-- Run AFTER client_organization_links.sql (migrate data first)

ALTER TABLE clients DROP COLUMN IF EXISTS organization_id;
ALTER TABLE clients DROP COLUMN IF EXISTS organization_tmp_id;
