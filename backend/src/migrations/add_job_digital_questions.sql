-- Add digitalQuestions JSONB column to jobs table for storing the automatic screening questionnaire.
-- Run against your PostgreSQL DB that has the jobs table.
-- If your table uses snake_case column names, use the second block instead.

-- Option A: camelCase column names (Sequelize default when underscored is false)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS "digitalQuestions" JSONB DEFAULT '[]'::jsonb;

-- Option B: snake_case column names (if your table uses underscored naming)
-- ALTER TABLE jobs ADD COLUMN IF NOT EXISTS digital_questions JSONB DEFAULT '[]'::jsonb;

