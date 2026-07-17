const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DOCUMENTS_DIR = path.join(__dirname, '..', '..', 'data', 'documents');

function personDir(personId) {
  return path.join(DOCUMENTS_DIR, String(personId));
}

function ensurePersonDir(personId) {
  const dir = personDir(personId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storedPath(personId, storedFilename) {
  return path.join(personDir(personId), storedFilename);
}

// Filenames on disk are never derived from the user-supplied original name --
// randomUUID keeps them collision-free and avoids passing arbitrary
// user-controlled path characters through to fs calls.
function generateStoredFilename(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

function deleteDocumentFile(personId, storedFilename) {
  fs.rmSync(storedPath(personId, storedFilename), { force: true });
}

function deletePersonDocuments(personId) {
  fs.rmSync(personDir(personId), { recursive: true, force: true });
}

module.exports = {
  personDir,
  ensurePersonDir,
  storedPath,
  generateStoredFilename,
  deleteDocumentFile,
  deletePersonDocuments,
};
