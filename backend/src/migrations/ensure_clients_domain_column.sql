-- Custom domain / subdomain for client public job board and landing pages
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS domain VARCHAR(255);

COMMENT ON COLUMN clients.domain IS 'Client public site domain, e.g. jobs.example.com';
