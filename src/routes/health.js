const express = require('express');
const { TIME_ZONE } = require('../lib/config');

module.exports = function healthRoutes(db) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', db: 'ok', timezone: TIME_ZONE });
    } catch (err) {
      res.status(500).json({ status: 'error', db: 'error', timezone: TIME_ZONE, error: err.message });
    }
  });

  return router;
};
