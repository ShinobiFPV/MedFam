'use strict';
// Registers MedFam as a real Windows Service (Services.msc), running server.js
// at boot even before anyone logs in, with auto-restart on crash. This is the
// Windows analog of medfam.service (systemd) on the Pi. Run via install.ps1,
// which handles elevation and passes --port/--timezone; invoking this
// directly requires an elevated (Administrator) shell.
const path = require('path');
const { Service } = require('node-windows');

function parseArgs(argv) {
  const args = { port: '8093', timezone: '' };
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'port') args.port = value;
    if (key === 'timezone') args.timezone = value;
  }
  return args;
}

const { port, timezone } = parseArgs(process.argv.slice(2));
// Mirrors install.sh's timedatectl-based detection, using the OS's own zone
// when the caller didn't pin one explicitly.
const resolvedTimezone =
  timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';

const svc = new Service({
  name: 'MedFam',
  description: 'MedFam family medical information manager API',
  script: path.join(__dirname, '..', 'server.js'),
  workingDirectory: path.join(__dirname, '..'),
  env: [
    { name: 'PORT', value: String(port) },
    { name: 'MEDFAM_TIMEZONE', value: resolvedTimezone },
    { name: 'NODE_ENV', value: 'production' },
  ],
});

svc.on('install', () => {
  console.log(`Service installed (port ${port}, timezone ${resolvedTimezone}). Starting...`);
  svc.start();
});

svc.on('start', () => {
  console.log('MedFam service is running.');
});

svc.on('alreadyinstalled', () => {
  console.log(
    'MedFam service is already installed. Its port/timezone are set at install time — ' +
      'to change them, run "npm run uninstall-service" here first, then re-run install.ps1.'
  );
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exitCode = 1;
});

svc.install();
