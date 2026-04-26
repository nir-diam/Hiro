-- Reference / helper info entries managed from the admin "מידע עזר" screen.
-- Each row is a key/value/description triple used to surface contextual tips and metadata across the app.
-- Run manually if you do not rely on Sequelize sync to create the table.

CREATE TABLE IF NOT EXISTS reference_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(255) NOT NULL UNIQUE,
  "value" TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reference_info_sort ON reference_info ("sortOrder", "createdAt");
CREATE INDEX IF NOT EXISTS idx_reference_info_key ON reference_info ("key");
