-- Client logo and brand color for landing pages / Nano Banana posters
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS "logoUrl" VARCHAR(2048),
  ADD COLUMN IF NOT EXISTS "primaryColor" VARCHAR(32);

COMMENT ON COLUMN clients."logoUrl" IS 'Public URL of company logo (S3)';
COMMENT ON COLUMN clients."primaryColor" IS 'Primary brand hex color, e.g. #1e293b';
