const crypto = require('crypto');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const JobCandidate = require('../models/JobCandidate');
const User = require('../models/User');
const CvForwardDelivery = require('../models/CvForwardDelivery');
const emailService = require('./emailService');
const { publishOpsAlert } = require('./opsAlertService');
const {
  isCvForwardEnabled,
  normalizeCvForwardSettings,
  normalizeEmail,
} = require('../utils/cvForwardSettings');
const {
  buildCvForwardEmailSubject,
  buildCvForwardSubjectContext,
  resolveRecruitmentSourceLabel,
} = require('../utils/cvForwardSubjectVariables');
const { passesCvForwardQualityGate } = require('../utils/cvForwardQualityGate');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

const RETRY_DELAYS_MS = [1000, 3000, 9000];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function plainRow(row) {
  if (!row) return null;
  return row.get ? row.get({ plain: true }) : { ...row };
}

function resumeFingerprint(buffer, resumeUrl) {
  if (buffer && Buffer.isBuffer(buffer) && buffer.length) {
    return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);
  }
  return crypto.createHash('sha256').update(String(resumeUrl || '')).digest('hex').slice(0, 32);
}

function buildIdempotencyKey(jobId, candidateId, recipientEmail, fingerprint) {
  return `${jobId}:${candidateId}:${fingerprint}:${String(recipientEmail).trim().toLowerCase()}`;
}

async function loadJobForForward(jobId, jobHint) {
  const row = await Job.findByPk(jobId, {
    attributes: ['id', 'title', 'publicJobTitle', 'postingCode', 'client', 'clientId', 'cvForwardSettings'],
  });
  if (row) return plainRow(row);
  return jobHint && jobHint.id ? plainRow(jobHint) : null;
}

async function loadCandidateForForward(candidateId, candidateHint) {
  if (candidateHint?.id) return plainRow(candidateHint);
  const row = await Candidate.findByPk(candidateId, {
    attributes: ['id', 'fullName', 'source', 'email', 'resumeUrl'],
  });
  return plainRow(row);
}

async function loadJobCandidate(jobId, candidateId, jobCandidateHint) {
  if (jobCandidateHint) return plainRow(jobCandidateHint);
  const row = await JobCandidate.findOne({ where: { jobId, candidateId } });
  return plainRow(row);
}

async function resolveDeliveryRecipients(settings) {
  const normalized = normalizeCvForwardSettings(settings);
  const out = [];
  const seen = new Set();

  for (const recipient of normalized.recipients) {
    let email = null;
    let name = recipient.name || '';
    let type = recipient.type;

    if (recipient.type === 'external') {
      email = normalizeEmail(recipient.email);
    } else if (recipient.type === 'user') {
      email = normalizeEmail(recipient.email);
      if (!email && recipient.userId) {
        const user = await User.findByPk(recipient.userId, {
          attributes: ['id', 'name', 'email', 'isActive'],
        });
        if (user) {
          email = normalizeEmail(user.email);
          if (!name) name = String(user.name || '').trim();
        }
      }
    }

    if (!email || !EMAIL_RE.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ email, name, type });
  }

  return out;
}

