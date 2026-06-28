-- Migration: add filter_state column to saved_searches
-- Run once against the production DB.
-- filter_state stores the full UI filter snapshot so the client can
-- restore every slider, tag, query-builder rule, and free-text field.

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS filter_state JSONB NOT NULL DEFAULT '{}';
