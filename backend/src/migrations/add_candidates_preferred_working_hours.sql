-- Daily schedule preference (גמיש / HH:mm-HH:mm), separate from recruitment timeline in availability (emoji options).
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS "preferredWorkingHours" VARCHAR(255);
