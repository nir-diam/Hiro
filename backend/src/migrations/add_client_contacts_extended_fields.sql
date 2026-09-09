-- Extended contact fields: split name, multi contact channels, distribution toggles.
ALTER TABLE client_contacts
  ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(255) NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(255) NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "distributionEmail" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "distributionSms" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "distributionWhatsapp" BOOLEAN NOT NULL DEFAULT true;
