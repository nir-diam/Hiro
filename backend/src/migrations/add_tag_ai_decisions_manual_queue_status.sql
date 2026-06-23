-- Allow manual_queue review status (used when admin moves a decision to manual correction)
ALTER TABLE tag_ai_decisions
  DROP CONSTRAINT IF EXISTS tag_ai_decisions_review_status_check;

ALTER TABLE tag_ai_decisions
  ADD CONSTRAINT tag_ai_decisions_review_status_check
  CHECK (review_status IN ('pending_review', 'approved', 'overridden', 'manual_queue'));
