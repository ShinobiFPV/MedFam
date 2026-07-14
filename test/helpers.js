const { getDb } = require('../src/db');
const { createApp } = require('../src/app');

function createTestServer() {
  const db = getDb(':memory:');
  const app = createApp(db);
  const server = app.listen(0);
  const port = server.address().port;
  return { db, server, baseUrl: `http://127.0.0.1:${port}/api` };
}

module.exports = { createTestServer };
