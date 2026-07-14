const express = require('express');
const { personExists } = require('../lib/validate');

module.exports = function doctorRoutes(db) {
  const router = express.Router();

  router.get('/doctors', (req, res) => {
    const { person_id } = req.query;
    const rows = person_id
      ? db.prepare('SELECT * FROM doctors WHERE person_id = ? ORDER BY id').all(person_id)
      : db.prepare('SELECT * FROM doctors ORDER BY id').all();
    res.json(rows);
  });

  router.get('/doctors/:id', (req, res) => {
    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    res.json(doctor);
  });

  router.post('/doctors', (req, res) => {
    const { person_id, name, specialty, phone, address, notes } = req.body || {};
    if (!person_id || !name) {
      return res.status(400).json({ error: 'person_id and name are required' });
    }
    if (!personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    const info = db
      .prepare(
        `
        INSERT INTO doctors (person_id, name, specialty, phone, address, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(person_id, name, specialty || null, phone || null, address || null, notes || null);
    res.status(201).json(db.prepare('SELECT * FROM doctors WHERE id = ?').get(info.lastInsertRowid));
  });

  router.put('/doctors/:id', (req, res) => {
    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.params.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    const { person_id, name, specialty, phone, address, notes } = req.body || {};
    if (person_id !== undefined && !personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    db.prepare(
      `
      UPDATE doctors SET person_id = ?, name = ?, specialty = ?, phone = ?, address = ?, notes = ?
      WHERE id = ?
    `
    ).run(
      person_id !== undefined ? person_id : doctor.person_id,
      name !== undefined ? name : doctor.name,
      specialty !== undefined ? specialty : doctor.specialty,
      phone !== undefined ? phone : doctor.phone,
      address !== undefined ? address : doctor.address,
      notes !== undefined ? notes : doctor.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.params.id));
  });

  router.delete('/doctors/:id', (req, res) => {
    const info = db.prepare('DELETE FROM doctors WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Doctor not found' });
    res.status(204).end();
  });

  return router;
};
