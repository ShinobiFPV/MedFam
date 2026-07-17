const { getDb } = require('../src/db');
const { createApp } = require('../src/app');

// Every test gets its own :memory: db, but document uploads still land on
// the real, shared data/documents/<person_id>/ tree -- and person ids are
// small autoincrement integers that restart at 1 in every fresh db. Two
// test *files* running concurrently can each mint a person id=1 and collide
// on the same real directory, so package.json's "test" script pins
// --test-concurrency=1 to run files sequentially and avoid that race.

function createTestServer() {
  const db = getDb(':memory:');
  const app = createApp(db);
  const server = app.listen(0);
  const port = server.address().port;
  return { db, server, baseUrl: `http://127.0.0.1:${port}/api` };
}

module.exports = { createTestServer };
