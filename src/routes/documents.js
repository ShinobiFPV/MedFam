const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { personExists } = require('../lib/validate');
const {
  ensurePersonDir,
  storedPath,
  generateStoredFilename,
  deleteDocumentFile,
} = require('../lib/documentStorage');

const MAX_UPLOAD_MB = Number(process.env.MEDFAM_MAX_UPLOAD_MB) || 25;

// Scans/photos of paperwork plus the handful of document formats a doctor's
// office might actually hand someone. Anything else (executables, archives,
// etc) is rejected -- there's no legitimate reason to store those here.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

// Buffered in memory (files are capped at MAX_UPLOAD_MB) rather than
// streamed straight to disk via multer's own storage engine, because the
// destination directory depends on person_id, a form field multer can't
// reliably guarantee has been parsed yet when the file field arrives first.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File exceeds the ${MAX_UPLOAD_MB}MB limit` });
    }
    res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

module.exports = function documentRoutes(db) {
  const router = express.Router();

  router.get('/documents', (req, res) => {
    const { person_id } = req.query;
    const rows = person_id
      ? db.prepare('SELECT * FROM documents WHERE person_id = ? ORDER BY uploaded_at DESC').all(person_id)
      : db.prepare('SELECT * FROM documents ORDER BY uploaded_at DESC').all();
    res.json(rows);
  });

  router.get('/documents/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  });

  router.get('/documents/:id/file', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    const filePath = storedPath(doc.person_id, doc.stored_filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing from disk' });

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    const safeName = doc.original_filename.replace(/[":\\]/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.sendFile(path.resolve(filePath));
  });

  router.post('/documents', handleUpload, (req, res) => {
    const { person_id, title, category, notes } = req.body || {};
    if (!person_id || !title) {
      return res.status(400).json({ error: 'person_id and title are required' });
    }
    if (!personExists(db, person_id)) {
      return res.status(400).json({ error: `person_id ${person_id} does not exist` });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    ensurePersonDir(person_id);
    const storedFilename = generateStoredFilename(req.file.originalname);
    fs.writeFileSync(storedPath(person_id, storedFilename), req.file.buffer);

    const info = db
      .prepare(
        `
        INSERT INTO documents
          (person_id, title, category, notes, original_filename, stored_filename, mime_type, size_bytes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        person_id,
        title,
        category || null,
        notes || null,
        req.file.originalname,
        storedFilename,
        req.file.mimetype,
        req.file.size
      );
    res.status(201).json(db.prepare('SELECT * FROM documents WHERE id = ?').get(info.lastInsertRowid));
  });

  router.put('/documents/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { title, category, notes } = req.body || {};
    if (title !== undefined && !title) {
      return res.status(400).json({ error: 'title cannot be empty' });
    }
    db.prepare('UPDATE documents SET title = ?, category = ?, notes = ? WHERE id = ?').run(
      title !== undefined ? title : doc.title,
      category !== undefined ? category : doc.category,
      notes !== undefined ? notes : doc.notes,
      req.params.id
    );
    res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id));
  });

  router.delete('/documents/:id', (req, res) => {
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    deleteDocumentFile(doc.person_id, doc.stored_filename);
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.status(204).end();
  });

  return router;
};
