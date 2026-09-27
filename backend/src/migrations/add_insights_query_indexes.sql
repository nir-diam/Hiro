-- Speed up organization/client insights (job scope + referral counts by jobId).
CREATE INDEX IF NOT EXISTS idx_jobs_client_organization
  ON jobs (client_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_notification_messages_job_id_created
  ON notification_messages ("createdAt")
  WHERE (metadata->'taskPayload'->>'jobId') IS NOT NULL;
