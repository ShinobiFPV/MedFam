const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { createTestServer } = require('./helpers');
const { personDir } = require('../src/lib/documentStorage');
const { buildFullBackupZip, importFullBackup } = require('../src/lib/dataTransfer');

function isolatedDocumentsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'medfam-test-documents-'));
}

async function createPerson(baseUrl, overrides = {}) {
  const res = await fetch(`${baseUrl}/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Person', ...overrides }),
  });
  return res.json();
}

async function createMedication(baseUrl, personId, overrides = {}) {
  const res = await fetch(`${baseUrl}/medications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      name: 'Test Med',
      dosage: '10mg',
      schedule_json: JSON.stringify({ times: ['08:00'], days: 'daily' }),
      ...overrides,
    }),
  });
  return res.json();
}

async function createDoctor(baseUrl, personId, overrides = {}) {
  const res = await fetch(`${baseUrl}/doctors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: personId, name: 'Dr. Test', specialty: 'GP', ...overrides }),
  });
  return res.json();
}

async function createAppointment(baseUrl, personId, doctorId, overrides = {}) {
  const res = await fetch(`${baseUrl}/appointments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      doctor_id: doctorId,
      datetime_utc: '2026-08-01T14:00:00.000Z',
      location: 'Test Clinic',
      ...overrides,
    }),
  });
  return res.json();
}

