/**
 * Durable lifecycle trail for inbound CV mail.
 *
 * The S3 upload notify answers 202 as soon as the `email_uploads` row is written, so "the vendor
 * got 200/202" says nothing about whether Hiro parsed anything. Every ingest therefore writes one
 * app_logs row per stage (source: `email_ingest`) with the `email_uploads.id` + S3 `fileKey`, so a
 * silent drop can be traced from the mail to the candidate row:
 *
 *   accepted  → row persisted by the notify endpoint (202/200 returned)
 *   started   → processing began (inline or worker)
 *   completed → candidate linked / merged
 *   skipped   → deliberate early exit (duplicate file, already ingested, no attachment yet)
 *   failed    → ingest ended with an error or without a candidate
 *
 * `stage` and `reason` live in `context`, which the admin log screen already renders.
 */
const appLogger = require('../utils/appLogger');

const SOURCE = 'email_ingest';

const buildContext = (record, extra = {}) => ({
  recordId: record?.id != null ? String(record.id) : null,
  fileKey: record?.fileKey || null,
  bucket: record?.bucket || null,
  subject: record?.subject ? String(record.subject).slice(0, 300) : null,
  from: record?.from ? String(record.from).slice(0, 300) : null,
  candidateId: record?.candidateId != null ? String(record.candidateId) : null,
  ...extra,
});

const logIngestStage = ({ stage, level = 'info', message, record, extra = {} }) => {
  if (!stage) return null;
  const { stackTrace = null, ...contextExtra } = extra;
  return appLogger.log({
    level,
    source: SOURCE,
    message: String(message || stage),
    context: buildContext(record, { stage, ...contextExtra }),
    stackTrace: stackTrace ? String(stackTrace).slice(0, 4000) : null,
  });
};

const logIngestAccepted = (record, extra = {}) =>
  logIngestStage({
    stage: 'accepted',
    message: 'inbound CV mail accepted for ingest',
    record,
    extra,
  });

const logIngestStarted = (record, extra = {}) =>
  logIngestStage({
    stage: 'started',
    message: 'CV ingest started',
    record,
    extra,
  });

const logIngestCompleted = (record, extra = {}) =>
  logIngestStage({
    stage: 'completed',
    message: 'CV ingest completed',
    record,
    extra,
  });

const logIngestSkipped = (record, reason, extra = {}) =>
  logIngestStage({
    stage: 'skipped',
    message: `CV ingest skipped: ${reason}`,
    record,
    extra: { reason, ...extra },
  });

/** level: 'error' for hard failures, 'warn' when no candidate could be linked. */
const logIngestFailed = (record, reason, extra = {}) =>
  logIngestStage({
    stage: 'failed',
    level: extra.level || 'error',
    message: `CV ingest failed: ${reason}`,
    record,
    extra: { reason, ...extra },
  });

module.exports = {
  INGEST_LOG_SOURCE: SOURCE,
  logIngestAccepted,
  logIngestStarted,
  logIngestCompleted,
  logIngestSkipped,
  logIngestFailed,
};
