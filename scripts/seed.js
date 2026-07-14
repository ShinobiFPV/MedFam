const { getDb } = require('../src/db');

const db = getDb();

function isoDaysFromNow(days, hour = 10, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function reset() {
  db.exec(`
    DELETE FROM dose_events;
    DELETE FROM appointments;
    DELETE FROM doctors;
    DELETE FROM medications;
    DELETE FROM people;
  `);
}

function seed() {
  reset();

  const insertPerson = db.prepare('INSERT INTO people (name, date_of_birth, notes) VALUES (?, ?, ?)');
  const alex = insertPerson.run('Alex Sample', '1948-03-12', 'Prefers morning doses with breakfast.')
    .lastInsertRowid;
  const jordan = insertPerson.run('Jordan Sample', '1950-09-02', 'Has trouble reading small print.')
    .lastInsertRowid;

  const insertMed = db.prepare(`
    INSERT INTO medications (person_id, name, dosage, color, description, schedule_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertMed.run(
    alex,
    'Lisinopril',
    '10mg',
    '#4C6EF5',
    'Blood pressure medication. Take with water.',
    JSON.stringify({ times: ['08:00'], days: 'daily' })
  );
  insertMed.run(
    alex,
    'Metformin',
    '500mg',
    '#F59F00',
    'For blood sugar control. Take with food.',
    JSON.stringify({ times: ['08:00', '18:00'], days: 'daily' })
  );
  insertMed.run(
    alex,
    'Atorvastatin',
    '20mg',
    '#7048E8',
    'Cholesterol medication, taken at night.',
    JSON.stringify({ times: ['21:00'], days: ['mon', 'wed', 'fri'] })
  );

  insertMed.run(
    jordan,
    'Levothyroxine',
    '75mcg',
    '#12B886',
    'Thyroid hormone. Take on an empty stomach.',
    JSON.stringify({ times: ['07:00'], days: 'daily' })
  );
  insertMed.run(
    jordan,
    'Amlodipine',
    '5mg',
    '#E64980',
    'Blood pressure medication.',
    JSON.stringify({ times: ['09:00'], days: 'daily' })
  );
  insertMed.run(
    jordan,
    'Vitamin D3',
    '1000IU',
    '#FAB005',
    'Supplement, taken with breakfast.',
    JSON.stringify({ times: ['09:00'], days: ['tue', 'thu', 'sat'] })
  );

  const insertDoctor = db.prepare(`
    INSERT INTO doctors (person_id, name, specialty, phone, address, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const drReyes = insertDoctor.run(
    alex,
    'Dr. Pat Reyes',
    'Family Medicine',
    '555-0142',
    '123 Main St, Springfield',
    'Prefers appointments booked in the morning.'
  ).lastInsertRowid;
  const drNovak = insertDoctor.run(
    alex,
    'Dr. Jamie Novak',
    'Cardiology',
    '555-0198',
    '45 Oak Ave, Springfield',
    null
  ).lastInsertRowid;
  const drDiaz = insertDoctor.run(
    jordan,
    'Dr. Morgan Diaz',
    'Family Medicine',
    '555-0177',
    '123 Main St, Springfield',
    null
  ).lastInsertRowid;
  const drWhitfield = insertDoctor.run(
    jordan,
    'Dr. Sam Whitfield',
    'Endocrinology',
    '555-0133',
    '700 Elm St, Springfield',
    'Bring recent bloodwork results.'
  ).lastInsertRowid;

  const insertAppt = db.prepare(`
    INSERT INTO appointments (person_id, doctor_id, datetime_utc, location, prep_notes, confirmed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertAppt.run(
    alex,
    drReyes,
    isoDaysFromNow(-14, 14, 30),
    '123 Main St, Springfield',
    'Annual checkup.',
    isoDaysFromNow(-20)
  );
  insertAppt.run(
    alex,
    drNovak,
    isoDaysFromNow(3, 14, 0),
    '45 Oak Ave, Springfield',
    'Bring blood pressure log.',
    null
  );
  insertAppt.run(
    alex,
    drNovak,
    isoDaysFromNow(30, 14, 0),
    '45 Oak Ave, Springfield',
    'Follow-up on cholesterol panel.',
    null
  );

  insertAppt.run(
    jordan,
    drDiaz,
    isoDaysFromNow(-7, 13, 0),
    '123 Main St, Springfield',
    'Flu shot.',
    isoDaysFromNow(-10)
  );
  insertAppt.run(
    jordan,
    drWhitfield,
    isoDaysFromNow(1, 13, 15),
    '700 Elm St, Springfield',
    'Bring recent bloodwork results.',
    null
  );
  insertAppt.run(jordan, drWhitfield, isoDaysFromNow(45, 13, 15), '700 Elm St, Springfield', 'Thyroid follow-up.', null);

  console.log('Seed complete.');
  console.log(`  Alex Sample -> person id ${alex}`);
  console.log(`  Jordan Sample -> person id ${jordan}`);
}

seed();
db.close();