async function createAction(baseUrl, personId, overrides = {}) {
  const res = await fetch(`${baseUrl}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: personId,
      name: 'Test Action',
      category: 'Exercise',
      schedule_json: JSON.stringify({ times: ['09:00'], days: 'daily' }),
      ...overrides,
    }),
  });
  return res.json();
}

async function uploadDocument(baseUrl, personId, { filename = 'scan.pdf', content = '%PDF-1.4 test content' } = {}) {
  const form = new FormData();
  form.append('person_id', String(personId));
  form.append('title', 'Test Document');
  form.append('category', 'Lab result');
  form.append('file', new Blob([Buffer.from(content)], { type: 'application/pdf' }), filename);
  const res = await fetch(`${baseUrl}/documents`, { method: 'POST', body: form });
  return res.json();
}

// Materializes today's dose/action events and marks them done, so exported
// data includes real compliance history.
async function materializeAndMarkDone(baseUrl, personId) {
  const today = await (await fetch(`${baseUrl}/people/${personId}/today`)).json();
  for (const dose of today.doses) {
    await fetch(`${baseUrl}/dose-events/${dose.dose_event_id}/taken`, { method: 'PUT' });
  }
  for (const action of today.actions) {
    await fetch(`${baseUrl}/action-events/${action.action_event_id}/done`, { method: 'PUT' });
  }
}

async function buildFullState(baseUrl) {
  const person = await createPerson(baseUrl, { name: 'Alex Sample', date_of_birth: '1950-01-01', notes: 'test notes' });
  const medication = await createMedication(baseUrl, person.id);
  const doctor = await createDoctor(baseUrl, person.id);
  await createAppointment(baseUrl, person.id, doctor.id);
  const action = await createAction(baseUrl, person.id);
  const document = await uploadDocument(baseUrl, person.id);
  await materializeAndMarkDone(baseUrl, person.id);
  return { person, medication, doctor, action, document };
}

function zipFormData(buffer, filename = 'export.zip') {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/zip' }), filename);
  return form;
}

test('person export -> import round-trip preserves data, including document bytes and compliance history', async (t) => {
  const a = createTestServer();
  const b = createTestServer();
  t.after(() => {
    a.server.close();
    b.server.close();
  });

  const { person, document } = await buildFullState(a.baseUrl);
  t.after(() => fs.rmSync(personDir(person.id), { recursive: true, force: true }));

  // Pre-seed B with an unrelated person so B's next autoincrement id can't
  // coincidentally match A's exported person id -- makes the "always a
  // fresh id, never the export's original id" assertion below meaningful.
  const existingOnB = await createPerson(b.baseUrl, { name: 'Already Here' });
  t.after(() => fs.rmSync(personDir(existingOnB.id), { recursive: true, force: true }));

  const exportRes = await fetch(`${a.baseUrl}/people/${person.id}/export`);
  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.headers.get('content-type'), 'application/zip');
  const zipBuffer = Buffer.from(await exportRes.arrayBuffer());

  const importRes = await fetch(`${b.baseUrl}/people/import`, { method: 'POST', body: zipFormData(zipBuffer) });
  assert.equal(importRes.status, 201);
  const newPerson = await importRes.json();
  t.after(() => fs.rmSync(personDir(newPerson.id), { recursive: true, force: true }));

  assert.equal(newPerson.name, 'Alex Sample');
  assert.equal(newPerson.date_of_birth, '1950-01-01');
  assert.notEqual(newPerson.id, existingOnB.id, 'import should always assign a fresh id');

  const meds = await (await fetch(`${b.baseUrl}/medications?person_id=${newPerson.id}`)).json();
  assert.equal(meds.length, 1);
  assert.equal(meds[0].name, 'Test Med');
  assert.equal(meds[0].dosage, '10mg');

  const doctors = await (await fetch(`${b.baseUrl}/doctors?person_id=${newPerson.id}`)).json();
  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].name, 'Dr. Test');

  const appts = await (await fetch(`${b.baseUrl}/appointments?person_id=${newPerson.id}`)).json();
  assert.equal(appts.length, 1);
  assert.equal(appts[0].doctor_id, doctors[0].id);
  assert.equal(appts[0].location, 'Test Clinic');

  const actions = await (await fetch(`${b.baseUrl}/actions?person_id=${newPerson.id}`)).json();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].name, 'Test Action');

  const docs = await (await fetch(`${b.baseUrl}/documents?person_id=${newPerson.id}`)).json();
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, document.title);
  const fileRes = await fetch(`${b.baseUrl}/documents/${docs[0].id}/file`);
  assert.equal(await fileRes.text(), '%PDF-1.4 test content');

  const doseEvents = b.db.prepare('SELECT * FROM dose_events WHERE medication_id = ?').all(meds[0].id);
  assert.equal(doseEvents.length, 1);
  assert.ok(doseEvents[0].taken_at, 'dose taken_at should have carried over');

  const actionEvents = b.db.prepare('SELECT * FROM action_events WHERE action_id = ?').all(actions[0].id);
  assert.equal(actionEvents.length, 1);
  assert.ok(actionEvents[0].done_at, 'action done_at should have carried over');
});

test('full backup export -> import round-trip wipes the target and restores everything', async (t) => {
  const a = createTestServer();
  const b = createTestServer();
  t.after(() => {
    a.server.close();
    b.server.close();
  });

  const aDocsDir = isolatedDocumentsDir();
  const bDocsDir = isolatedDocumentsDir();
  t.after(() => {
    fs.rmSync(aDocsDir, { recursive: true, force: true });
    fs.rmSync(bDocsDir, { recursive: true, force: true });
  });

  const { person, document } = await buildFullState(a.baseUrl);
  // buildFullState() uploaded via the real HTTP route, which writes under the
  // real data/documents/ dir -- move that file into our isolated dir so the
  // backup zip (built with an explicit documentsDir override) picks it up
  // without touching the shared real directory.
  const realDocRow = a.db.prepare('SELECT * FROM documents WHERE person_id = ?').get(person.id);
  fs.mkdirSync(path.join(aDocsDir, String(person.id)), { recursive: true });
  fs.copyFileSync(
    path.join(personDir(person.id), realDocRow.stored_filename),
    path.join(aDocsDir, String(person.id), realDocRow.stored_filename)
  );
  t.after(() => fs.rmSync(personDir(person.id), { recursive: true, force: true }));

  const { buffer: zipBuffer } = await buildFullBackupZip(a.db, aDocsDir);

  // Prove restore wipes existing data: seed B with an unrelated decoy person.
  const decoy = await createPerson(b.baseUrl, { name: 'Decoy Person' });

  const restored = await importFullBackup(b.db, zipBuffer, bDocsDir);
  assert.equal(restored.people, 1);
  assert.equal(restored.documents, 1);

  const peopleOnB = await (await fetch(`${b.baseUrl}/people`)).json();
  assert.equal(peopleOnB.length, 1);
  assert.equal(peopleOnB[0].id, person.id, 'restore should preserve original ids');
  assert.equal(peopleOnB[0].name, 'Alex Sample');
  assert.ok(!peopleOnB.some((p) => p.name === decoy.name), 'decoy person should have been wiped');

  const restoredDocRow = b.db.prepare('SELECT * FROM documents WHERE person_id = ?').get(person.id);
  assert.equal(restoredDocRow.title, document.title);
  const restoredBytes = fs.readFileSync(path.join(bDocsDir, String(person.id), restoredDocRow.stored_filename));
  assert.equal(restoredBytes.toString(), '%PDF-1.4 test content');
});

test('rejects a non-zip upload on both import endpoints', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const notAZip = new FormData();
  notAZip.append('file', new Blob([Buffer.from('just some text')], { type: 'text/plain' }), 'notes.txt');

  const personImportRes = await fetch(`${baseUrl}/people/import`, { method: 'POST', body: notAZip });
  assert.equal(personImportRes.status, 400);

  const backupImportRes = await fetch(`${baseUrl}/backup/import`, { method: 'POST', body: notAZip });
  assert.equal(backupImportRes.status, 400);
});

test('restore rejects a corrupt backup db and leaves live data untouched', async (t) => {
  const { server, baseUrl, db } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl, { name: 'Untouched Person' });
  t.after(() => fs.rmSync(personDir(person.id), { recursive: true, force: true }));

  const zip = new JSZip();
  zip.file('medfam.db', Buffer.from('this is not a sqlite database'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const res = await fetch(`${baseUrl}/backup/import`, { method: 'POST', body: zipFormData(zipBuffer) });
  assert.equal(res.status, 400);

  const people = db.prepare('SELECT * FROM people').all();
  assert.equal(people.length, 1);
  assert.equal(people[0].name, 'Untouched Person');
});

test('person import rejects a manifest referencing a document file missing from the zip', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const manifest = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    person: { name: 'Broken Export', date_of_birth: null, notes: null },
    medications: [],
    doctors: [],
    actions: [],
    appointments: [],
    documents: [
      {
        title: 'Missing file',
        category: null,
        notes: null,
        original_filename: 'ghost.pdf',
        stored_filename: `${crypto.randomUUID()}.pdf`,
        mime_type: 'application/pdf',
        size_bytes: 10,
        uploaded_at: new Date().toISOString(),
      },
    ],
    doseEvents: [],
    actionEvents: [],
  };
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest));
  // Deliberately no documents/<stored_filename> entry.
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const res = await fetch(`${baseUrl}/people/import`, { method: 'POST', body: zipFormData(zipBuffer) });
  assert.equal(res.status, 400);
});
