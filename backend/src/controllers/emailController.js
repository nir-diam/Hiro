const { randomUUID } = require('crypto');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { simpleParser } = require('mailparser');
const emailService = require('../services/emailService');
const messageTemplateService = require('../services/messageTemplateService');
const Client = require('../models/Client');
const candidateService = require('../services/candidateService');
const jobCandidateService = require('../services/jobCandidateService');
const jobService = require('../services/jobService');
const clientService = require('../services/clientService');
const clientUsageSettingService = require('../services/clientUsageSettingService');
const EmailUpload = require('../models/EmailUpload');
const { createS3Client } = require('../services/s3Service');
const {
  putResumeFileInS3,
  fetchResumeText,
  extractResumeTextFromUpload,
  buildParsedUpdates,
  fetchResumeBinaryForMail,
  buildCandidateModelSchemaJsonForPrompt,
  ensureOrganizationsFromExperience,
  enrichCandidateFromResumeText,
} = require('./candidateController');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateTagService = require('../services/candidateTagService');
const candidateCompletenessService = require('../services/candidateCompletenessService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const { sendChat } = require('../services/geminiService');
const User = require('../models/User');
const authService = require('../services/authService');
const NotificationMessage = require('../models/NotificationMessage');
const RecruitmentStatus = require('../models/RecruitmentStatus');
const RecruitmentSource = require('../models/RecruitmentSource');
const { Op, Sequelize, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const systemEventEmitter = require('../utils/systemEventEmitter');
const proposalService = require('../services/proposalService');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');
const cvForwardService = require('../services/cvForwardService');
const {
  recordCandidateIdentityMerge,
  recordDuplicateResumeHashIngest,
} = require('../utils/candidateCanonicalLinkEvent');
const auditLogger = require('../utils/auditLogger');
const { embedCandidateAndSave, hasEmbeddableCandidateContent } = require('../services/vectorSearchService');
const {
  hashResumeBuffer,
  findCandidateByResumeContentHash,
  resolvePrimaryFromHashMatch,
} = require('../services/cvContentHashService');
const { normalizeResumeSearchText } = require('../utils/normalizeResumeSearchText');

const supportedResumeExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
const supportedMimes = ['pdf', 'msword', 'officedocument', 'application/octet-stream'];

const NOTIFICATION_TASK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Inbox / task folder values; screening_cv rows typically store recruitment status `name` instead. */
const INBOX_NOTIFICATION_STATUS_TOKENS = new Set(['unread', 'tasks', 'archived', 'deleted']);

/**
 * Count prior screening_cv notifications with same subject and candidateId (repeat הפניה).
 */
const countPriorScreeningCvSameCandidateSubject = async (subject, candidateId) => {
  const sub = String(subject || '').trim();
  const cid = String(candidateId || '').trim();
  if (!sub || !cid) return 0;
  const rows = await sequelize.query(
    `
    SELECT COUNT(*)::int AS c
    FROM notification_messages
    WHERE category = 'screening_cv'
      AND subject = :subject
      AND TRIM(COALESCE(metadata #>> '{taskPayload,candidateId}', '')) = TRIM(:candidateId)
    `,
    {
      replacements: { subject: sub, candidateId: cid },
      type: QueryTypes.SELECT,
    },
  );
  return Number(rows[0]?.c || 0);
};

const splitRecruitmentSourceAddresses = (addresses) =>
  String(addresses || '')
    .split(';')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

const resolveRecruitmentSourceFromEmail = async (fromEmail, clientId = null) => {
  const sender = String(fromEmail || '').trim().toLowerCase();
  if (!sender) return null;

  const rows = await RecruitmentSource.findAll({
    where: clientId ? { clientId } : undefined,
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  for (const row of rows) {
    const sourceName = String(row.name || '').trim();
    if (!sourceName) continue;
    const tokens = splitRecruitmentSourceAddresses(row.addresses);
    if (tokens.some((token) => sender.includes(token))) {
      return {
        id: row.id,
        name: sourceName,
        clientId: row.clientId != null ? String(row.clientId) : null,
      };
    }
  }

  return null;
};

/** Staff app origin for deep links — no trailing slash (`PUBLIC_APP_URL` / `FRONTEND_URL`). */
const publicStaffAppOrigin = () =>
  String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://app.hiro.co.il').replace(/\/$/, '');

/** Staff app URLs e.g. `https://app.hiro.co.il/candidates/{uuid}`. */
const staffSpaUrl = (origin, routePath) => {
  const base = String(origin || '').replace(/\/$/, '');
  const path = String(routePath || '').startsWith('/') ? routePath : `/${routePath}`;
  return `${base}${path}`;
};

const escapeHtmlMail = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const htmlFromPlainTextForMail = (t) =>
  escapeHtmlMail(t ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .join('<br/>');

const stripHtmlMail = (s) =>
  String(s ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Clickable links (HTML + plain text) for linked candidate / job / client.
 * Only appended when the client sets `appendSystemLinks: true` (NewTaskModal email send).
 */
function buildLinkedEntityMailAppend(taskPayload, origin) {
  const tp =
    taskPayload && typeof taskPayload === 'object' && !Array.isArray(taskPayload) ? taskPayload : {};
  const base = String(origin || '').replace(/\/$/, '');
  if (!base) return { htmlAppend: '', storedTextSuffix: '' };

  const links = [];

  const candId = String(tp.linkedCandidateBackendId || '').trim();
  if (NOTIFICATION_TASK_UUID_RE.test(candId)) {
    const url = staffSpaUrl(base, `/candidates/${candId}`);
    const label = String(tp.linkedCandidateLabel || '').trim() || 'פתיחת פרופיל המועמד';
    links.push({ label, url });
  }

  const jobId = String(tp.linkedJobId || '').trim();
  if (NOTIFICATION_TASK_UUID_RE.test(jobId)) {
    const url = staffSpaUrl(base, `/jobs/edit/${jobId}`);
    const label = String(tp.linkedJobLabel || '').trim() || 'פתיחת המשרה';
    links.push({ label, url });
  }

  const clientId = String(tp.linkedClientId || '').trim();
  if (NOTIFICATION_TASK_UUID_RE.test(clientId)) {
    const contactId = String(tp.linkedContactId || '').trim();
    const path = NOTIFICATION_TASK_UUID_RE.test(contactId)
      ? `/clients/${clientId}/contacts/${contactId}`
      : `/clients/${clientId}`;
    const url = staffSpaUrl(base, path);
    const label = String(tp.linkedClientLabel || '').trim() || 'פתיחת כרטיס לקוח';
    links.push({ label, url });
  }

  const orgId = String(tp.linkedOrganizationId || '').trim();
  if (NOTIFICATION_TASK_UUID_RE.test(orgId)) {
    const url = staffSpaUrl(base, `/organizations/${orgId}`);
    const label = String(tp.linkedOrganizationLabel || '').trim() || 'פתיחת כרטיס ארגון';
    links.push({ label, url });
  }

  const orgTmpId = String(tp.linkedOrganizationTmpId || '').trim();
  if (NOTIFICATION_TASK_UUID_RE.test(orgTmpId)) {
    const url = staffSpaUrl(base, `/organizations/tmp/${orgTmpId}`);
    const label = String(tp.linkedOrganizationLabel || '').trim() || 'פתיחת כרטיס ארגון (ממתין)';
    links.push({ label, url });
  }

  if (!links.length) return { htmlAppend: '', storedTextSuffix: '' };

  const textLinksBlock = links.map((l) => `${l.label}: ${l.url}`).join('\n');
  const storedTextSuffix = `\n\n---\nקישורים מהמערכת:\n${textLinksBlock}`;
  const htmlAppend =
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>` +
    `<p dir="rtl" style="margin:0 0 10px;font-weight:bold;color:#111;font-family:sans-serif;font-size:14px">` +
    `קישורים מהמערכת</p>` +
    `<ul dir="rtl" style="margin:0;padding-inline-start:20px;line-height:1.6;font-family:sans-serif;font-size:14px;color:#111">` +
    links
      .map(
        (l) =>
          `<li style="margin:6px 0"><a href="${escapeHtmlMail(l.url)}" style="color:#2563eb;text-decoration:underline">` +
          `${escapeHtmlMail(l.label)}</a></li>`,
      )
      .join('') +
    `</ul>`;

  return { htmlAppend, storedTextSuffix };
}

/**
 * SMTP profile: admin → HIRO_* / Resend; tenant «מימד אנושי» → HUMAND_*; else legacy SMTP_*.
 * Expects `authMiddleware` on `/send` so `req.user.sub` is set (no manual Authorization parsing).
 */
async function resolveEmailSenderSmtpContext(req) {

  
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return { userRole: null, clientName: null, senderEmail: null };
  try {
    const user = await User.findByPk(userId, {
      attributes: ['role', 'clientId', 'email'],
      include: [{ model: Client, as: 'client', attributes: ['name', 'displayName'], required: false }],
    });
    if (!user) return { userRole: null, clientName: null, senderEmail: null };
    const c = user.client;
    const label = c ? String(c.displayName || c.name || '').trim() : '';
    return {
      userRole: user.role || null,
      clientName: label || null,
      senderEmail: user.email ? String(user.email).trim() : null,
    };
  } catch {
    return { userRole: null, clientName: null, senderEmail: null };
  }
}

/**
 * Job application inboxes use plus addressing: {prefix}+{postingCode}@{domain}
 * e.g. hiro+123@…, humand+5848@…, nir+5222@… — prefix is not always "hiro".
 */
const postingCodeFromPlusAddressText = (text = '') => {
  const m = String(text || '').match(/[a-zA-Z0-9][a-zA-Z0-9._-]*\+([a-zA-Z0-9_-]+)@/i);
  return m ? m[1] : null;
};

/** Fallback when plus-tagging missed: first standalone number with value > 800000 in the text. */
const extractPostingCodeFromLargeNumberInText = (text = '') => {
  const src = String(text || '').trim();
  if (!src) return null;
  const re = /\b(\d+)\b/gu;
  let m;
  while ((m = re.exec(src)) !== null) {
    const digits = m[1];
    if (digits.length > 8) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > 800000) return digits;
  }
  return null;
};

const extractPostingCodeFromEmailAddress = (email = '') => {
  const raw = String(email || '').trim();
  if (!raw) return null;
  const angle = raw.match(/<([^>]+@[^>]+)>/i);
  const addr = angle ? angle[1].trim() : raw;
  const fromPlus = postingCodeFromPlusAddressText(addr);
  if (fromPlus) return fromPlus;
  if (angle) {
    const displayPart = raw
      .replace(angle[0], '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .trim();
    const fromNumber = extractPostingCodeFromLargeNumberInText(displayPart);
    if (fromNumber) return fromNumber;
  }
  return extractPostingCodeFromLargeNumberInText(raw);
};

/** e.g. "Name - 603771.pdf" → 603771 */
const extractPostingCodeFromFileKey = (fileKey = '') => {
  const base = String(fileKey || '').split('/').pop() || '';
  let name = base;
  try {
    name = decodeURIComponent(base);
  } catch {
    /* keep raw */
  }
  const dashMatch = name.match(/[-–—]\s*(\d{4,8})(?:\.[^.]+)?$/);
  if (dashMatch) return dashMatch[1];
  const tailMatch = name.match(/(\d{4,8})(?:\.[^.]+)?$/);
  return tailMatch ? tailMatch[1] : null;
};

const extractPostingCodeFromSubject = (subject = '') => {
  const text = String(subject || '').trim();
  if (!text) return null;
  const fromPlus = postingCodeFromPlusAddressText(text);
  if (fromPlus) return fromPlus;
  const fromLargeNumber = extractPostingCodeFromLargeNumberInText(text);
  if (fromLargeNumber) return fromLargeNumber;
  const codeMatch = text.match(/\b(\d{4,8})\b/);
  return codeMatch ? codeMatch[1] : null;
};

const formatJobForEmailUpload = (job) => {
  if (!job) return null;
  const plain = job.get ? job.get({ plain: true }) : job;
  if (!plain?.id) return null;
  return {
    id: String(plain.id),
    title: String(plain.title || '').trim(),
    client: String(plain.client || '').trim(),
    postingCode: String(plain.postingCode || '').trim(),
    digitalQuestions: Array.isArray(plain.digitalQuestions) ? plain.digitalQuestions : [],
  };
};

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    if (!chunk) continue;
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const isResumeAttachment = (attachment) => {
  if (!attachment || !attachment.content) return false;
  const filename = (attachment.filename || '').toLowerCase();
  if (supportedResumeExtensions.some((ext) => filename.endsWith(ext))) return true;
  const contentType = (attachment.contentType || '').toLowerCase();
  return supportedMimes.some((mimeHint) => contentType.includes(mimeHint));
};

const BORING_EMAIL_PREFIX = new Set(['noreply', 'no-reply', 'mailer-daemon', 'donotreply', 'no_reply']);

/**
 * Heuristic: first plausible contact email in CV body (not the envelope From).
 * Used to split one mail with multiple people’s CVs into separate records + welcome each.
 */
const extractFirstEmailFromCvText = (text) => {
  if (!text || typeof text !== 'string') return null;
  const sample = String(text).slice(0, 20000);
  const re = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  let m;
  while ((m = re.exec(sample)) != null) {
    const raw = m[0];
    const e = raw.toLowerCase();
    const local = e.split('@')[0];
    if (BORING_EMAIL_PREFIX.has(local) || e.endsWith('@example.com')) continue;
    return raw;
  }
  return null;
};

/** Candidate row email if valid, else null. */
const candidateRowEmail = (row) => {
  if (!row) return null;
  const raw = row.get && typeof row.get === 'function' ? row.get('email') : row.email;
  return raw && String(raw).includes('@') ? String(raw).trim().toLowerCase() : null;
};

const normalizeIngestEmail = (raw) => {
  const e = String(raw || '').trim().toLowerCase();
  return e && e.includes('@') ? e : null;
};

const normalizeIngestPhone = (raw) => {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972') && d.length >= 11) d = `0${d.slice(3)}`;
  if (d.length < 9) return null;
  return d.length > 9 ? d.slice(-9) : d;
};

const candidateRowPhone = (row) => {
  if (!row) return null;
  const raw = row.get && typeof row.get === 'function' ? row.get('phone') : row.phone;
  return normalizeIngestPhone(raw);
};

/**
 * Recruiter inboxes reuse one candidate row when hash-dedup or legacy paths attach the wrong id.
 * If the CV names a different person than the row already holds, fork a fresh candidate row.
 */
const forkEmailIngestCandidateIfIdentityMismatch = async ({
  candidate,
  candidateCreatedViaEmailIngest,
  reusedExistingCandidateByHash,
  textChunks,
  fromEmail,
  emailIngestSourcePatch,
  markIngestPending,
}) => {
  if (!candidate?.id || candidateCreatedViaEmailIngest || !textChunks?.[0]) {
    return { candidate, candidateCreatedViaEmailIngest, reusedExistingCandidateByHash, identityForked: false };
  }

  const cvEmail = extractCvContactEmail(textChunks[0], extractFirstEmailFromCvText(textChunks[0]));
  const fromNorm = normalizeIngestEmail(fromEmail);
  const normCvEmail = normalizeIngestEmail(cvEmail);
  if (!normCvEmail || (fromNorm && normCvEmail === fromNorm)) {
    return { candidate, candidateCreatedViaEmailIngest, reusedExistingCandidateByHash, identityForked: false };
  }

  const row = await candidateService.getById(candidate.id);
  const existingEmail = candidateRowEmail(row);
  const existingPhone = candidateRowPhone(row);
  const rowHasRealIdentity =
    (existingEmail && (!fromNorm || existingEmail !== fromNorm)) || Boolean(existingPhone);

  if (!rowHasRealIdentity || !existingEmail || existingEmail === normCvEmail) {
    return { candidate, candidateCreatedViaEmailIngest, reusedExistingCandidateByHash, identityForked: false };
  }

  const nameGuess =
    extractNameHintFromCvBody(textChunks[0] || '') ||
    inferNameFromCvTextForEmail(textChunks[0] || '', normCvEmail);

  console.warn('[email] CV identity differs from reused candidate row — forking new candidate', {
    reusedCandidateId: candidate.id,
    existingEmail,
    cvEmail: normCvEmail,
    reusedExistingCandidateByHash,
  });

  const forked = await candidateService.create(
    {
      email: normCvEmail,
      fullName: nameGuess || 'מועמד חדש',
      inboundFromEmail: fromEmail,
      ingestPending: true,
      ...emailIngestSourcePatch,
    },
    { skipIdentityLink: true },
  );
  await markIngestPending(forked.id);
  return {
    candidate: forked,
    candidateCreatedViaEmailIngest: true,
    reusedExistingCandidateByHash: false,
    identityForked: true,
  };
};

/** Re-upload attachments to a candidate after forking (prior uploads targeted the wrong id). */
const reuploadResumeAttachmentsForCandidate = async (
  candidateId,
  resumeAttachments,
  hashDedupedAttachmentIndices,
) => {
  const uploaded = [];
  const textChunks = [];
  const totalResumes = resumeAttachments.length;

  for (let i = 0; i < resumeAttachments.length; i += 1) {
    const resumeAttachment = resumeAttachments[i];
    const fileBase64 = resumeAttachment.content.toString('base64');
    const rawName =
      String(resumeAttachment.filename || 'resume')
        .split(/[/\\]/)
        .pop()
        .trim() || 'resume';
    const filename =
      totalResumes > 1
        ? `${i + 1}-of-${totalResumes}-${rawName}`
        : resumeAttachment.filename || `resume-${Date.now()}.bin`;
    const mimeType = resumeAttachment.contentType || 'application/octet-stream';

    if (hashDedupedAttachmentIndices.has(i)) {
      textChunks.push('');
      continue;
    }

    const put = await putResumeFileInS3(candidateId, fileBase64, filename, mimeType);
    if (!put) {
      textChunks.push('');
      continue;
    }
    uploaded.push({ ...put, fileLabel: filename });
    const piece =
      (await extractResumeTextFromUpload(fileBase64, mimeType)) ||
      (await fetchResumeText(put.publicUrl, candidateId)) ||
      '';
    textChunks.push(piece);
  }

  return { uploaded, textChunks };
};

/** CV body contact email (never the envelope From). */
const extractCvContactEmail = (text, fallbackFromFirstCv = null) => {
  const fromText = extractFirstEmailFromCvText(text);
  if (fromText && String(fromText).includes('@')) {
    return String(fromText).trim().toLowerCase();
  }
  if (fallbackFromFirstCv && String(fallbackFromFirstCv).includes('@')) {
    return String(fallbackFromFirstCv).trim().toLowerCase();
  }
  return null;
};

/** Persist CV contact email on the candidate when the row has none yet. */
const ensureCandidateEmailFromCvText = async (candidateId, cvText, fallbackFromFirstCv = null) => {
  const row = await candidateService.getById(candidateId);
  const existing = candidateRowEmail(row);
  if (existing) return { row, email: existing };
  const extracted = extractCvContactEmail(cvText, fallbackFromFirstCv);
  if (!extracted) return { row, email: null };
  await candidateService.update(candidateId, { email: extracted });
  const updated = await candidateService.getById(candidateId);
  return { row: updated, email: extracted };
};

const inferNameFromCvTextForEmail = (text, email) => {
  const fallback = (email && email.split('@')[0]) || 'מועמד';
  if (!text || typeof text !== 'string') return fallback;
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reName = /^(?:שם|שם מלא|name)\s*[:：]\s*(.+)/i;
  for (const line of lines.slice(0, 40)) {
    const mm = line.match(reName);
    if (mm && mm[1]) return mm[1].replace(/\s+/g, ' ').trim().slice(0, 120) || fallback;
  }
  return fallback;
};

/** Normalize for comparing “same person?” across CVs (spacing + niqqud). */
const normalizeCvIdentityKey = (s) => {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/["׳״'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const compactIdentityCompare = (k) => normalizeCvIdentityKey(k).replace(/\s/g, '');

const isPdfAttachmentBuffer = (buf, mimeType = '') => {
  if (!buf || !Buffer.isBuffer(buf) || !buf.length) return false;
  if (buf.slice(0, 5).toString('utf8').startsWith('%PDF')) return true;
  return String(mimeType || '').toLowerCase().includes('pdf');
};

/** Full Gemini parse + vision fallback (same as staff upload) when email text extract is empty. */
const runEmailIngestFullEnrichment = async (candidateId, combinedText, attachment, fileLabel) => {
  const buf = attachment?.content;
  if (!buf?.length) return false;
  const mimeType = attachment.contentType || 'application/octet-stream';
  const isPdf = isPdfAttachmentBuffer(buf, mimeType);
  const isImage = String(mimeType || '').toLowerCase().startsWith('image/');
  if (!isPdf && !isImage && !(combinedText || '').trim()) return false;

  const base = await candidateService.getById(candidateId);
  await enrichCandidateFromResumeText(base, combinedText || '', {
    pdfBuffer: isPdf ? buf : undefined,
    fileName: attachment.filename || fileLabel || 'resume.pdf',
    mimeType,
  });
  return true;
};

/**
 * Filename often encodes the candidate when agency footers share one email across CVs:
 * `…-1-of-3-קורות חיים של מאיה גל ללא.docx`
 */
const extractNameHintFromResumeFilename = (fileLabel) => {
  if (!fileLabel) return null;
  let s = String(fileLabel).split(/[/\\]/).pop() || '';
  s = s.replace(/\.[^.]+$/i, '');
  s = s.replace(/^\d+-\d+-of-\d+-/i, '').replace(/^\d+-/i, '');
  const m1 = s.match(/של\s+(.+?)(?:\s+ללא)?$/u);
  if (m1 && m1[1]) {
    const name = m1[1].replace(/קורות\s*חיים/gi, '').trim();
    if (name.length >= 2) return name;
  }
  const m2 = s.match(/קורות\s*חיים\s*[-–]\s*(.+)/u);
  if (m2 && m2[1]) {
    const v = m2[1].trim();
    if (v.length >= 2) return v;
  }
  return null;
};

/** Best-effort person label for splitting multi-attachment mail (before email heuristics). */
const extractNameHintFromCvBody = (text) => {
  if (!text || typeof text !== 'string') return null;
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const reName = /^(?:שם|שם מלא|name)\s*[:：]\s*(.+)/i;
  for (const line of lines.slice(0, 55)) {
    const mm = line.match(reName);
    if (mm && mm[1]) {
      const v = mm[1].replace(/\s+/g, ' ').trim();
      if (v.length >= 2 && v.length < 120) return v;
    }
  }
  const reCvDash = /^קורות\s*חיים\s*[-–]\s*(.+)$/i;
  for (const line of lines.slice(0, 8)) {
    const m = line.match(reCvDash);
    if (m && m[1]) {
      const v = m[1].trim();
      if (v.length >= 2 && v.length < 120) return v;
    }
  }
  if (lines[0]) {
    const L = lines[0]
      .replace(/^קו["׳״]?ח\s*[-–]?\s*/i, '')
      .replace(/^קורות\s*חיים\s*[-–]?\s*/i, '')
      .trim();
    if (L.length >= 2 && L.length < 90 && !/@/.test(L) && !/^\d+$/.test(L)) return L;
  }
  return null;
};

/**
 * Stable label to compare CV 0 vs CV j when contact email is duplicated (agency / shared footer).
 */
const extractCvIdentityKey = (text, fileLabel) => {
  const fromBody = extractNameHintFromCvBody(text || '');
  const fromFile = extractNameHintFromResumeFilename(fileLabel || '');
  const raw = fromBody || fromFile;
  return normalizeCvIdentityKey(raw || '');
};

const downloadEmailFromS3 = async (bucket, key) => {
  const client = createS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  if (!response.Body) return null;
  return streamToBuffer(response.Body);
};

/**
 * Email ingest keeps one Sequelize `candidate` instance while calling `candidateService.update` many times.
 * Updates do not refresh that instance, so `candidate.fullName` can stay stale and audit_logs.entityName
 * records the wrong person. Reload / re-read from DB before each system-event emit.
 */
async function resolveCandidateAuditDisplayName(candidateRef) {
  if (!candidateRef?.id) return '—';
  const id = candidateRef.id;
  try {
    if (typeof candidateRef.reload === 'function') {
      await candidateRef.reload({ attributes: ['id', 'fullName'] });
    }
  } catch (_) {
    // ignore reload errors
  }
  let name =
    (typeof candidateRef.get === 'function' ? candidateRef.get('fullName') : null) ||
    candidateRef.fullName ||
    '';
  const trimmed = String(name).trim();
  if (trimmed) return trimmed;
  try {
    const row = await candidateService.getById(id);
    return String(row?.fullName || '').trim() || '—';
  } catch (_) {
    return '—';
  }
}

const processEmailUpload = async (record) => {
  console.log('[email] processing upload record', {
    id: record.id,
    bucket: record.bucket,
    fileKey: record.fileKey,
    jobId: record.jobId,
  });
  /** Candidate rows hidden from list until this ingest finishes enrichment. */
  const ingestPendingIds = new Set();
  const markIngestPending = async (candidateId) => {
    if (!candidateId) return;
    const id = String(candidateId);
    ingestPendingIds.add(id);
    try {
      await candidateService.update(id, { ingestPending: true });
    } catch (err) {
      console.warn('[email] mark ingestPending failed', id, err?.message || err);
    }
  };
  const releaseAllIngestPending = async () => {
    for (const id of ingestPendingIds) {
      try {
        await candidateService.update(id, { ingestPending: false });
      } catch (err) {
        console.warn('[email] clear ingestPending failed', id, err?.message || err);
      }
    }
    ingestPendingIds.clear();
  };
  try {
    const rawEmail = await downloadEmailFromS3(record.bucket, record.fileKey);
    if (!rawEmail) {
      console.warn('[email] failed to download raw email', record.fileKey);
      return;
    }
    console.log('[email] downloaded raw email', { recordId: record.id, size: rawEmail.length });
    const parsed = await simpleParser(rawEmail);
    const fromText = parsed.from?.text || null;
    const toText = parsed.to?.text || null;
    const subject = parsed.subject || null;
    const body = parsed.text || parsed.html || null;

    console.log('[email] parsed headers', { fromText, toText, subject });
    await record.update({ from: fromText, to: toText, subject, body });

    const fromAddress = parsed.from?.value?.[0];
    const fromEmail = fromAddress?.address?.trim().toLowerCase();
    if (!fromEmail) {
      console.warn('[email] missing from address', record.fileKey);
      return;
    }

    const resumeAttachments = (parsed.attachments || []).filter(
      (a) => isResumeAttachment(a) && a.content,
    );
    if (!resumeAttachments.length) {
      console.warn('[email] no resume attachment found', {
        recordId: record.id,
        attachments: (parsed.attachments || []).map((att) => att.filename),
      });
      console.warn('[email] no resume attachment found', record.fileKey);
      return;
    }

    // Same S3 key delivered twice (e.g. duplicate webhook) → do not re-ingest; link this row and exit.
    const priorIngested = await EmailUpload.findOne({
      where: {
        bucket: record.bucket,
        fileKey: record.fileKey,
        candidateId: { [Op.not]: null },
        id: { [Op.ne]: record.id },
      },
      order: [['id', 'ASC']],
    });
    if (priorIngested) {
      await record.update({ candidateId: priorIngested.candidateId });
      console.log(
        '[email] duplicate S3 / duplicate notify for same fileKey; linked row, skipping full ingest',
        { recordId: record.id, priorRecordId: priorIngested.id, candidateId: priorIngested.candidateId },
      );
      return;
    }

    const toRecipients = parsed.to?.value || [];
    let postingCode = null;
    for (const recipient of toRecipients) {
      const code =
        extractPostingCodeFromEmailAddress(recipient.address) ||
        extractPostingCodeFromLargeNumberInText(recipient.name);
      if (code) {
        postingCode = code;
        break;
      }
    }
    if (!postingCode) {
      postingCode = postingCodeFromPlusAddressText(parsed.to?.text || '');
    }
    if (!postingCode) {
      postingCode =
        extractPostingCodeFromLargeNumberInText(parsed.to?.text || '') ||
        extractPostingCodeFromLargeNumberInText(subject || '');
    }
    let resolvedJob = null;
    if (postingCode) {
      resolvedJob = await jobService.findByPostingCode(postingCode);
      const isUuid = (value) =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
      if (resolvedJob && !isUuid(resolvedJob.id)) {
        resolvedJob = null;
      }
    }
    const inboxToText = parsed.to?.text || '';
    let resolvedJobClientId = await clientUsageSettingService.resolveClientIdForWelcomeEmail({
      jobId: resolvedJob?.id || null,
      inboxTo: inboxToText,
    });
    const matchedRecruitmentSource = await resolveRecruitmentSourceFromEmail(fromEmail, resolvedJobClientId);
    if (!resolvedJobClientId && matchedRecruitmentSource?.clientId) {
      resolvedJobClientId = matchedRecruitmentSource.clientId;
    }
    const emailIngestSource = matchedRecruitmentSource?.name || 'email';
    const emailIngestSourcePatch = {
      source: emailIngestSource,
      recruitmentSourceId: matchedRecruitmentSource?.id || null,
    };

    // Candidate row for this ingest:
    // `fromEmail` is only the envelope sender. Recruiters/agencies often forward CVs,
    // so do not write it into candidates.email; CV parsing below owns that field.
    // For job-directed mail (posting code in To), inbound-only reuse is dangerous:
    // one recruiter can forward many applicants from the same From address.
    let candidate = null;
    let candidateCreatedViaEmailIngest = false;
    let reusedExistingCandidateByHash = false;

    // Always create a stub per inbound mail. Identical file bytes dedupe later (hash loop below);
    // duplicate people dedupe after parse via mergeIfDuplicateIdentity (email/phone/tz).
    // Never reuse by envelope From — recruiter inboxes forward many applicants from one sender.
    if (!candidate) {
      const inferredName =
        fromAddress?.name?.trim() || fromEmail.split('@')[0] || 'מועמד חדש';
      candidate = await candidateService.create(
        {
          /** Stable key when CV/AI later overwrites `email` to a different address. */
          inboundFromEmail: fromEmail,
          fullName: inferredName,
          ingestPending: true,
          ...emailIngestSourcePatch,
        },
        { skipIdentityLink: true },
      );
      await markIngestPending(candidate.id);
      try {
        await candidateCompletenessService.refreshCandidateDataStatusForClient(candidate.id, null);
      } catch (cmpErr) {
        console.warn('[email] candidate completeness', cmpErr?.message || cmpErr);
      }
      candidateCreatedViaEmailIngest = true;
      console.log('[email] created new candidate', candidate.id);
    } else {
      try {
        const rawInbound =
          candidate.get && typeof candidate.get === 'function'
            ? candidate.get('inboundFromEmail')
            : candidate.inboundFromEmail;
        if (!rawInbound) {
          await candidateService.update(candidate.id, { inboundFromEmail: fromEmail });
        }
      } catch (e) {
        console.warn(
          '[email] inboundFromEmail not set (run migration add_candidates_inbound_from_email.sql if missing):',
          e?.message || e,
        );
      }
    }

    const textChunks = [];
    /** @type {Array<{ publicUrl: string, key: string, size: number, fileLabel: string }>} */
    const uploaded = [];
    const totalResumes = resumeAttachments.length;
    const attachmentHashes = [];
    const hashDedupedAttachmentIndices = new Set();
    let firstResumeContentHash = null;
    for (let i = 0; i < resumeAttachments.length; i += 1) {
      const resumeAttachment = resumeAttachments[i];
      const attachmentHash = hashResumeBuffer(resumeAttachment.content);
      attachmentHashes[i] = attachmentHash;
      if (i === 0) firstResumeContentHash = attachmentHash;

      if (attachmentHash) {
        const hashMatch = await findCandidateByResumeContentHash(attachmentHash);
        if (hashMatch && String(hashMatch.id) !== String(candidate.id)) {
          const primary = await resolvePrimaryFromHashMatch(hashMatch);
          const previousStubId = candidateCreatedViaEmailIngest ? String(candidate.id) : null;
          console.log('[email] duplicate resume content hash; using existing candidate', {
            hashPrefix: attachmentHash.slice(0, 12),
            existingId: primary.id,
            previousCandidateId: candidate.id,
          });
          try {
            await recordDuplicateResumeHashIngest(null, {
              primaryCandidateId: primary.id,
              duplicateCandidateId: previousStubId,
              source: 'email',
              fileName: resumeAttachment.filename || null,
            });
          } catch (evtErr) {
            console.warn('[email] duplicate hash journal failed', evtErr?.message || evtErr);
          }
          if (candidateCreatedViaEmailIngest) {
            try {
              await candidateService.update(candidate.id, { isDeleted: true });
            } catch (delErr) {
              console.warn('[email] failed to soft-delete stub after hash dedup', delErr?.message || delErr);
            }
          }
          candidate = await candidateService.getById(primary.id);
          candidateCreatedViaEmailIngest = false;
          reusedExistingCandidateByHash = true;
          hashDedupedAttachmentIndices.add(i);
        }
      }

      const fileBase64 = resumeAttachment.content.toString('base64');
      const rawName =
        String(resumeAttachment.filename || 'resume')
          .split(/[/\\]/)
          .pop()
          .trim() || 'resume';
      const filename =
        totalResumes > 1
          ? `${i + 1}-of-${totalResumes}-${rawName}`
          : resumeAttachment.filename || `resume-${Date.now()}.bin`;
      const mimeType = resumeAttachment.contentType || 'application/octet-stream';
      const put = await putResumeFileInS3(candidate.id, fileBase64, filename, mimeType);
      if (!put) continue;
      uploaded.push({ ...put, fileLabel: filename });
      console.log(
        '[email] resume uploaded to S3',
        `(${i + 1}/${totalResumes})`,
        put.publicUrl.slice(0, 60),
      );
      let piece = '';
      if (hashDedupedAttachmentIndices.has(i)) {
        console.log('[email] skipping text extract for hash-deduped attachment', { index: i });
      } else {
        // Extract from attachment bytes first (direct .doc/.docx/.pdf path; no S3 round-trip).
        piece =
          (await extractResumeTextFromUpload(fileBase64, mimeType)) ||
          (await fetchResumeText(put.publicUrl, candidate.id)) ||
          '';
      }
      textChunks.push(piece);
    }
    if (!uploaded.length) {
      console.warn('[email] all resume uploads failed', {
        recordId: record.id,
        fileKey: record.fileKey,
        attempted: totalResumes,
      });
      return;
    }

    // Route to an existing profile when the CV lists a contact email (not the recruiter From).
    if (!reusedExistingCandidateByHash && textChunks[0]) {
      const cvEmail = extractFirstEmailFromCvText(textChunks[0] || '');
      const fromNorm = String(fromEmail || '').trim().toLowerCase();
      if (cvEmail && cvEmail !== fromNorm) {
        const existingByCvEmail = await candidateService.findByEmail(cvEmail);
        if (existingByCvEmail && String(existingByCvEmail.id) !== String(candidate.id)) {
          if (candidateCreatedViaEmailIngest) {
            const stubId = String(candidate.id);
            try {
              await recordCandidateIdentityMerge(null, {
                primaryCandidateId: existingByCvEmail.id,
                duplicateCandidateId: stubId,
              });
            } catch (evtErr) {
              console.warn('[email] CV-email route journal failed', evtErr?.message || evtErr);
            }
            try {
              await candidateService.update(candidate.id, { isDeleted: true });
            } catch (delErr) {
              console.warn('[email] soft-delete stub after CV-email routing failed', delErr?.message || delErr);
            }
          }
          candidate = await candidateService.getById(existingByCvEmail.id);
          candidateCreatedViaEmailIngest = false;
          console.log('[email] routed ingest to existing candidate by CV email', {
            candidateId: candidate.id,
            cvEmail,
            recordId: record.id,
          });
        }
      }
    }

    let identityForked = false;
    ({
      candidate,
      candidateCreatedViaEmailIngest,
      reusedExistingCandidateByHash,
      identityForked,
    } = await forkEmailIngestCandidateIfIdentityMismatch({
      candidate,
      candidateCreatedViaEmailIngest,
      reusedExistingCandidateByHash,
      textChunks,
      fromEmail,
      emailIngestSourcePatch,
      markIngestPending,
    }));

    if (identityForked) {
      const reforked = await reuploadResumeAttachmentsForCandidate(
        candidate.id,
        resumeAttachments,
        hashDedupedAttachmentIndices,
      );
      if (reforked.uploaded.length) {
        uploaded.length = 0;
        uploaded.push(...reforked.uploaded);
        textChunks.length = 0;
        textChunks.push(...reforked.textChunks);
        if (reforked.uploaded[0]) {
          firstResumeContentHash = hashResumeBuffer(resumeAttachments[0]?.content);
        }
      } else {
        console.warn('[email] identity fork re-upload produced no files', {
          candidateId: candidate.id,
          recordId: record.id,
        });
      }
    }

    if (textChunks.length !== uploaded.length) {
      console.warn('[email] text/attachment count mismatch, falling back to join', {
        recordId: record.id,
        uploaded: uploaded.length,
        textChunks: textChunks.length,
      });
    }

    // Split when attachments look like different people. Default for multi-CV mail: split unless
    // we can prove same person (identical hash, same name hint, or same CV contact email).
    const emailInFirstCv = extractFirstEmailFromCvText(textChunks[0] || '');
    const identityKey0 = extractCvIdentityKey(textChunks[0] || '', uploaded[0]?.fileLabel || '');
    const identitySplitIndices = new Set();
    const splitFileIndices = new Set();
    for (let j = 1; j < uploaded.length; j += 1) {
      const identityKeyJ = extractCvIdentityKey(textChunks[j] || '', uploaded[j]?.fileLabel || '');
      const emailJ = extractFirstEmailFromCvText(textChunks[j] || '');
      const n0 = (emailInFirstCv || '').trim().toLowerCase();
      const nJ = emailJ ? String(emailJ).trim().toLowerCase() : '';

      if (
        attachmentHashes[j] &&
        attachmentHashes[0] &&
        attachmentHashes[j] === attachmentHashes[0]
      ) {
        continue;
      }

      const sameIdentity =
        identityKey0 &&
        identityKeyJ &&
        compactIdentityCompare(identityKey0) === compactIdentityCompare(identityKeyJ);
      if (sameIdentity) continue;

      if (n0 && nJ && n0 === nJ && nJ !== fromEmail) continue;

      splitFileIndices.add(j);
      if (
        identityKeyJ &&
        identityKey0 &&
        compactIdentityCompare(identityKeyJ) !== compactIdentityCompare(identityKey0)
      ) {
        identitySplitIndices.add(j);
      } else if (!nJ || nJ === fromEmail || !n0 || nJ !== n0) {
        // Agency batches often share one footer email — split without merging on envelope From.
        identitySplitIndices.add(j);
      }

      console.log('[email] multi-CV: split attachment to separate candidate', {
        j,
        identityKey0,
        identityKeyJ,
        email0: n0 || null,
        emailJ: nJ || null,
      });
    }

    // Hash-deduped attachments were already routed to an existing candidate — do not split again.
    for (const j of hashDedupedAttachmentIndices) {
      if (splitFileIndices.delete(j)) {
        console.log('[email] multi-CV: skip split for hash-deduped attachment index', { j });
      }
      identitySplitIndices.delete(j);
    }

    const latest = await candidateService.getById(candidate.id);
    const prevDocs = Array.isArray(latest?.documents) ? [...latest.documents] : [];
    const extraDocEntries = uploaded
      .slice(1)
      .map((u, idx) => {
        const j = idx + 1;
        if (splitFileIndices.has(j)) return null;
        return {
          id: randomUUID(),
          name: u.fileLabel || 'קורות חיים',
          type: 'resume',
          uploadDate: new Date().toISOString(),
          uploadedBy: 'מייל',
          notes: 'קליטה ממייל (מצורף מרובה)',
          fileSize: u.size || 0,
          key: u.key,
          url: u.publicUrl,
        };
      })
      .filter(Boolean);
    await candidateService.update(candidate.id, {
      resumeUrl: uploaded[0].publicUrl,
      resumeUploadedAt: new Date(),
      ...(firstResumeContentHash ? { resumeContentHash: firstResumeContentHash } : {}),
      documents: extraDocEntries.length ? [...extraDocEntries, ...prevDocs] : prevDocs,
    });

    const primaryTextParts = [textChunks[0] || ''];
    for (let j = 1; j < textChunks.length; j += 1) {
      if (!splitFileIndices.has(j)) primaryTextParts.push(textChunks[j] || '');
    }
    let combinedText = primaryTextParts.filter(Boolean).join('\n\n----\n\n');

    // DB-only check: combinedText must not mask an empty profile on hash-dedup re-ingest.
    const profileIncompleteOnDb = !hasEmbeddableCandidateContent(latest, '');
    const profileIncomplete = !hasEmbeddableCandidateContent(latest, combinedText);
    let hasCvText = combinedText.trim().length > 40;

    // Hash-dedup skips text extract for speed; re-extract when the stored profile is still a stub.
    if (
      reusedExistingCandidateByHash &&
      profileIncompleteOnDb &&
      !hasCvText &&
      hashDedupedAttachmentIndices.has(0) &&
      resumeAttachments[0]?.content
    ) {
      try {
        const fileBase64 = resumeAttachments[0].content.toString('base64');
        const mimeType = resumeAttachments[0].contentType || 'application/octet-stream';
        const reExtracted =
          (await extractResumeTextFromUpload(fileBase64, mimeType)) || '';
        if (reExtracted.trim().length > 40) {
          combinedText = reExtracted;
          hasCvText = true;
          console.log('[email] re-extracted CV text for incomplete hash-deduped candidate', {
            candidateId: candidate.id,
            textLen: reExtracted.trim().length,
          });
        }
      } catch (reExtractErr) {
        console.warn(
          '[email] hash-dedup CV re-extract failed',
          candidate.id,
          reExtractErr?.message || reExtractErr,
        );
      }
    }

    const profileNeedsEnrichment = profileIncompleteOnDb && hasCvText;
    // Fresh stub: always parse when we have text. Hash-reuse: parse only when DB profile is still empty.
    let shouldRunAiParse =
      hasCvText &&
      (candidateCreatedViaEmailIngest || !reusedExistingCandidateByHash || profileNeedsEnrichment);
    let ranFullEnrichment = false;

    if (reusedExistingCandidateByHash && profileIncompleteOnDb && !hasCvText) {
      console.warn('[email] hash-reused candidate still incomplete — will try vision/text enrich', {
        candidateId: candidate.id,
        hint: 'Legacy .doc requires word-extractor — run npm install in backend',
      });
    }

    if (!shouldRunAiParse && !hasCvText && resumeAttachments[0]?.content && profileIncompleteOnDb) {
      try {
        await markIngestPending(candidate.id);
        ranFullEnrichment = await runEmailIngestFullEnrichment(
          candidate.id,
          combinedText,
          resumeAttachments[0],
          uploaded[0]?.fileLabel,
        );
        if (ranFullEnrichment) {
          shouldRunAiParse = true;
          console.log('[email] ran full CV enrichment (vision/text) after empty text extract', {
            candidateId: candidate.id,
            reusedExistingCandidateByHash,
            fileName: resumeAttachments[0]?.filename || uploaded[0]?.fileLabel || null,
          });
        }
      } catch (fullEnrichErr) {
        console.warn(
          '[email] full CV enrichment failed after empty text extract',
          candidate.id,
          fullEnrichErr?.message || fullEnrichErr,
        );
      }
    }

    const forwardEligible =
      (hasCvText || ranFullEnrichment) && uploaded[0] && resolvedJob?.id && candidate?.id;
    if (forwardEligible) {
      let forwardAssociation = null;
      try {
        forwardAssociation = await jobCandidateService.associateCandidateWithJob({
          jobId: resolvedJob.id,
          candidateId: candidate.id,
          source: 'email',
          manualOverride: false,
        });
      } catch (assocErr) {
        console.warn('[email] early job association for CV forward failed', assocErr?.message || assocErr);
      }
      console.log('[email] scheduling CV forward', {
        candidateId: candidate.id,
        jobId: resolvedJob.id,
        postingCode,
        hasCvText,
        ranFullEnrichment,
      });
      cvForwardService.scheduleCvForward({
        candidateId: candidate.id,
        jobId: resolvedJob.id,
        intakeChannel: 'email',
        candidate,
        job: resolvedJob,
        jobCandidate: forwardAssociation?.record,
        resumeBuffer: resumeAttachments[0]?.content,
        resumeUrl: uploaded[0]?.publicUrl,
        resumeFileName: uploaded[0]?.fileLabel || resumeAttachments[0]?.filename,
        resumeMimeType: resumeAttachments[0]?.contentType,
        extractedText: combinedText,
        hasCvText,
        ranFullEnrichment,
        originalEmailSubject: subject,
        originalEmailText: parsed.text?.trim() || body,
        originalEmailHtml: parsed.html?.trim() || null,
        recruitmentSourceName: matchedRecruitmentSource?.name || emailIngestSource,
      });
    }

    if (shouldRunAiParse && !ranFullEnrichment) {
      await markIngestPending(candidate.id);
      const parsedUpdates = buildParsedUpdates(candidate, combinedText || '');
      if (Object.keys(parsedUpdates).length) {
        await candidateService.update(candidate.id, parsedUpdates);
      }
      const { aiFields, aiTags } = await deriveCandidateFieldsFromResume(combinedText);
      if (aiFields && Object.keys(aiFields).length) {
        const safeAi = { ...aiFields };
        if (safeAi.email && String(safeAi.email).includes('@')) {
          safeAi.email = String(safeAi.email).trim().toLowerCase();
        } else {
          // Keep any email extracted directly from the CV; never fall back to the envelope From.
          delete safeAi.email;
          const cvMail = extractCvContactEmail(combinedText || '', emailInFirstCv);
          const fromNorm = String(fromEmail || '').trim().toLowerCase();
          if (cvMail && cvMail !== fromNorm) {
            safeAi.email = cvMail;
          }
        }
        await candidateService.update(candidate.id, safeAi);

        const auditNameAfterAi = await resolveCandidateAuditDisplayName(candidate);

        // Audit: 'פרסור ניתוח ועיבוד מידע' — AI parsed CV and applied auto updates
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_PARSED,
          entityType: 'Candidate',
          entityId: candidate.id,
          entityName: auditNameAfterAi,
          params: { source: aiFields?.source || emailIngestSource },
        });

        // Audit: 'הגדרת תחום משרה' — candidate "field" inferred by AI
        if (safeAi.field) {
          await systemEventEmitter.emit(null, {
            ...SYSTEM_EVENTS.CV_FIELD,
            entityType: 'Candidate',
            entityId: candidate.id,
            entityName: auditNameAfterAi,
            params: { job: safeAi.field },
          });
        }
      }
      if (aiTags.length) {
        await candidateTagService.syncTagsForCandidate(candidate.id, aiTags);

        const auditNameAfterTags = await resolveCandidateAuditDisplayName(candidate);

        // Audit: 'הגדרת תגיות' — tags created/synced for candidate
        const tagsLabel = aiTags
          .map((t) => t?.displayNameHe || t?.displayNameEn || t?.tagKey || t?.name)
          .filter(Boolean)
          .slice(0, 12)
          .join(', ');
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_TAGS,
          entityType: 'Candidate',
          entityId: candidate.id,
          entityName: auditNameAfterTags,
          params: { tags: tagsLabel || `${aiTags.length} תגיות` },
        });
      }
    } else if (!ranFullEnrichment) {
      const skipReason = !hasCvText
        ? 'no_cv_text_extracted'
        : reusedExistingCandidateByHash
          ? 'hash_reused_existing_candidate'
          : 'profile_already_complete';
      console.log('[email] skipping AI parse/embed', {
        candidateId: candidate.id,
        reason: skipReason,
        hashDedupedAttachmentIndices: [...hashDedupedAttachmentIndices],
        profileNeedsEnrichment,
        profileIncompleteOnDb,
        hasCvText,
        reusedExistingCandidateByHash,
        ...(skipReason === 'no_cv_text_extracted'
          ? { hint: 'Check PDF canvas/OCR on server — run npm install in backend' }
          : {}),
      });
    }
    await candidateService.update(candidate.id, emailIngestSourcePatch);

    // Duplicate identity (email / phone / tz): merge this ingest row into the existing candidate.
    try {
      const latestForIdentity = await candidateService.getById(candidate.id);
      const identityResult = await candidateService.mergeIfDuplicateIdentity(candidate.id, {
        email: latestForIdentity?.email,
        phone: latestForIdentity?.phone,
        idNumber: latestForIdentity?.idNumber,
      });
      if (identityResult.merged) {
        console.log('[email] duplicate ingest reconciled with existing candidate', {
          removedDuplicateId: identityResult.removedDuplicateId,
          candidateId: identityResult.candidateId,
          linked: Boolean(identityResult.linked),
        });
        candidate = await candidateService.getById(identityResult.candidateId);
        candidateCreatedViaEmailIngest = false;
        await record.update({ candidateId: candidate.id });
      }
      await candidateService.repairPartialIdentityLink(candidate.id);
    } catch (identityErr) {
      console.warn('[email] identity merge failed', identityErr?.message || identityErr);
    }

    try {
      await candidateCompletenessService.refreshCandidateDataStatusForClient(candidate.id, resolvedJobClientId);
    } catch (cmpErr) {
      console.warn('[email] completeness after ingest', cmpErr?.message || cmpErr);
    }

    const primarySynced = await candidateService.getById(candidate.id);
    await ensureOrganizationsFromExperience(primarySynced?.workExperience, candidate.id);

    if (shouldRunAiParse && !ranFullEnrichment) {
      try {
        await embedCandidateAndSave(candidate.id, combinedText || '');
      } catch (embErr) {
        console.warn('[email] embed primary candidate failed', candidate.id, embErr?.message || embErr);
      }
    }

    const association = await jobCandidateService.associateCandidateWithJob({
      jobId: resolvedJob?.id || null,
      candidateId: candidate.id,
      source: 'email',
      manualOverride: false,
    });
    console.log('[email] associated candidate with job', {
      jobCandidateId: association?.id ?? null,
      jobId: resolvedJob?.id || null,
      candidateId: candidate.id,
    });
    await record.update({
      candidateId: candidate.id,
      body: parsed.html?.trim() || parsed.text?.trim() || null,
      ...(resolvedJob?.id ? { jobId: String(resolvedJob.id) } : {}),
    });
    if (resolvedJob?.id) {
      record.jobId = String(resolvedJob.id);
    }
    await record.reload();

    // Audit + pipeline automations: run after job link so clientId and jobCandidateId resolve.
    const primaryAuditId = candidate.id != null ? String(candidate.id) : null;
    const primaryAuditName = await resolveCandidateAuditDisplayName(candidate);
    if (candidateCreatedViaEmailIngest && primaryAuditId) {
      await systemEventEmitter.emit(null, {
        ...SYSTEM_EVENTS.CV_RECEIVED,
        entityType: 'Candidate',
        entityId: primaryAuditId,
        entityName: primaryAuditName,
        clientId: resolvedJobClientId || null,
        params: { id: record?.id != null ? String(record.id) : primaryAuditId },
      });
      await systemEventEmitter.emit(null, {
        ...SYSTEM_EVENTS.CV_SOURCE,
        entityType: 'Candidate',
        entityId: primaryAuditId,
        entityName: primaryAuditName,
        clientId: resolvedJobClientId || null,
        params: { source: emailIngestSource },
      });
    }

    const welcomeClientId = resolvedJobClientId;
    const welcomeOnce = new Set();
    const queueWelcome = async (cand, cvText = '') => {
      if (!cand?.id) return;
      const plain =
        cand.get && typeof cand.get === 'function' ? cand.get({ plain: true }) : { ...cand };
      let welcomeCandidate = plain;
      if (welcomeCandidate.userId) {
        console.log('[email] welcome skipped: candidate already linked to portal user', {
          candidateId: welcomeCandidate.id,
          userId: welcomeCandidate.userId,
        });
        return;
      }
      const fromNorm = String(fromEmail || '').trim().toLowerCase();
      let toEmail =
        candidateRowEmail(cand) || extractCvContactEmail(cvText, emailInFirstCv);
      // Direct application: candidate emailed their own CV; envelope From is the contact.
      if (!toEmail && fromNorm && fromNorm.includes('@') && !matchedRecruitmentSource) {
        toEmail = fromNorm;
      }
      if (!toEmail) {
        console.log('[email] welcome skipped: no candidate contact email on CV', {
          candidateId: cand.id,
        });
        return;
      }
      // Agency/recruiter forwarded CV — do not welcome the envelope sender.
      if (fromNorm && toEmail === fromNorm && matchedRecruitmentSource) {
        console.log('[email] welcome skipped: sender is recruitment source (forwarded CV)', {
          candidateId: cand.id,
          source: matchedRecruitmentSource.name,
        });
        return;
      }
      const k = toEmail;
      if (welcomeOnce.has(k)) {
        console.log('[email] welcome skipped (dedupe, same address as earlier in this ingest)', k);
        return;
      }
      welcomeOnce.add(k);
      if (!candidateRowEmail(welcomeCandidate)) {
        try {
          await candidateService.update(cand.id, { email: k });
          const refreshed = await candidateService.getById(cand.id);
          if (refreshed) welcomeCandidate = refreshed;
        } catch (persistErr) {
          console.warn('[email] welcome email persist failed', cand.id, persistErr?.message || persistErr);
        }
      }
      try {
        messageTemplateService.queueCandidateWelcomeEmail(
          { ...welcomeCandidate, email: k },
          {
            clientId: welcomeClientId,
            jobId: resolvedJob?.id || null,
            inboxTo: inboxToText,
          },
        );
      } catch (e) {
        console.warn('[email] welcome queue failed for', k, e?.message || e);
      }
    };

    for (const j of splitFileIndices) {
      const up = uploaded[j];
      if (!up) continue;
      let contactEmail =
        extractFirstEmailFromCvText(textChunks[j] || '') ||
        emailInFirstCv ||
        extractFirstEmailFromCvText(textChunks[0] || '');
      const norm = contactEmail ? String(contactEmail).trim().toLowerCase() : null;
      if (!identitySplitIndices.has(j) && norm === fromEmail) continue;

      const nameGuess =
        extractNameHintFromCvBody(textChunks[j] || '') ||
        extractNameHintFromResumeFilename(up.fileLabel || '') ||
        inferNameFromCvTextForEmail(textChunks[j] || '', contactEmail);

      let splitCand;
      let splitCandIsNew = false;
      let splitHashReused = false;
      const splitHash = attachmentHashes[j] || null;
      if (splitHash) {
        const hashMatch = await findCandidateByResumeContentHash(splitHash);
        if (hashMatch) {
          const primary = await resolvePrimaryFromHashMatch(hashMatch);
          splitCand = await candidateService.getById(primary.id);
          splitCandIsNew = false;
          splitHashReused = true;
          console.log('[email] split CV: reusing existing candidate from resume content hash', {
            attachmentIndex: j,
            candidateId: splitCand.id,
            hashPrefix: splitHash.slice(0, 12),
          });
        }
      }
      if (!splitCand) {
        if (identitySplitIndices.has(j)) {
          // Distinct people sharing one footer email — do not merge by identity.
          splitCand = await candidateService.create(
            {
              email: norm,
              fullName: nameGuess,
              inboundFromEmail: fromEmail,
              ingestPending: true,
              ...emailIngestSourcePatch,
            },
            { skipIdentityLink: true },
          );
          splitCandIsNew = true;
          await markIngestPending(splitCand.id);
        } else {
          splitCand = await candidateService.create({
            email: norm,
            fullName: nameGuess,
            inboundFromEmail: fromEmail,
            ingestPending: true,
            ...emailIngestSourcePatch,
          });
          splitCandIsNew = true;
          await markIngestPending(splitCand.id);
          if (splitCand._identityReused || splitCand._identityLinked) {
            console.log('[email] split CV attached to existing candidate', {
              candidateId: splitCand.id,
              linked: Boolean(splitCand._identityLinked),
            });
            splitCandIsNew = false;
          }
        }
      }
      await candidateService.update(splitCand.id, {
        resumeUrl: up.publicUrl,
        resumeUploadedAt: new Date(),
        ...(splitHash ? { resumeContentHash: splitHash } : {}),
        ...emailIngestSourcePatch,
      });
      if (splitCandIsNew) {
        const sid = splitCand.id != null ? String(splitCand.id) : null;
        const sname =
          (typeof splitCand.get === 'function' ? splitCand.get('fullName') : null) ||
          splitCand.fullName ||
          nameGuess ||
          '—';
        splitCand._pendingCvAudit = { sid, sname };
      }
      const tj = textChunks[j] || '';
      if (!splitHashReused) {
        const { aiFields: splitAi, aiTags: splitTags } = await deriveCandidateFieldsFromResume(tj);
        if (splitAi && Object.keys(splitAi).length) {
          const safeS = { ...splitAi };
          if (safeS.email && String(safeS.email).includes('@')) {
            safeS.email = String(safeS.email).trim().toLowerCase();
          } else if (norm && norm !== fromEmail) {
            safeS.email = norm;
          } else {
            delete safeS.email;
          }
          await candidateService.update(splitCand.id, safeS);
        }
        if (splitTags && splitTags.length) {
          await candidateTagService.syncTagsForCandidate(splitCand.id, splitTags);
        }
      } else {
        console.log('[email] split CV: skipping AI parse/embed — hash-reused candidate', {
          attachmentIndex: j,
          candidateId: splitCand.id,
        });
      }
      try {
        const splitFreshForIdentity = await candidateService.getById(splitCand.id);
        const splitIdentity = await candidateService.mergeIfDuplicateIdentity(splitCand.id, {
          email: splitFreshForIdentity?.email,
          phone: splitFreshForIdentity?.phone,
          idNumber: splitFreshForIdentity?.idNumber,
        });
        if (splitIdentity.merged) {
          splitCand = await candidateService.getById(splitIdentity.candidateId);
          splitCandIsNew = false;
        }
      } catch (splitIdentityErr) {
        console.warn('[email] split identity merge failed', splitIdentityErr?.message || splitIdentityErr);
      }
      await jobCandidateService.associateCandidateWithJob({
        jobId: resolvedJob?.id || null,
        candidateId: splitCand.id,
        source: 'email',
        manualOverride: false,
      });
      if (splitCand._pendingCvAudit) {
        const { sid, sname } = splitCand._pendingCvAudit;
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_RECEIVED,
          entityType: 'Candidate',
          entityId: sid,
          entityName: sname,
          clientId: resolvedJobClientId || null,
          params: { id: record?.id != null ? String(record.id) : sid },
        });
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_SOURCE,
          entityType: 'Candidate',
          entityId: sid,
          entityName: sname,
          clientId: resolvedJobClientId || null,
          params: { source: emailIngestSource },
        });
        delete splitCand._pendingCvAudit;
      }
      const splitFresh = await candidateService.getById(splitCand.id);
      await ensureOrganizationsFromExperience(splitFresh?.workExperience, splitCand.id);
      if (!splitHashReused) {
        try {
          await embedCandidateAndSave(splitCand.id, tj || '');
        } catch (embErr) {
          console.warn('[email] embed split candidate failed', splitCand.id, embErr?.message || embErr);
        }
      }
      // Mirror row so GET /api/email-uploads/candidate/:id finds this mail for split candidates (same S3 object as primary).
      try {
        await EmailUpload.create({
          bucket: record.bucket,
          fileKey: record.fileKey,
          jobId: resolvedJob?.id ? String(resolvedJob.id) : record.jobId,
          to: record.to,
          from: record.from,
          subject: record.subject,
          body: record.body,
          candidateId: splitCand.id,
        });
      } catch (mirrorErr) {
        console.warn(
          '[email] failed to mirror EmailUpload for split candidate',
          splitCand.id,
          mirrorErr?.message || mirrorErr,
        );
      }
      if (!splitHashReused) {
        await queueWelcome(splitFresh, textChunks[j] || '');
      }
    }

    if (!reusedExistingCandidateByHash) {
      try {
        const { row: fresh, email: welcomeEmail } = await ensureCandidateEmailFromCvText(
          candidate.id,
          combinedText,
          emailInFirstCv,
        );
        console.log('[email] ingest template email queue (primary CV-by-mail)', {
          candidateId: fresh?.id,
          newCandidateThisIngest: candidateCreatedViaEmailIngest,
          email: welcomeEmail || fresh?.email || null,
          source: fresh?.source,
          resolvedJobId: resolvedJob?.id || null,
          welcomeClientId,
          postingCode: postingCode || null,
          splitAttachmentWelcomeCount: splitFileIndices.size,
        });
        await queueWelcome(fresh, combinedText);
      } catch (welcomeErr) {
        console.warn('[email] ingest template email queue failed', welcomeErr?.message || welcomeErr);
      }
    } else {
      console.log('[email] skipping welcome email — hash-reused existing candidate', {
        candidateId: candidate.id,
      });
    }
    console.log('[email] resume(s) attached for candidate', candidate.id, record.fileKey, {
      count: totalResumes,
    });
  } catch (error) {
    console.error('[email][processEmailUpload]', {
      message: error?.message || error,
      stack: error?.stack,
      recordId: record?.id,
      fileKey: record?.fileKey,
    });
  } finally {
    await releaseAllIngestPending();
  }
};

async function fetchEmailUploadsForCandidates(candidateIds) {
  const ids = [...new Set(candidateIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];

  const records = await EmailUpload.findAll({
    where: { candidateId: { [Op.in]: ids } },
    order: [['createdAt', 'DESC']],
  });

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isJobUuid = (value) => UUID_RE.test(String(value || '').trim());

  const uuidJobIds = new Set();
  const postingCodes = new Set();
  const collectPostingCodesForRecord = (record) => {
    const codes = new Set();
    const key = String(record.jobId || '').trim();
    if (key && !isJobUuid(key)) codes.add(key);
    const fromFile = extractPostingCodeFromFileKey(record.fileKey);
    if (fromFile) codes.add(fromFile);
    const fromSubject = extractPostingCodeFromSubject(record.subject);
    if (fromSubject) codes.add(fromSubject);
    return [...codes];
  };

  for (const record of records) {
    const key = String(record.jobId || '').trim();
    if (!key) {
      collectPostingCodesForRecord(record).forEach((code) => postingCodes.add(code));
      continue;
    }
    if (isJobUuid(key)) uuidJobIds.add(key);
    else postingCodes.add(key);
    collectPostingCodesForRecord(record).forEach((code) => postingCodes.add(code));
  }

  const jobsById = new Map();
  const jobsByPostingCode = new Map();
  const registerJob = (job) => {
    const plain = job.get ? job.get({ plain: true }) : job;
    if (!plain?.id) return;
    jobsById.set(String(plain.id), plain);
    const code = String(plain.postingCode || '').trim();
    if (code) jobsByPostingCode.set(code, plain);
  };

  try {
    if (uuidJobIds.size) {
      const jobs = await Job.findAll({
        where: { id: { [Op.in]: [...uuidJobIds] } },
        attributes: ['id', 'title', 'client', 'postingCode', 'digitalQuestions'],
      });
      jobs.forEach(registerJob);
    }
    const unresolvedPostingCodes = [...postingCodes].filter((code) => !jobsByPostingCode.has(code));
    if (unresolvedPostingCodes.length) {
      const jobs = await Job.findAll({
        where: { postingCode: { [Op.in]: unresolvedPostingCodes } },
        attributes: ['id', 'title', 'client', 'postingCode', 'digitalQuestions'],
      });
      jobs.forEach(registerJob);
    }
  } catch (jobErr) {
    console.warn('[email][fetchEmailUploadsForCandidates] job lookup failed (non-fatal):', jobErr?.message || jobErr);
  }

  const jobsByCandidateId = new Map();
  try {
    const candidateIdsForLinks = [...new Set(records.map((r) => r.candidateId).filter(Boolean))];
    if (candidateIdsForLinks.length) {
      const links = await JobCandidate.findAll({
        where: {
          candidateId: { [Op.in]: candidateIdsForLinks },
          jobId: { [Op.ne]: null },
        },
        attributes: ['candidateId', 'jobId', 'createdAt'],
        order: [['createdAt', 'DESC']],
      });
      const missingLinkJobIds = [
        ...new Set(
          links
            .map((link) => String(link.jobId || '').trim())
            .filter((jobId) => jobId && !jobsById.has(jobId)),
        ),
      ];
      if (missingLinkJobIds.length) {
        const linkedJobs = await Job.findAll({
          where: { id: { [Op.in]: missingLinkJobIds } },
          attributes: ['id', 'title', 'client', 'postingCode', 'digitalQuestions'],
        });
        linkedJobs.forEach(registerJob);
      }
      for (const link of links) {
        const cid = String(link.candidateId || '').trim();
        const jid = String(link.jobId || '').trim();
        if (!cid || !jid || jobsByCandidateId.has(cid)) continue;
        const job = jobsById.get(jid);
        if (job) jobsByCandidateId.set(cid, job);
      }
    }
  } catch (linkErr) {
    console.warn('[email][fetchEmailUploadsForCandidates] job-candidate lookup failed (non-fatal):', linkErr?.message || linkErr);
  }

  const resolveJobForRecord = (record) => {
    const key = String(record.jobId || '').trim();
    if (key) {
      if (isJobUuid(key)) {
        const byId = jobsById.get(key);
        if (byId) return formatJobForEmailUpload(byId);
      } else {
        const byCode = jobsByPostingCode.get(key);
        if (byCode) return formatJobForEmailUpload(byCode);
      }
    }
    for (const code of collectPostingCodesForRecord(record)) {
      const byHint = jobsByPostingCode.get(code);
      if (byHint) return formatJobForEmailUpload(byHint);
    }
    const cid = record.candidateId ? String(record.candidateId) : '';
    if (cid) {
      const byCandidate = jobsByCandidateId.get(cid);
      if (byCandidate) return formatJobForEmailUpload(byCandidate);
    }
    return null;
  };

  return records.map((record) => {
    const plain = record.get({ plain: true });
    plain.job = resolveJobForRecord(record);
    return plain;
  });
}

const getByCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    if (!candidateId) {
      return res.status(400).json({ message: 'candidateId is required' });
    }
    const records = await fetchEmailUploadsForCandidates([candidateId]);
    res.json(records);
  } catch (error) {
    console.error('[email][getByCandidate]', error);
    res.status(500).json({ message: 'Failed to load email uploads' });
  }
};

const getByCandidates = async (req, res) => {
  try {
    const raw = req.query.candidateIds ?? req.query.candidateId ?? '';
    const candidateIds = [...new Set(String(raw).split(/[,;\s]+/).map((id) => id.trim()).filter(Boolean))];
    if (!candidateIds.length) {
      return res.status(400).json({ message: 'candidateIds is required' });
    }
    const records = await fetchEmailUploadsForCandidates(candidateIds);
    res.json(records);
  } catch (error) {
    console.error('[email][getByCandidates]', error);
    res.status(500).json({ message: 'Failed to load email uploads' });
  }
};

const patchEmailUploadNotes = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'id is required' });
    }
    const userNotes = req.body?.userNotes != null ? String(req.body.userNotes) : '';
    const record = await EmailUpload.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Email upload not found' });
    }
    await record.update({ userNotes });
    res.json(record);
  } catch (error) {
    console.error('[email][patchEmailUploadNotes]', error);
    res.status(500).json({ message: 'Failed to update notes' });
  }
};

const downloadEmailUploadResume = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'id is required' });
    }
    const record = await EmailUpload.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Email upload not found' });
    }

    const rawEmail = await downloadEmailFromS3(record.bucket, record.fileKey);
    if (!rawEmail) {
      return res.status(404).json({ message: 'Email file not found' });
    }

    const parsed = await simpleParser(rawEmail);
    const resumeAttachments = (parsed.attachments || []).filter(
      (a) => isResumeAttachment(a) && a.content,
    );
    if (!resumeAttachments.length) {
      return res.status(404).json({ message: 'No resume attachment found in email' });
    }

    const attachment = resumeAttachments[0];
    const filename = String(attachment.filename || 'resume.pdf').replace(/[/\\]/g, '_');
    const contentType = attachment.contentType || 'application/octet-stream';
    const asciiName = filename.replace(/[^\x20-\x7E]/g, '_') || 'resume.pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(attachment.content);
  } catch (error) {
    console.error('[email][downloadEmailUploadResume]', error);
    return res.status(500).json({ message: 'Failed to download resume' });
  }
};

/** DB-backed viewer: JWT email can be missing or stale; rows may match assignee/name or sender. */
async function resolveNotificationViewerContext(req) {
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return null;
  const user = await User.findByPk(userId, { attributes: ['id', 'email', 'name'] });
  if (!user) return null;
  const emailNorm = (user.email || '').trim().toLowerCase();
  const nameNorm = (user.name || '').trim().toLowerCase();
  return { userId: user.id, emailNorm, nameNorm };
}

function emailInCommaSeparatedField(field, emailNorm) {
  const norm = String(emailNorm || '').trim().toLowerCase();
  if (!norm) return false;
  return String(field || '')
    .split(/[,;\n]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(norm);
}

function notificationVisibleToViewer(record, ctx) {
  if (!ctx) return false;
  if (ctx.userId != null && record.senderUserId != null) {
    if (String(record.senderUserId) === String(ctx.userId)) return true;
  }
  const assigneeWhole = String(record.assignee || '').trim().toLowerCase();
  if (ctx.emailNorm) {
    if (emailInCommaSeparatedField(record.toEmail, ctx.emailNorm)) return true;
    if (emailInCommaSeparatedField(record.assignee, ctx.emailNorm)) return true;
  }
  if (ctx.nameNorm && assigneeWhole === ctx.nameNorm) return true;
  return false;
}

function buildNotificationAttachmentMetadata(smtpAttachments) {
  if (!Array.isArray(smtpAttachments) || !smtpAttachments.length) return null;
  const rows = smtpAttachments
    .map((a) => {
      if (!a?.content || !Buffer.isBuffer(a.content) || !a.content.length) return null;
      return {
        filename: String(a.filename || 'attachment'),
        contentType: a.contentType || 'application/octet-stream',
        size: a.content.length,
        contentBase64: a.content.toString('base64'),
      };
    })
    .filter(Boolean);
  return rows.length ? rows : null;
}

function readNotificationMetadata(record) {
  const raw = record?.get?.('metadata') ?? record?.metadata ?? {};
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
}

async function patchNotificationMetadata(record, patch, { attachments } = {}) {
  const next = {
    ...readNotificationMetadata(record),
    ...(patch && typeof patch === 'object' ? patch : {}),
  };
  if (Array.isArray(attachments) && attachments.length) {
    next.attachments = attachments;
  }
  await record.update({ metadata: next });
  record.set('metadata', next);
  return next;
}

async function findOutboundAttachmentInClientEvents(notificationMessageId, index) {
  const msgId = String(notificationMessageId || '').trim();
  const idx = Number(index);
  if (!msgId || !Number.isInteger(idx) || idx < 0) return null;

  const [rows] = await sequelize.query(
    `SELECT ev AS event
     FROM clients c
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.events, '[]'::jsonb)) ev
     WHERE ev->'metadata'->>'notificationMessageId' = :msgId
     LIMIT 50`,
    { replacements: { msgId } },
  );

  for (const row of rows) {
    const meta = row?.event?.metadata;
    const attachments = Array.isArray(meta?.attachments) ? meta.attachments : [];
    const att = attachments[idx];
    if (att?.contentBase64) return att;
  }
  return null;
}

/** Sender/recipient, or same-tenant staff (e.g. CRM contact profile). */
async function notificationAttachmentAccessibleByViewer(record, req) {
  const ctx = await resolveNotificationViewerContext(req);
  if (notificationVisibleToViewer(record, ctx)) return true;

  const userId = req.user?.sub || req.user?.id;
  if (!userId || !record?.senderUserId) return false;

  const me = await User.findByPk(userId, { attributes: ['id', 'clientId'] });
  if (!me) return false;

  const sender = await User.findByPk(record.senderUserId, { attributes: ['id', 'clientId'] });
  if (!sender) return false;

  if (me.clientId && sender.clientId && String(me.clientId) === String(sender.clientId)) {
    return true;
  }

  const myEffective = await authService.resolveEffectiveClientIdForUser(me);
  const senderEffective = await authService.resolveEffectiveClientIdForUser(sender);
  return Boolean(
    myEffective && senderEffective && String(myEffective) === String(senderEffective),
  );
}

/** Same-tenant staff may edit screening_cv workflow fields (aligned with list scope). */
async function screeningCvReferralEditableByPeer(record, req) {
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return false;

  const me = await User.findByPk(userId, {
    attributes: ['id', 'clientId', 'email', 'role', 'name'],
  });
  if (!me) return false;

  const myEffective = await authService.resolveEffectiveClientIdForUser(me);
  const sid = record?.senderUserId;

  // Same effective client (or raw clientId) as the sender
  if (sid) {
    const sender = await User.findByPk(sid, {
      attributes: ['id', 'clientId', 'email', 'role', 'name'],
    });
    if (sender) {
      if (me.clientId && sender.clientId && String(me.clientId) === String(sender.clientId)) {
        return true;
      }
      if (myEffective) {
        const senderEffective = await authService.resolveEffectiveClientIdForUser(sender);
        if (senderEffective && String(senderEffective) === String(myEffective)) {
          return true;
        }
      }
    }
  }

  // Same gate as listScreeningCvReferrals: job company label under the viewer's tenant
  if (!myEffective) return false;
  const labels = await collectClientScopeLabels(myEffective);
  if (!labels.length) return false;
  const meta = record.metadata || {};
  const tp = meta.taskPayload || {};
  const clientName = String(tp.clientName || '').trim();
  return screeningClientNameMatchesScope(clientName, labels);
}

/** True when the viewer is an intended recipient (not only the sender viewing "sent"). */
function notificationRecipientMatchesViewer(record, ctx) {
  if (!ctx) return false;
  const assigneeWhole = String(record.assignee || '').trim().toLowerCase();
  if (ctx.emailNorm) {
    if (emailInCommaSeparatedField(record.toEmail, ctx.emailNorm)) return true;
    if (emailInCommaSeparatedField(record.assignee, ctx.emailNorm)) return true;
  }
  if (ctx.nameNorm && assigneeWhole === ctx.nameNorm) return true;
  return false;
}

const getNotificationMessages = async (req, res) => {
  try {
    const ctx = await resolveNotificationViewerContext(req);
    if (!ctx) {
      res.set('Cache-Control', 'private, no-store');
      return res.json([]);
    }

    const trimmedLower = (col) =>
      Sequelize.fn('lower', Sequelize.fn('trim', Sequelize.col(col)));

    const orConditions = [];

    if (ctx.emailNorm) {
      const emailListPattern = `%,${ctx.emailNorm},%`;
      orConditions.push(
        Sequelize.literal(
          `(',' || REPLACE(LOWER(TRIM(COALESCE("NotificationMessage"."toEmail", ''))), ' ', '') || ',') LIKE ${sequelize.escape(
            emailListPattern
          )}`
        ),
        Sequelize.literal(
          `(',' || REPLACE(LOWER(TRIM(COALESCE("NotificationMessage"."assignee", ''))), ' ', '') || ',') LIKE ${sequelize.escape(
            emailListPattern
          )}`
        )
      );
      if (ctx.nameNorm) {
        orConditions.push(Sequelize.where(trimmedLower('assignee'), ctx.nameNorm));
      }
    } else if (ctx.nameNorm) {
      orConditions.push(Sequelize.where(trimmedLower('assignee'), ctx.nameNorm));
    }

    if (ctx.userId != null) {
      orConditions.push({ senderUserId: ctx.userId });
    }

    if (orConditions.length === 0) {
      res.set('Cache-Control', 'private, no-store');
      return res.json([]);
    }

    const records = await NotificationMessage.findAll({
      where: {
        [Op.and]: [{ status: { [Op.ne]: 'deleted' } }, { [Op.or]: orConditions }],
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'email'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    const payload = records.map((r) => {
      const row = r.get({ plain: true });
      const s = row.sender;
      delete row.sender;
      const senderName = s?.name != null ? String(s.name).trim() : '';
      const senderEmail = s?.email != null ? String(s.email).trim() : '';
      return { ...row, senderName, senderEmail };
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json(payload);
  } catch (error) {
    console.error('[email][getNotificationMessages]', error);
    return res.status(500).json({ message: 'Failed to load notification messages' });
  }
};

const downloadNotificationMessageAttachment = async (req, res) => {
  try {
    const { id, index } = req.params;
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    const idx = Number(index);
    if (!isUuid || !Number.isInteger(idx) || idx < 0) {
      return res.status(400).json({ message: 'Invalid message or attachment index' });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Notification message not found' });
    }

    if (!(await notificationAttachmentAccessibleByViewer(record, req))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    let att = null;
    const attachments = Array.isArray(record.metadata?.attachments) ? record.metadata.attachments : [];
    if (attachments[idx]?.contentBase64) {
      att = attachments[idx];
    } else {
      att = await findOutboundAttachmentInClientEvents(id, idx);
    }
    if (!att?.contentBase64) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    let buf;
    try {
      buf = Buffer.from(String(att.contentBase64), 'base64');
    } catch {
      return res.status(404).json({ message: 'Attachment not found' });
    }
    if (!buf.length) {
      return res.status(404).json({ message: 'Attachment not found' });
    }

    const filename = String(att.filename || 'attachment');
    const asciiName = filename.replace(/[^\x20-\x7E]/g, '_') || 'attachment';
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return res.send(buf);
  } catch (error) {
    console.error('[email][downloadNotificationMessageAttachment]', error);
    return res.status(500).json({ message: 'Failed to download attachment' });
  }
};

const updateNotificationMessageAssignee = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigneeEmails } = req.body || {};
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ message: 'id must be a valid UUID' });
    }

    const rawList = Array.isArray(assigneeEmails) ? assigneeEmails : [];
    const emails = [
      ...new Set(
        rawList
          .map((e) => String(e || '').trim().toLowerCase())
          .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
      ),
    ];
    if (!emails.length) {
      return res.status(400).json({ message: 'assigneeEmails must include at least one valid email' });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Notification message not found' });
    }

    const ctx = await resolveNotificationViewerContext(req);
    if (!ctx || !notificationVisibleToViewer(record, ctx)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const assigneeField = emails.join(', ');
    const primaryTo = emails[0];

    await record.update({
      toEmail: primaryTo,
      assignee: assigneeField,
    });

    return res.json(record.get({ plain: true }));
  } catch (error) {
    console.error('[email][updateNotificationMessageAssignee]', error);
    return res.status(500).json({ message: 'Failed to assign notification message' });
  }
};

async function resolveRequesterEmail(req) {
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return null;
  const u = await User.findByPk(userId, { attributes: ['email'] });
  const em = u?.email != null ? String(u.email).trim() : '';
  return em || null;
}

const updateNotificationMessageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, taskCompleted, markRecipientRead, dueDate, dueTime } = req.body || {};
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ message: 'id must be a valid UUID' });
    }
    const hasStatus = status !== undefined && status !== null && String(status).trim() !== '';
    const hasTaskCompleted = typeof taskCompleted === 'boolean';
    const hasMarkRecipientRead = markRecipientRead === true;
    const hasDueDate = dueDate !== undefined;
    const hasDueTime = dueTime !== undefined;
    if (!hasStatus && !hasTaskCompleted && !hasMarkRecipientRead && !hasDueDate && !hasDueTime) {
      return res.status(400).json({
        message: 'Provide status, taskCompleted, markRecipientRead, dueDate, and/or dueTime',
      });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Notification message not found' });
    }

    const ctx = await resolveNotificationViewerContext(req);
    if (!ctx || !notificationVisibleToViewer(record, ctx)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (hasMarkRecipientRead) {
      const isTaskRow = Boolean(record.isTask) || record.messageType === 'task';
      if (isTaskRow) {
        return res.status(400).json({ message: 'markRecipientRead applies to messages only' });
      }
      if (!notificationRecipientMatchesViewer(record, ctx)) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const existingRead = record.metadata && record.metadata.recipientReadAt;
      if (existingRead) {
        return res.json(record.get({ plain: true }));
      }
    }

    const patch = {};
    const nextMeta = { ...(record.metadata || {}) };
    let metaTouched = false;
    if (hasTaskCompleted) {
      nextMeta.taskCompleted = taskCompleted;
      metaTouched = true;
    }
    if (hasMarkRecipientRead) {
      nextMeta.recipientReadAt = new Date().toISOString();
      metaTouched = true;
    }
    if (hasStatus) {
      const s = String(status).trim();
      if (s.length > 500) {
        return res.status(400).json({ message: 'status is too long (max 500 characters)' });
      }
      patch.status = s;
    }
    if (metaTouched) patch.metadata = nextMeta;

    if (hasDueDate) {
      if (dueDate === null || dueDate === '') {
        patch.dueDate = null;
      } else if (typeof dueDate === 'string') {
        patch.dueDate = dueDate.trim() || null;
      }
    }
    if (hasDueTime) {
      if (dueTime === null || dueTime === '') {
        patch.dueTime = null;
      } else if (typeof dueTime === 'string') {
        patch.dueTime = dueTime.trim() || null;
      }
    }

    await record.update(patch);
    await record.reload();
    return res.json(record.get({ plain: true }));
  } catch (error) {
    console.error('[email][updateNotificationMessageStatus]', error);
    return res.status(500).json({ message: 'Failed to update notification status' });
  }
};

const upload = async (req, res) => {
  const { jobId, fileKey, bucket } = req.body;
  if (!jobId || !fileKey || !bucket) {
    return res.status(400).json({ message: 'jobId, fileKey, and bucket are required' });
  }

  try {
    const record = await emailService.create({ jobId, fileKey, bucket });
    // Await: 201 only after all attachments are stored and candidate is updated, so clients
    // that load the profile right away see every file (void + early 201 caused a race).
    await processEmailUpload(record);
    return res.status(201).json(record);
  } catch (error) {
    console.error('Failed to save email upload', error);
    return res.status(500).json({ message: 'Could not persist upload' });
  }
};

/** `to` / `toEmail`: one address, comma/semicolon-separated list, or array — each gets its own notification + send. */
const expandSendRecipients = (to, toEmail) => {
  const raw = toEmail != null && toEmail !== '' ? toEmail : to;
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const send = async (req, res) => {
  try {
    const payload = req.body || {};
    const {
      to,
      toEmail,
      subject,
      text,
      html,
      isTask,
      messageType,
      assignee,
      category,
      dueDate,
      dueTime,
      submissionPopup,
      submissionEmail,
      sla,
      allocatedDays,
      taskPayload,
      skipSmtp,
      appendSystemLinks,
      attachments: rawAttachments,
    } = payload;

    let smtpAttachments = null;
    if (Array.isArray(rawAttachments) && rawAttachments.length) {
      smtpAttachments = rawAttachments
        .map((a) => {
          const contentB64 = typeof a?.content === 'string' ? a.content.trim() : '';
          if (!contentB64) return null;
          try {
            const buf = Buffer.from(contentB64, 'base64');
            if (!buf.length) return null;
            const cidRaw = typeof a?.cid === 'string' ? a.cid.trim() : '';
            return {
              filename: String(a.filename || 'attachment'),
              content: buf,
              contentType: typeof a.contentType === 'string' ? a.contentType : undefined,
              ...(cidRaw ? { cid: cidRaw } : {}),
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      if (smtpAttachments.length === 0) smtpAttachments = null;
    }

    const normalizedSkipSmtp = Boolean(skipSmtp);

    console.log('[email][send] request received', {
      to: Array.isArray(to) ? `array(${to.length})` : typeof to,
      toEmail: typeof toEmail,
      subject: typeof subject === 'string' ? subject : undefined,
      hasText: typeof text === 'string' && text.trim().length > 0,
      hasHtml: typeof html === 'string' && html.trim().length > 0,
    });

    if (!subject) return res.status(400).json({ message: 'subject is required' });
    const baseText = typeof text === 'string' ? text : '';
    const { htmlAppend, storedTextSuffix } = Boolean(appendSystemLinks)
      ? buildLinkedEntityMailAppend(taskPayload, publicStaffAppOrigin())
      : { htmlAppend: '', storedTextSuffix: '' };
    const storedText = baseText + storedTextSuffix;
    const clientHtml = typeof html === 'string' && html.trim() ? html : null;
    let storedHtml = null;
    if (clientHtml) {
      storedHtml = htmlAppend ? `${clientHtml}${htmlAppend}` : clientHtml;
    } else if (htmlAppend) {
      storedHtml = `${htmlFromPlainTextForMail(baseText)}${htmlAppend}`;
    }

    const rawList = expandSendRecipients(to, toEmail);
    const seen = new Set();
    const recipients = [];
    for (const r of rawList) {
      const trimmed = String(r || '').trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      recipients.push(trimmed);
    }

    if (recipients.length === 0) {
      if (normalizedSkipSmtp) {
        const selfEmail = await resolveRequesterEmail(req);
        if (!selfEmail) {
          return res.status(400).json({
            message: 'לא ניתן ליצור משימה/הודעה ללא מייל — חסר אימייל למשתמש המחובר',
          });
        }
        recipients.push(selfEmail);
      } else {
        return res.status(400).json({ message: 'recipient (to/toEmail) is required' });
      }
    }

    const normalizedIsTask = Boolean(isTask);
    const normalizedMessageType = messageType === 'task' || normalizedIsTask ? 'task' : 'message';
    const {
      userRole: smtpUserRole,
      clientName: smtpClientName,
      senderEmail: smtpSenderEmail,
    } = await resolveEmailSenderSmtpContext(req);

    const tp =
      taskPayload && typeof taskPayload === 'object' && !Array.isArray(taskPayload) ? taskPayload : {};
    const isSendMessageModal = String(tp.source || '').trim() === 'SendMessageModal';
    const composeCandidateId =
      tp.candidateId != null && String(tp.candidateId).trim() ? String(tp.candidateId).trim() : null;
    const composeCandidateName =
      tp.candidateName != null && String(tp.candidateName).trim() ? String(tp.candidateName).trim() : '';

    let savedProposalsMarkedThisRequest = false;
    const logSendMessageModalAudit = async (resolvedToEmail, savedMessage, providerMessageId) => {
      if (!isSendMessageModal) return;
      const fromName =
        req?.user?.fullName ||
        req?.user?.name ||
        req?.user?.email ||
        smtpSenderEmail ||
        'מערכת';
      const messagePreview = (storedText || '').replace(/\s+/g, ' ').trim().slice(0, 280) || subject;
      const subjectText = String(subject || '').trim() || '—';

      const composeClientId =
        tp.clientId != null && String(tp.clientId).trim() ? String(tp.clientId).trim() : null;
      const proposalTemplateIds = Array.isArray(tp.proposalTemplateIds)
        ? tp.proposalTemplateIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const savedProposalIds = Array.isArray(tp.savedProposalIds)
        ? tp.savedProposalIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const proposalTemplateNames = Array.isArray(tp.proposalTemplateNames)
        ? tp.proposalTemplateNames.map((name) => String(name || '').trim()).filter(Boolean)
        : [];
      const hasProposalAttachment = proposalTemplateIds.length > 0 || savedProposalIds.length > 0;

      if (!savedProposalsMarkedThisRequest && savedProposalIds.length > 0) {
        savedProposalsMarkedThisRequest = true;
        try {
          await proposalService.markProposalsSent(savedProposalIds, {
            userId: req.user?.sub || req.dbUser?.id || null,
            name: fromName,
          });
        } catch (markErr) {
          console.warn('[email][send] markProposalsSent failed', markErr?.message || markErr);
        }
      }
      const proposalNamesSuffix =
        proposalTemplateNames.length > 0
          ? ` · תבניות: ${proposalTemplateNames.join(', ')}`
          : hasProposalAttachment
            ? ` · ${proposalTemplateIds.length} תבניות הצעת מחיר`
            : '';
      await systemEventEmitter.emit(req, {
        ...(hasProposalAttachment ? SYSTEM_EVENTS.PROPOSAL_SENT : SYSTEM_EVENTS.STAFF_EMAIL_SENT),
        entityType: composeCandidateId ? 'Candidate' : composeClientId ? 'Client' : null,
        entityId: composeCandidateId || composeClientId,
        entityName: composeCandidateName || subjectText,
        clientId: composeClientId,
        params: {
          from: fromName,
          to: resolvedToEmail,
          subject: subjectText,
          candidateName: composeCandidateName ? ` · מועמד: ${composeCandidateName}` : '',
          proposalNames: proposalNamesSuffix,
          message: messagePreview ? ` · ${messagePreview}` : '',
          notificationMessageId: savedMessage.id,
          providerMessageId: providerMessageId || null,
          templateId:
            tp.templateId != null && String(tp.templateId).trim() ? String(tp.templateId).trim() : null,
          jobId: tp.jobId != null && String(tp.jobId).trim() ? String(tp.jobId).trim() : null,
          proposalTemplateIds: hasProposalAttachment ? proposalTemplateIds : null,
          proposalTemplateNames: hasProposalAttachment ? proposalTemplateNames : null,
        },
      });
    };

    let composeScreeningRepeatPriorCount = 0;
    if (
      typeof category === 'string' &&
      category.trim() === 'screening_cv' &&
      composeCandidateId
    ) {
      composeScreeningRepeatPriorCount = await countPriorScreeningCvSameCandidateSubject(
        String(subject || ''),
        composeCandidateId,
      );
    }

    const attachmentMetadata = buildNotificationAttachmentMetadata(smtpAttachments);

    const results = [];

    for (const emailCandidate of recipients) {
      const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailCandidate);
      let resolvedToEmail = emailCandidate;

      if (!isEmail) {
        console.log('[email][send] resolving recipient name -> user.email', {
          assigneeOrName: emailCandidate,
        });
        const userRow = await User.findOne({
          where: { name: { [Op.iLike]: `%${emailCandidate}%` } },
          attributes: ['email'],
        });
        if (!userRow?.email) {
          return res.status(404).json({ message: `No user.email found for assignee/name: ${emailCandidate}` });
        }
        resolvedToEmail = userRow.email;
      }

      const assigneeField =
        recipients.length === 1 && typeof assignee === 'string' && assignee.trim()
          ? assignee.trim()
          : resolvedToEmail;

      const savedMessage = await NotificationMessage.create({
        toEmail: resolvedToEmail,
        subject: String(subject || ''),
        text: storedText.trim() ? storedText : null,
        html: storedHtml,
        messageType: normalizedMessageType,
        status: normalizedMessageType === 'task' ? 'tasks' : 'unread',
        isTask: normalizedIsTask,
        assignee: assigneeField,
        assigneeId: req?.user?.sub || req?.user?.id || null,
        isRepeat:
          typeof category === 'string' &&
          category.trim() === 'screening_cv' &&
          composeCandidateId &&
          composeScreeningRepeatPriorCount > 0,
        category: typeof category === 'string' ? category : null,
        dueDate: typeof dueDate === 'string' ? dueDate : null,
        dueTime: typeof dueTime === 'string' ? dueTime : null,
        submissionPopup: Boolean(submissionPopup),
        submissionEmail: submissionEmail === undefined ? true : Boolean(submissionEmail),
        sla: typeof sla === 'string' ? sla : null,
        allocatedDays: Number.isFinite(Number(allocatedDays)) ? Number(allocatedDays) : null,
        senderUserId: req?.user?.sub || req?.user?.id || null,
        metadata: {
          deliveryStatus: 'pending',
          taskPayload:
            taskPayload && typeof taskPayload === 'object' && !Array.isArray(taskPayload)
              ? taskPayload
              : {},
          ...(attachmentMetadata ? { attachments: attachmentMetadata } : {}),
        },
      });

      if (normalizedSkipSmtp) {
        await patchNotificationMetadata(
          savedMessage,
          { deliveryStatus: 'in_app_only' },
          { attachments: attachmentMetadata || undefined },
        );
        results.push({
          notificationMessageId: savedMessage.id,
          to: resolvedToEmail,
          messageId: null,
        });
        await logSendMessageModalAudit(resolvedToEmail, savedMessage, null);
        continue;
      }

      let result;
      try {
        result = await emailService.sendEmail({
          toEmail: resolvedToEmail,
          subject,
          text: storedText || '',
          html: storedHtml || undefined,
          userRole: smtpUserRole,
          clientName: smtpClientName,
          senderEmail: smtpSenderEmail,
          attachments: smtpAttachments || undefined,
        });

        await patchNotificationMetadata(
          savedMessage,
          {
            deliveryStatus: 'sent',
            providerMessageId: result?.messageId || null,
          },
          { attachments: attachmentMetadata || undefined },
        );
      } catch (sendErr) {
        await patchNotificationMetadata(
          savedMessage,
          {
            deliveryStatus: 'failed',
            deliveryError: sendErr?.message || String(sendErr),
          },
          { attachments: attachmentMetadata || undefined },
        );
        throw sendErr;
      }

      results.push({
        notificationMessageId: savedMessage.id,
        to: resolvedToEmail,
        messageId: result?.messageId || null,
      });

      if (isSendMessageModal) {
        await logSendMessageModalAudit(resolvedToEmail, savedMessage, result?.messageId ?? null);
      } else {
        const fromName =
          req?.user?.fullName ||
          req?.user?.name ||
          req?.user?.email ||
          smtpSenderEmail ||
          'מערכת';
        const messagePreview = (storedText || '').replace(/\s+/g, ' ').trim().slice(0, 280) || subject;
        systemEventEmitter.emit(req, {
          ...SYSTEM_EVENTS.TEAM_USER_MSG,
          entityType: composeCandidateId ? 'Candidate' : 'Job',
          entityId: composeCandidateId,
          entityName: composeCandidateId ? composeCandidateName || subject : subject,
          params: {
            from: fromName,
            to: resolvedToEmail,
            message: messagePreview,
          },
        });
      }
    }

    console.log('[email][send] sendEmail batch succeeded', { count: results.length });

    return res.json({
      ok: true,
      count: results.length,
      results,
      messageId: results[0]?.messageId ?? null,
      notificationMessageId: results[0]?.notificationMessageId ?? null,
    });
  } catch (err) {
    console.error('[email][send] send failed', {
      message: err?.message || err,
      name: err?.name,
      stack: err?.stack,
    });
    return res.status(400).json({ message: err?.message || 'Failed to send email' });
  }
};

const jobTelephoneQuestionsToList = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) =>
      typeof q === 'string' ? q.trim() : String(q?.question ?? q?.text ?? '').trim(),
    )
    .filter(Boolean);
};

/**
 * Fill missing screening-CV mail fields from DB (Job + optional JobCandidateScreening).
 * When mergeCandidateScreeningFromDb is false, job fields still merge from Job; saved screening answers,
 * telephone impression, and internal opinion on JobCandidateScreening are not pulled in.
 * When skipAllDbMerge is true (bulk minimal referral), return the client block as-is — no Job/Screening reads.
 */
const mergeScreeningCvPayloadFromDb = async (
  candidateId,
  rawBlock,
  mergeCandidateScreeningFromDb = true,
  skipAllDbMerge = false,
) => {
  const block = { ...rawBlock };
  if (skipAllDbMerge) return block;
  const jobIdRaw = block.jobId != null ? String(block.jobId).trim() : '';
  const candId = candidateId != null ? String(candidateId).trim() : '';
  if (!candId || !jobIdRaw) {
    return block;
  }

  let jobRow;
  let screeningRow;
  try {
    if (mergeCandidateScreeningFromDb) {
      [jobRow, screeningRow] = await Promise.all([
        Job.findByPk(jobIdRaw, {
          attributes: ['description', 'requirements', 'telephoneQuestions'],
        }),
        JobCandidateScreening.findOne({
          where: { candidateId: candId, jobId: jobIdRaw },
          attributes: ['screeningAnswers', 'telephoneImpression', 'internalOpinion'],
        }),
      ]);
    } else {
      jobRow = await Job.findByPk(jobIdRaw, {
        attributes: ['description', 'requirements', 'telephoneQuestions'],
      });
      screeningRow = null;
    }
  } catch (e) {
    console.warn('[sendScreeningCv] mergeScreeningCvPayloadFromDb', e?.message || e);
    return block;
  }

  if (!jobRow) return block;

  const clientDesc = typeof block.jobDescriptionPlain === 'string' ? block.jobDescriptionPlain.trim() : '';
  if (!clientDesc) {
    const blob = jobRow.description;
    if (blob && String(blob).trim()) {
      const d = stripHtmlMail(String(blob)).trim();
      if (d) block.jobDescriptionPlain = d;
    }
  }

  const clientReqs = Array.isArray(block.jobRequirementsPlain)
    ? block.jobRequirementsPlain.map((r) => (typeof r === 'string' ? r.trim() : String(r))).filter(Boolean)
    : [];
  if (!clientReqs.length && Array.isArray(jobRow.requirements) && jobRow.requirements.length) {
    block.jobRequirementsPlain = jobRow.requirements
      .map((r) => stripHtmlMail(String(r)).trim())
      .filter(Boolean);
  }

  const tqList = jobTelephoneQuestionsToList(jobRow.telephoneQuestions);
  const clientQa = Array.isArray(block.screeningQa) ? block.screeningQa : [];
  const dbAns =
    screeningRow && Array.isArray(screeningRow.screeningAnswers) ? screeningRow.screeningAnswers : [];
  const clientByQ = new Map(
    clientQa.map((r) => [String(r.question || '').trim(), r.answer]),
  );
  const dbByQ = new Map(dbAns.map((r) => [String(r.question || '').trim(), r.answer]));

  if (tqList.length) {
    block.screeningQa = tqList.map((q) => {
      const k = String(q).trim();
      const rawAns = clientByQ.has(k) ? clientByQ.get(k) : dbByQ.get(k);
      const answer =
        rawAns != null && typeof rawAns === 'string' ? rawAns : String(rawAns ?? '');
      return { question: q, answer };
    });
  } else if (!clientQa.length && dbAns.length) {
    block.screeningQa = dbAns.map((r) => ({
      question: typeof r.question === 'string' ? r.question : String(r.question || ''),
      answer: typeof r.answer === 'string' ? r.answer : String(r.answer || ''),
    }));
  } else if (tqList.length === 0 && clientQa.length) {
    block.screeningQa = clientQa.map((r) => ({
      question: typeof r.question === 'string' ? r.question : String(r.question || ''),
      answer: typeof r.answer === 'string' ? r.answer : String(r.answer ?? ''),
    }));
  }

  const ti = typeof block.telephoneImpression === 'string' ? block.telephoneImpression.trim() : '';
  if (!ti && screeningRow?.telephoneImpression) {
    block.telephoneImpression = String(screeningRow.telephoneImpression).trim();
  }

  const op = typeof block.internalOpinionHtml === 'string' ? block.internalOpinionHtml : '';
  if (!String(op).trim() && screeningRow?.internalOpinion) {
    block.internalOpinionHtml = String(screeningRow.internalOpinion);
  }

  return block;
};

/**
 * Job description, requirements, screening Q&A, telephone impression, internal opinion — for screening CV mail + DB text.
 * Plain strings for description/requirements/Q&A/phone come pre-stripped from the client; opinion is HTML.
 */
const buildScreeningCvDetailsAppendix = (block) => {
  const jobDescriptionPlain = String(block?.jobDescriptionPlain ?? '')
    .trim();
  const jobRequirementsPlain = Array.isArray(block?.jobRequirementsPlain)
    ? block.jobRequirementsPlain.map((r) => String(r ?? '').trim()).filter(Boolean)
    : [];
  const screeningQa = Array.isArray(block?.screeningQa)
    ? block.screeningQa.map((row) => ({
        question: String(row?.question ?? '').trim(),
        answer: String(row?.answer ?? '').trim(),
      }))
    : [];
  const telephoneImpression = String(block?.telephoneImpression ?? '')
    .trim();
  const internalOpinionHtml = String(block?.internalOpinionHtml ?? '');

  const dash = '—';
  const textParts = [];
  const htmlParts = [];

  textParts.push('———— פרטי המשרה והסינון ————');

  textParts.push(`\nתיאור המשרה:\n${jobDescriptionPlain || dash}`);
  htmlParts.push(
    `<p dir="rtl"><strong>תיאור המשרה</strong></p><div dir="rtl" style="white-space:pre-wrap">${htmlFromPlainTextForMail(
      jobDescriptionPlain || dash,
    )}</div>`,
  );

  textParts.push('\nדרישות:');
  if (jobRequirementsPlain.length === 0) {
    textParts.push(dash);
    htmlParts.push(`<p dir="rtl"><strong>דרישות</strong></p><p dir="rtl">${escapeHtmlMail(dash)}</p>`);
  } else {
    const lines = jobRequirementsPlain
      .map((r) => (typeof r === 'string' ? r.trim() : String(r)))
      .filter(Boolean);
    if (lines.length === 0) {
      textParts.push(dash);
      htmlParts.push(`<p dir="rtl"><strong>דרישות</strong></p><p dir="rtl">${escapeHtmlMail(dash)}</p>`);
    } else {
      lines.forEach((line) => {
        textParts.push(`• ${line}`);
      });
      htmlParts.push(
        `<p dir="rtl"><strong>דרישות</strong></p><ul dir="rtl" style="margin:8px 0;padding-right:20px">${lines
          .map((line) => `<li style="margin:4px 0">${htmlFromPlainTextForMail(line)}</li>`)
          .join('')}</ul>`,
      );
    }
  }

  textParts.push('\nשאלות סינון ותשובות:');
  htmlParts.push('<p dir="rtl"><strong>שאלות סינון ותשובות</strong></p>');
  if (screeningQa.length === 0) {
    textParts.push(dash);
    htmlParts.push(`<p dir="rtl">${escapeHtmlMail(dash)}</p>`);
  } else {
    screeningQa.forEach((row) => {
      const q = String(row?.question ?? '').trim();
      const a = String(row?.answer ?? '').trim();
      textParts.push(`ש: ${q || dash}`);
      textParts.push(`ת: ${a || dash}\n`);
      htmlParts.push(
        `<div dir="rtl" style="margin-bottom:12px"><div><strong>ש:</strong> ${htmlFromPlainTextForMail(
          q || dash,
        )}</div><div><strong>ת:</strong> ${htmlFromPlainTextForMail(a || dash)}</div></div>`,
      );
    });
  }

  textParts.push('רושם טלפוני:');
  textParts.push(telephoneImpression || dash);
  htmlParts.push(
    `<p dir="rtl"><strong>רושם טלפוני</strong></p><div dir="rtl" style="white-space:pre-wrap">${htmlFromPlainTextForMail(
      telephoneImpression || dash,
    )}</div>`,
  );

  textParts.push('\nחוות דעת פנימית:');
  if (internalOpinionHtml && internalOpinionHtml.trim()) {
    textParts.push(stripHtmlMail(internalOpinionHtml));
    htmlParts.push(
      `<p dir="rtl"><strong>חוות דעת פנימית</strong></p><div dir="rtl">${internalOpinionHtml}</div>`,
    );
  } else {
    textParts.push(dash);
    htmlParts.push(
      `<p dir="rtl"><strong>חוות דעת פנימית</strong></p><p dir="rtl">${escapeHtmlMail(dash)}</p>`,
    );
  }

  return {
    detailsText: textParts.join('\n'),
    detailsHtml: htmlParts.join('\n'),
  };
};

/** Phone, email, city/address — shown in screening CV referral body + `notification_messages.text`. */
const buildCandidateContactSectionForScreeningMail = (cand) => {
  const phone = cand?.phone != null ? String(cand.phone).trim() : '';
  const email = cand?.email != null ? String(cand.email).trim() : '';
  const addr = cand?.address != null ? String(cand.address).trim() : '';
  const loc = cand?.location != null ? String(cand.location).trim() : '';
  const locAddr = [loc, addr].filter(Boolean).join(' · ');
  const dash = '—';
  const textBlock = [
    'פרטי התקשרות למועמד:',
    `טלפון: ${phone || dash}`,
    `מייל: ${email || dash}`,
    `עיר / כתובת: ${locAddr || dash}`,
  ].join('\n');
  const htmlBlock = [
    `<p dir="rtl"><strong>פרטי התקשרות למועמד</strong></p>`,
    `<ul dir="rtl" style="margin:8px 0;padding-right:20px">`,
    `<li style="margin:4px 0"><strong>טלפון:</strong> ${escapeHtmlMail(phone || dash)}</li>`,
    `<li style="margin:4px 0"><strong>מייל:</strong> ${escapeHtmlMail(email || dash)}</li>`,
    `<li style="margin:4px 0"><strong>עיר / כתובת:</strong> ${escapeHtmlMail(locAddr || dash)}</li>`,
    '</ul>',
  ].join('');
  return { textBlock, htmlBlock };
};

/**
 * Bulk referral template: CV attachment + candidate contact block only (no job description, requirements,
 * screening Q&A, phone impression, or internal opinion from DB). Optional coordinator notes under «הערות נוספות».
 */
const buildMinimalCvReferralMailBodies = (
  {
    recipientName,
    candLabel,
    jobTitle,
    company,
    candContactHtml,
    candContactText,
    additionalNotesPlain,
  },
  coordinatorDisplayName,
) => {
  const dash = '—';
  const greetingHtml = `<p dir="rtl">${recipientName ? `שלום ${escapeHtmlMail(recipientName)},` : 'שלום,'}</p>`;
  const greetingText = recipientName ? `שלום ${recipientName},` : 'שלום,';

  let introPlain = `מצורפים קורות החיים של ${candLabel}`;
  let introHtmlInner = `מצורפים קורות החיים של <strong>${escapeHtmlMail(candLabel)}</strong>`;
  if (jobTitle) {
    introPlain += ` עבור המשרה ${jobTitle}`;
    introHtmlInner += ` עבור המשרה <strong>${escapeHtmlMail(jobTitle)}</strong>`;
  }
  if (company) {
    introPlain += ` בחברת ${company}`;
    introHtmlInner += ` בחברת <strong>${escapeHtmlMail(company)}</strong>`;
  }
  introPlain += '.';
  const introHtml = `<p dir="rtl">${introHtmlInner}.</p>`;

  const notesPlain = additionalNotesPlain != null ? String(additionalNotesPlain).trim() : '';
  const notesContentHtml = notesPlain
    ? `<div dir="rtl" style="white-space:pre-wrap">${htmlFromPlainTextForMail(notesPlain)}</div>`
    : `<p dir="rtl">${escapeHtmlMail(dash)}</p>`;

  const coord = coordinatorDisplayName != null ? String(coordinatorDisplayName).trim() : '';

  const sectionsHtml = [
    `<p dir="rtl"><strong>סיכום חוות דעת</strong></p><p dir="rtl">${escapeHtmlMail(dash)}</p>`,
    `<p dir="rtl"><strong>שאלות ותשובות</strong></p><p dir="rtl">${escapeHtmlMail(dash)}</p>`,
    `<p dir="rtl"><strong>הערות נוספות</strong></p>${notesContentHtml}`,
    `<p dir="rtl" style="margin-top:28px"><strong>חתימת הרכז</strong></p>`,
    coord ? `<p dir="rtl">${escapeHtmlMail(coord)}</p>` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const sectionsText = [
    '',
    'סיכום חוות דעת',
    dash,
    '',
    'שאלות ותשובות',
    dash,
    '',
    'הערות נוספות',
    notesPlain || dash,
    '',
    '',
    'חתימת הרכז',
    coord || '',
  ].join('\n');

  const htmlBody = [greetingHtml, introHtml, candContactHtml, sectionsHtml].join('\n');
  const textBody = [greetingText, introPlain, '', candContactText, sectionsText].join('\n');
  return { htmlBody, textBody };
};

/** Default workflow label for new screening_cv rows: first active status for the recruiter client (JWT clientId or users.client_id). */
const defaultReferralWorkflowStatusForRecruiterClient = async (senderUserId, jwtClientId) => {
  const fallback = 'חדש';
  let cid = jwtClientId != null ? String(jwtClientId).trim() : '';
  const uid = senderUserId != null ? String(senderUserId).trim() : '';
  if (!cid && uid) {
    const me = await User.findByPk(uid, { attributes: ['clientId'] });
    cid = me?.clientId != null ? String(me.clientId).trim() : '';
  }
  if (!cid) return fallback;
  const row = await RecruitmentStatus.findOne({
    where: { clientId: cid, isActive: true },
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
    attributes: ['name'],
  });
  const name = row?.name != null ? String(row.name).trim() : '';
  return name || fallback;
};

/** POST body: { candidateId, attachOriginalCv?, attachSystemCvPdf?, attachLastReferral?, minimalCvReferralBody?, systemCvPdfBase64?, sends: [...] } */
const sendScreeningCv = async (req, res) => {
  try {
    const candidateIdRaw = req.body?.candidateId;
    if (candidateIdRaw == null || String(candidateIdRaw).trim() === '') {
      return res.status(400).json({ message: 'candidateId is required' });
    }
    const candidateId = String(candidateIdRaw).trim();
    const { sends } = req.body || {};
    if (!Array.isArray(sends) || sends.length === 0) {
      return res.status(400).json({ message: 'sends must be a non-empty array' });
    }
    const minimalCvReferralBody = Boolean(req.body?.minimalCvReferralBody);
    const attachLastReferral =
      minimalCvReferralBody
        ? false
        : req.body?.attachLastReferral === undefined || req.body?.attachLastReferral === null
          ? true
          : Boolean(req.body.attachLastReferral);

    const candidate = await Candidate.findByPk(candidateId, {
      attributes: ['id', 'fullName', 'resumeUrl', 'phone', 'email', 'address', 'location'],
    });
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    const attachOriginalCv =
      req.body?.attachOriginalCv === undefined || req.body?.attachOriginalCv === null
        ? true
        : Boolean(req.body.attachOriginalCv);
    const attachSystemCvPdf = Boolean(req.body?.attachSystemCvPdf);
    const systemCvPdfBase64 =
      typeof req.body?.systemCvPdfBase64 === 'string' ? req.body.systemCvPdfBase64.trim() : '';

    if (!attachOriginalCv && !attachSystemCvPdf) {
      return res.status(400).json({ message: 'נדרש לבחור לפחות סוג קובץ אחד לצירוף' });
    }

    const safeFileStem = String(candidate.fullName || 'candidate')
      .replace(/[^\w\u0590-\u05FF\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      || 'resume';

    const attachments = [];

    if (attachOriginalCv) {
      if (!candidate.resumeUrl) {
        return res.status(400).json({ message: 'למועמד אין קובץ קורות חיים מצורף' });
      }

      const bin = await fetchResumeBinaryForMail(candidate.resumeUrl, candidate.id);
      if (!bin || !bin.buffer?.length) {
        return res.status(400).json({ message: 'לא ניתן להוריד את קובץ קורות החיים לצורף למייל' });
      }

      const ext =
        typeof bin.filename === 'string' && bin.filename.includes('.')
          ? bin.filename.split('.').pop()
          : 'pdf';
      const attachFilename = `${safeFileStem}-resume.${ext}`;
      attachments.push({ filename: attachFilename, content: bin.buffer, contentType: bin.contentType });
    }

    if (attachSystemCvPdf) {
      if (!systemCvPdfBase64) {
        return res.status(400).json({ message: 'חסר קובץ PDF מערכת' });
      }
      let sysBuf;
      try {
        sysBuf = Buffer.from(systemCvPdfBase64, 'base64');
      } catch {
        return res.status(400).json({ message: 'קובץ PDF מערכת לא תקין' });
      }
      if (!sysBuf.length) {
        return res.status(400).json({ message: 'קובץ PDF מערכת ריק' });
      }
      attachments.push({
        filename: `${safeFileStem}-system-cv.pdf`,
        content: sysBuf,
        contentType: 'application/pdf',
      });
    }

    if (!attachments.length) {
      return res.status(400).json({ message: 'אין קבצים לצירוף' });
    }

    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const {
      userRole: smtpUserRole,
      clientName: smtpClientName,
      senderEmail: smtpSenderEmail,
    } = await resolveEmailSenderSmtpContext(req);

    const results = [];
    const candLabel = candidate.fullName || 'המועמד';
    const senderUserId = req?.user?.sub || req?.user?.id || null;
    const coordinatorSignOff =
      [req?.user?.fullName, req?.user?.name, req?.user?.email]
        .map((x) => (x != null ? String(x).trim() : ''))
        .find(Boolean) || '';
    const initialReferralWorkflowStatus = await defaultReferralWorkflowStatusForRecruiterClient(
      senderUserId,
      req.user?.clientId,
    );
    /** For audit: one summary row per sends[] block (bulk refer has one block). */
    const screeningSendSummaries = [];

    for (const rawBlock of sends) {
      const block = await mergeScreeningCvPayloadFromDb(
        candidateId,
        rawBlock,
        attachLastReferral && !minimalCvReferralBody,
        minimalCvReferralBody,
      );
      const jobId = block.jobId != null ? block.jobId : null;
      const jobTitle = typeof block.jobTitle === 'string' ? block.jobTitle.trim() : '';
      const company = typeof block.company === 'string' ? block.company.trim() : '';
      const rawContacts = Array.isArray(block.contacts) ? block.contacts : [];

      const contactRows = [];
      for (const c of rawContacts) {
        const email = typeof c.email === 'string' ? c.email.trim() : '';
        const name = typeof c.name === 'string' ? c.name.trim() : '';
        if (!emailRe.test(email)) {
          return res.status(400).json({
            message: `כתובת מייל לא תקינה או חסרה: ${email || '(ריק)'}`,
          });
        }
        contactRows.push({ email, name });
      }
      if (contactRows.length === 0) {
        continue;
      }

      screeningSendSummaries.push({
        jobId: jobId || null,
        jobTitle: jobTitle || '',
        company: company || '',
        recipientCount: contactRows.length,
      });

      const subject = `קורות חיים — ${candLabel} | ${jobTitle || 'משרה'}${company ? ` — ${company}` : ''}`;
      const toEmailCombined = contactRows.map((r) => r.email).join(', ');

      const { textBlock: candContactText, htmlBlock: candContactHtml } =
        buildCandidateContactSectionForScreeningMail(candidate);

      const additionalNotesPlain =
        typeof block.additionalNotes === 'string' ? block.additionalNotes : '';

      let detailsText = '';
      let detailsHtml = '';
      if (!minimalCvReferralBody) {
        const appendix = buildScreeningCvDetailsAppendix(block);
        detailsText = appendix.detailsText;
        detailsHtml = appendix.detailsHtml;
      }

      const buildBodies = ({ email, name }) => {
        if (minimalCvReferralBody) {
          return buildMinimalCvReferralMailBodies(
            {
              recipientName: name,
              candLabel,
              jobTitle,
              company,
              candContactHtml,
              candContactText,
              additionalNotesPlain,
            },
            coordinatorSignOff,
          );
        }
        const greeting = name ? `שלום ${escapeHtmlMail(name)},` : 'שלום,';
        const htmlParts = [
          `<p dir="rtl">${greeting}</p>`,
          `<p dir="rtl">מצורפות קורות החיים של <strong>${escapeHtmlMail(candLabel)}</strong>${
            jobTitle ? ` עבור המשרה <strong>${escapeHtmlMail(jobTitle)}</strong>` : ''
          }${company ? ` (${escapeHtmlMail(company)})` : ''}.</p>`,
          candContactHtml,
          '<hr/>',
          detailsHtml,
        ];
        const htmlBody = htmlParts.join('\n');
        const textBody = [
          stripHtmlMail(name ? `שלום ${name},` : 'שלום,'),
          stripHtmlMail(
            `מצורפות קורות החיים של ${candLabel}${jobTitle ? ` עבור המשרה ${jobTitle}` : ''}${
              company ? ` (${company})` : ''
            }.`,
          ),
          candContactText,
          '',
          detailsText,
        ].join('\n');
        return { htmlBody, textBody };
      };

      const firstBodies = buildBodies(contactRows[0]);
      const storedPlain =
        firstBodies.textBody.trim() ||
        stripHtmlMail(firstBodies.htmlBody).trim() ||
        null;

      const priorSameSubjectCandidate = await countPriorScreeningCvSameCandidateSubject(
        subject,
        candidate.id,
      );
      const isRepeatReferral = priorSameSubjectCandidate > 0;

      const savedMessage = await NotificationMessage.create({
        toEmail: toEmailCombined,
        subject,
        text: storedPlain,
        html: firstBodies.htmlBody,
        messageType: 'message',
        status: initialReferralWorkflowStatus.slice(0, 500),
        isTask: false,
        assignee: contactRows[0].email,
        category: 'screening_cv',
        senderUserId: senderUserId,
        assigneeId: senderUserId,
        isRepeat: isRepeatReferral,
        metadata: {
          deliveryStatus: 'pending',
          referralWorkflowStatus: initialReferralWorkflowStatus,
          taskPayload: {
            kind: 'screening_cv',
            candidateId: candidate.id,
            candidateName: candLabel,
            jobId,
            jobTitle: jobTitle || '',
            clientName: company || '',
            recipients: contactRows.map((r) => ({
              name: r.name || '',
              email: r.email,
            })),
          },
        },
      });

      const recipientSends = [];
      try {
        for (const row of contactRows) {
          const { htmlBody, textBody } = buildBodies(row);
          const result = await emailService.sendEmail({
            toEmail: row.email,
            subject,
            text: textBody || ' ',
            html: htmlBody,
            userRole: smtpUserRole,
            clientName: smtpClientName,
            senderEmail: smtpSenderEmail,
            attachments,
          });
          recipientSends.push({
            to: row.email,
            messageId: result?.messageId || null,
          });
          results.push({
            to: row.email,
            jobId,
            messageId: result?.messageId || null,
            notificationMessageId: savedMessage.id,
          });
        }

        const firstId = recipientSends[0]?.messageId || null;
        await savedMessage.update({
          status: initialReferralWorkflowStatus.slice(0, 500),
          metadata: {
            ...(savedMessage.metadata || {}),
            deliveryStatus: 'sent',
            providerMessageId: firstId,
            providerMessageIds: recipientSends.map((x) => x.messageId).filter(Boolean),
            recipientSends,
          },
        });
      } catch (sendErr) {
        await savedMessage.update({
          status: initialReferralWorkflowStatus.slice(0, 500),
          metadata: {
            ...(savedMessage.metadata || {}),
            deliveryStatus: 'failed',
            deliveryError: sendErr?.message || String(sendErr),
            recipientSends: recipientSends.length ? recipientSends : undefined,
          },
        });
        throw sendErr;
      }
    }

    if (results.length) {
      const uniqJobIds = [...new Set(results.map((r) => r.jobId).filter(Boolean))];
      const recipientEmails = [...new Set(results.map((r) => r.to).filter(Boolean))];
      const titledSummaries = screeningSendSummaries.filter((s) => String(s.jobTitle || '').trim());
      const jobTitlesHint = titledSummaries
        .map((s) => String(s.jobTitle || '').trim())
        .slice(0, 3)
        .join(', ');
      const descriptionParts = [
        'נשלח מייל סינון (קו״ח) ללקוח / הפניה',
        candLabel ? `מועמד: ${candLabel}` : null,
        jobTitlesHint ? `משרה: ${jobTitlesHint}${titledSummaries.length > 3 ? '…' : ''}` : null,
        uniqJobIds.length ? `מזהי משרה: ${uniqJobIds.slice(0, 5).join(', ')}${uniqJobIds.length > 5 ? '…' : ''}` : null,
        `${recipientEmails.length} נמענים · ${results.length} שליחות`,
      ].filter(Boolean);
      auditLogger.log(req, {
        level: 'info',
        action: 'system',
        description: descriptionParts.join(' · ').slice(0, 4000),
        entity: {
          type: 'Candidate',
          id: candidateId,
          name: String(candLabel || '').slice(0, 500),
        },
        metadata: {
          screeningCvEmail: true,
          emailsDispatched: results.length,
          jobIds: uniqJobIds,
          recipientEmails: recipientEmails.slice(0, 40),
          notificationMessageIds: [...new Set(results.map((r) => r.notificationMessageId).filter(Boolean))],
          sends: screeningSendSummaries.slice(0, 20),
        },
      });
    }

    return res.json({ ok: true, count: results.length, results });
  } catch (err) {
    console.error('[email][sendScreeningCv]', err);
    return res.status(400).json({ message: err?.message || 'Failed to send screening CV' });
  }
};

/** Persist workflow status / note / due fields on screening_cv notification rows. */
const patchScreeningCvReferral = async (req, res) => {
  try {
    const { id } = req.params;
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ message: 'id must be a valid UUID' });
    }

    const bodyRaw = req.body || {};
    const { status, dueDate, dueTime } = bodyRaw;
    const hasNoteKey = Object.prototype.hasOwnProperty.call(bodyRaw, 'note');
    const hasStatus = status !== undefined && status !== null && String(status).trim() !== '';
    const hasDueDate = dueDate !== undefined;
    const hasDueTime = dueTime !== undefined;
    const hasInviteCandidate = Object.prototype.hasOwnProperty.call(bodyRaw, 'inviteCandidate');
    const hasInviteClient = Object.prototype.hasOwnProperty.call(bodyRaw, 'inviteClient');
    if (!hasStatus && !hasNoteKey && !hasDueDate && !hasDueTime && !hasInviteCandidate && !hasInviteClient) {
      return res.status(400).json({ message: 'Provide status, note, dueDate, dueTime, and/or invite flags' });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Not found' });
    }
    if (String(record.category || '') !== 'screening_cv') {
      return res.status(400).json({ message: 'Not a screening CV referral' });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const isBroad = role === 'admin' || role === 'super_admin';
    const ctx = await resolveNotificationViewerContext(req);
    if (!isBroad) {
      const ok =
        (ctx && notificationVisibleToViewer(record, ctx)) ||
        (await screeningCvReferralEditableByPeer(record, req));
      if (!ok) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const nextMeta = { ...(record.metadata || {}) };
    if (hasStatus) {
      nextMeta.referralWorkflowStatus = String(status).trim();
    }
    if (hasNoteKey) {
      const raw = bodyRaw.note;
      const n = raw === null || raw === '' ? null : String(raw).trim();
      nextMeta.referralInternalNote = n || null;
    }
    if (hasInviteCandidate) {
      nextMeta.referralInviteCandidate = Boolean(bodyRaw.inviteCandidate);
    }
    if (hasInviteClient) {
      nextMeta.referralInviteClient = Boolean(bodyRaw.inviteClient);
    }
    nextMeta.referralWorkflowUpdatedAt = new Date().toISOString();

    const patch = { metadata: nextMeta };
    if (hasStatus) {
      patch.status = String(status).trim().slice(0, 500);
    }

    if (hasDueDate) {
      if (dueDate === null || dueDate === '') {
        patch.dueDate = null;
      } else if (typeof dueDate === 'string') {
        patch.dueDate = dueDate.trim() || null;
      }
    }
    if (hasDueTime) {
      if (dueTime === null || dueTime === '') {
        patch.dueTime = null;
      } else if (typeof dueTime === 'string') {
        patch.dueTime = dueTime.trim() || null;
      }
    }

    await record.update(patch);
    await record.reload();
    res.set('Cache-Control', 'private, no-store');
    return res.json({ ok: true, record: record.get({ plain: true }) });
  } catch (err) {
    console.error('[email][patchScreeningCvReferral]', err);
    return res.status(500).json({ message: err?.message || 'Failed to update referral' });
  }
};

/** @param {unknown} val */
const normalizeQueryStringArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

/**
 * @param {Record<string, unknown>} q
 * @param {boolean} wantsPagination
 */
/**
 * All display labels that map a screening row's `clientName` to a tenant Client row.
 * Includes the client record names plus linked organization / org-tmp names (job company labels).
 * @param {string} clientId
 * @returns {Promise<string[]>}
 */
async function collectClientScopeLabels(clientId) {
  const id = String(clientId || '').trim();
  if (!id) return [];
  const client = await Client.findByPk(id, {
    attributes: ['id', 'name', 'displayName', 'domain', 'metadata'],
  });
  if (!client) return [];
  const plain = client.get ? client.get({ plain: true }) : client;
  const labels = new Set();
  const add = (v) => {
    const s = String(v || '').trim();
    if (s) labels.add(s);
  };
  add(plain.name);
  add(plain.displayName);
  add(plain.domain);
  if (plain.metadata && typeof plain.metadata === 'object') {
    add(plain.metadata.companyName);
    add(plain.metadata.legalName);
    add(plain.metadata.nameEn);
    if (Array.isArray(plain.metadata.aliases)) {
      for (const alias of plain.metadata.aliases) add(alias);
    }
  }

  // Screening rows store the job company name in clientName — usually a linked org, not the agency Client.name.
  try {
    const ClientOrganizationLink = require('../models/ClientOrganizationLink');
    const Organization = require('../models/Organization');
    const OrganizationTmp = require('../models/OrganizationTmp');
    const links = await ClientOrganizationLink.findAll({
      where: { clientId: id },
      include: [
        {
          model: Organization,
          as: 'organization',
          required: false,
          attributes: ['name', 'nameEn', 'legalName', 'aliases'],
        },
        {
          model: OrganizationTmp,
          as: 'organizationTmp',
          required: false,
          attributes: ['name', 'nameEn', 'legalName', 'aliases'],
        },
      ],
    });
    for (const link of links) {
      const org = link.organization || link.organizationTmp;
      if (!org) continue;
      const o = org.get ? org.get({ plain: true }) : org;
      add(o.name);
      add(o.nameEn);
      add(o.legalName);
      if (Array.isArray(o.aliases)) {
        for (const alias of o.aliases) add(alias);
      }
    }
  } catch (err) {
    console.warn('[email][collectClientScopeLabels] linked orgs:', err?.message || err);
  }

  return [...labels];
}

/** @param {string} rowClientName @param {string[]} scopeLabels */
function screeningClientNameMatchesScope(rowClientName, scopeLabels) {
  const name = String(rowClientName || '').trim();
  if (!name || !scopeLabels.length) return false;
  if (scopeLabels.includes(name)) return true;
  const lower = name.toLowerCase();
  return scopeLabels.some((l) => String(l).trim().toLowerCase() === lower);
}

const parseScreeningCvReferralsQuery = (q, wantsPagination) => {
  const page = Math.max(1, parseInt(String(q.page != null ? q.page : '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(String(q.pageSize != null ? q.pageSize : '25'), 10) || 25));
  return {
    page: wantsPagination ? page : 1,
    pageSize: wantsPagination ? pageSize : 0,
    search: String(q.search || '').trim(),
    referralDateFrom: String(q.referralDate != null ? q.referralDate : q.referralDateFrom || q.dateFrom || '').trim(),
    referralDateTo: String(
      q.referralDateEnd != null ? q.referralDateEnd : q.referralDateTo || q.dateTo || '',
    ).trim(),
    status: String(q.status || '').trim(),
    clientNames: normalizeQueryStringArray(q.clientNames),
    jobTitles: normalizeQueryStringArray(q.jobTitles),
    coordinators: normalizeQueryStringArray(q.coordinators),
    lastUpdatedBys: normalizeQueryStringArray(q.lastUpdatedBys),
    candidateName: String(q.candidateName || '').trim(),
    /** Exact backend candidate UUID (screening row `metadata.taskPayload.candidateId`). */
    candidateId: String(q.candidateId || '').trim(),
    source: String(q.source || '').trim(),
    sortKey: String(q.sortKey || 'referralDate').trim() || 'referralDate',
    sortDir: String(q.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
  };
};

const SCREENING_REFERRAL_SORT_KEYS = new Set([
  'candidateName',
  'clientName',
  'jobTitle',
  'coordinator',
  'status',
  'referralDate',
  'lastUpdatedBy',
  'source',
  'isRepeat',
]);

/**
 * @param {Record<string, unknown>} row
 * @param {ReturnType<typeof parseScreeningCvReferralsQuery>} f
 */
const screeningReferralRowMatchesFilters = (row, f) => {
  const refDate = new Date(String(row.referralDate));
  if (f.referralDateFrom) {
    const start = new Date(f.referralDateFrom);
    if (Number.isFinite(start.getTime()) && (!Number.isFinite(refDate.getTime()) || refDate < start)) return false;
  }
  if (f.referralDateTo) {
    const end = new Date(f.referralDateTo);
    if (Number.isFinite(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      if (!Number.isFinite(refDate.getTime()) || refDate > end) return false;
    }
  }
  if (f.search) {
    const s = f.search.toLowerCase();
    const c = String(row.candidateName || '').toLowerCase();
    const cl = String(row.clientName || '').toLowerCase();
    const j = String(row.jobTitle || '').toLowerCase();
    if (!c.includes(s) && !cl.includes(s) && !j.includes(s)) return false;
  }
  if (f.status && String(row.status || '') !== f.status) return false;
  if (f.clientNames.length) {
    const c = String(row.clientName || '').trim();
    if (!c || !f.clientNames.some((label) => screeningClientNameMatchesScope(c, [label]))) return false;
  }
  if (f.jobTitles.length) {
    const j = String(row.jobTitle || '').trim();
    if (!j || !f.jobTitles.includes(j)) return false;
  }
  if (f.coordinators.length) {
    const c = String(row.coordinator || '').trim();
    if (!c || c === '—' || !f.coordinators.includes(c)) return false;
  }
  if (f.lastUpdatedBys.length) {
    const c = String(row.coordinator || '').trim();
    if (!c || c === '—' || !f.lastUpdatedBys.includes(c)) return false;
  }
  if (f.candidateName) {
    if (!String(row.candidateName || '').toLowerCase().includes(f.candidateName.toLowerCase())) return false;
  }
  if (f.candidateId) {
    if (String(row.candidateId || '') !== f.candidateId) return false;
  }
  if (f.source) {
    if (!String(row.source || '').toLowerCase().includes(f.source.toLowerCase())) return false;
  }
  return true;
};

/**
 * @param {Record<string, unknown>[]} list
 * @param {string} sortKey
 * @param {'asc'|'desc'} sortDir
 */
const sortScreeningReferralRows = (list, sortKey, sortDir) => {
  const key = SCREENING_REFERRAL_SORT_KEYS.has(sortKey) ? sortKey : 'referralDate';
  const dir = sortDir === 'asc' ? 1 : -1;
  const getCmp = (a, b) => {
    if (key === 'referralDate') {
      const at = new Date(String(a.referralDate || 0)).getTime();
      const bt = new Date(String(b.referralDate || 0)).getTime();
      return (Number.isFinite(at) ? at : 0) - (Number.isFinite(bt) ? bt : 0);
    }
    if (key === 'isRepeat') {
      const av = a.isRepeat === true ? 1 : 0;
      const bv = b.isRepeat === true ? 1 : 0;
      return av - bv;
    }
    const vKey = key === 'lastUpdatedBy' ? 'coordinator' : key;
    const av = String((a)[vKey] != null ? (a)[vKey] : '');
    const bv = String((b)[vKey] != null ? (b)[vKey] : '');
    return av.localeCompare(bv, 'he', { sensitivity: 'base' });
  };
  return [...list].sort((a, b) => {
    const c = getCmp(a, b);
    if (c === 0) {
      return String(b.id).localeCompare(String(a.id), 'he');
    }
    return dir * c;
  });
};

/**
 * Non-admins without tenant client scope see only their own sends.
 * Tenant staff with a client see rows whose job client matches that client (any sender).
 * @returns {Promise<{ category: string } & Record<string, unknown>>}
 */
async function buildScreeningCvReferralAccessWhere(req, { tenantHasClientScope = false } = {}) {
  const where = { category: 'screening_cv' };
  if (tenantHasClientScope) return where;
  const userId = req.user?.sub || req.user?.id;
  const role = String(req.user?.role || '').toLowerCase();
  const isBroad = role === 'admin' || role === 'super_admin';
  if (!isBroad && userId) {
    const me = await User.findByPk(userId, { attributes: ['id', 'clientId'] });
    const cid = me?.clientId;
    if (cid) {
      const peers = await User.findAll({ where: { clientId: cid }, attributes: ['id'] });
      const senderIds = peers.map((p) => p.id).filter(Boolean);
      if (senderIds.length) {
        where.senderUserId = { [Op.in]: senderIds };
      } else {
        where.senderUserId = userId;
      }
    } else {
      where.senderUserId = userId;
    }
  }
  return where;
}

/** Prefer `notification_messages.text`; fall back to stripped HTML when text is empty (legacy rows). */
function screeningCvNotificationPlainBodyFromPlain(plain) {
  if (!plain || typeof plain !== 'object') return '';
  const fromText =
    plain.text != null && String(plain.text).trim() !== '' ? String(plain.text).trim() : '';
  if (fromText) return fromText;
  if (plain.html != null && String(plain.html).trim() !== '') {
    return stripHtmlMail(String(plain.html));
  }
  return '';
}

/** CV sends from candidate screening — one row per job send; `toEmail` lists all recipients comma-separated (notification_messages.category = screening_cv). */
const listScreeningCvReferrals = async (req, res) => {
  try {
    const q0 = req.query || {};
    const role = String(req.user?.role || '').toLowerCase();
    const isBroad = role === 'admin' || role === 'super_admin';
    const userId = req.user?.sub || req.user?.id;

    const wantsPagination =
      (q0.page != null && String(q0.page) !== '') || (q0.pageSize != null && String(q0.pageSize) !== '');
    const filterParams = parseScreeningCvReferralsQuery(q0, wantsPagination);

    let tenantClientLabels = null;
    if (!isBroad && userId) {
      const me = await User.findByPk(userId, { attributes: ['id', 'clientId'] });
      const effectiveClientId = await authService.resolveEffectiveClientIdForUser(me);
      if (effectiveClientId) {
        tenantClientLabels = await collectClientScopeLabels(effectiveClientId);
      }
    }

    const adminClientId = String(q0.clientId || '').trim();
    if (isBroad && adminClientId) {
      const labels = await collectClientScopeLabels(adminClientId);
      if (labels.length) filterParams.clientNames = labels;
    } else if (!isBroad) {
      if (!tenantClientLabels?.length) {
        res.set('Cache-Control', 'private, no-store');
        const emptyStats = {
          total: 0,
          accepted: 0,
          stages: { new: 0, review: 0, interview: 0, offer: 0, hired: 0, rejected: 0 },
          needsAttention: [],
        };
        if (wantsPagination) {
          return res.json({ items: [], total: 0, page: filterParams.page, pageSize: filterParams.pageSize, totalPages: 1, stats: emptyStats });
        }
        return res.json([]);
      }
      filterParams.clientNames = tenantClientLabels;
    }

    const where = await buildScreeningCvReferralAccessWhere(req, {
      tenantHasClientScope: Boolean(tenantClientLabels?.length),
    });

    const rows = await NotificationMessage.findAll({
      where,
      include: [{ model: User, as: 'sender', attributes: ['name'], required: false }],
      order: [['createdAt', 'DESC']],
      limit: 20000,
    });

    const candIds = [
      ...new Set(
        rows
          .map((r) => r.get('metadata')?.taskPayload?.candidateId)
          .filter((id) => id && String(id).trim()),
      ),
    ];
    const candRows =
      candIds.length > 0
        ? await Candidate.findAll({
            where: { id: candIds },
            attributes: ['id', 'phone', 'email'],
          })
        : [];
    const candById = new Map(candRows.map((c) => [c.id, c]));

    const out = rows.map((r) => {
      const plain = r.get({ plain: true });
      const meta = plain.metadata || {};
      const tp = meta.taskPayload || {};
      const sender = plain.sender;
      const namesFromRecipients =
        Array.isArray(tp.recipients) && tp.recipients.length
          ? tp.recipients
              .map((x) => (x && x.name ? String(x.name).trim() : ''))
              .filter(Boolean)
              .join(' · ')
          : '';
      const recipientNamePart =
        namesFromRecipients ||
        (tp.recipientName != null && String(tp.recipientName).trim() !== ''
          ? String(tp.recipientName).trim()
          : '');
      const recipientLine = [recipientNamePart, plain.toEmail].filter(Boolean).join(' · ');
      const wfMeta =
        meta.referralWorkflowStatus != null ? String(meta.referralWorkflowStatus).trim() : '';
      const colStatus = plain.status != null ? String(plain.status).trim() : '';
      const workflowStatus =
        wfMeta !== ''
          ? wfMeta
          : colStatus !== '' && !INBOX_NOTIFICATION_STATUS_TOKENS.has(colStatus)
            ? colStatus
            : 'חדש';
      const internal = meta.referralInternalNote;
      const notesParts = [recipientLine, internal].filter((x) => x != null && String(x).trim() !== '');
      const internalStr =
        internal != null && String(internal).trim() !== '' ? String(internal).trim() : '';
      const cand = tp.candidateId ? candById.get(tp.candidateId) : null;
      return {
        id: plain.id,
        candidateId: tp.candidateId || null,
        jobId: tp.jobId || null,
        candidateName: tp.candidateName || '',
        jobTitle: tp.jobTitle || '',
        clientName: tp.clientName || '',
        clientId: null,
        referralDate: plain.createdAt,
        contactDate: '',
        source: 'סינון — שליחת קו"ח',
        coordinator: sender?.name ? String(sender.name).trim() : '',
        status: workflowStatus,
        recipientLine,
        internalNote: internalStr,
        dueDate: plain.dueDate != null && String(plain.dueDate).trim() !== '' ? String(plain.dueDate).trim() : '',
        dueTime: plain.dueTime != null && String(plain.dueTime).trim() !== '' ? String(plain.dueTime).trim() : '',
        notes: notesParts.length ? notesParts.join('\n\n') : recipientLine,
        clientContacts: [],
        deliveryStatus: meta.deliveryStatus || null,
        candidatePhone: cand?.phone ? String(cand.phone).trim() : '',
        candidateEmail: cand?.email ? String(cand.email).trim() : '',
        inviteCandidate: Boolean(meta.referralInviteCandidate),
        inviteClient: Boolean(meta.referralInviteClient),
        isRepeat: plain.isRepeat === true,
        /** Plain body: `notification_messages.text`, or stripped HTML if text is empty. */
        notificationText: screeningCvNotificationPlainBodyFromPlain(plain),
      };
    });

    const filtered = out.filter((row) => screeningReferralRowMatchesFilters(row, filterParams));
    const sorted = sortScreeningReferralRows(
      filtered,
      filterParams.sortKey,
      filterParams.sortDir,
    );
    const total = sorted.length;

    const now = Date.now();
    const daysInStage = (row) => {
      const t = new Date(String(row.referralDate || 0)).getTime();
      if (!Number.isFinite(t)) return 0;
      return Math.max(0, Math.floor((now - t) / 86400000));
    };

    const accepted = sorted.filter(
      (r) => String(r.status || '') === 'התקבל' || String(r.status || '') === 'התקבל לעבודה',
    ).length;
    const stages = {
      new: sorted.filter((r) => r.status === 'חדש').length,
      review: sorted.filter((r) => r.status === 'בבדיקה').length,
      interview: sorted.filter((r) => r.status === 'ראיון').length,
      offer: sorted.filter((r) => r.status === 'הצעה').length,
      hired: accepted,
      rejected: sorted.filter((r) => r.status === 'נדחה').length,
    };
    const needsAttentionFull = sorted.filter(
      (r) =>
        (r.status === 'חדש' || r.status === 'בבדיקה') && daysInStage(r) > 7,
    );
    const needsAttention = needsAttentionFull.slice(0, 100).map((r) => ({
      id: r.id,
      candidateId: r.candidateId,
      candidateName: r.candidateName,
      jobTitle: r.jobTitle,
      clientName: r.clientName,
      coordinator: r.coordinator,
      status: r.status,
      referralDate: r.referralDate,
      source: r.source,
      daysInStage: daysInStage(r),
    }));

    const stats = { total, accepted, stages, needsAttention };
    const page = wantsPagination ? filterParams.page : 1;
    const pageSize = wantsPagination ? filterParams.pageSize : total || 1;
    const from = wantsPagination ? (page - 1) * pageSize : 0;
    const pSize = wantsPagination ? pageSize : total;
    const items = wantsPagination
      ? sorted.slice(from, from + pSize)
      : sorted;
    const totalPages = wantsPagination && pSize > 0 ? Math.max(1, Math.ceil(total / pSize)) : 1;

    res.set('Cache-Control', 'private, no-store');
    return res.json({ items, total, page, pageSize: wantsPagination ? pageSize : total, totalPages, stats });
  } catch (err) {
    console.error('[email][listScreeningCvReferrals]', err);
    return res.status(500).json({ message: err?.message || 'Failed to list screening CV referrals' });
  }
};

const getScreeningCvReferralById = async (req, res) => {
  try {
    const { id } = req.params;
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ message: 'id must be a valid UUID' });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Not found' });
    }
    if (String(record.category || '') !== 'screening_cv') {
      return res.status(400).json({ message: 'Not a screening CV referral' });
    }

    const role = String(req.user?.role || '').toLowerCase();
    const isBroad = role === 'admin' || role === 'super_admin';
    const ctx = await resolveNotificationViewerContext(req);
    if (!isBroad) {
      const ok =
        (ctx && notificationVisibleToViewer(record, ctx)) ||
        (await screeningCvReferralEditableByPeer(record, req));
      if (!ok) {
        return res.status(403).json({ message: 'Forbidden' });
      }
    }

    const plain = record.get({ plain: true });
    const notificationText = screeningCvNotificationPlainBodyFromPlain(plain);
    res.set('Cache-Control', 'private, no-store');
    return res.json({ id: plain.id, notificationText });
  } catch (err) {
    console.error('[email][getScreeningCvReferralById]', err);
    return res.status(500).json({ message: err?.message || 'Failed to load referral' });
  }
};

module.exports = {
  upload,
  getByCandidate,
  getByCandidates,
  patchEmailUploadNotes,
  downloadEmailUploadResume,
  send,
  sendScreeningCv,
  listScreeningCvReferrals,
  getScreeningCvReferralById,
  patchScreeningCvReferral,
  getNotificationMessages,
  downloadNotificationMessageAttachment,
  updateNotificationMessageStatus,
  updateNotificationMessageAssignee,
};

const normalizeStringArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const normalizeWorkExperience = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x || typeof x !== 'object') return null;
      const title = String(x.title || '').trim();
      const company = String(x.company || '').trim();
      const description = String(x.description || '').trim();
      if (!title && !company && !description) return null;
      const startDate = String(x.startDate || '').trim() || '2000-01';
      const endDate = String(x.endDate || '').trim() || (startDate || '2000-12');
      return {
        id: x.id || idx + 1,
        title: title || 'ניסיון תעסוקתי',
        company,
        companyField: String(x.companyField || '').trim(),
        startDate,
        endDate,
        description: description || [title, company].filter(Boolean).join(' - '),
      };
    })
    .filter(Boolean);
};

const normalizeEducation = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const v = x.trim();
        return v ? { id: idx + 1, value: v } : null;
      }
      if (typeof x === 'object') {
        const v = String(x.value || x.degree || x.title || x.description || '').trim();
        return v ? { id: x.id || idx + 1, value: v } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const normalizeLanguages = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const name = x.trim();
        return name ? { id: idx + 1, name, level: 50, levelText: '' } : null;
      }
      if (typeof x === 'object') {
        const name = String(x.name || '').trim();
        if (!name) return null;
        const level = typeof x.level === 'number' ? x.level : 50;
        return { id: x.id || idx + 1, name, level, levelText: String(x.levelText || x.level || '').trim() };
      }
      return null;
    })
    .filter(Boolean);
};

const tryParseJson = (text) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const startObj = trimmed.indexOf('{');
    const startArr = trimmed.indexOf('[');
    const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
    if (start === -1) return null;
    const endObj = trimmed.lastIndexOf('}');
    const endArr = trimmed.lastIndexOf(']');
    const end = endObj === -1 ? endArr : endArr === -1 ? endObj : Math.max(endObj, endArr);
    if (end === -1 || end <= start) return null;
    const slice = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
};

const extractStructuredFields = (text) => {
  if (!text) return {};
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  const pipeParts = firstLine.split('|').map((p) => p.trim()).filter(Boolean);
  const nameCandidate = (() => {
    const raw = pipeParts[0] ? pipeParts[0].split(',')[0].trim() : firstLine.split(',')[0].trim();
    if (!raw) return undefined;
    if (/\d/.test(raw) || raw.includes('@')) return undefined;
    if (raw.length < 2 || raw.length > 80) return undefined;
    return raw;
  })();
  const phoneRegex = /(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/;
  const addressCandidate = (() => {
    const candidates = pipeParts.slice(1);
    for (const part of candidates) {
      if (!part) continue;
      if (part.includes('@')) continue;
      if (phoneRegex.test(part)) continue;
      if (part.length < 2 || part.length > 80) continue;
      return part;
    }
    return undefined;
  })();
  const genderCandidate = (() => {
    const lower = text.toLowerCase();
    if (lower.includes('נקבה') || lower.includes('female')) return 'female';
    if (lower.includes('זכר') || lower.includes('male')) return 'male';
    return undefined;
  })();
  const titleLine = lines.find(
    (l) =>
      l.length >= 4 &&
      l.length <= 80 &&
      !l.includes('@') &&
      !/\d{4,}/.test(l),
  );
  const summary = text.slice(0, 600);
  const linesLower = lines.map((l) => l.toLowerCase());
  const collectSections = (keywords, stopKeywords) => {
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = linesLower[i];
      if (!keywords.some((k) => lower.includes(k))) continue;
      let acc = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        const lwr = linesLower[j];
        if (!line) {
          if (acc.length) {
            sections.push(acc.join(' '));
            acc = [];
          }
          continue;
        }
        if (keywords.some((k) => lwr.includes(k))) break;
        if (stopKeywords.some((k) => lwr.includes(k))) break;
        if (/^(skills|כישורים|summary|סיכום|about|אודות)/i.test(line)) break;
        acc.push(line.trim());
      }
      if (acc.length) sections.push(acc.join(' '));
    }
    return sections;
  };
  const experienceBlocks = collectSections(
    [
      'נסיון',
      'ניסיון',
      'experience',
      'employment',
      'work history',
      'professional experience',
      'career history',
      'תעסוקה',
      'עבודה',
    ],
    ['השכלה', 'education', 'degree', 'תואר', 'לימודים', 'certification', 'תעודה', 'studies', 'academy'],
  );
  const educationBlocks = collectSections(
    [
      'השכלה',
      'education',
      'degree',
      'degrees',
      'תואר',
      'לימודים',
      'certification',
      'certifications',
      'תעודה',
      'studies',
      'academy',
      'academic',
      'bachelor',
      'master',
      'phd',
      'university',
      'college',
    ],
    ['נסיון', 'ניסיון', 'experience', 'employment', 'work history', 'professional experience', 'career history', 'תעסוקה', 'עבודה'],
  );
  const experienceCards = [];
  experienceBlocks.forEach((block) => {
    const segments = [];
    const rangeRegex = /(20\d{2}|19\d{2})\s*[–-]\s*(present|כיום|20\d{2}|19\d{2})/gi;
    const indices = [];
    let m;
    while ((m = rangeRegex.exec(block)) !== null) {
      indices.push({ index: m.index, sy: m[1], eyRaw: m[2] });
    }
    if (indices.length > 0) {
      indices.forEach((item, idx) => {
        const start = item.index;
        const end = idx + 1 < indices.length ? indices[idx + 1].index : block.length;
        const snippet = block.slice(start, end).trim();
        if (!snippet) return;
        const ey = /present|כיום/i.test(item.eyRaw) ? 'Present' : item.eyRaw;
        segments.push({
          sy: item.sy,
          ey,
          text: snippet,
        });
      });
    } else {
      segments.push({ sy: '2000', ey: '2000', text: block.trim() });
    }

    segments.forEach((seg) => {
      const sy = seg.sy || '2000';
      const ey = seg.ey || sy;
      experienceCards.push({
        id: experienceCards.length + 1,
        title: seg.text.split('.')[0] || `ניסיון ${sy}${ey ? `-${ey}` : ''}`,
        company: '',
        companyField: '',
        startDate: `${sy}-01`,
        endDate: /present|כיום/i.test(ey) ? 'Present' : ey === sy ? `${ey}-12` : `${ey}-12`,
        description: seg.text,
      });
    });
  });
  const educationCards = educationBlocks.map((block, idx) => ({
    id: idx + 1,
    value: block,
  }));
  if (!experienceCards.length) {
    const yearLines = lines
      .filter((l) => /(20\d{2}|19\d{2})/.test(l))
      .map((l) => l.trim())
      .filter(Boolean);
    if (yearLines.length) {
      experienceCards.push(
        ...yearLines.map((l, idx) => {
          const m = l.match(/(20\d{2}|19\d{2}).{0,10}(20\d{2}|19\d{2}|כיום|present)/i);
          const single = l.match(/(20\d{2}|19\d{2})/);
          const sy = m ? m[1] : single ? single[1] : '2000';
          const eyRaw = m ? m[2] : sy;
          const ey = /כיום|present/i.test(eyRaw) ? 'Present' : eyRaw;
          return {
            id: idx + 1,
            title: l,
            company: '',
            companyField: '',
            startDate: `${sy}-01`,
            endDate: ey === sy ? `${ey}-12` : ey === 'Present' ? 'Present' : `${ey}-12`,
            description: l,
          };
        }),
      );
    }
  }
  if (!educationCards.length) {
    const eduLines = lines
      .filter((l) =>
        /(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma)/i.test(l),
      )
      .map((l) => l.trim())
      .filter(Boolean);
    if (eduLines.length) {
      eduLines.forEach((l, idx) => educationCards.push({ id: idx + 1, value: l }));
    }
  }
  if (experienceCards.length === 0 && text && text.trim().length > 30) {
    const snippet = text.trim().slice(0, 220);
    experienceCards.push({
      id: 1,
      title: snippet.split('.')[0] || 'ניסיון תעסוקתי',
      company: '',
      companyField: '',
      startDate: '2000-01',
      endDate: '2000-12',
      description: snippet,
    });
  }
  if (educationCards.length === 0) {
    const eduMatch = text.match(/.{0,50}(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma).{0,80}/i);
    const eduText = eduMatch ? eduMatch[0].trim() : text.trim().slice(0, 150);
    if (eduText) {
      educationCards.push({ id: 1, value: eduText });
    }
  }
  return {
    email: emailMatch ? emailMatch[0] : undefined,
    phone: phoneMatch ? phoneMatch[0] : undefined,
    fullName: nameCandidate,
    address: addressCandidate,
    gender: genderCandidate,
    title: titleLine,
    professionalSummary: summary,
    workExperience: experienceCards,
    education: educationCards,
  };
};

const extractSkillsHeuristic = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return { soft: [], technical: [] };

  const techKeywords = [
    'excel', 'word', 'powerpoint', 'sql', 'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node.js',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jira', 'confluence', 'sap', 'salesforce', 'power bi', 'tableau',
    'git', 'github', 'gitlab', 'linux', 'windows', 'photoshop', 'figma', 'google ads', 'meta ads', 'facebook ads',
    'seo', 'ppc', 'crm', 'erp',
    'אקסל', 'אופיס', 'וורד', 'פאוורפוינט', 'סאפ', 'ג\'ירה', 'גירה', 'קונפלואנס', 'פאוור בי', 'טאבלו', 'פוטושופ',
  ];
  const softKeywords = [
    'communication', 'teamwork', 'leadership', 'problem solving', 'organization', 'time management', 'customer service',
    'תקשורת', 'עבודת צוות', 'עבודה בצוות', 'מנהיגות', 'שירותיות', 'שירות לקוחות', 'סדר', 'ארגון', 'ניהול זמן', 'פתרון בעיות',
    'אחריות', 'מוטיבציה', 'יחסי אנוש', 'עצמאות', 'יכולת למידה',
  ];

  const pick = (arr) => arr.filter((k) => t.includes(k.toLowerCase()));
  const tech = Array.from(new Set(pick(techKeywords))).slice(0, 30);
  const soft = Array.from(new Set(pick(softKeywords))).slice(0, 30);
  return { soft, technical: tech };
};

const getCandidateTagsSchemaText = () => `
Candidate tag schema (from backend/src/models/SystemTag.js):
- type (candidate | job) — always "candidate" for candidate profiles
- name (String)
- entity_id (UUID, FK -> candidates.id or jobs.id depending on type)
- tag_id (UUID, FK -> tags.id)
- raw_type (role/skill/education/etc.)
- context (Core/Tool/Degree)
- is_current (boolean)
- is_in_summary (boolean)
- confidence_score (float)
- calculated_weight (float)
- final_score (float)
- tag_reason (String) — short Hebrew explanation of why this tag was inferred (paraphrase allowed)
- quote (TEXT) — EXACT verbatim substring of the input CV/email text that triggered this tag (no paraphrase)
Use this schema as guidance when tagging professional skills or roles.
`;

const buildAiResumePrompt = (candidate_tag) => `
You are an expert CV parser. You receive raw CV text (Hebrew or English).
Return ONLY a valid JSON object (no markdown, no explanations) matching this schema:
{
  "fullName": string|null,
  "email": string|null,
  "phone": string|null,
  "address": string|null,
  "availability": string|null,
  "preferredWorkingHours": string|null,
  "title": string|null,
  "professionalSummary": string|null,
  "skills": { "soft": string[], "technical": string[] },
  "tags": string[],
  "languages": [{ "name": string, "level": string|number|null, "levelText": string|null }],
  "workExperience": [{
    "title": string|null,
    "company": string|null,
    "companyField": string|null,
    "startDate": string|null,
    "endDate": string|null,
    "description": string|null
  }],
  "education": [{ "value": string|null }]
}

Rules:
- Do NOT invent facts. If unknown, use null/empty.
- Extract multiple work/education entries when present.
- You MUST ALWAYS include the "skills" key with BOTH arrays: skills.soft and skills.technical (even if empty).
- If the user mentions skills, roles, tools, or other professional tags,also include them under the \`tags\` field so the backend can synchronize candidate_tag rows. candidate_tag  scehma:${candidate_tag } (must implement in candidate_tag from the llm: raw_type: (String) הסיווג מה-LLM (Role, Skill, etc). context: (Core/Tool/Degree).  is_current: (Boolean) האם מופיע בניסיון האחרון.  is_in_summary: (Boolean) האם מופיע בפתיח.  confidence_score: (Float) רמת הביטחון של ה-AI.)
- If the CV contains any skills/tools/technologies/traits, you MUST extract them into the relevant list (do not leave both lists empty).
- skills.soft = interpersonal/behavioral skills (e.g., תקשורת בין-אישית, עבודת צוות, מנהיגות, שירותיות, סדר וארגון, פתרון בעיות). Max 30.
- skills.technical = tools/technologies/platforms/methods/certifications (e.g., Excel, SQL, Python, React, Jira, AWS, Docker). Max 30.
- Prefer realistic date formats; if only year exists use YYYY-01 / YYYY-12.
- Always include top-level "availability" and "preferredWorkingHours" (null when not stated); see the appended schedule rules at the end of this prompt.

Output constraints:
- Return STRICT JSON (double quotes, no trailing commas).
- Do not wrap in \`\`\` fences.
`;

/** Same appendix as candidateController: forces preferredWorkingHours / availability into model output. */
const CV_PARSING_SCHEDULE_AND_AVAILABILITY_APPENDIX = `
--- Backend-required JSON keys (add to the SAME single JSON object; use null when not stated in the CV) ---
- "availability": string|null — Notice period, start date, or employment readiness ONLY if explicitly written (e.g. מיידי, חודש התראה, זמין מ-…).
- "preferredWorkingHours": string|null — Preferred daily work schedule ONLY if explicit. If absent in the CV, use null (do not guess).
  When present, use ONE of: "גמיש", "ללא אילוצי שעות", or a single 24h range "HH:mm-HH:mm" with zero-padded hours (e.g. "09:00-18:00").
  Map phrases like "שעות גמישות", "משמרות גמישות", "flexible hours" to "גמיש".
`;

/** Same appendix as candidateController: forces a verbatim `quote` on every candidate tag. */
const CV_PARSING_TAG_QUOTE_APPENDIX = `
--- Required additional field on EVERY object inside the "tags" array ---
- "quote": string|null — The EXACT, verbatim substring copied character-by-character from the
  input CV/email text that caused this tag to be created.
  STRICT RULES:
  * MUST be a literal substring of the input text — no paraphrase, no synonyms, no translation,
    no punctuation/whitespace edits beyond trimming leading/trailing spaces.
  * Pick the SHORTEST span that proves the tag (usually a phrase or short sentence). Hard cap ~240 characters.
  * If the same evidence supports multiple tags, repeat the quote per tag — do NOT deduplicate.
  * If the input does not contain a verbatim phrase that justifies the tag, set "quote" to null (very rare).
  * "quote" is REQUIRED on every tag object and is IN ADDITION to "tag_reason" and the legacy "evidence" field.
  * If you also emit the legacy "evidence" field, it MUST equal "quote" (same verbatim substring).
`;

/** Overrides any legacy "10-15 tags" / hard-cap wording in the stored cv_parsing prompt. */
const CV_PARSING_TAG_COUNT_APPENDIX = `
--- Tag count (OVERRIDES any earlier cap in this prompt) ---
- There is NO maximum tag count. Extract every relevant professional tag supported by evidence in the CV.
- Include roles, skills, tools, seniority, industry, methodologies, degrees, and soft skills whenever they appear.
- Still aim for at least 1-2 Role tags, one Seniority tag, and one Industry tag when the CV supports them.
`;

const coercePreferredWorkingHoursFromAi = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;
  if (s === 'גמיש' || s === 'ללא אילוצי שעות') return s;
  const lower = s.toLowerCase();
  if (
    /גמישות|שעות גמישות|משמרות גמישות|ללא התחייבות לשעות|עבודה גמישה/i.test(s) ||
    /\bflexible(\s+hours|\s+schedule)?\b/i.test(lower) ||
    /\bvariable\s+hours\b/i.test(lower)
  ) {
    return 'גמיש';
  }
  const m = s.match(/(\d{1,2})\s*:\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (m) {
    const hh = (x) => String(Math.min(23, parseInt(x, 10))).padStart(2, '0');
    const mm = (x) => String(Math.min(59, parseInt(x, 10))).padStart(2, '0');
    return `${hh(m[1])}:${mm(m[2])}-${hh(m[3])}:${mm(m[4])}`;
  }
  return s.slice(0, 255);
};

const getResumePromptTemplate = async () => {
  try {
    const record = await promptService.getById('cv_parsing');
    const schemaJson = buildCandidateModelSchemaJsonForPrompt();
    const mobilityPicklist = await picklistService.formatCategoryValuesForLlmPrompt('mobility');
    const drivingPicklist = await picklistService.formatCategoryValuesForLlmPrompt('driving_license');
    let template = String(record.template || '');
    template = template.replace(/\$\{JSON\}/g, schemaJson).replace(/\$JSON/g, schemaJson);
    template = template.replace(/\$\{Mobility\}/g, mobilityPicklist);
    template = template.replace(/\$\{DrivingLicenses\}/g, drivingPicklist);
    template = `${String(template).trimEnd()}\n${CV_PARSING_SCHEDULE_AND_AVAILABILITY_APPENDIX}\n${CV_PARSING_TAG_QUOTE_APPENDIX}\n${CV_PARSING_TAG_COUNT_APPENDIX}`;
    return { ...record, template };
  } catch (err) {
    console.warn('[emailController] cv_parsing prompt missing', err.message || err);
    return null;
  }
};

const parseResumeWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!resumeText || !String(resumeText).trim()) return null;
  const promptRecord = await getResumePromptTemplate();
  const systemPrompt = (promptRecord?.template?.replace('{candidate_tag}', getCandidateTagsSchemaText())) || buildAiResumePrompt(getCandidateTagsSchemaText());
  const cvText = resumeText.slice(0, 50000);
  const raw = await sendChat({
    apiKey,
    systemPrompt,
    history: [{ role: 'user', text: cvText }],
    message: resumeText,
    promptId: 'cv_parsing',
    llmInputJson: {
      cvTextLength: cvText.length,
      cvTextPreview: cvText.slice(0, 4000),
    },
  });
  const parsed = tryParseJson(raw);
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const deriveCandidateFieldsFromResume = async (text) => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (!trimmed) {
    return { aiFields: null, aiTags: [], rawResult: null };
  }
  const aiResult = (await parseResumeWithAi({ resumeText: trimmed })) || {};
  const fallback = extractStructuredFields(trimmed);

  const aiSkills = aiResult.skills || {};
  let softSkills = normalizeStringArray(aiSkills.soft);
  let techSkills = normalizeStringArray(aiSkills.technical);
  if (!softSkills.length && !techSkills.length) {
    const heuristic = extractSkillsHeuristic(trimmed);
    softSkills = heuristic.soft;
    techSkills = heuristic.technical;
  }

  let tags = normalizeStringArray(aiResult.tags);
  if (!tags.length && (softSkills.length || techSkills.length)) {
    tags = Array.from(new Set([...softSkills, ...techSkills])).slice(0, 50);
  }

  const pwhFromAi = coercePreferredWorkingHoursFromAi(aiResult.preferredWorkingHours);
  let availabilityFromAi =
    aiResult.availability != null && String(aiResult.availability).trim() !== ''
      ? String(aiResult.availability).trim()
      : null;

  availabilityFromAi=null; //dont change it!

  const aiFields = {
    fullName: aiResult.fullName || fallback.fullName || 'מועמד חדש',
    email: aiResult.email || fallback.email || null,
    phone: aiResult.phone || fallback.phone || null,
    address: aiResult.address || null,
    ...(availabilityFromAi ? { availability: availabilityFromAi } : {}),
    ...(pwhFromAi ? { preferredWorkingHours: pwhFromAi } : {}),
    title: aiResult.title || fallback.title || null,
    professionalSummary:
      aiResult.professionalSummary || fallback.professionalSummary || fallback.summary || null,
    skills: {
      soft: softSkills.slice(0, 50),
      technical: techSkills.slice(0, 50),
    },
    tags,
    workExperience: normalizeWorkExperience(aiResult.workExperience || fallback.workExperience),
    education: normalizeEducation(aiResult.education || fallback.education),
    languages: normalizeLanguages(aiResult.languages || fallback.languages),
    industryAnalysis: aiResult.industryAnalysis || fallback.industryAnalysis || {},
    searchText: normalizeResumeSearchText(trimmed).slice(0, 50000),
    searchTextSavedAt: new Date(),
  };

  const aiTags = Array.isArray(aiResult.tags) && aiResult.tags.length
    ? aiResult.tags
    : tags.map((name) => ({ name }));

  return { aiFields, aiTags, rawResult: aiResult };
};

