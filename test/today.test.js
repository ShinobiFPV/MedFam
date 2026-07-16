const test = require('node:test');
const assert = require('node:assert/strict');
const { getDb } = require('../src/db');
const { getTodayForPerson } = require('../src/lib/today');
const { torontoDayAbbrev } = require('../src/lib/timezone');

function insertPerson(db, name = 'Test Person') {
  return db.prepare('INSERT INTO people (name) VALUES (?)').run(name).lastInsertRowid;
}

function insertMedication(db, personId, schedule, overrides = {}) {
  return db
    .prepare(
      `
      INSERT INTO medications (person_id, name, dosage, color, description, schedule_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      personId,
      overrides.name || 'Test Med',
      overrides.dosage || '10mg',
      overrides.color || '#000000',
      overrides.description || 'desc',
      JSON.stringify(schedule)
    ).lastInsertRowid;
}

test('generates dose_events for a medication scheduled today (daily)', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertMedication(db, personId, { times: ['08:00', '20:00'], days: 'daily' });

  const result = getTodayForPerson(db, personId);

  assert.equal(result.doses.length, 2);
  assert.deepEqual(
    result.doses.map((d) => d.scheduled_time).sort(),
    ['08:00', '20:00']
  );
  assert.ok(result.doses.every((d) => d.taken === false));
});

test('does not duplicate dose_events across repeated calls the same day', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertMedication(db, personId, { times: ['08:00'], days: 'daily' });

  getTodayForPerson(db, personId);
  getTodayForPerson(db, personId);
  const result = getTodayForPerson(db, personId);

  assert.equal(result.doses.length, 1);
  const count = db.prepare('SELECT COUNT(*) AS c FROM dose_events').get().c;
  assert.equal(count, 1);
});

test('medication added mid-day appears on next today call without touching existing dose_events', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertMedication(db, personId, { times: ['08:00'], days: 'daily' }, { name: 'Morning Med' });

  const first = getTodayForPerson(db, personId);
  assert.equal(first.doses.length, 1);
  const firstDoseId = first.doses[0].dose_event_id;

  insertMedication(db, personId, { times: ['09:00'], days: 'daily' }, { name: 'New Med' });
  const second = getTodayForPerson(db, personId);

  assert.equal(second.doses.length, 2);
  const unchanged = second.doses.find((d) => d.dose_event_id === firstDoseId);
  assert.ok(unchanged, 'original dose_event should be untouched');
});

test('medication only scheduled on other days does not appear today', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);

  const today = torontoDayAbbrev();
  const otherDay = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].find((d) => d !== today);

  insertMedication(db, personId, { times: ['08:00'], days: [otherDay] });

  const result = getTodayForPerson(db, personId);
  assert.equal(result.doses.length, 0);
});

test('inactive medications are excluded from today', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  const medId = insertMedication(db, personId, { times: ['08:00'], days: 'daily' });
  db.prepare('UPDATE medications SET active = 0 WHERE id = ?').run(medId);

  const result = getTodayForPerson(db, personId);
  assert.equal(result.doses.length, 0);
});

test('marking a dose taken is reflected on the next today call', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertMedication(db, personId, { times: ['08:00'], days: 'daily' });

  const first = getTodayForPerson(db, personId);
  const doseId = first.doses[0].dose_event_id;
  db.prepare("UPDATE dose_events SET taken_at = datetime('now') WHERE id = ?").run(doseId);

  const second = getTodayForPerson(db, personId);
  assert.equal(second.doses.length, 1);
  assert.equal(second.doses[0].taken, true);
});

function insertAction(db, personId, schedule, overrides = {}) {
  return db
    .prepare(
      `
      INSERT INTO actions (person_id, name, category, notes, schedule_json)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(
      personId,
      overrides.name || 'Test Action',
      overrides.category || 'Exercise',
      overrides.notes || 'notes',
      JSON.stringify(schedule)
    ).lastInsertRowid;
}

test('generates action_events for an action scheduled today (daily)', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertAction(db, personId, { times: ['09:00', '17:00'], days: 'daily' });

  const result = getTodayForPerson(db, personId);

  assert.equal(result.actions.length, 2);
  assert.deepEqual(
    result.actions.map((a) => a.scheduled_time).sort(),
    ['09:00', '17:00']
  );
  assert.ok(result.actions.every((a) => a.done === false));
});

test('does not duplicate action_events across repeated calls the same day', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertAction(db, personId, { times: ['09:00'], days: 'daily' });

  getTodayForPerson(db, personId);
  getTodayForPerson(db, personId);
  const result = getTodayForPerson(db, personId);

  assert.equal(result.actions.length, 1);
  const count = db.prepare('SELECT COUNT(*) AS c FROM action_events').get().c;
  assert.equal(count, 1);
});

test('action only scheduled on other days does not appear today', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);

  const today = torontoDayAbbrev();
  const otherDay = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].find((d) => d !== today);

  insertAction(db, personId, { times: ['09:00'], days: [otherDay] });

  const result = getTodayForPerson(db, personId);
  assert.equal(result.actions.length, 0);
});

test('inactive actions are excluded from today', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  const actionId = insertAction(db, personId, { times: ['09:00'], days: 'daily' });
  db.prepare('UPDATE actions SET active = 0 WHERE id = ?').run(actionId);

  const result = getTodayForPerson(db, personId);
  assert.equal(result.actions.length, 0);
});

test('marking an action done is reflected on the next today call', () => {
  const db = getDb(':memory:');
  const personId = insertPerson(db);
  insertAction(db, personId, { times: ['09:00'], days: 'daily' });

  const first = getTodayForPerson(db, personId);
  const actionEventId = first.actions[0].action_event_id;
  db.prepare("UPDATE action_events SET done_at = datetime('now') WHERE id = ?").run(actionEventId);

  const second = getTodayForPerson(db, personId);
  assert.equal(second.actions.length, 1);
  assert.equal(second.actions[0].done, true);
});
