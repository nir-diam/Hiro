-- Repeat referral tracking + assignee on outbound notifications.
-- Run once against PostgreSQL.

ALTER TABLE public.notification_messages
  ADD COLUMN IF NOT EXISTS "isRepeat" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.notification_messages
  ADD COLUMN IF NOT EXISTS "assigneeId" UUID NULL;

-- Optional: enforce assignee → users.id (same type as senderUserId)
-- ALTER TABLE public.notification_messages
--   DROP CONSTRAINT IF EXISTS notification_messages_assignee_id_fkey;
-- ALTER TABLE public.notification_messages
--   ADD CONSTRAINT notification_messages_assignee_id_fkey
--   FOREIGN KEY ("assigneeId") REFERENCES public.users (id) ON DELETE SET NULL;
