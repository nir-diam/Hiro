-- Matching engine admin settings (missing info policy, penalties, weights)
-- are stored as JSON inside matching_engine_configs.config — NOT as separate columns.
--
-- You do NOT need ALTER TABLE when adding fields like:
--   missingGeoScore, missingAgeScore, missingSalaryScore, penaltyPolicies, …
--
-- Save from Admin UI → PUT /api/admin/matching-engine/config (global)
-- or preset row config JSON. Scoring reads via resolveEngineConfigForJob().

-- ── Only run if the table does not exist (otherwise Sequelize sync may have created it) ──

CREATE TABLE IF NOT EXISTS matching_engine_configs (
  id          SERIAL PRIMARY KEY,
  config_key  VARCHAR(255) NOT NULL UNIQUE DEFAULT 'global',
  type        VARCHAR(20)  NOT NULL DEFAULT 'global',
  label       VARCHAR(255),
  description TEXT,
  client_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Optional: link Company Settings preset to client (if not already applied) ──
-- See also: add_client_usage_settings_matching_engine_preset_id.sql

-- ALTER TABLE client_usage_settings
--   ADD COLUMN IF NOT EXISTS matching_engine_preset_id INTEGER NULL
--   REFERENCES matching_engine_configs(id) ON DELETE SET NULL;

-- ── Optional backfill: ensure global row exists (defaults applied at read time in code) ──

INSERT INTO matching_engine_configs (config_key, type, config)
VALUES (
  'global',
  'global',
  '{
    "missingGeoScore": 50,
    "missingAgeScore": 6,
    "missingSalaryScore": 0,
    "salaryDiffThreshold": 10,
    "salaryPenalty": 5,
    "ageGapPenalty": 2,
    "penaltyPolicies": {
      "gender":       { "mismatch": 10, "missing": 5 },
      "mobility":     { "mismatch": 10, "missing": 5 },
      "scope":        { "mismatch": 10, "missing": 5 },
      "license":      { "mismatch": 10, "missing": 5 },
      "work_hours":   { "mismatch": 8,  "missing": 4 },
      "availability": { "mismatch": 8,  "missing": 4 }
    }
  }'::jsonb
)
ON CONFLICT (config_key) DO NOTHING;

-- To merge missingAgeScore into an existing global config without overwriting other keys:
--
-- UPDATE matching_engine_configs
-- SET config = config || '{"missingAgeScore": 6}'::jsonb
-- WHERE config_key = 'global' AND (config->>'missingAgeScore') IS NULL;
