-- Add סטטוס פעילות (activity status) column to organizations.
-- Values: פעילה | לא פעילה | לא ידוע | בפירוק
-- Run against your PostgreSQL DB.

-- Option A: camelCase (Sequelize default when underscored is false)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS "activityStatus" VARCHAR(100);

-- Option B: snake_case (if your table uses underscored naming)
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS activity_status VARCHAR(100);
