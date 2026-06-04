-- User Preferences V2: global theme + per-screen layout/columns (JSONB)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS "uiPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb;
