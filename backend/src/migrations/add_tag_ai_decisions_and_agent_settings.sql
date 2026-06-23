-- Tag correction AI agent: decisions queue + platform toggle + per-client toggle

ALTER TABLE client_usage_settings
  ADD COLUMN IF NOT EXISTS tag_correction_agent_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS tag_correction_platform_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  agent_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tag_correction_platform_settings (id, agent_enabled)
VALUES (1, TRUE)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tag_ai_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  original_term TEXT NOT NULL,
  detected_type VARCHAR(32) NOT NULL DEFAULT 'skill',
  context_sample TEXT,
  ai_decision VARCHAR(16) NOT NULL CHECK (ai_decision IN ('merge', 'create', 'delete')),
  ai_suggested_target TEXT,
  ai_reasoning TEXT,
  candidate_tags_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status VARCHAR(24) NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review', 'approved', 'overridden', 'manual_queue')),
  reviewer_action VARCHAR(16),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS tag_ai_decisions_pending_tag_pending_review_uq
  ON tag_ai_decisions (pending_tag_id)
  WHERE review_status = 'pending_review';

CREATE INDEX IF NOT EXISTS tag_ai_decisions_review_status_idx ON tag_ai_decisions (review_status);
CREATE INDEX IF NOT EXISTS tag_ai_decisions_created_at_idx ON tag_ai_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS tag_ai_decisions_ai_decision_idx ON tag_ai_decisions (ai_decision);

-- Seed prompt for new installs / manual run (promptService also includes this id on empty DB)
INSERT INTO prompts (id, name, description, template, model, temperature, variables, category, comments)
VALUES (
  'tag_correction_agent',
  'Tag correction agent (normalize pending tags)',
  'Decides merge, create, or delete for non-normalized tag terms using hybrid-search candidates.',
  $prompt$
You are a technical AI agent specializing in precise data normalization and tag classification for CVs and job postings (tech, finance) stored in a recruitment database.
Your goal is to analyze a non-normalized text term and decide whether to merge it into an existing tag, create a new tag, or delete it.

You will receive a JSON object with:
1. "original_term": the term requiring handling.
2. "context_sample": where the term appeared in text (to infer Skill, Education, role, or noise).
3. "candidate_tags": a short list of approved existing tags that may match (from Hybrid Search).

**Decision rules:**
* MERGE: choose when the original term is a synonym, abbreviation, slang, or typo that means exactly the same as one specific tag in "candidate_tags".
* CREATE: choose when the term is a professional skill, programming language, clear job title, or academic degree not covered by any tag in "candidate_tags".
* DELETE: choose when the term is not professionally relevant, is punctuation noise, or demographic trivia (e.g. "driver license", hobbies).

**Critical constraint:**
If you choose "merge", you MUST set "target_tag" to the exact case-sensitive string from one entry in "candidate_tags". Otherwise set "target_tag" to null.

**Output:** Return ONLY valid JSON, no preamble:
{
  "action": "merge" | "create" | "delete",
  "target_tag": "string" | null,
  "reasoning": "Short concise sentence in Hebrew, max 15 words"
}
$prompt$,
  'gemini-3-flash-preview',
  0.1,
  '[]'::jsonb,
  'analysis',
  ''
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  template = EXCLUDED.template,
  model = EXCLUDED.model,
  temperature = EXCLUDED.temperature,
  category = EXCLUDED.category;
