-- Adds the "for Flight" toggle to event types (admin "מטוס" column).
ALTER TABLE event_types
ADD COLUMN IF NOT EXISTS "forFlight" BOOLEAN NOT NULL DEFAULT false;
