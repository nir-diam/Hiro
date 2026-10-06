-- Per-job automatic CV forwarding settings (external recipient dispatch).
-- PostgreSQL: column matches Sequelize camelCase attribute on Job model.
-- Run manually against your DB when deploying.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS "cvForwardSettings" JSONB NOT NULL DEFAULT '{
    "enabled": false,
    "recipients": [],
    "subjectPrefixTemplate": "{{מקור_גיוס}}"
  }'::jsonb;

COMMENT ON COLUMN jobs."cvForwardSettings" IS
  'Automatic CV forwarding: enabled flag, recipients (internal users + external emails), subject prefix template with {{variables}}.';
