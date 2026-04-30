-- notification_messages.status: replace ENUM with VARCHAR(500) so screening_cv can store recruitment_statuses.name.
-- Run against PostgreSQL once.

ALTER TABLE notification_messages
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE notification_messages
  ALTER COLUMN status TYPE VARCHAR(500) USING (status::text);

ALTER TABLE notification_messages
  ALTER COLUMN status SET DEFAULT 'unread';

ALTER TABLE notification_messages
  ALTER COLUMN status SET NOT NULL;

-- After conversion: copy workflow label from metadata for screening rows still at inbox default
UPDATE notification_messages
SET status = LEFT(TRIM(metadata->>'referralWorkflowStatus'), 500)
WHERE category = 'screening_cv'
  AND metadata ? 'referralWorkflowStatus'
  AND TRIM(COALESCE(metadata->>'referralWorkflowStatus', '')) <> ''
  AND TRIM(status) = 'unread';

-- Optional: drop orphaned enum type if Sequelize created it (name may vary — list with \dT+ )
-- DROP TYPE IF EXISTS enum_notification_messages_status;
