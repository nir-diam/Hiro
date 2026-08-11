-- Add איכות הנתונים (data completeness) to organizations.
-- Values: נתונים מלאים | חסרים מלאים
-- Run against your PostgreSQL DB.

-- Option A: camelCase (Sequelize default when underscored is false)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "dataCompleteness" VARCHAR(100);

-- Option B: snake_case (if your table uses underscored naming)
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS data_completeness VARCHAR(100);
