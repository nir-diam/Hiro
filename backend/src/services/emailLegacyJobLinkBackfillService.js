const { Op, QueryTypes } = require('sequelize');
const { simpleParser } = require('mailparser');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { sequelize } = require('../config/db');
const EmailUpload = require('../models/EmailUpload');
const JobCandidate = require('../models/JobCandidate');
const jobService = require('./jobService');
const jobCandidateService = require('./jobCandidateService');
const cvForwardService = require('./cvForwardService');
const candidateService = require('./candidateService');
const { createS3Client } = require('./s3Service');

const { POSTING_CODE_FIRST, isPostingCodeValidForMatch } = jobService;
const DEFAULT_SINCE_YMD = '2026-10-08';
const TEST_CANDIDATE_ID = '35d41e78-3837-499d-9716-8f2431d01533';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
const RESUME_MIMES = ['pdf', 'msword', 'wordprocessingml', 'rtf', 'plain'];

function isJobUuid(value) {
  return UUID_RE.test(String(value || '').trim());
}

function extractPostingCodeFromFileKey(fileKey = '') {
  const base = String(fileKey || '').split('/').pop() || '';
  let name = base;
  try {
    name = decodeURIComponent(base);
  } catch {
    /* keep */
  }
  const dashMatch = name.match(/[-–—]\s*(\d{4,8})(?:\.[^.]+)?$/);
  if (dashMatch) return dashMatch[1];
  const tailMatch = name.match(/(\d{4,8})(?:\.[^.]+)?$/);
  return tailMatch ? tailMatch[1] : null;
}

