-- Job timeline / journal events (same JSON shape as candidate events).
-- Run on PostgreSQL after jobs table exists.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN jobs.events IS 'Array of job journal events: id, type[], date, coordinator, status, linkedTo, description, history';
