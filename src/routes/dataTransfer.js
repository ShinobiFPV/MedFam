const express = require('express');
const multer = require('multer');
const { personExists } = require('../lib/validate');
const {
  ImportValidationError,
  buildPersonExportZip,
  importPersonFromZip,
  buildFullBackupZip,
  importFullBackup,
} = require('../lib/dataTransfer');

const MAX_TRANSFER_MB = Number(process.env.MEDFAM_MAX_TRANSFER_MB) || 250;

// Separate, larger-limit multer instance from documents.js's (a full backup
// or a person's whole document set is bigger than any single upload).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TRANSFER_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Real-world zip MIME types are inconsistent across browsers/OSes, so
    // fall back to the file extension.
    const isZipMime = ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(
      file.mimetype
    );
    const isZipName = /\.zip$/i.test(file.originalname || '');
    if (isZipMime || isZipName) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File exceeds the ${MAX_TRANSFER_MB}MB limit` });
    }
    res.status(400).json({ error: err.message || 'Upload failed' });
  });
}

module.exports = function dataTransferRoutes(db) {
  const router = express.Router();

  router.get('/people/:id/export', async (req, res, next) => {
    try {
      if (!personExists(db, req.params.id)) {
        return res.status(404).json({ error: 'Person not found' });
      }
      const { buffer, filename } = await buildPersonExportZip(db, req.params.id);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post('/people/import', handleUpload, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const person = await importPersonFromZip(db, req.file.buffer);
      res.status(201).json(person);
    } catch (err) {
      if (err instanceof ImportValidationError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  router.get('/backup/export', async (req, res, next) => {
    try {
      const { buffer, filename } = await buildFullBackupZip(db);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  });

  router.post('/backup/import', handleUpload, async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const restored = await importFullBackup(db, req.file.buffer);
      res.json({ restored });
    } catch (err) {
      if (err instanceof ImportValidationError) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  });

  return router;
};
