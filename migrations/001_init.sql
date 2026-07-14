-- Initial MedFam schema

CREATE TABLE people (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  date_of_birth TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE medications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  dosage        TEXT,
  color         TEXT,
  description   TEXT,
  schedule_json TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medications_person_id ON medications(person_id);

CREATE TABLE dose_events (
  id              TEXT PRIMARY KEY,
  medication_id   INTEGER NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL,
  taken_at        TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (medication_id, scheduled_date, scheduled_time)
);
CREATE INDEX idx_dose_events_medication_id ON dose_events(medication_id);
CREATE INDEX idx_dose_events_scheduled_date ON dose_events(scheduled_date);

CREATE TABLE doctors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id   INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  specialty   TEXT,
  phone       TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_doctors_person_id ON doctors(person_id);

CREATE TABLE appointments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  doctor_id     INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  datetime_utc  TEXT NOT NULL,
  location      TEXT,
  prep_notes    TEXT,
  confirmed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_appointments_person_id ON appointments(person_id);
CREATE INDEX idx_appointments_datetime_utc ON appointments(datetime_utc);
