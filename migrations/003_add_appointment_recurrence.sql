-- Recurring appointments: occurrences are materialized as individual rows
-- (like dose_events are for medications) so each one can be confirmed,
-- edited, or deleted on its own. Rows that were created together share a
-- series_id, and carry the rule that generated them for display purposes.

ALTER TABLE appointments ADD COLUMN series_id TEXT;
ALTER TABLE appointments ADD COLUMN recurrence_rule TEXT;
CREATE INDEX idx_appointments_series_id ON appointments(series_id);
