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

async function createAppointment(baseUrl, personId, overrides = {}) {
  const res = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      datetime_utc: '2026-08-01T14:00:00.000Z',
      location: 'Test Clinic',
      ...overrides,
    }),
  });
  return { status: res.status, body: await res.json() };
}

test('creating a recurring appointment materializes one row per occurrence', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  const { status, body: first } = await createAppointment(baseUrl, person.id, {
    recurrence: { unit: 'week', interval: 2, count: 3 },
  });
  assert.equal(status, 201);
  assert.ok(first.series_id);

  const all = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  assert.equal(all.length, 3);
  assert.deepEqual(
    all.map((a) => a.datetime_utc).sort(),
    ['2026-08-01T14:00:00.000Z', '2026-08-15T14:00:00.000Z', '2026-08-29T14:00:00.000Z']
  );
  assert.ok(all.every((a) => a.series_id === first.series_id));
  assert.ok(all.every((a) => JSON.parse(a.recurrence_rule).count === 3));
});

test('a non-recurring appointment has no series_id', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  const { body: appt } = await createAppointment(baseUrl, person.id);
  assert.equal(appt.series_id, null);
  assert.equal(appt.recurrence_rule, null);
});

test('rejects an invalid recurrence rule', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  const { status } = await createAppointment(baseUrl, person.id, {
    recurrence: { unit: 'day', interval: 1, count: 3 },
  });
  assert.equal(status, 400);
});

test('monthly recurrence clamps day-of-month overflow', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  const { body: first } = await createAppointment(baseUrl, person.id, {
    datetime_utc: '2026-01-31T14:00:00.000Z',
    recurrence: { unit: 'month', interval: 1, count: 3 },
  });

  const all = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  assert.deepEqual(
    all.map((a) => a.datetime_utc.slice(0, 10)).sort(),
    ['2026-01-31', '2026-02-28', '2026-03-28']
  );
  assert.ok(first.series_id);
});

test('deleting with scope=future removes this and later occurrences only', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createAppointment(baseUrl, person.id, {
    recurrence: { unit: 'week', interval: 1, count: 4 },
  });

  const all = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  const sorted = all.slice().sort((a, b) => a.datetime_utc.localeCompare(b.datetime_utc));
  const secondOccurrence = sorted[1];

  const delRes = await fetch(`${baseUrl}/appointments/${secondOccurrence.id}?scope=future`, {
    method: 'DELETE',
  });
  assert.equal(delRes.status, 204);

  const remaining = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, sorted[0].id);
});

test('deleting a single occurrence without scope leaves the rest of the series intact', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  await createAppointment(baseUrl, person.id, {
    recurrence: { unit: 'week', interval: 1, count: 3 },
  });

  const all = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  const target = all[0];

  const delRes = await fetch(`${baseUrl}/appointments/${target.id}`, { method: 'DELETE' });
  assert.equal(delRes.status, 204);

  const remaining = await (await fetch(`${baseUrl}/appointments?person_id=${person.id}`)).json();
  assert.equal(remaining.length, 2);
});
