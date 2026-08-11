-- InforU SMS RSVP — outbound invitations + inbound reply tracking (see smsRsvpService)

CREATE TABLE IF NOT EXISTS sms_rsvp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL,
  phone VARCHAR(32) NOT NULL,
  phone_digits VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  rsvp_response VARCHAR(48) NULL,
  outbound_message TEXT NULL,
  outbound_sent_at TIMESTAMPTZ NULL,
  inforu_customer_message_id VARCHAR(128) NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ NULL,
  inbound_message_raw TEXT NULL,
  inbound_keyword VARCHAR(64) NULL,
  reminder_sent_at TIMESTAMPTZ NULL,
  delivery_status VARCHAR(64) NULL,
  delivery_status_at TIMESTAMPTZ NULL,
  created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sms_rsvp_requests_status_chk CHECK (
    status IN ('pending', 'answered', 'expired', 'no_response', 'delivery_failed')
  ),
  CONSTRAINT sms_rsvp_requests_response_chk CHECK (
    rsvp_response IS NULL OR rsvp_response IN (
      'confirmed',
      'confirmed_with_reservations',
      'declined',
      'other',
      'manual_review'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_sms_rsvp_requests_phone_pending
  ON sms_rsvp_requests (phone_digits, expires_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sms_rsvp_requests_candidate
  ON sms_rsvp_requests (candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_rsvp_requests_job
  ON sms_rsvp_requests (job_id, created_at DESC);

-- Only one open pending RSVP per candidate at a time (enforced also in service layer)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_rsvp_requests_one_pending_per_candidate
  ON sms_rsvp_requests (candidate_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sms_rsvp_inbound_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  phone VARCHAR(32) NOT NULL,
  phone_digits VARCHAR(32) NOT NULL,
  message TEXT NULL,
  keyword VARCHAR(64) NULL,
  short_code VARCHAR(32) NULL,
  parse_result VARCHAR(48) NULL,
  matched_request_id UUID NULL REFERENCES sms_rsvp_requests(id) ON DELETE SET NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sms_rsvp_inbound_log_phone
  ON sms_rsvp_inbound_log (phone_digits, received_at DESC);

CREATE TABLE IF NOT EXISTS sms_rsvp_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NULL REFERENCES sms_rsvp_requests(id) ON DELETE SET NULL,
  phone VARCHAR(32) NULL,
  phone_digits VARCHAR(32) NULL,
  delivery_status VARCHAR(64) NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_rsvp_delivery_log_request
  ON sms_rsvp_delivery_log (request_id, received_at DESC);
