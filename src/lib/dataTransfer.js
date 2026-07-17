const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const JSZip = require('jszip');
const { runMigrations } = require('../migrate');
const { ensurePersonDir, storedPath, generateStoredFilename } = require('./documentStorage');

const FORMAT_VERSION = 1;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DOCUMENTS_DIR = path.join(DATA_DIR, 'documents');

// Thrown for anything wrong with an uploaded export/backup file itself (not
// a valid zip, missing manifest, unsupported version, corrupt db, etc) --
// routes catch this specifically and turn it into a 400 instead of a 500.
class ImportValidationError extends Error {}

function slugify(name) {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'person';
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function walkDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

// ---- Single-person export ----

function buildPersonExportManifest(db, personId) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  const medications = db.prepare('SELECT * FROM medications WHERE person_id = ? ORDER BY id').all(personId);
  const doctors = db.prepare('SELECT * FROM doctors WHERE person_id = ? ORDER BY id').all(personId);
  const actions = db.prepare('SELECT * FROM actions WHERE person_id = ? ORDER BY id').all(personId);
  const appointments = db.prepare('SELECT * FROM appointments WHERE person_id = ? ORDER BY id').all(personId);
  const documents = db.prepare('SELECT * FROM documents WHERE person_id = ? ORDER BY id').all(personId);

  const medicationIndexById = new Map(medications.map((m, i) => [m.id, i]));
  const doctorIndexById = new Map(doctors.map((d, i) => [d.id, i]));
  const actionIndexById = new Map(actions.map((a, i) => [a.id, i]));

  const doseEvents = medications.length
    ? db
        .prepare(
          `SELECT * FROM dose_events WHERE medication_id IN (${medications.map(() => '?').join(',')})
           ORDER BY scheduled_date, scheduled_time`
        )
        .all(...medications.map((m) => m.id))
    : [];
  const actionEvents = actions.length
    ? db
        .prepare(
          `SELECT * FROM action_events WHERE action_id IN (${actions.map(() => '?').join(',')})
           ORDER BY scheduled_date, scheduled_time`
        )
        .all(...actions.map((a) => a.id))
    : [];

  return {
    formatVersion: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    person: {
      name: person.name,
      date_of_birth: person.date_of_birth,
      notes: person.notes,
      created_at: person.created_at,
    },
    medications: medications.map((m) => ({
      name: m.name,
      brand_name: m.brand_name,
      dosage: m.dosage,
      color: m.color,
      description: m.description,
      schedule_json: m.schedule_json,
      active: m.active,
      created_at: m.created_at,
    })),
    doctors: doctors.map((d) => ({
      name: d.name,
      specialty: d.specialty,
      phone: d.phone,
      address: d.address,
      notes: d.notes,
      created_at: d.created_at,
    })),
    actions: actions.map((a) => ({
      name: a.name,
      category: a.category,
      notes: a.notes,
      schedule_json: a.schedule_json,
      active: a.active,
      created_at: a.created_at,
    })),
    appointments: appointments.map((a) => ({
      doctorIndex: a.doctor_id !== null ? (doctorIndexById.get(a.doctor_id) ?? null) : null,
      datetime_utc: a.datetime_utc,
      location: a.location,
      prep_notes: a.prep_notes,
      confirmed_at: a.confirmed_at,
      series_id: a.series_id,
      recurrence_rule: a.recurrence_rule,
      created_at: a.created_at,
    })),
    documents: documents.map((doc) => ({
      title: doc.title,
      category: doc.category,
      notes: doc.notes,
      original_filename: doc.original_filename,
      stored_filename: doc.stored_filename,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
      uploaded_at: doc.uploaded_at,
    })),
    doseEvents: doseEvents.map((e) => ({
      medicationIndex: medicationIndexById.get(e.medication_id),
      scheduled_date: e.scheduled_date,
      scheduled_time: e.scheduled_time,
      taken_at: e.taken_at,
      created_at: e.created_at,
    })),
    actionEvents: actionEvents.map((e) => ({
      actionIndex: actionIndexById.get(e.action_id),
      scheduled_date: e.scheduled_date,
      scheduled_time: e.scheduled_time,
      done_at: e.done_at,
      created_at: e.created_at,
    })),
  };
}

