CREATE TABLE IF NOT EXISTS login_email_codes (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email VARCHAR(255) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  client_id UUID NULL REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_email_codes_user_id ON login_email_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_login_email_codes_email ON login_email_codes (email);
CREATE INDEX IF NOT EXISTS idx_login_email_codes_expires ON login_email_codes (expires_at);
