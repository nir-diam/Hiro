-- Migration: create organization_ai_decisions table
-- Stores every AI decision made for unrecognized company names encountered
-- during candidate creation. Admins review these in AdminCompanyCorrectionsView.

CREATE TABLE IF NOT EXISTS organization_ai_decisions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  original_term    TEXT         NOT NULL,
  candidate_id     UUID         REFERENCES candidates(id)      ON DELETE SET NULL,
  organization_tmp_id UUID      REFERENCES organizations_tmp(id) ON DELETE SET NULL,
  ai_decision      VARCHAR(32)  NOT NULL,                          -- 'create_company' | 'merge_company' | 'map_generic'
  ai_suggested_target      TEXT,                                   -- target company name or generic bucket label
  ai_suggested_target_id   UUID REFERENCES organizations(id) ON DELETE SET NULL,  -- existing org to merge into
  ai_reasoning     TEXT,
  hesitation_level INTEGER,                                        -- 0-100, higher = more uncertain
  dilemma_reasoning TEXT,
  similar_entities JSONB        NOT NULL DEFAULT '[]',             -- [{name, similarity}]
  review_status    VARCHAR(24)  NOT NULL DEFAULT 'pending_review', -- 'pending_review'|'approved'|'changed'|'manual'
  reviewer_action  VARCHAR(32),
  resolved_at      TIMESTAMPTZ,
  context          VARCHAR(64)  DEFAULT 'resume',                  -- 'resume' | 'email' | 'manual'
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_ai_decisions_review_status
  ON organization_ai_decisions(review_status);

CREATE INDEX IF NOT EXISTS idx_org_ai_decisions_candidate_id
  ON organization_ai_decisions(candidate_id);

CREATE INDEX IF NOT EXISTS idx_org_ai_decisions_created_at
  ON organization_ai_decisions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_org_ai_decisions_org_tmp_id
  ON organization_ai_decisions(organization_tmp_id);
