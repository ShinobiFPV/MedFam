const express = require('express');
const { personExists } = require('../lib/validate');
const { parseSchedule, isValidSchedule } = require('../lib/schedule');

function validateSchedule(scheduleJson, res) {
  let schedule;
  try {
    schedule = parseSchedule(scheduleJson);
  } catch {
    res.status(400).json({ error: 'schedule_json must be valid JSON' });
    return undefined;
  }
  if (!isValidSchedule(schedule)) {
    res.status(400).json({
      error:
        'schedule_json must have a non-empty "times" array of "HH:MM" strings and "days" of "daily" or an array of day abbreviations (mon..sun)',
    });
    return undefined;
  }
  return JSON.stringify(schedule);
}

module.exports = function actionRoutes(db) {
  const router = express.Router();

  router.get('/actions', (req, res) => {
    const { person_id } = req.query;
    const rows = person_id
      ? db.prepare('SELECT * FROM actions WHERE person_id = ? ORDER BY id').all(person_id)
      : db.prepare('SELECT * FROM actions ORDER BY id').all();
    res.json(rows);
  });

  router.get('/actions/:id', (req, res) => {
    const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found' });
    res.json(action);
  });

  router.post('/actions', (req, res) => {
    const { person_id, name, category, notes, schedule_json, active } = req.body || {};
    if (!person_id || !name || !schedule_json) {
      return res.status(400).json({ error: 'person_id, name, and schedule_json are required' });
    }
    if (!personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    const scheduleStr = validateSchedule(schedule_json, res);
    if (scheduleStr === undefined) return;

    const info = db
      .prepare(
        `
        INSERT INTO actions (person_id, name, category, notes, schedule_json, active)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(person_id, name, category || null, notes || null, scheduleStr, active === 0 ? 0 : 1);
    res.status(201).json(db.prepare('SELECT * FROM actions WHERE id = ?').get(info.lastInsertRowid));
  });

  router.put('/actions/:id', (req, res) => {
    const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(req.params.id);
    if (!action) return res.status(404).json({ error: 'Action not found' });

    const { person_id, name, category, notes, schedule_json, active } = req.body || {};
    if (person_id !== undefined && !personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    let scheduleStr = action.schedule_json;
    if (schedule_json !== undefined) {
      scheduleStr = validateSchedule(schedule_json, res);
      if (scheduleStr === undefined) return;
    }

    db.prepare(
      `
      UPDATE actions
      SET person_id = ?, name = ?, category = ?, notes = ?, schedule_json = ?, active = ?
      WHERE id = ?
    `
    ).run(
      person_id !== undefined ? person_id : action.person_id,
      name !== undefined ? name : action.name,
      category !== undefined ? category : action.category,
      notes !== undefined ? notes : action.notes,
      scheduleStr,
      active !== undefined ? (active ? 1 : 0) : action.active,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM actions WHERE id = ?').get(req.params.id));
  });

  router.delete('/actions/:id', (req, res) => {
    const info = db.prepare('DELETE FROM actions WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Action not found' });
    res.status(204).end();
  });

  return router;
};
