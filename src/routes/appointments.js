const express = require('express');
const { personExists, doctorExists } = require('../lib/validate');

function normalizeDate(value, res) {
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    res.status(400).json({ error: 'datetime_utc must be a valid date/time string' });
    return undefined;
  }
  return d.toISOString();
}

module.exports = function appointmentRoutes(db) {
  const router = express.Router();

  router.get('/appointments', (req, res) => {
    const { person_id } = req.query;
    const rows = person_id
      ? db.prepare('SELECT * FROM appointments WHERE person_id = ? ORDER BY datetime_utc').all(person_id)
      : db.prepare('SELECT * FROM appointments ORDER BY datetime_utc').all();
    res.json(rows);
  });

  router.get('/appointments/:id', (req, res) => {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    res.json(appt);
  });

  router.post('/appointments', (req, res) => {
    const { person_id, doctor_id, datetime_utc, location, prep_notes } = req.body || {};
    if (!person_id || !datetime_utc) {
      return res.status(400).json({ error: 'person_id and datetime_utc are required' });
    }
    if (!personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    if (doctor_id !== undefined && doctor_id !== null && !doctorExists(db, doctor_id)) {
      return res.status(400).json({ error: `doctor_id ${doctor_id} does not exist` });
    }
    const iso = normalizeDate(datetime_utc, res);
    if (iso === undefined) return;

    const info = db
      .prepare(
        `
        INSERT INTO appointments (person_id, doctor_id, datetime_utc, location, prep_notes)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(person_id, doctor_id || null, iso, location || null, prep_notes || null);
    res.status(201).json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(info.lastInsertRowid));
  });

  router.put('/appointments/:id', (req, res) => {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });

    const { person_id, doctor_id, datetime_utc, location, prep_notes } = req.body || {};
    if (person_id !== undefined && !personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    if (doctor_id !== undefined && doctor_id !== null && !doctorExists(db, doctor_id)) {
      return res.status(400).json({ error: `doctor_id ${doctor_id} does not exist` });
    }
    let iso = appt.datetime_utc;
    if (datetime_utc !== undefined) {
      iso = normalizeDate(datetime_utc, res);
      if (iso === undefined) return;
    }

    db.prepare(
      `
      UPDATE appointments SET person_id = ?, doctor_id = ?, datetime_utc = ?, location = ?, prep_notes = ?
      WHERE id = ?
    `
    ).run(
      person_id !== undefined ? person_id : appt.person_id,
      doctor_id !== undefined ? doctor_id : appt.doctor_id,
      iso,
      location !== undefined ? location : appt.location,
      prep_notes !== undefined ? prep_notes : appt.prep_notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id));
  });

  router.delete('/appointments/:id', (req, res) => {
    const info = db.prepare('DELETE FROM appointments WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Appointment not found' });
    res.status(204).end();
  });

  router.put('/appointments/:id/confirm', (req, res) => {
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (!appt.confirmed_at) {
      db.prepare('UPDATE appointments SET confirmed_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        req.params.id
      );
    }
    res.json(db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id));
  });

  return router;
};
