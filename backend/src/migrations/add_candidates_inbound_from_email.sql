-- Inbound (envelope) sender for email-originated candidates; not overwritten by CV parse email.
-- Allows findByFrom after candidate.email is updated to the person in the attached CV.
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "inboundFromEmail" VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_inbound_from_email
  ON candidates ("inboundFromEmail")
  WHERE "inboundFromEmail" IS NOT NULL;
