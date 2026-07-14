'use strict';
// Removes the MedFam Windows Service registered by install-service.js.
// Requires an elevated (Administrator) shell.
const path = require('path');
const { Service } = require('node-windows');

const svc = new Service({
  name: 'MedFam',
  script: path.join(__dirname, '..', 'server.js'),
});

svc.on('uninstall', () => {
  console.log('MedFam service uninstalled.');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exitCode = 1;
});

svc.uninstall();
