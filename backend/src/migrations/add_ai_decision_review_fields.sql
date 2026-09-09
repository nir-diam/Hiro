-- Agent/user review fields for AI decision tables (admin corrections UI).

ALTER TABLE tag_ai_decisions
  ADD COLUMN IF NOT EXISTS agent_notes TEXT,
  ADD COLUMN IF NOT EXISTS agent_verdict TEXT,
  ADD COLUMN IF NOT EXISTS user_verdict TEXT;

ALTER TABLE organization_ai_decisions
  ADD COLUMN IF NOT EXISTS agent_notes TEXT,
  ADD COLUMN IF NOT EXISTS agent_verdict TEXT,
  ADD COLUMN IF NOT EXISTS user_verdict TEXT;
