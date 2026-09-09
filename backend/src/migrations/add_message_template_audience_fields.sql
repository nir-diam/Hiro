-- Audience flags: which recipient types may use each message template in compose UI.
ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS for_candidate BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS for_client_contact BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS for_team_member BOOLEAN NOT NULL DEFAULT TRUE;
