-- SLA unit for pipeline stages (days | hours | minutes). Default days preserves existing behavior.
ALTER TABLE client_pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_limit_unit VARCHAR(16) NOT NULL DEFAULT 'days';

ALTER TABLE candidate_pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_limit_unit VARCHAR(16) NOT NULL DEFAULT 'days';
