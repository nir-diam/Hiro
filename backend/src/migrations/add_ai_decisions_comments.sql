-- Comments / notes on AI correction decisions (org + tags)
ALTER TABLE organization_ai_decisions
  ADD COLUMN IF NOT EXISTS comments TEXT;

ALTER TABLE tag_ai_decisions
  ADD COLUMN IF NOT EXISTS comments TEXT;
