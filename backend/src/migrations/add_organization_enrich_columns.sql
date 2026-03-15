-- Add columns for organization enrichment (email, address, phone, מגמת צמיחה / growthTrend).
-- Run against your PostgreSQL DB that has the organizations table.
-- If your table uses snake_case column names, use the second block instead.

-- Option A: camelCase column names (Sequelize default when underscored is false)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "email" VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "phone" VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "growthTrend" VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "latitude" DECIMAL(10, 7);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "longitude" DECIMAL(10, 7);

-- Option B: snake_case column names (if your table uses underscored naming)
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS email VARCHAR(255);
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address TEXT;
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone VARCHAR(255);
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS growth_trend VARCHAR(255);
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7);
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS longitude DECIMAL(10, 7);
