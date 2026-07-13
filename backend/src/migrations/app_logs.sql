-- Application / system logs (separate from audit_logs user-action journal)

CREATE TABLE IF NOT EXISTS app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level VARCHAR(16) NOT NULL DEFAULT 'info',
  source VARCHAR(128) NOT NULL DEFAULT 'system',
  message TEXT NOT NULL DEFAULT '',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id UUID,
  user_email VARCHAR(255),
  request_id VARCHAR(64),
  stack_trace TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON app_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_source ON app_logs (source);

COMMENT ON TABLE app_logs IS 'Application/system logs for admin diagnostics';
