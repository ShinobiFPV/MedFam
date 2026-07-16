const express = require('express');

module.exports = function actionEventRoutes(db) {
  const router = express.Router();

  // Idempotent: repeat calls (e.g. tablet offline-queue replay) never move
  // done_at once it's set, and always return the row's actual current state.
  router.put('/action-events/:id/done', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM action_events WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Action event not found' });

    if (!existing.done_at) {
      const clientDoneAt = req.body && req.body.done_at;
      let doneAt = new Date().toISOString();
      if (clientDoneAt) {
        const d = new Date(clientDoneAt);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ error: 'done_at must be a valid date/time string' });
        }
        doneAt = d.toISOString();
      }
      db.prepare('UPDATE action_events SET done_at = ? WHERE id = ?').run(doneAt, id);
    }
    res.json(db.prepare('SELECT * FROM action_events WHERE id = ?').get(id));
  });

  router.put('/action-events/:id/undone', (req, res) => {
    const id = req.params.id;
    const existing = db.prepare('SELECT * FROM action_events WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Action event not found' });

    db.prepare('UPDATE action_events SET done_at = NULL WHERE id = ?').run(id);
    res.json(db.prepare('SELECT * FROM action_events WHERE id = ?').get(id));
  });

  return router;
};
