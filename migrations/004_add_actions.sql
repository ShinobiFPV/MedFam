-- Action tracking: non-appointment, non-medication regimens the person
-- follows on their own (exercise, self-directed physio, etc). Mirrors the
-- medications/dose_events split -- actions is the recurring plan, and
-- action_events are the day-by-day generated instances marked done.

CREATE TABLE actions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id     INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      TEXT,
  notes         TEXT,
  schedule_json TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_actions_person_id ON actions(person_id);

CREATE TABLE action_events (
  id              TEXT PRIMARY KEY,
  action_id       INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  scheduled_date  TEXT NOT NULL,
  scheduled_time  TEXT NOT NULL,
  done_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (action_id, scheduled_date, scheduled_time)
);
CREATE INDEX idx_action_events_action_id ON action_events(action_id);
CREATE INDEX idx_action_events_scheduled_date ON action_events(scheduled_date);
