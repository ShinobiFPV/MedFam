-- Uploaded documents: scans/photos of medical paperwork (referral letters,
-- lab results, insurance cards, visit summaries, etc) attached to a
-- person's file. This table is metadata only -- the bytes live on disk
-- under data/documents/<person_id>/<stored_filename>, keyed by
-- stored_filename so a re-upload with the same original name never
-- collides with (or overwrites) an earlier one.
CREATE TABLE documents (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id         INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  category          TEXT,
  notes             TEXT,
  original_filename TEXT NOT NULL,
  stored_filename   TEXT NOT NULL UNIQUE,
  mime_type         TEXT,
  size_bytes        INTEGER,
  uploaded_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_documents_person_id ON documents(person_id);
