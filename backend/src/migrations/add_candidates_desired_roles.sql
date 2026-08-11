-- Candidate preferred job roles (managed job-field taxonomy selections)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS "desiredRoles" JSONB NOT NULL DEFAULT '[]'::jsonb;
