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
const { uploadResumeForCandidate, fetchResumeText, buildParsedUpdates } = require('./candidateController');
const candidateTagService = require('../services/candidateTagService');
const promptService = require('../services/promptService');
const { sendChat } = require('../services/geminiService');
const User = require('../models/User');
const NotificationMessage = require('../models/NotificationMessage');
const { Op, Sequelize } = require('sequelize');

const supportedResumeExtensions = ['.pdf', '.doc', '.docx', '.rtf', '.txt'];
const supportedMimes = ['pdf', 'msword', 'officedocument', 'application/octet-stream'];

/**
 * SMTP profile: admin → HIRO_* / Resend; tenant «מימד אנושי» → HUMAND_*; else legacy SMTP_*.
 * Expects `authMiddleware` on `/send` so `req.user.sub` is set (no manual Authorization parsing).
 */
async function resolveEmailSenderSmtpContext(req) {
  return { userRole: null, clientName: null };

  
  const userId = req.user?.sub || req.user?.id;
  if (!userId) return { userRole: null, clientName: null };
  try {
    const user = await User.findByPk(userId, {
      attributes: ['role', 'clientId'],
      include: [{ model: Client, as: 'client', attributes: ['name', 'displayName'], required: false }],
    });
    if (!user) return { userRole: null, clientName: null };
    const c = user.client;
    const label = c ? String(c.displayName || c.name || '').trim() : '';
    return { userRole: user.role || null, clientName: label || null };
  } catch {
    return { userRole: null, clientName: null };
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

    const resumeAttachment = (parsed.attachments || []).find(isResumeAttachment);
    if (!resumeAttachment || !resumeAttachment.content) {
      console.warn('[email] no resume attachment found', {
        recordId: record.id,
        attachments: (parsed.attachments || []).map((att) => att.filename),
      });
      console.warn('[email] no resume attachment found', record.fileKey);
      return;
    }

    const fileBase64 = resumeAttachment.content.toString('base64');
    const filename = resumeAttachment.filename || `resume-${Date.now()}.bin`;
    const mimeType = resumeAttachment.contentType || 'application/octet-stream';

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

    let candidate = await candidateService.findByEmail(fromEmail);
    let candidateCreatedViaEmailIngest = false;
    if (!candidate) {
      const inferredName =
        fromAddress?.name?.trim() || fromEmail.split('@')[0] || 'מועמד חדש';
      candidate = await candidateService.create({
        email: fromEmail,
        fullName: inferredName,
        source: 'email',
      });
      candidateCreatedViaEmailIngest = true;
      console.log('[email] created new candidate', candidate.id);
    }

    const resumeUrl = await uploadResumeForCandidate(candidate.id, fileBase64, filename, mimeType);
    if (resumeUrl) {
      console.log('[email] resume uploaded', resumeUrl.slice(0, 60));
    const extraText = await fetchResumeText(resumeUrl, candidate.id);
    const parsedUpdates = buildParsedUpdates(candidate, extraText || '');
    if (Object.keys(parsedUpdates).length) {
      await candidateService.update(candidate.id, parsedUpdates);
    }
    const { aiFields, aiTags } = await deriveCandidateFieldsFromResume(extraText);
    if (aiFields && Object.keys(aiFields).length) {
      const safeAi = { ...aiFields };
      const envelopeEmail = candidate.email && String(candidate.email).includes('@');
      if (envelopeEmail && (!safeAi.email || !String(safeAi.email).includes('@'))) {
        delete safeAi.email;
      }
      await candidateService.update(candidate.id, safeAi);
    }
    if (aiTags.length) {
      await candidateTagService.syncTagsForCandidate(candidate.id, aiTags);
    }
    await candidateService.update(candidate.id, { source: 'email' });

    const association = await jobCandidateService.associateCandidateWithJob({
      jobId: resolvedJob?.id || null,
      candidateId: candidate.id,
      source: 'email',
    });
    console.log('[email] associated candidate with job', association?.id);
    await record.update({ candidateId: candidate.id, body: parsed.html?.trim() || parsed.text?.trim() || null });

      try {
        const fresh = await candidateService.getById(candidate.id);
        let welcomeClientId = null;
        if (resolvedJob?.client) {
          welcomeClientId = await clientService.findIdByJobClientLabel(resolvedJob.client);
        }
        console.log('[email] ingest template email queue (every successful CV-by-mail)', {
          candidateId: fresh?.id,
          newCandidateThisIngest: candidateCreatedViaEmailIngest,
          email: fresh?.email || null,
          source: fresh?.source,
          resolvedJobId: resolvedJob?.id || null,
          welcomeClientId,
          postingCode: postingCode || null,
        });
        messageTemplateService.queueCandidateWelcomeEmail(fresh, {
          clientId: welcomeClientId,
        });
      } catch (welcomeErr) {
        console.warn('[email] ingest template email queue failed', welcomeErr?.message || welcomeErr);
      }
    }
    console.log('[email] resume attached for candidate', candidate.id, record.fileKey);
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

function notificationVisibleToViewer(record, ctx) {
  if (!ctx) return false;
  const toEmail = String(record.toEmail || '').trim().toLowerCase();
  const assignee = String(record.assignee || '').trim().toLowerCase();
  if (ctx.emailNorm && toEmail === ctx.emailNorm) return true;
  if (ctx.emailNorm && assignee === ctx.emailNorm) return true;
  if (ctx.nameNorm && assignee === ctx.nameNorm) return true;
  return false;
}

const getNotificationMessages = async (req, res) => {
  try {
    const ctx = await resolveNotificationViewerContext(req);
    if (!ctx || !ctx.emailNorm) {
      res.set('Cache-Control', 'private, no-store');
      return res.json([]);
    }

    const trimmedLower = (col) =>
      Sequelize.fn('lower', Sequelize.fn('trim', Sequelize.col(col)));

    const orConditions = [
      Sequelize.where(trimmedLower('toEmail'), ctx.emailNorm),
      Sequelize.where(trimmedLower('assignee'), ctx.emailNorm),
    ];
    if (ctx.nameNorm) {
      orConditions.push(Sequelize.where(trimmedLower('assignee'), ctx.nameNorm));
    }

    const records = await NotificationMessage.findAll({
      where: {
        [Op.and]: [{ status: { [Op.ne]: 'deleted' } }, { [Op.or]: orConditions }],
      },
      order: [['createdAt', 'DESC']],
      limit: 500,
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json(records);
  } catch (error) {
    console.error('[email][getNotificationMessages]', error);
    return res.status(500).json({ message: 'Failed to load notification messages' });
  }
};

const updateNotificationMessageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const isUuid =
      typeof id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return res.status(400).json({ message: 'id must be a valid UUID' });
    }
    const allowedStatuses = new Set(['unread', 'tasks', 'archived', 'deleted']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ message: 'status must be one of unread/tasks/archived/deleted' });
    }

    const record = await NotificationMessage.findByPk(id);
    if (!record) {
      return res.status(404).json({ message: 'Notification message not found' });
    }

    const ctx = await resolveNotificationViewerContext(req);
    if (!ctx || !notificationVisibleToViewer(record, ctx)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await record.update({ status });
    return res.json(record);
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
    void processEmailUpload(record);
    return res.status(201).json(record);
  } catch (error) {
    console.error('Failed to save email upload', error);
    return res.status(500).json({ message: 'Could not persist upload' });
  }
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
    } = payload;

    console.log('[email][send] request received', {
      to: typeof to === 'string' ? to : undefined,
      toEmail: typeof toEmail === 'string' ? toEmail : undefined,
      subject: typeof subject === 'string' ? subject : undefined,
      hasText: typeof text === 'string' && text.trim().length > 0,
      hasHtml: typeof html === 'string' && html.trim().length > 0,
    });

    if (!subject) return res.status(400).json({ message: 'subject is required' });
    const bodyText = typeof text === 'string' ? text : undefined;

    const emailCandidate = String(toEmail || to || '').trim();
    if (!emailCandidate) return res.status(400).json({ message: 'recipient (to/toEmail) is required' });

    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailCandidate);
    let resolvedToEmail = emailCandidate;

    if (!isEmail) {
      console.log('[email][send] resolving recipient name -> user.email', {
        assigneeOrName: emailCandidate,
      });
      const user = await User.findOne({
        where: { name: { [Op.iLike]: `%${emailCandidate}%` } },
        attributes: ['email'],
      });
      if (!user?.email) {
        return res.status(404).json({ message: `No user.email found for assignee/name: ${emailCandidate}` });
      }
      resolvedToEmail = user.email;
    }

    console.log('[email][send] resolved recipient', {
      isEmail,
      resolvedToEmail,
    });

    const normalizedIsTask = Boolean(isTask);
    const normalizedMessageType = messageType === 'task' || normalizedIsTask ? 'task' : 'message';

    const savedMessage = await NotificationMessage.create({
      toEmail: resolvedToEmail,
      subject: String(subject || ''),
      text: typeof text === 'string' ? text : null,
      html: typeof html === 'string' ? html : null,
      messageType: normalizedMessageType,
      status: normalizedMessageType === 'task' ? 'tasks' : 'unread',
      isTask: normalizedIsTask,
      assignee: typeof assignee === 'string' ? assignee : null,
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

    const { userRole: smtpUserRole, clientName: smtpClientName } = await resolveEmailSenderSmtpContext(req);

    let result;
    try {
      result = await emailService.sendEmail({
        toEmail: resolvedToEmail,
        subject,
        text: bodyText || (typeof html === 'string' ? undefined : ''),
        html: typeof html === 'string' ? html : undefined,
        userRole: smtpUserRole,
        clientName: smtpClientName,
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

    console.log('[email][send] sendEmail succeeded', {
      messageId: result?.messageId || null,
      accepted: result?.accepted?.length || null,
      rejected: result?.rejected?.length || null,
      notificationMessageId: savedMessage?.id || null,
    });

    return res.json({
      ok: true,
      messageId: result?.messageId || null,
      notificationMessageId: savedMessage?.id || null,
    });
  } catch (err) {
    console.error('[email][send] send failed', {
      message: err?.message || err,
      name: err?.name,
      // Avoid dumping entire transporter/config to prevent leaking anything sensitive.
      stack: err?.stack,
    });
    return res.status(400).json({ message: err?.message || 'Failed to send email' });
  }
};

module.exports = { upload, getByCandidate, send, getNotificationMessages, updateNotificationMessageStatus };

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
    resumePromptCache = await promptService.getById('cv_parsing');
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

