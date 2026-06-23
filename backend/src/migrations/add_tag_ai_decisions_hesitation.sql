-- Add hesitation/dilemma fields to tag_ai_decisions
-- hesitation_level: 0-100 (0 = fully certain, 100 = maximum doubt)
-- dilemma_reasoning: LLM explanation of the hesitation level in Hebrew

ALTER TABLE tag_ai_decisions
  ADD COLUMN IF NOT EXISTS hesitation_level INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dilemma_reasoning TEXT DEFAULT NULL;
