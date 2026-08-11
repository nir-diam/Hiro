ALTER TABLE login_email_codes
  ADD COLUMN IF NOT EXISTS delivery_channel VARCHAR(16) NOT NULL DEFAULT 'email';
