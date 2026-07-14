const path = require('path');
const fs = require('fs');
const express = require('express');
const healthRoutes = require('./routes/health');
const peopleRoutes = require('./routes/people');
const medicationRoutes = require('./routes/medications');
const doctorRoutes = require('./routes/doctors');
const appointmentRoutes = require('./routes/appointments');
const doseEventRoutes = require('./routes/doseEvents');

const PWA_DIST = path.join(__dirname, '..', 'pwa', 'dist');

function createApp(db) {
  const app = express();
  app.use(express.json());

  // Phase 1 is Tailscale-only with no auth. When auth is added, mount the
  // middleware here (single choke point for every /api route below).
  const auth = (req, res, next) => next();

  // The tablet PWA is same-origin (served from this app) and needs no CORS,
  // but the Electron admin app runs on a different machine and fetches an
  // absolute cross-origin URL. Permissive is fine here — there's no auth
  // boundary for CORS to protect either side of.
  const cors = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };

  const api = express.Router();
  api.use(cors);
  api.use(auth);
  api.use(healthRoutes(db));
  api.use(peopleRoutes(db));
  api.use(medicationRoutes(db));
  api.use(doctorRoutes(db));
  api.use(appointmentRoutes(db));
  api.use(doseEventRoutes(db));

  app.use('/api', api);

  // Serves the Phase 2 PWA build (pwa/dist) at '/', same origin as the API so
  // the tablet app needs no CORS. Guarded by existsSync so the API still runs
  // standalone (e.g. local dev) before the PWA has ever been built.
  if (fs.existsSync(PWA_DIST)) {
    app.use(express.static(PWA_DIST));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(PWA_DIST, 'index.html'));
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
