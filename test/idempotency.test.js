const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers');

async function createPerson(baseUrl) {
  const res = await fetch(`${baseUrl}/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Person' }),
  });
  return res.json();
}

async function createMedication(baseUrl, personId) {
  const res = await fetch(`${baseUrl}/medications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      name: 'Test Med',
      dosage: '10mg',
      color: '#000000',
      schedule_json: { times: ['08:00'], days: 'daily' },
    }),
  });
  return res.json();
}

async function createAction(baseUrl, personId) {
  const res = await fetch(`${baseUrl}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      name: 'Test Action',
      category: 'Exercise',
      schedule_json: { times: ['09:00'], days: 'daily' },
    }),
  });
  return res.json();
}

test('marking a dose taken repeatedly is idempotent', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createMedication(baseUrl, person.id);

  const today = await (await fetch(`${baseUrl}/people/${person.id}/today`)).json();
  const doseId = today.doses[0].dose_event_id;

  const first = await (await fetch(`${baseUrl}/dose-events/${doseId}/taken`, { method: 'PUT' })).json();
  assert.ok(first.taken_at);

  const second = await (await fetch(`${baseUrl}/dose-events/${doseId}/taken`, { method: 'PUT' })).json();
  assert.equal(second.taken_at, first.taken_at);

  const third = await (
    await fetch(`${baseUrl}/dose-events/${doseId}/taken`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taken_at: new Date(Date.now() + 100000).toISOString() }),
    })
  ).json();
  assert.equal(third.taken_at, first.taken_at, 'client-provided taken_at should be ignored once already taken');
});

test('marking a dose untaken repeatedly is idempotent', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createMedication(baseUrl, person.id);

  const today = await (await fetch(`${baseUrl}/people/${person.id}/today`)).json();
  const doseId = today.doses[0].dose_event_id;

  await fetch(`${baseUrl}/dose-events/${doseId}/taken`, { method: 'PUT' });

  const first = await (await fetch(`${baseUrl}/dose-events/${doseId}/untaken`, { method: 'PUT' })).json();
  assert.equal(first.taken_at, null);

  const second = await (await fetch(`${baseUrl}/dose-events/${doseId}/untaken`, { method: 'PUT' })).json();
  assert.equal(second.taken_at, null);
});

test('taken/untaken on an unknown dose event returns 404', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const takenRes = await fetch(`${baseUrl}/dose-events/does-not-exist/taken`, { method: 'PUT' });
  assert.equal(takenRes.status, 404);

  const untakenRes = await fetch(`${baseUrl}/dose-events/does-not-exist/untaken`, { method: 'PUT' });
  assert.equal(untakenRes.status, 404);
});

test('marking an action done repeatedly is idempotent', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createAction(baseUrl, person.id);

  const today = await (await fetch(`${baseUrl}/people/${person.id}/today`)).json();
  const actionEventId = today.actions[0].action_event_id;

  const first = await (await fetch(`${baseUrl}/action-events/${actionEventId}/done`, { method: 'PUT' })).json();
  assert.ok(first.done_at);

  const second = await (await fetch(`${baseUrl}/action-events/${actionEventId}/done`, { method: 'PUT' })).json();
  assert.equal(second.done_at, first.done_at);

  const third = await (
    await fetch(`${baseUrl}/action-events/${actionEventId}/done`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done_at: new Date(Date.now() + 100000).toISOString() }),
    })
  ).json();
  assert.equal(third.done_at, first.done_at, 'client-provided done_at should be ignored once already done');
});

test('marking an action undone repeatedly is idempotent', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createAction(baseUrl, person.id);

  const today = await (await fetch(`${baseUrl}/people/${person.id}/today`)).json();
  const actionEventId = today.actions[0].action_event_id;

  await fetch(`${baseUrl}/action-events/${actionEventId}/done`, { method: 'PUT' });

  const first = await (await fetch(`${baseUrl}/action-events/${actionEventId}/undone`, { method: 'PUT' })).json();
  assert.equal(first.done_at, null);

  const second = await (await fetch(`${baseUrl}/action-events/${actionEventId}/undone`, { method: 'PUT' })).json();
  assert.equal(second.done_at, null);
});

test('done/undone on an unknown action event returns 404', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const doneRes = await fetch(`${baseUrl}/action-events/does-not-exist/done`, { method: 'PUT' });
  assert.equal(doneRes.status, 404);

  const undoneRes = await fetch(`${baseUrl}/action-events/does-not-exist/undone`, { method: 'PUT' });
  assert.equal(undoneRes.status, 404);
});

test('appointment confirm is idempotent', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  const apptRes = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: person.id,
      datetime_utc: new Date(Date.now() + 86400000).toISOString(),
      location: 'Test Clinic',
    }),
  });
  const appt = await apptRes.json();

  const first = await (await fetch(`${baseUrl}/appointments/${appt.id}/confirm`, { method: 'PUT' })).json();
  assert.ok(first.confirmed_at);

  const second = await (await fetch(`${baseUrl}/appointments/${appt.id}/confirm`, { method: 'PUT' })).json();
  assert.equal(second.confirmed_at, first.confirmed_at);
});
