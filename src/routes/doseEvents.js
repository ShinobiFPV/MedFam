const express = require('express');

module.exports = function doseEventRoutes(db) {
  const router = express.Router();

  // Idempotent: repeat calls (e.g. tablet offline-queue replay) never move
  // taken_at once it's set, and always return the row's actual current state.
  router.put('/dose-events/:id/taken', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM dose_events WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Dose event not found' });

    if (!existing.taken_at) {
      const clientTakenAt = req.body && req.body.taken_at;
      let takenAt = new Date().toISOString();
      if (clientTakenAt) {
        const d = new Date(clientTakenAt);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'taken_at must be a valid date/time string' });
        }
        takenAt = d.toISOString();
      }
      db.prepare('UPDATE dose_events SET taken_at = ? WHERE id = ?').run(takenAt, id);
    }
    res.json(db.prepare('SELECT * FROM dose_events WHERE id = ?').get(id));
  });

  router.put('/dose-events/:id/untaken', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM dose_events WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Dose event not found' });

    db.prepare('UPDATE dose_events SET taken_at = NULL WHERE id = ?').run(id);
    res.json(db.prepare('SELECT * FROM dose_events WHERE id = ?').get(id));
  });

  return router;
};
