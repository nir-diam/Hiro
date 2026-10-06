-- Per-recipient CV forward delivery log (idempotency + retry audit).

CREATE TABLE IF NOT EXISTS cv_forward_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "jobId" UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  "candidateId" UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  "recipientEmail" TEXT NOT NULL,
  "recipientType" VARCHAR(20) NOT NULL DEFAULT 'external',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "idempotencyKey" TEXT NOT NULL UNIQUE,
  subject TEXT,
  "intakeChannel" VARCHAR(32),
  "sentAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cv_forward_deliveries_job_candidate
  ON cv_forward_deliveries ("jobId", "candidateId");

CREATE INDEX IF NOT EXISTS idx_cv_forward_deliveries_status
  ON cv_forward_deliveries (status);
