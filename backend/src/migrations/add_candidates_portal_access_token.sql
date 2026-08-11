ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "portalAccessToken" UUID NULL,
  ADD COLUMN IF NOT EXISTS "portalAccessTokenExpiresAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_portal_access_token
  ON candidates ("portalAccessToken")
  WHERE "portalAccessToken" IS NOT NULL;
