-- Run if recruitment_sources was created without UNIQUE (client_id, name) (e.g. Sequelize sync alone).
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recruitment_sources_client_name_unique'
  ) THEN
    ALTER TABLE recruitment_sources
      ADD CONSTRAINT recruitment_sources_client_name_unique UNIQUE (client_id, name);
  END IF;
END $$;
