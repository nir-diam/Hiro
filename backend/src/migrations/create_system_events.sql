-- Automatic system-generated events (admin-managed catalog).
-- Each row represents an automatic event that the backend may emit, with a
-- microcopy template the UI uses when rendering the event.
-- Run manually if you do not rely on Sequelize sync to create the table.

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "triggerName" VARCHAR(255) NOT NULL,
  "eventName" VARCHAR(255) NOT NULL,
  "contentTemplate" TEXT NOT NULL DEFAULT '',
  "forCandidate" BOOLEAN NOT NULL DEFAULT false,
  "forJob" BOOLEAN NOT NULL DEFAULT false,
  "forClient" BOOLEAN NOT NULL DEFAULT false,
  "textColor" VARCHAR(32) NOT NULL DEFAULT '#000000',
  "bgColor" VARCHAR(32) NOT NULL DEFAULT '#ffffff',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_events_sort     ON system_events ("sortOrder", "createdAt");
CREATE INDEX IF NOT EXISTS idx_system_events_trigger  ON system_events ("triggerName");
CREATE INDEX IF NOT EXISTS idx_system_events_active   ON system_events ("isActive");
