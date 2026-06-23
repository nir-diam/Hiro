ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS "mainField2" TEXT[] DEFAULT '{}';
