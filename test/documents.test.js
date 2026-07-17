const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createTestServer } = require('./helpers');
const { personDir } = require('../src/lib/documentStorage');

async function createPerson(baseUrl) {
  const res = await fetch(`${baseUrl}/people`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Person' }),
  });
  return res.json();
}

function uploadForm({ personId, title, category, filename = 'referral.pdf', mimeType = 'application/pdf' }) {
  const form = new FormData();
  form.append('person_id', String(personId));
  form.append('title', title);
  if (category) form.append('category', category);
  form.append('file', new Blob([Buffer.from('%PDF-1.4 fake contents')], { type: mimeType }), filename);
  return form;
}

test('uploading a document stores metadata and the file on disk', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  t.after(() => fs.rmSync(personDir(person.id), { recursive: true, force: true }));

  const uploadRes = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    body: uploadForm({ personId: person.id, title: 'ER referral letter', category: 'Referral' }),
  });
  assert.equal(uploadRes.status, 201);
  const doc = await uploadRes.json();
  assert.equal(doc.person_id, person.id);
  assert.equal(doc.title, 'ER referral letter');
  assert.equal(doc.category, 'Referral');
  assert.equal(doc.original_filename, 'referral.pdf');
  assert.equal(doc.mime_type, 'application/pdf');
  assert.ok(doc.size_bytes > 0);
  assert.ok(fs.existsSync(`${personDir(person.id)}/${doc.stored_filename}`));

  const listRes = await fetch(`${baseUrl}/documents?person_id=${person.id}`);
  const list = await listRes.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, doc.id);

  const fileRes = await fetch(`${baseUrl}/documents/${doc.id}/file`);
  assert.equal(fileRes.status, 200);
  assert.equal(fileRes.headers.get('content-type'), 'application/pdf');
  const body = await fileRes.text();
  assert.equal(body, '%PDF-1.4 fake contents');

  const updateRes = await fetch(`${baseUrl}/documents/${doc.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'Bring to next visit' }),
  });
  assert.equal(updateRes.status, 200);
  assert.equal((await updateRes.json()).notes, 'Bring to next visit');

  const deleteRes = await fetch(`${baseUrl}/documents/${doc.id}`, { method: 'DELETE' });
  assert.equal(deleteRes.status, 204);
  assert.ok(!fs.existsSync(`${personDir(person.id)}/${doc.stored_filename}`));
  assert.equal((await fetch(`${baseUrl}/documents/${doc.id}`)).status, 404);
});

test('rejects an upload with an unsupported file type', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const person = await createPerson(baseUrl);
  t.after(() => fs.rmSync(personDir(person.id), { recursive: true, force: true }));

  const form = uploadForm({
    personId: person.id,
    title: 'Sketchy file',
    filename: 'virus.exe',
    mimeType: 'application/x-msdownload',
  });
  const res = await fetch(`${baseUrl}/documents`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
});

test('rejects an upload for a nonexistent person', async (t) => {
  const { server, baseUrl } = createTestServer();
  t.after(() => server.close());

  const res = await fetch(`${baseUrl}/documents`, {
    method: 'POST',
    body: uploadForm({ personId: 999999, title: 'Orphan doc' }),
  });
  assert.equal(res.status, 400);
});
