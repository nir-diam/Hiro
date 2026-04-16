-- Staff invite: one-time activation token (cleared after first password set)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "activationGuid" UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_activation_guid
  ON users ("activationGuid")
  WHERE "activationGuid" IS NOT NULL;
