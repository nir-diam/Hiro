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
const EmailUpload = require('../models/EmailUpload');
const { createS3Client } = require('../services/s3Service');
const {
  putResumeFileInS3,
  fetchResumeText,
  buildParsedUpdates,
  fetchResumeBinaryForMail,
  buildCandidateModelSchemaJsonForPrompt,
  ensureOrganizationsFromExperience,
} = require('./candidateController');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const JobCandidateScreening = require('../models/JobCandidateScreening');
const candidateTagService = require('../services/candidateTagService');
const candidateCompletenessService = require('../services/candidateCompletenessService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const { sendChat } = require('../services/geminiService');
const User = require('../models/User');
const NotificationMessage = require('../models/NotificationMessage');
const RecruitmentStatus = require('../models/RecruitmentStatus');
const { Op, Sequelize } = require('sequelize');
const { sequelize } = require('../config/db');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');
const auditLogger = require('../utils/auditLogger');

const supportedResumeExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
const supportedMimes = ['pdf', 'msword', 'officedocument', 'application/octet-stream'];

const NOTIFICATION_TASK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Inbox / task folder values; screening_cv rows typically store recruitment status `name` instead. */
const INBOX_NOTIFICATION_STATUS_TOKENS = new Set(['unread', 'tasks', 'archived', 'deleted']);

/** Staff app origin for deep links — no trailing slash (`PUBLIC_APP_URL` / `FRONTEND_URL`). */
const publicStaffAppOrigin = () =>
  String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://hiro.co.il').replace(/\/$/, '');

/** Hash-router URLs e.g. `https://hiro.co.il/#/candidates/{uuid}`. */
const staffSpaUrl = (origin, routePath) => {
  const base = String(origin || '').replace(/\/$/, '');
  const path = String(routePath || '').startsWith('/') ? routePath : `/${routePath}`;
  return `${base}/#${path}`;
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
 * Clickable links (HTML + plain text) for linked candidate / job / client in outgoing task & message mail.
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

const extractPostingCodeFromEmailAddress = (email = '') => {
  const raw = String(email || '').trim();
  if (!raw) return null;
  const angle = raw.match(/<([^>]+@[^>]+)>/i);
  const addr = angle ? angle[1].trim() : raw;
  return postingCodeFromPlusAddressText(addr);
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

const processEmailUpload = async (record) => {
  console.log('[email] processing upload record', {
    id: record.id,
    bucket: record.bucket,
    fileKey: record.fileKey,
    jobId: record.jobId,
  });
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
      const code = extractPostingCodeFromEmailAddress(recipient.address);
      if (code) {
        postingCode = code;
        break;
      }
    }
    if (!postingCode) {
      postingCode = postingCodeFromPlusAddressText(parsed.to?.text || '');
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

    let candidate =
      (await candidateService.findByEmail(fromEmail)) || (await candidateService.findByInboundFromEmail(fromEmail));
    let candidateCreatedViaEmailIngest = false;
    if (!candidate) {
      const inferredName =
        fromAddress?.name?.trim() || fromEmail.split('@')[0] || 'מועמד חדש';
      candidate = await candidateService.create({
        email: fromEmail,
        /** Stable key when CV/AI later overwrites `email` to a different address. */
        inboundFromEmail: fromEmail,
        fullName: inferredName,
        source: 'email',
      });
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
      const put = await putResumeFileInS3(candidate.id, fileBase64, filename, mimeType);
      if (!put) continue;
      uploaded.push({ ...put, fileLabel: filename });
      console.log(
        '[email] resume uploaded to S3',
        `(${i + 1}/${totalResumes})`,
        put.publicUrl.slice(0, 60),
      );
      const piece = (await fetchResumeText(put.publicUrl, candidate.id)) || '';
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

    // Audit after at least one CV is stored — must be awaited so the run (incl. workers)
    // does not end before audit rows are written; matches "CV loaded from email".
    const primaryAuditId = candidate.id != null ? String(candidate.id) : null;
    const primaryAuditName =
      (typeof candidate.get === 'function' ? candidate.get('fullName') : null) ||
      candidate.fullName ||
      '—';
    if (candidateCreatedViaEmailIngest) {
      await systemEventEmitter.emit(null, {
        ...SYSTEM_EVENTS.CV_RECEIVED,
        entityType: 'Candidate',
        entityId: primaryAuditId,
        entityName: primaryAuditName,
        params: { id: record?.id != null ? String(record.id) : primaryAuditId },
      });
      await systemEventEmitter.emit(null, {
        ...SYSTEM_EVENTS.CV_SOURCE,
        entityType: 'Candidate',
        entityId: primaryAuditId,
        entityName: primaryAuditName,
        params: { source: 'email' },
      });
    }

    if (textChunks.length !== uploaded.length) {
      console.warn('[email] text/attachment count mismatch, falling back to join', {
        recordId: record.id,
        uploaded: uploaded.length,
        textChunks: textChunks.length,
      });
    }

    // Split when: (1) different person on CV / filename despite shared footer email (agency batches),
    // or (2) different contact email vs file 0 (original behavior).
    const emailInFirstCv = extractFirstEmailFromCvText(textChunks[0] || '');
    const identityKey0 = extractCvIdentityKey(textChunks[0] || '', uploaded[0]?.fileLabel || '');
    const identitySplitIndices = new Set();
    const splitFileIndices = new Set();
    for (let j = 1; j < uploaded.length; j += 1) {
      const identityKeyJ = extractCvIdentityKey(textChunks[j] || '', uploaded[j]?.fileLabel || '');
      const differsIdentity =
        identityKey0 &&
        identityKeyJ &&
        identityKey0 !== identityKeyJ &&
        compactIdentityCompare(identityKey0) !== compactIdentityCompare(identityKeyJ);
      if (differsIdentity) {
        identitySplitIndices.add(j);
        splitFileIndices.add(j);
        console.log('[email] multi-CV: split (distinct CV identity; shared email is OK)', {
          j,
          identityKey0,
          identityKeyJ,
        });
        continue;
      }

      const emailJ = extractFirstEmailFromCvText(textChunks[j] || '');
      if (!emailJ) continue;
      const n0 = (emailInFirstCv || '').toLowerCase();
      const nJ = String(emailJ).toLowerCase();
      if (nJ === fromEmail) continue;
      if (n0 && nJ === n0) continue;
      if (!n0) {
        if (nJ === fromEmail) continue;
        splitFileIndices.add(j);
        continue;
      }
      if (nJ !== n0) {
        splitFileIndices.add(j);
        console.log('[email] multi-CV: split to separate candidate for attachment index', {
          j,
          email: nJ,
          primaryFileEmail: n0,
        });
      }
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
      documents: extraDocEntries.length ? [...extraDocEntries, ...prevDocs] : prevDocs,
    });

    const primaryTextParts = [textChunks[0] || ''];
    for (let j = 1; j < textChunks.length; j += 1) {
      if (!splitFileIndices.has(j)) primaryTextParts.push(textChunks[j] || '');
    }
    const combinedText = primaryTextParts.filter(Boolean).join('\n\n----\n\n');

    const parsedUpdates = buildParsedUpdates(candidate, combinedText || '');
    if (Object.keys(parsedUpdates).length) {
      await candidateService.update(candidate.id, parsedUpdates);
    }
    const { aiFields, aiTags } = await deriveCandidateFieldsFromResume(combinedText);
    if (aiFields && Object.keys(aiFields).length) {
      const safeAi = { ...aiFields };
      const envelopeEmail = candidate.email && String(candidate.email).includes('@');
      if (envelopeEmail && (!safeAi.email || !String(safeAi.email).includes('@'))) {
        delete safeAi.email;
      }
      await candidateService.update(candidate.id, safeAi);

      // Audit: 'פרסור ניתוח ועיבוד מידע' — AI parsed CV and applied auto updates
      await systemEventEmitter.emit(null, {
        ...SYSTEM_EVENTS.CV_PARSED,
        entityType: 'Candidate',
        entityId: candidate.id,
        entityName: candidate.fullName,
        params: { source: aiFields?.source || 'email' },
      });

      // Audit: 'הגדרת תחום משרה' — candidate "field" inferred by AI
      if (safeAi.field) {
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_FIELD,
          entityType: 'Candidate',
          entityId: candidate.id,
          entityName: candidate.fullName,
          params: { job: safeAi.field },
        });
      }
    }
    if (aiTags.length) {
      await candidateTagService.syncTagsForCandidate(candidate.id, aiTags);

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
        entityName: candidate.fullName,
        params: { tags: tagsLabel || `${aiTags.length} תגיות` },
      });
    }
    await candidateService.update(candidate.id, { source: 'email' });

    try {
      let completenessClientId = null;
      if (resolvedJob?.client) {
        completenessClientId = await clientService.findIdByJobClientLabel(resolvedJob.client);
      }
      await candidateCompletenessService.refreshCandidateDataStatusForClient(candidate.id, completenessClientId);
    } catch (cmpErr) {
      console.warn('[email] completeness after ingest', cmpErr?.message || cmpErr);
    }

    const primarySynced = await candidateService.getById(candidate.id);
    await ensureOrganizationsFromExperience(primarySynced?.workExperience, candidate.id);

    const association = await jobCandidateService.associateCandidateWithJob({
      jobId: resolvedJob?.id || null,
      candidateId: candidate.id,
      source: 'email',
    });
    console.log('[email] associated candidate with job', association?.id);
    await record.update({ candidateId: candidate.id, body: parsed.html?.trim() || parsed.text?.trim() || null });
    await record.reload();

    let welcomeClientId = null;
    if (resolvedJob?.client) {
      welcomeClientId = await clientService.findIdByJobClientLabel(resolvedJob.client);
    }
    const welcomeOnce = new Set();
    const queueWelcome = (cand) => {
      if (!cand || !cand.email) return;
      const k = String(cand.email).trim().toLowerCase();
      if (welcomeOnce.has(k)) {
        console.log('[email] welcome skipped (dedupe, same address as earlier in this ingest)', k);
        return;
      }
      welcomeOnce.add(k);
      try {
        messageTemplateService.queueCandidateWelcomeEmail(cand, {
          clientId: welcomeClientId,
        });
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
      if (!contactEmail) contactEmail = fromEmail;
      if (!contactEmail) continue;
      const norm = String(contactEmail).toLowerCase();
      if (!identitySplitIndices.has(j) && norm === fromEmail) continue;

      const nameGuess =
        extractNameHintFromCvBody(textChunks[j] || '') ||
        extractNameHintFromResumeFilename(up.fileLabel || '') ||
        inferNameFromCvTextForEmail(textChunks[j] || '', contactEmail);

      let splitCand;
      let splitCandIsNew = false;
      if (identitySplitIndices.has(j)) {
        // Multiple CVs often share one contact email; never reuse another row from findByEmail (would merge 2nd+ splits).
        splitCand = await candidateService.create({
          email: norm,
          fullName: nameGuess,
          source: 'email',
          inboundFromEmail: fromEmail,
        });
        splitCandIsNew = true;
      } else {
        splitCand = await candidateService.findByEmail(norm);
        if (!splitCand) {
          splitCand = await candidateService.create({
            email: norm,
            fullName: nameGuess,
            source: 'email',
            inboundFromEmail: fromEmail,
          });
          splitCandIsNew = true;
        } else if (splitCand.id === candidate.id) {
          splitCand = await candidateService.create({
            email: norm,
            fullName: nameGuess,
            source: 'email',
            inboundFromEmail: fromEmail,
          });
          splitCandIsNew = true;
        }
      }
      await candidateService.update(splitCand.id, { resumeUrl: up.publicUrl, source: 'email' });
      if (splitCandIsNew) {
        const sid = splitCand.id != null ? String(splitCand.id) : null;
        const sname =
          (typeof splitCand.get === 'function' ? splitCand.get('fullName') : null) ||
          splitCand.fullName ||
          nameGuess ||
          '—';
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_RECEIVED,
          entityType: 'Candidate',
          entityId: sid,
          entityName: sname,
          params: { id: record?.id != null ? String(record.id) : sid },
        });
        await systemEventEmitter.emit(null, {
          ...SYSTEM_EVENTS.CV_SOURCE,
          entityType: 'Candidate',
          entityId: sid,
          entityName: sname,
          params: { source: 'email' },
        });
      }
      const tj = textChunks[j] || '';
      const { aiFields: splitAi, aiTags: splitTags } = await deriveCandidateFieldsFromResume(tj);
      if (splitAi && Object.keys(splitAi).length) {
        const safeS = { ...splitAi };
        if (norm && (!safeS.email || !String(safeS.email).includes('@'))) {
          safeS.email = norm;
        }
        await candidateService.update(splitCand.id, safeS);
      }
      if (splitTags && splitTags.length) {
        await candidateTagService.syncTagsForCandidate(splitCand.id, splitTags);
      }
      await jobCandidateService.associateCandidateWithJob({
        jobId: resolvedJob?.id || null,
        candidateId: splitCand.id,
        source: 'email',
      });
      const splitFresh = await candidateService.getById(splitCand.id);
      await ensureOrganizationsFromExperience(splitFresh?.workExperience, splitCand.id);
      // Mirror row so GET /api/email-uploads/candidate/:id finds this mail for split candidates (same S3 object as primary).
      try {
        await EmailUpload.create({
          bucket: record.bucket,
          fileKey: record.fileKey,
          jobId: record.jobId,
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
      queueWelcome(splitFresh);
    }

    try {
      const fresh = await candidateService.getById(candidate.id);
      console.log('[email] ingest template email queue (primary CV-by-mail)', {
        candidateId: fresh?.id,
        newCandidateThisIngest: candidateCreatedViaEmailIngest,
        email: fresh?.email || null,
        source: fresh?.source,
        resolvedJobId: resolvedJob?.id || null,
        welcomeClientId,
        postingCode: postingCode || null,
        splitAttachmentWelcomeCount: splitFileIndices.size,
      });
      queueWelcome(fresh);
    } catch (welcomeErr) {
      console.warn('[email] ingest template email queue failed', welcomeErr?.message || welcomeErr);
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
  }
};

const getByCandidate = async (req, res) => {
  try {
    const { candidateId } = req.params;
    if (!candidateId) {
      return res.status(400).json({ message: 'candidateId is required' });
    }
    const records = await EmailUpload.findAll({
      where: { candidateId },
      order: [['createdAt', 'DESC']],
    });
    res.json(records);
  } catch (error) {
    console.error('[email][getByCandidate]', error);
    res.status(500).json({ message: 'Failed to load email uploads' });
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

/** Same-client recruiters may edit screening_cv workflow fields on rows sent by a teammate. */
async function screeningCvReferralEditableByPeer(record, req) {
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return false;
  const sid = record?.senderUserId;
  if (!sid) return false;
  const [me, sender] = await Promise.all([
    User.findByPk(userId, { attributes: ['clientId'] }),
    User.findByPk(sid, { attributes: ['clientId'] }),
  ]);
  const a = me?.clientId;
  const b = sender?.clientId;
  return Boolean(a && b && String(a) === String(b));
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
            return {
              filename: String(a.filename || 'attachment'),
              content: buf,
              contentType: typeof a.contentType === 'string' ? a.contentType : undefined,
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
    const { htmlAppend, storedTextSuffix } = buildLinkedEntityMailAppend(
      taskPayload,
      publicStaffAppOrigin(),
    );
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

    const logSendMessageModalAudit = async (resolvedToEmail, savedMessage, providerMessageId) => {
      if (!isSendMessageModal) return;
      const fromName =
        req?.user?.fullName ||
        req?.user?.name ||
        req?.user?.email ||
        smtpSenderEmail ||
        'מערכת';
      const messagePreview = (storedText || '').replace(/\s+/g, ' ').trim().slice(0, 280) || subject;
      const descriptionParts = [
        'נשלח מייל מממשק הצוות',
        composeCandidateName ? `מועמד: ${composeCandidateName}` : null,
        `נושא: ${String(subject || '').trim() || '—'}`,
        `אל: ${resolvedToEmail}`,
        messagePreview ? `תצוגת תוכן: ${messagePreview}` : null,
      ].filter(Boolean);
      const description = descriptionParts.join(' · ').slice(0, 4000) || 'נשלח מייל מממשק הצוות';

      await auditLogger.logAwait(req, {
        level: 'info',
        action: 'system',
        description,
        entityType: composeCandidateId ? 'Candidate' : null,
        entityId: composeCandidateId,
        entityName: composeCandidateName || null,
        metadata: {
          sendMessageModalEmail: true,
          from: fromName,
          to: resolvedToEmail,
          subject: String(subject || ''),
          notificationMessageId: savedMessage.id,
          providerMessageId: providerMessageId || null,
          templateId:
            tp.templateId != null && String(tp.templateId).trim() ? String(tp.templateId).trim() : null,
          jobId: tp.jobId != null && String(tp.jobId).trim() ? String(tp.jobId).trim() : null,
        },
      });
    };

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
        },
      });

      if (normalizedSkipSmtp) {
        await savedMessage.update({
          metadata: {
            ...(savedMessage.metadata || {}),
            deliveryStatus: 'in_app_only',
          },
        });
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

        await savedMessage.update({
          metadata: {
            ...(savedMessage.metadata || {}),
            deliveryStatus: 'sent',
            providerMessageId: result?.messageId || null,
          },
        });
      } catch (sendErr) {
        await savedMessage.update({
          metadata: {
            ...(savedMessage.metadata || {}),
            deliveryStatus: 'failed',
            deliveryError: sendErr?.message || String(sendErr),
          },
        });
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
 * Fill missing screening-CV mail fields from DB (jobs + job_candidate_screening) so email/notification
 * always mirror what the UI shows even if the client payload omits long text.
 */
const mergeScreeningCvPayloadFromDb = async (candidateId, rawBlock) => {
  const block = { ...rawBlock };
  const jobIdRaw = block.jobId != null ? String(block.jobId).trim() : '';
  const candId = candidateId != null ? String(candidateId).trim() : '';
  if (!candId || !jobIdRaw) {
    return block;
  }

  let jobRow;
  let screeningRow;
  try {
    [jobRow, screeningRow] = await Promise.all([
      Job.findByPk(jobIdRaw, {
        attributes: ['description', 'requirements', 'telephoneQuestions'],
      }),
      JobCandidateScreening.findOne({
        where: { candidateId: candId, jobId: jobIdRaw },
        attributes: ['screeningAnswers', 'telephoneImpression', 'internalOpinion'],
      }),
    ]);
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

/** POST body: { candidateId, attachOriginalCv?, attachSystemCvPdf?, systemCvPdfBase64?, sends: [...] } */
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
    const initialReferralWorkflowStatus = await defaultReferralWorkflowStatusForRecruiterClient(
      senderUserId,
      req.user?.clientId,
    );

    for (const rawBlock of sends) {
      const block = await mergeScreeningCvPayloadFromDb(candidateId, rawBlock);
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

      const subject = `קורות חיים — ${candLabel} | ${jobTitle || 'משרה'}${company ? ` — ${company}` : ''}`;
      const toEmailCombined = contactRows.map((r) => r.email).join(', ');

      const { detailsText, detailsHtml } = buildScreeningCvDetailsAppendix(block);
      const { textBlock: candContactText, htmlBlock: candContactHtml } =
        buildCandidateContactSectionForScreeningMail(candidate);

      const buildBodies = ({ email, name }) => {
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
        senderUserId: req?.user?.sub || req?.user?.id || null,
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

    // Audit: 'נשלח סטטוס מועמדים' — bulk candidate-status report dispatched
    if (results.length) {
      const namesLabel = results
        .map((r) => r.to)
        .filter(Boolean)
        .slice(0, 12)
        .join(', ');
      systemEventEmitter.emit(req, {
        ...SYSTEM_EVENTS.MAIL_STATUS_BULK,
        entityType: 'Job',
        entityId: candidateId,
        entityName: candidate?.fullName || null,
        params: { names: namesLabel || `${results.length} נמענים` },
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
    if (!c || !f.clientNames.includes(c)) return false;
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
 * Non-admins see screening CV rows sent by anyone in the same client (team), not only their own `senderUserId`.
 * @returns {Promise<{ category: string } & Record<string, unknown>>}
 */
async function buildScreeningCvReferralAccessWhere(req) {
  const where = { category: 'screening_cv' };
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
    const where = await buildScreeningCvReferralAccessWhere(req);

    const q0 = req.query || {};
    const wantsPagination =
      (q0.page != null && String(q0.page) !== '') || (q0.pageSize != null && String(q0.pageSize) !== '');
    const filterParams = parseScreeningCvReferralsQuery(q0, wantsPagination);

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
  send,
  sendScreeningCv,
  listScreeningCvReferrals,
  getScreeningCvReferralById,
  patchScreeningCvReferral,
  getNotificationMessages,
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
Candidate tag schema (from backend/src/models/CandidateTag.js):
- name (String)
- candidate_id (UUID, FK -> candidates.id)
- tag_id (UUID, FK -> tags.id)
- raw_type (role/skill/education/etc.)
- context (Core/Tool/Degree)
- is_current (boolean)
- is_in_summary (boolean)
- confidence_score (float)
- calculated_weight (float)
- final_score (float)
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

Output constraints:
- Return STRICT JSON (double quotes, no trailing commas).
- Do not wrap in \`\`\` fences.
`;

let resumePromptCache = null;
const getResumePromptTemplate = async () => {
  if (resumePromptCache) return resumePromptCache;
  try {
    const record = await promptService.getById('cv_parsing');
    const schemaJson = buildCandidateModelSchemaJsonForPrompt();
    const mobilityPicklist = await picklistService.formatCategoryValuesForLlmPrompt('mobility');
    const drivingPicklist = await picklistService.formatCategoryValuesForLlmPrompt('driving_license');
    let template = String(record.template || '');
    template = template.replace(/\$\{JSON\}/g, schemaJson).replace(/\$JSON/g, schemaJson);
    template = template.replace(/\$\{Mobility\}/g, mobilityPicklist);
    template = template.replace(/\$\{DrivingLicenses\}/g, drivingPicklist);
    resumePromptCache = { ...record, template };
  } catch (err) {
    console.warn('[emailController] cv_parsing prompt missing', err.message || err);
    resumePromptCache = null;
  }
  return resumePromptCache;
};

const parseResumeWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!resumeText || !String(resumeText).trim()) return null;
  const promptRecord = await getResumePromptTemplate();
  const systemPrompt = (promptRecord?.template?.replace('{candidate_tag}', getCandidateTagsSchemaText())) || buildAiResumePrompt(getCandidateTagsSchemaText());
  const raw = await sendChat({
    apiKey,
    systemPrompt,
    history: [{ role: 'user', text: resumeText.slice(0, 50000) }],
    message: resumeText,
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

  const aiFields = {
    fullName: aiResult.fullName || fallback.fullName || 'מועמד חדש',
    email: aiResult.email || fallback.email || null,
    phone: aiResult.phone || fallback.phone || null,
    address: aiResult.address || null,
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
    searchText: trimmed.slice(0, 50000),
  };

  const aiTags = Array.isArray(aiResult.tags) && aiResult.tags.length
    ? aiResult.tags
    : tags.map((name) => ({ name }));

  return { aiFields, aiTags, rawResult: aiResult };
};

