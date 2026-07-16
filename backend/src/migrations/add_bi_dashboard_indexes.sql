-- Indexes to speed BI dashboard aggregations (safe IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_candidates_created_at_not_deleted
  ON candidates ("createdAt")
  WHERE "isDeleted" = false;

CREATE INDEX IF NOT EXISTS idx_candidates_userid_created_at
  ON candidates ("userId", "createdAt")
  WHERE "isDeleted" = false AND "userId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jc_status_events_changed_at
  ON job_candidate_status_events ("changedAt");

CREATE INDEX IF NOT EXISTS idx_jc_status_events_changed_by_at
  ON job_candidate_status_events ("changedByUserId", "changedAt")
  WHERE "changedByUserId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jc_status_events_to_group_at
  ON job_candidate_status_events ("toGroup", "changedAt");

CREATE INDEX IF NOT EXISTS idx_notification_messages_category_created
  ON notification_messages (category, "createdAt");

CREATE INDEX IF NOT EXISTS idx_notification_messages_sender_created
  ON notification_messages ("senderUserId", "createdAt")
  WHERE "senderUserId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_status_client
  ON jobs (status, client_id);