function extractPostingCodeFromSubject(subject = '') {
  const text = String(subject || '').trim();
  if (!text) return null;
  const masMatch = text.match(/מס['\u05F3]?\s*(\d{4,8})/u);
  if (masMatch) return masMatch[1];
  const dashMatch = text.match(/[-–—]\s*(\d{4,8})\s*$/);
  if (dashMatch) return dashMatch[1];
  const all = [...text.matchAll(/\b(\d{4,8})\b/g)].map((m) => m[1]);
  if (all.length) return all[all.length - 1];
  return null;
}

function isLegacyPostingCode(code) {
  if (!isPostingCodeValidForMatch(code)) return false;
  const digits = String(code || '').trim();
  if (!/^\d+$/.test(digits)) return true;
  const n = Number(digits);
  return Number.isFinite(n) && n < POSTING_CODE_FIRST;
}

function resolveLegacyPostingCodeFromUpload(record) {
  const plain = record.get ? record.get({ plain: true }) : record;
  const key = String(plain.jobId || '').trim();
  const candidates = [];
  if (key && !isJobUuid(key) && isLegacyPostingCode(key)) candidates.push(key);
  const fromSubject = extractPostingCodeFromSubject(plain.subject);
  if (fromSubject && isLegacyPostingCode(fromSubject)) candidates.push(fromSubject);
  const fromFile = extractPostingCodeFromFileKey(plain.fileKey);
  if (fromFile && isLegacyPostingCode(fromFile)) candidates.push(fromFile);
  return candidates[0] || null;
}

async function dayStartIsrael(ymd) {
  const [[row]] = await sequelize.query(
    `SELECT (DATE :ymd AT TIME ZONE 'Asia/Jerusalem') AS day_start`,
    { replacements: { ymd } },
  );
  return row?.day_start ? new Date(row.day_start) : new Date(`${ymd}T00:00:00+03:00`);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    if (!chunk) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadEmailFromS3(bucket, key) {
  const client = createS3Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) return null;
  return streamToBuffer(response.Body);
}

function isResumeAttachment(attachment) {
  if (!attachment?.content) return false;
  const filename = (attachment.filename || '').toLowerCase();
  if (RESUME_EXTENSIONS.some((ext) => filename.endsWith(ext))) return true;
  const contentType = (attachment.contentType || '').toLowerCase();
  return RESUME_MIMES.some((hint) => contentType.includes(hint));
}

async function loadEmailForwardContext(uploadRow) {
  const plain = uploadRow.get ? uploadRow.get({ plain: true }) : uploadRow;
  let subject = String(plain.subject || '').trim();
  let originalEmailText = String(plain.body || '').trim();
  let originalEmailHtml = null;
  let resumeBuffer = null;
  let resumeFileName = null;
  let resumeMimeType = null;

  try {
    const raw = await downloadEmailFromS3(plain.bucket, plain.fileKey);
    if (raw?.length) {
      const parsed = await simpleParser(raw);
      if (parsed.subject) subject = String(parsed.subject).trim();
      originalEmailText = String(parsed.text || originalEmailText || '').trim();
      originalEmailHtml = parsed.html ? String(parsed.html).trim() : null;
      const resumeAttachments = (parsed.attachments || []).filter(
        (a) => isResumeAttachment(a) && a.content,
      );
      if (resumeAttachments[0]) {
        const att = resumeAttachments[0];
        resumeBuffer = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content);
        resumeFileName = att.filename || null;
        resumeMimeType = att.contentType || null;
      }
    }
  } catch (err) {
    console.warn('[script][email-legacy] S3 email parse failed', {
      uploadId: plain.id,
      message: err?.message || err,
    });
  }

  return {
    originalEmailSubject: subject,
    originalEmailText,
    originalEmailHtml,
    resumeBuffer,
    resumeFileName,
    resumeMimeType,
  };
}

async function isLinkedToJob(candidateId, jobId) {
  const row = await JobCandidate.findOne({
    where: { candidateId, jobId },
  });
  return Boolean(row);
}

async function processOneUpload(uploadRow, { req = null } = {}) {
  const plain = uploadRow.get ? uploadRow.get({ plain: true }) : uploadRow;
  const candidateId = String(plain.candidateId || '').trim();
  const postingCode = resolveLegacyPostingCodeFromUpload(uploadRow);

  const baseLog = {
    emailUploadId: plain.id,
    candidateId,
    postingCode,
    fileKey: plain.fileKey,
  };

  if (!candidateId) {
    console.log('[script][email-legacy] skip — no candidateId', baseLog);
    return { ...baseLog, status: 'skipped', reason: 'no_candidate_id' };
  }
  if (!postingCode) {
    console.log('[script][email-legacy] skip — no legacy posting code', baseLog);
    return { ...baseLog, status: 'skipped', reason: 'no_legacy_posting_code' };
  }

  const job = await jobService.findByPostingCode(postingCode);
  if (!job?.id || !isJobUuid(job.id)) {
    console.log('[script][email-legacy] skip — job not found for code', baseLog);
    return { ...baseLog, status: 'skipped', reason: 'job_not_found' };
  }

  const jobId = String(job.id);
  const jobPlain = job.get ? job.get({ plain: true }) : job;
  let linked = await isLinkedToJob(candidateId, jobId);
  let associationRecord = null;

  if (!linked) {
    console.log('[script][email-legacy] linking candidate to job', { ...baseLog, jobId });
    const association = await jobCandidateService.associateCandidateWithJob({
      jobId,
      candidateId,
      source: 'email',
      manualOverride: false,
    });
    associationRecord = association?.record;
    linked = true;
    await uploadRow.update({ jobId });
    console.log('[script][email-legacy] linked + patched email_upload.jobId', {
      ...baseLog,
      jobId,
      jobCandidateId: associationRecord?.id || null,
    });
  } else {
    console.log('[script][email-legacy] already linked to job', { ...baseLog, jobId });
    associationRecord = await JobCandidate.findOne({ where: { jobId, candidateId } });
    if (!isJobUuid(String(plain.jobId || '').trim()) || String(plain.jobId).trim() !== jobId) {
      await uploadRow.update({ jobId });
      console.log('[script][email-legacy] patched email_upload.jobId', { ...baseLog, jobId });
    }
  }

  const candidate = await candidateService.getById(candidateId);
  const emailCtx = await loadEmailForwardContext(uploadRow);
  const extractedText = String(candidate?.searchText || '').trim();
  const hasCvText = extractedText.length >= 40;

  console.log('[script][email-legacy] scheduling CV forward (await)', {
    ...baseLog,
    jobId,
    hasCvText,
    hasResumeBuffer: Boolean(emailCtx.resumeBuffer?.length),
    resumeUrl: candidate?.resumeUrl || null,
  });

  const forwardResult = await cvForwardService.maybeForwardCvAfterQualityGate({
    req,
    candidateId,
    jobId,
    intakeChannel: 'email',
    candidate,
    job: jobPlain,
    jobCandidate: associationRecord?.get ? associationRecord.get({ plain: true }) : associationRecord,
    resumeBuffer: emailCtx.resumeBuffer,
    resumeUrl: candidate?.resumeUrl || null,
    resumeFileName: emailCtx.resumeFileName,
    resumeMimeType: emailCtx.resumeMimeType,
    extractedText,
    hasCvText,
    ranFullEnrichment: hasCvText,
    originalEmailSubject: emailCtx.originalEmailSubject,
    originalEmailText: emailCtx.originalEmailText,
    originalEmailHtml: emailCtx.originalEmailHtml,
  });

  console.log('[script][email-legacy] CV forward result', {
    ...baseLog,
    jobId,
    forwarded: forwardResult?.forwarded,
    reason: forwardResult?.reason,
    results: forwardResult?.results,
  });

  return {
    ...baseLog,
    jobId,
    jobTitle: jobPlain.title,
    status: forwardResult?.forwarded ? 'forwarded' : 'linked_only',
    forward: forwardResult,
  };
}

async function listUploadsForBackfill({ sinceYmd = DEFAULT_SINCE_YMD, candidateId = null } = {}) {
  const since = await dayStartIsrael(sinceYmd);
  const where = {
    candidateId: candidateId ? String(candidateId).trim() : { [Op.ne]: null },
    createdAt: { [Op.gte]: since },
  };

  const uploads = await EmailUpload.findAll({
    where,
    order: [['createdAt', 'ASC']],
  });

  const out = [];
  for (const row of uploads) {
    const code = resolveLegacyPostingCodeFromUpload(row);
    if (!code) continue;
    const job = await jobService.findByPostingCode(code);
    if (!job?.id) continue;
    const cid = String(row.candidateId);
    const linked = await isLinkedToJob(cid, String(job.id));
    if (linked) {
      const deliveries = await sequelize.query(
        `SELECT COUNT(*)::int AS n FROM cv_forward_deliveries
         WHERE "jobId" = :jobId AND "candidateId" = :candidateId AND status = 'sent'`,
        {
          replacements: { jobId: job.id, candidateId: cid },
          type: QueryTypes.SELECT,
        },
      );
      const sentCount = deliveries[0]?.n || 0;
      if (sentCount > 0) continue;
    }
    out.push(row);
  }
  return out;
}

async function runBatch({ sinceYmd = DEFAULT_SINCE_YMD, candidateId = null, req = null } = {}) {
  console.log('[script][email-legacy] batch start', { sinceYmd, candidateId });
  const uploads = await listUploadsForBackfill({ sinceYmd, candidateId });
  console.log('[script][email-legacy] uploads to process', uploads.length);

  const results = [];
  for (const upload of uploads) {
    try {
      const result = await processOneUpload(upload, { req });
      results.push(result);
    } catch (err) {
      console.error('[script][email-legacy] upload failed', {
        uploadId: upload.id,
        candidateId: upload.candidateId,
        error: err?.message || err,
      });
      results.push({
        emailUploadId: upload.id,
        candidateId: upload.candidateId,
        status: 'error',
        error: err?.message || String(err),
      });
    }
  }

  console.log('[script][email-legacy] batch complete', {
    processed: results.length,
    forwarded: results.filter((r) => r.status === 'forwarded').length,
    linkedOnly: results.filter((r) => r.status === 'linked_only').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
  });

  return results;
}

async function runTestCandidate(req) {
  return runBatch({ sinceYmd: DEFAULT_SINCE_YMD, candidateId: TEST_CANDIDATE_ID, req });
}

module.exports = {
  DEFAULT_SINCE_YMD,
  TEST_CANDIDATE_ID,
  runBatch,
  runTestCandidate,
  listUploadsForBackfill,
  resolveLegacyPostingCodeFromUpload,
};
