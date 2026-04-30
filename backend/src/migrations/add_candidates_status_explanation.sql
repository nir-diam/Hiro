-- Explains why the candidate has the current automated status (e.g. חסר נתונים), for UI tooltip next to סטטוס.
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS "statusExplanation" TEXT NULL;

COMMENT ON COLUMN candidates."statusExplanation" IS 'Optional Hebrew/system narrative: why this status applies (automated completeness / ready to approve).';
