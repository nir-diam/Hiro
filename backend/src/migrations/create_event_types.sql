-- Custom event types for candidate/job/client event tables (settings UI).
-- Run manually if you do not rely on Sequelize sync to create the table.

CREATE TABLE IF NOT EXISTS event_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  name VARCHAR(500) NOT NULL,
  "textColor" VARCHAR(32) NOT NULL DEFAULT '#000000',
  "bgColor" VARCHAR(32) NOT NULL DEFAULT '#ffffff',
  "forCandidate" BOOLEAN NOT NULL DEFAULT false,
  "forJob" BOOLEAN NOT NULL DEFAULT false,
  "forClient" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_types_sort ON event_types ("sortOrder", "createdAt");
