ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS "staffShadowPinned" BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN candidates."staffShadowPinned" IS
  'Staff shadow only: the pinned copy is the only shadow sent to clients when "עותק צל" is selected.';