async function fetchResumeAttachment({ resumeBuffer, resumeUrl, resumeFileName, resumeMimeType, candidateId }) {
  if (resumeBuffer && Buffer.isBuffer(resumeBuffer) && resumeBuffer.length) {
    const filename = String(resumeFileName || 'resume.pdf').trim() || 'resume.pdf';
    const contentType = String(resumeMimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    return { buffer: resumeBuffer, filename, contentType };
  }

  if (!resumeUrl) return null;

  const { fetchResumeBinaryForMail } = require('../controllers/candidateController');
  const bin = await fetchResumeBinaryForMail(resumeUrl, candidateId);
  if (!bin?.buffer?.length) return null;

  return {
    buffer: bin.buffer,
    filename: bin.filename || resumeFileName || 'resume.pdf',
    contentType: bin.contentType || resumeMimeType || 'application/octet-stream',
  };
}

function buildForwardBodies({ intakeChannel, job, candidate, originalEmailText, originalEmailHtml }) {
  const jobTitle = String(job?.title || job?.publicJobTitle || 'משרה').trim();
  const candidateName = String(candidate?.fullName || 'מועמד').trim();
  const clientName = String(job?.client || '').trim();

  if (intakeChannel === 'email') {
    const text = String(originalEmailText || '').trim();
    const html = String(originalEmailHtml || '').trim();
    if (text || html) {
      return {
        text: text || undefined,
        html: html || (text ? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre>` : undefined),
      };
    }
  }

  const lines = [
    'קורות חיים חדשים התקבלו במערכת.',
    clientName ? `לקוח: ${clientName}` : null,
    `משרה: ${jobTitle}`,
    job?.postingCode ? `קוד משרה: ${job.postingCode}` : null,
    `מועמד: ${candidateName}`,
    candidate?.email ? `אימייל מועמד: ${candidate.email}` : null,
  ].filter(Boolean);

  const text = lines.join('\n');
  const html = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  return { text, html };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function defaultOriginalSubject(intakeChannel, job, candidate) {
  const jobTitle = String(job?.title || job?.publicJobTitle || 'משרה').trim();
  const candidateName = String(candidate?.fullName || '').trim();
  if (intakeChannel === 'email') {
    return candidateName ? `קורות חיים - ${candidateName}` : 'קורות חיים';
  }
  return candidateName ? `[${jobTitle}] קורות חיים - ${candidateName}` : `[${jobTitle}] קורות חיים חדשים`;
}

async function emitForwardEvent(req, eventDef, { job, candidate, toEmail, subject, errorMessage }) {
  try {
    await systemEventEmitter.emit(req, {
      ...eventDef,
      entityType: 'Candidate',
      entityId: candidate?.id ? String(candidate.id) : null,
      entityName: candidate?.fullName || candidate?.email || '—',
      clientId: job?.clientId || null,
      params: {
        jobTitle: job?.title || job?.publicJobTitle || '',
        to: toEmail || '',
        subject: subject || '',
        error: errorMessage || '',
      },
    });
  } catch (err) {
    console.warn('[cvForward] audit event failed', err?.message || err);
  }
}

async function alertForwardFailure({ job, recipientEmail, errorMessage, candidateId }) {
  const jobTitle = String(job?.title || job?.publicJobTitle || job?.id || '—').trim();
  await publishOpsAlert({
    subject: `CV forward failed: ${jobTitle}`,
    message: [
      `Job: ${jobTitle} (${job?.id || '—'})`,
      `Candidate: ${candidateId || '—'}`,
      `Recipient: ${recipientEmail}`,
      `Error: ${errorMessage}`,
    ].join('\n'),
    attributes: {
      alertType: 'cv_forward_failed',
      jobId: job?.id ? String(job.id) : '',
      candidateId: candidateId ? String(candidateId) : '',
      recipient: recipientEmail,
    },
  });
}

async function sendToRecipientWithRetry({
  req,
  job,
  candidate,
  recipient,
  subject,
  text,
  html,
  attachment,
  intakeChannel,
  idempotencyKey,
}) {
  let delivery = await CvForwardDelivery.findOne({ where: { idempotencyKey } });
  if (delivery?.status === 'sent') {
    return { status: 'skipped', reason: 'already_sent' };
  }

  if (!delivery) {
    try {
      delivery = await CvForwardDelivery.create({
        jobId: job.id,
        candidateId: candidate.id,
        recipientEmail: recipient.email,
        recipientType: recipient.type,
        status: 'pending',
        attemptCount: 0,
        idempotencyKey,
        subject,
        intakeChannel,
      });
    } catch (err) {
      if (String(err?.name) === 'SequelizeUniqueConstraintError') {
        delivery = await CvForwardDelivery.findOne({ where: { idempotencyKey } });
        if (delivery?.status === 'sent') return { status: 'skipped', reason: 'already_sent' };
      } else {
        throw err;
      }
    }
  }

  const attachments = [
    {
      filename: attachment.filename,
      content: attachment.buffer,
      contentType: attachment.contentType,
    },
  ];

  let lastError = null;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    try {
      await delivery.update({
        attemptCount: attempt + 1,
        status: 'pending',
        lastError: null,
      });

      await emailService.sendEmail({
        toEmail: recipient.email,
        subject,
        text: text || ' ',
        html,
        clientName: job.client || 'מימד אנושי',
        userRole: 'admin',
        attachments,
      });

      await delivery.update({
        status: 'sent',
        sentAt: new Date(),
        lastError: null,
      });

      await emitForwardEvent(req, SYSTEM_EVENTS.CV_FORWARD_SENT, {
        job,
        candidate,
        toEmail: recipient.email,
        subject,
      });

      return { status: 'sent', recipient: recipient.email };
    } catch (err) {
      lastError = err?.message || String(err);
      await delivery.update({
        status: 'failed',
        lastError,
      });
    }
  }

  await alertForwardFailure({
    job,
    recipientEmail: recipient.email,
    errorMessage: lastError || 'unknown_error',
    candidateId: candidate.id,
  });

  await emitForwardEvent(req, SYSTEM_EVENTS.CV_FORWARD_FAILED, {
    job,
    candidate,
    toEmail: recipient.email,
    subject,
    errorMessage: lastError || 'unknown_error',
  });

  return { status: 'failed', recipient: recipient.email, error: lastError };
}

/**
 * Schedule CV forward (fire-and-forget).
 * @param {object} input
 */
function scheduleCvForward(input = {}) {
  setImmediate(() => {
    maybeForwardCvAfterQualityGate(input)
      .then((result) => {
        const base = {
          jobId: input.jobId,
          candidateId: input.candidateId,
          intakeChannel: input.intakeChannel,
        };
        if (result?.forwarded) {
          console.log('[cvForward] delivered', {
            ...base,
            results: result.results,
          });
          return;
        }
        console.log('[cvForward] skipped', {
          ...base,
          reason: result?.reason || 'unknown',
        });
      })
      .catch((err) => {
        console.error('[cvForward] background forward failed', err?.message || err, {
          jobId: input.jobId,
          candidateId: input.candidateId,
          intakeChannel: input.intakeChannel,
        });
      });
  });
}

/**
 * Forward CV to configured recipients when settings allow.
 * @param {object} input
 * @returns {Promise<{ forwarded: boolean, reason?: string, results?: object[] }>}
 */
async function maybeForwardCvAfterQualityGate(input = {}) {
  const candidateId = input.candidateId ? String(input.candidateId).trim() : '';
  const jobId = input.jobId ? String(input.jobId).trim() : '';
  if (!candidateId || !jobId) {
    return { forwarded: false, reason: 'missing_job_or_candidate' };
  }

  const quality = passesCvForwardQualityGate({
    resumeBuffer: input.resumeBuffer,
    resumeUrl: input.resumeUrl,
    extractedText: input.extractedText,
    hasCvText: input.hasCvText,
    ranFullEnrichment: input.ranFullEnrichment,
    mimeType: input.resumeMimeType,
  });
  if (!quality.ok) {
    return { forwarded: false, reason: quality.reason || 'quality_gate_failed' };
  }

  const job = await loadJobForForward(jobId, input.job);
  if (!job) return { forwarded: false, reason: 'job_not_found' };

  const settings = job.cvForwardSettings;
  if (!isCvForwardEnabled(settings)) {
    return { forwarded: false, reason: 'forward_disabled' };
  }

  const candidate = await loadCandidateForForward(candidateId, input.candidate);
  if (!candidate) return { forwarded: false, reason: 'candidate_not_found' };

  const jobCandidate = await loadJobCandidate(jobId, candidateId, input.jobCandidate);
  const recipients = await resolveDeliveryRecipients(settings);
  if (!recipients.length) {
    return { forwarded: false, reason: 'no_recipients' };
  }

  const attachment = await fetchResumeAttachment({
    resumeBuffer: input.resumeBuffer,
    resumeUrl: input.resumeUrl || candidate.resumeUrl,
    resumeFileName: input.resumeFileName,
    resumeMimeType: input.resumeMimeType,
    candidateId,
  });
  if (!attachment?.buffer?.length) {
    return { forwarded: false, reason: 'attachment_unavailable' };
  }

  const subjectContext = buildCvForwardSubjectContext({
    job,
    candidate,
    jobCandidate,
    recruitmentSourceName:
      input.recruitmentSourceName
      || resolveRecruitmentSourceLabel(
        buildCvForwardSubjectContext({
          candidate,
          jobCandidate,
          recruitmentSourceName: input.recruitmentSourceName,
        }),
      ),
    intakeChannel: input.intakeChannel,
  });

  const normalizedSettings = normalizeCvForwardSettings(settings);
  const originalSubject =
    String(input.originalEmailSubject || '').trim() || defaultOriginalSubject(input.intakeChannel, job, candidate);
  const subject = buildCvForwardEmailSubject(
    normalizedSettings.subjectPrefixTemplate,
    originalSubject,
    subjectContext,
  );

  const bodies = buildForwardBodies({
    intakeChannel: input.intakeChannel,
    job,
    candidate,
    originalEmailText: input.originalEmailText,
    originalEmailHtml: input.originalEmailHtml,
  });

  const fingerprint = resumeFingerprint(attachment.buffer, input.resumeUrl || candidate.resumeUrl);
  const results = [];

  for (const recipient of recipients) {
    const idempotencyKey = buildIdempotencyKey(jobId, candidateId, recipient.email, fingerprint);
    const result = await sendToRecipientWithRetry({
      req: input.req || null,
      job,
      candidate,
      recipient,
      subject,
      text: bodies.text,
      html: bodies.html,
      attachment,
      intakeChannel: input.intakeChannel,
      idempotencyKey,
    });
    results.push(result);
  }

  const anySent = results.some((r) => r.status === 'sent');
  return {
    forwarded: anySent,
    results,
  };
}

module.exports = {
  scheduleCvForward,
  maybeForwardCvAfterQualityGate,
  resolveDeliveryRecipients,
  buildIdempotencyKey,
};
