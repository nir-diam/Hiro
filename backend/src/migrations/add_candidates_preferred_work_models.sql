-- Preferred work arrangement (multi-select): בית / היברידי / משרד
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS "preferredWorkModels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
