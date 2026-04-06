-- Per-client usage settings (Company Settings → Usage tab). Run if not using Sequelize sync.
CREATE TABLE IF NOT EXISTS client_usage_settings (
  client_id UUID NOT NULL PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  double_auth VARCHAR(32) NOT NULL DEFAULT 'לא פעיל',
  google_login VARCHAR(32) NOT NULL DEFAULT 'פעיל',
  initial_screening_level VARCHAR(32) NOT NULL DEFAULT 'טלפוני',
  return_months INTEGER NOT NULL DEFAULT 3,
  questionnaire_source VARCHAR(128) NOT NULL DEFAULT 'חברה',
  auto_disconnect BOOLEAN NOT NULL DEFAULT false,
  logo_on_cv BOOLEAN NOT NULL DEFAULT true,
  candidate_no_location_to_fix BOOLEAN NOT NULL DEFAULT true,
  candidate_no_tag_to_fix BOOLEAN NOT NULL DEFAULT true,
  show_cv_preview BOOLEAN NOT NULL DEFAULT true,
  job_alerts BOOLEAN NOT NULL DEFAULT false,
  auto_thanks_email BOOLEAN NOT NULL DEFAULT false,
  one_candidate_per_email BOOLEAN NOT NULL DEFAULT false,
  billing_status_parent BOOLEAN NOT NULL DEFAULT false,
  billing_status_accepted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
