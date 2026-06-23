CREATE TABLE IF NOT EXISTS saved_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT FALSE,
  search_params        JSONB NOT NULL DEFAULT '{}',
  additional_filters   JSONB NOT NULL DEFAULT '[]',
  language_filters     JSONB NOT NULL DEFAULT '[]',
  is_alert             BOOLEAN NOT NULL DEFAULT FALSE,
  frequency            VARCHAR(20),
  notification_methods JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id   ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_client_id ON saved_searches(client_id);
