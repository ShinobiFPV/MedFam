const { getDb } = require('./src/db');
const { createApp } = require('./src/app');

const PORT = process.env.PORT || 8093;

const db = getDb();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`MedFam API listening on port ${PORT}`);
});
