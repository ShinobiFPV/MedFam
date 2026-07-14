const express = require('express');
const { personExists } = require('../lib/validate');
const { getTodayForPerson } = require('../lib/today');

module.exports = function peopleRoutes(db) {
  const router = express.Router();

  router.get('/people', (req, res) => {
    res.json(db.prepare('SELECT * FROM people ORDER BY id').all());
  });

  router.get('/people/:id', (req, res) => {
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    res.json(person);
  });

  router.post('/people', (req, res) => {
    const { name, date_of_birth, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const info = db
      .prepare('INSERT INTO people (name, date_of_birth, notes) VALUES (?, ?, ?)')
      .run(name, date_of_birth || null, notes || null);
    res.status(201).json(db.prepare('SELECT * FROM people WHERE id = ?').get(info.lastInsertRowid));
  });

  router.put('/people/:id', (req, res) => {
    const person = db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });
    const { name, date_of_birth, notes } = req.body || {};
    db.prepare('UPDATE people SET name = ?, date_of_birth = ?, notes = ? WHERE id = ?').run(
      name !== undefined ? name : person.name,
      date_of_birth !== undefined ? date_of_birth : person.date_of_birth,
      notes !== undefined ? notes : person.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM people WHERE id = ?').get(req.params.id));
  });

  router.delete('/people/:id', (req, res) => {
    const info = db.prepare('DELETE FROM people WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Person not found' });
    res.status(204).end();
  });

  router.get('/people/:id/today', (req, res) => {
    const personId = Number(req.params.id);
    if (!personExists(db, personId)) return res.status(404).json({ error: 'Person not found' });
    res.json(getTodayForPerson(db, personId));
  });

  router.get('/people/:id/doses', (req, res) => {
    const personId = Number(req.params.id);
    if (!personExists(db, personId)) return res.status(404).json({ error: 'Person not found' });
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required (YYYY-MM-DD)' });
    }
    const rows = db
      .prepare(
        `
        SELECT de.id AS dose_event_id, de.scheduled_date, de.scheduled_time, de.taken_at,
               m.id AS medication_id, m.name, m.dosage, m.color
        FROM dose_events de
        JOIN medications m ON m.id = de.medication_id
        WHERE m.person_id = ? AND de.scheduled_date BETWEEN ? AND ?
        ORDER BY de.scheduled_date ASC, de.scheduled_time ASC
      `
      )
      .all(personId, from, to);
    res.json(rows);
  });

  router.get('/people/:id/appointments/upcoming', (req, res) => {
    const personId = Number(req.params.id);
    if (!personExists(db, personId)) return res.status(404).json({ error: 'Person not found' });
    const limit = Math.max(1, Number(req.query.limit) || 5);
    const rows = db
      .prepare(
        `
        SELECT * FROM appointments
        WHERE person_id = ? AND datetime_utc > ?
        ORDER BY datetime_utc ASC
        LIMIT ?
      `
      )
      .all(personId, new Date().toISOString(), limit);
    res.json(rows);
  });

  return router;
};