async function buildPersonExportZip(db, personId) {
  const person = db.prepare('SELECT * FROM people WHERE id = ?').get(personId);
  const manifest = buildPersonExportManifest(db, personId);
  const documents = db.prepare('SELECT * FROM documents WHERE person_id = ?').all(personId);

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  const docsFolder = zip.folder('documents');
  for (const doc of documents) {
    const filePath = storedPath(personId, doc.stored_filename);
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing document file on export: ${filePath}`);
      continue;
    }
    docsFolder.file(doc.stored_filename, fs.readFileSync(filePath));
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return { buffer, filename: `${slugify(person.name)}-medfam-export-${todayStamp()}.zip` };
}

async function importPersonFromZip(db, zipBuffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new ImportValidationError('File is not a valid zip archive');
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new ImportValidationError('Zip is missing manifest.json -- not a MedFam person export');
  }
  let manifest;
  try {
    manifest = JSON.parse(await manifestEntry.async('string'));
  } catch {
    throw new ImportValidationError('manifest.json is not valid JSON');
  }
  if (manifest.formatVersion !== FORMAT_VERSION) {
    throw new ImportValidationError(`Unsupported export format version: ${manifest.formatVersion}`);
  }
  if (!manifest.person || !manifest.person.name) {
    throw new ImportValidationError('manifest.json is missing the person\'s name');
  }

  // Pre-load every referenced document's bytes (async) before entering the
  // synchronous DB transaction below -- better-sqlite3 transactions can't
  // await, so all zip reads have to happen up front.
  const documentBuffers = [];
  for (const doc of manifest.documents || []) {
    const entry = zip.file(`documents/${doc.stored_filename}`);
    if (!entry) {
      throw new ImportValidationError(`Zip is missing referenced document file: ${doc.stored_filename}`);
    }
    documentBuffers.push(await entry.async('nodebuffer'));
  }

  const now = () => new Date().toISOString();

  const insertPerson = db.prepare('INSERT INTO people (name, date_of_birth, notes, created_at) VALUES (?, ?, ?, ?)');
  const insertMedication = db.prepare(`
    INSERT INTO medications (person_id, name, brand_name, dosage, color, description, schedule_json, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDoctor = db.prepare(`
    INSERT INTO doctors (person_id, name, specialty, phone, address, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAction = db.prepare(`
    INSERT INTO actions (person_id, name, category, notes, schedule_json, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAppointment = db.prepare(`
    INSERT INTO appointments
      (person_id, doctor_id, datetime_utc, location, prep_notes, confirmed_at, series_id, recurrence_rule, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDocument = db.prepare(`
    INSERT INTO documents (person_id, title, category, notes, original_filename, stored_filename, mime_type, size_bytes, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertDoseEvent = db.prepare(`
    INSERT INTO dose_events (id, medication_id, scheduled_date, scheduled_time, taken_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertActionEvent = db.prepare(`
    INSERT INTO action_events (id, action_id, scheduled_date, scheduled_time, done_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const doImport = db.transaction(() => {
    const p = manifest.person;
    const newPersonId = insertPerson.run(p.name, p.date_of_birth ?? null, p.notes ?? null, p.created_at || now())
      .lastInsertRowid;

    const medicationIds = (manifest.medications || []).map(
      (m) =>
        insertMedication.run(
          newPersonId,
          m.name,
          m.brand_name ?? null,
          m.dosage ?? null,
          m.color ?? null,
          m.description ?? null,
          m.schedule_json,
          m.active ?? 1,
          m.created_at || now()
        ).lastInsertRowid
    );

    const doctorIds = (manifest.doctors || []).map(
      (d) =>
        insertDoctor.run(newPersonId, d.name, d.specialty ?? null, d.phone ?? null, d.address ?? null, d.notes ?? null, d.created_at || now())
          .lastInsertRowid
    );

    const actionIds = (manifest.actions || []).map(
      (a) =>
        insertAction.run(newPersonId, a.name, a.category ?? null, a.notes ?? null, a.schedule_json, a.active ?? 1, a.created_at || now())
          .lastInsertRowid
    );

    for (const appt of manifest.appointments || []) {
      const doctorId =
        appt.doctorIndex !== null && appt.doctorIndex !== undefined ? (doctorIds[appt.doctorIndex] ?? null) : null;
      insertAppointment.run(
        newPersonId,
        doctorId,
        appt.datetime_utc,
        appt.location ?? null,
        appt.prep_notes ?? null,
        appt.confirmed_at ?? null,
        appt.series_id ?? null,
        appt.recurrence_rule ?? null,
        appt.created_at || now()
      );
    }

    (manifest.documents || []).forEach((doc, i) => {
      ensurePersonDir(newPersonId);
      const newStoredFilename = generateStoredFilename(doc.original_filename);
      fs.writeFileSync(storedPath(newPersonId, newStoredFilename), documentBuffers[i]);
      insertDocument.run(
        newPersonId,
        doc.title,
        doc.category ?? null,
        doc.notes ?? null,
        doc.original_filename,
        newStoredFilename,
        doc.mime_type ?? null,
        doc.size_bytes ?? null,
        doc.uploaded_at || now()
      );
    });

    for (const e of manifest.doseEvents || []) {
      const medicationId = medicationIds[e.medicationIndex];
      if (medicationId === undefined) continue;
      insertDoseEvent.run(crypto.randomUUID(), medicationId, e.scheduled_date, e.scheduled_time, e.taken_at ?? null, e.created_at || now());
    }

    for (const e of manifest.actionEvents || []) {
      const actionId = actionIds[e.actionIndex];
      if (actionId === undefined) continue;
      insertActionEvent.run(crypto.randomUUID(), actionId, e.scheduled_date, e.scheduled_time, e.done_at ?? null, e.created_at || now());
    }

    return newPersonId;
  });

  const newPersonId = doImport();
  return db.prepare('SELECT * FROM people WHERE id = ?').get(newPersonId);
}

// ---- Full backup export/restore ----

// documentsDir is overridable (defaults to the real data/documents) purely
// for tests: a full restore replaces this directory wholesale, which would
// otherwise stomp on whatever other test files are concurrently writing to
// the real one when the suite runs multiple files in parallel.
async function buildFullBackupZip(db, documentsDir = DOCUMENTS_DIR) {
  const tempPath = path.join(os.tmpdir(), `medfam-backup-${crypto.randomUUID()}.db`);
  try {
    // VACUUM INTO takes a WAL-safe, consistent snapshot in one synchronous
    // call -- unlike db.backup() (Promise-based), which would make this the
    // only async-flavored SQLite operation in an otherwise entirely
    // synchronous route/query codebase.
    db.prepare('VACUUM INTO ?').run(tempPath);

    const zip = new JSZip();
    zip.file('medfam.db', fs.readFileSync(tempPath));
    const docsFolder = zip.folder('documents');
    for (const filePath of walkDir(documentsDir)) {
      const rel = path.relative(documentsDir, filePath).split(path.sep).join('/');
      docsFolder.file(rel, fs.readFileSync(filePath));
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return { buffer, filename: `medfam-backup-${todayStamp()}.zip` };
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

async function importFullBackup(db, zipBuffer, documentsDir = DOCUMENTS_DIR) {
  let zip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new ImportValidationError('File is not a valid zip archive');
  }

  const dbEntry = zip.file('medfam.db');
  if (!dbEntry) {
    throw new ImportValidationError('Zip is missing medfam.db -- not a MedFam backup');
  }
  const dbBuffer = await dbEntry.async('nodebuffer');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medfam-restore-'));
  const tempDbPath = path.join(tempDir, 'medfam.db');
  fs.writeFileSync(tempDbPath, dbBuffer);

  // Stage the restored documents/ tree as a sibling of the real one so the
  // final swap can use same-volume (near-atomic) renames rather than a
  // cross-device copy that os.tmpdir() could force.
  const dataDir = path.dirname(documentsDir);
  const stagingDir = path.join(dataDir, `documents.staging-${crypto.randomUUID()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  try {
    // Bring the uploaded db up to the live schema before attaching it, so
    // `INSERT INTO main.<t> SELECT * FROM backup.<t>` below can rely on both
    // sides having identical column order/count. Also doubles as validation:
    // a non-MedFam or corrupt file fails here, before touching live data.
    let tempDb;
    try {
      tempDb = new Database(tempDbPath);
      tempDb.pragma('foreign_keys = ON');
      runMigrations(tempDb);
    } catch {
      throw new ImportValidationError('Not a valid MedFam backup file');
    } finally {
      if (tempDb) tempDb.close();
    }

    for (const entry of Object.values(zip.files)) {
      if (entry.dir || !entry.name.startsWith('documents/')) continue;
      const rel = entry.name.slice('documents/'.length);
      if (!rel) continue;
      const destPath = path.join(stagingDir, ...rel.split('/'));
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, await entry.async('nodebuffer'));
    }

    db.prepare('ATTACH DATABASE ? AS backup').run(tempDbPath);
    try {
      const restore = db.transaction(() => {
        db.exec('DELETE FROM people'); // cascades medications/doctors/appointments/actions/documents/*_events
        for (const table of [
          'people',
          'medications',
          'doctors',
          'actions',
          'appointments',
          'documents',
          'dose_events',
          'action_events',
        ]) {
          // Safe only because both DBs just ran the identical migration set
          // (identical column order/count) -- would break if a future
          // migration ever reorders/drops columns via table rebuild.
          db.exec(`INSERT INTO main.${table} SELECT * FROM backup.${table}`);
        }
      });
      restore();
    } finally {
      db.exec('DETACH DATABASE backup');
    }

    const oldDir = path.join(dataDir, `documents.old-${crypto.randomUUID()}`);
    if (fs.existsSync(documentsDir)) {
      fs.renameSync(documentsDir, oldDir);
    }
    fs.renameSync(stagingDir, documentsDir);
    fs.rmSync(oldDir, { recursive: true, force: true });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true }); // no-op once renamed into place
  }

  return {
    people: db.prepare('SELECT COUNT(*) AS c FROM people').get().c,
    medications: db.prepare('SELECT COUNT(*) AS c FROM medications').get().c,
    doctors: db.prepare('SELECT COUNT(*) AS c FROM doctors').get().c,
    appointments: db.prepare('SELECT COUNT(*) AS c FROM appointments').get().c,
    actions: db.prepare('SELECT COUNT(*) AS c FROM actions').get().c,
    documents: db.prepare('SELECT COUNT(*) AS c FROM documents').get().c,
  };
}

module.exports = {
  ImportValidationError,
  buildPersonExportZip,
  importPersonFromZip,
  buildFullBackupZip,
  importFullBackup,
};
