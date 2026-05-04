-- Job screening pool / re-application rules (NewJobView).
-- PostgreSQL: columns match Sequelize camelCase attributes on Job model.
-- Run manually against your DB when deploying.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "reScreeningCooldownMonths" INTEGER DEFAULT 3;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "requireOriginalCv" BOOLEAN DEFAULT false;

COMMENT ON COLUMN jobs."reScreeningCooldownMonths" IS 'Months after rejection/exit before candidate can re-enter screening for this job; 0 = immediate.';
COMMENT ON COLUMN jobs."requireOriginalCv" IS 'When true, auto-screening excludes candidates without an original CV file in the system.';
