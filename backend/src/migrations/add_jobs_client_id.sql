-- Link jobs to clients by FK (tenant scoping). Legacy rows keep client_id NULL until backfill.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS client_id UUID NULL
  REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS idx_jobs_client_id ON jobs(client_id);

-- Best-effort backfill from free-text job.client label
UPDATE jobs j
SET client_id = c.id
FROM clients c
WHERE j.client_id IS NULL
  AND (
    LOWER(TRIM(j.client)) = LOWER(TRIM(c.name))
    OR LOWER(TRIM(j.client)) = LOWER(TRIM(c."displayName"))
  );
