-- Link staff users to a client (tenant)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "clientId" UUID NULL
  REFERENCES clients (id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_client_id ON users ("clientId");

-- Optional: backfill example (set all recruiters/managers to one client)
-- UPDATE users SET "clientId" = 'YOUR-CLIENT-UUID' WHERE role IN ('manager', 'recruiter') AND "clientId" IS NULL;
