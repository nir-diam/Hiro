const { Op } = require('sequelize');
const MessageTemplate = require('../models/MessageTemplate');
const Client = require('../models/Client');
const Job = require('../models/Job');
const emailService = require('./emailService');
const jobCandidateService = require('./jobCandidateService');
const clientUsageSettingService = require('./clientUsageSettingService');
const systemEventEmitter = require('../utils/systemEventEmitter');
const SYSTEM_EVENTS = require('../utils/systemEventCatalog');

const ALLOWED_CHANNELS = new Set(['email', 'sms', 'whatsapp']);

const normalizeChannels = (raw) => {
  if (!raw) return ['email'];
  const arr = Array.isArray(raw) ? raw : [];
  const out = [...new Set(arr.map((c) => String(c).toLowerCase()).filter((c) => ALLOWED_CHANNELS.has(c)))];
  return out.length ? out : ['email'];
};

const toRow = (t) => {
  const plain = t.get ? t.get({ plain: true }) : t;
  return {
    id: plain.id,
    templateKey: plain.templateKey || null,
    name: plain.name,
    subject: plain.subject,
    content: plain.body,
    channels: normalizeChannels(plain.channels),
    isSystem: !!plain.isSystem,
    lastUpdated: plain.updatedAt ? new Date(plain.updatedAt).toISOString() : null,
    updatedBy: plain.updatedByName || '',
  };
};

const toCatalogRow = (t) => {
  const plain = t.get ? t.get({ plain: true }) : t;
  const linked = plain.client || null;
  const base = toRow(t);
  return {
    ...base,
    scope: plain.scope,
    clientId: plain.clientId || null,
    clientName: linked
      ? String(linked.displayName || linked.name || linked.id || '').trim() || null
      : null,
  };
};

const listAdmin = async () => {
  const rows = await MessageTemplate.findAll({
    where: { scope: 'admin' },
    order: [['updatedAt', 'DESC']],
  });
  return rows.map(toRow);
};

const listByClient = async (clientId) => {
  const rows = await MessageTemplate.findAll({
    where: { scope: 'client', clientId },
    order: [['updatedAt', 'DESC']],
  });
  return rows.map(toRow);
};

/** Super-admin: all Hiro (admin) templates + every tenant's client templates */
const listAllCatalog = async () => {
  const rows = await MessageTemplate.findAll({
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'displayName'],
        required: false,
      },
    ],
    order: [
      ['scope', 'ASC'],
      ['updatedAt', 'DESC'],
    ],
  });
  return rows.map(toCatalogRow);
};

const findScoped = async (id, scope, clientId) => {
  const where = { id, scope };
  if (scope === 'client') where.clientId = clientId;
  return MessageTemplate.findOne({ where });
};

const findByPkWithClient = async (id) =>
  MessageTemplate.findByPk(id, {
    include: [
      {
        model: Client,
        as: 'client',
        attributes: ['id', 'name', 'displayName'],
        required: false,
      },
    ],
  });

/**
 * Super-admin catalog create: scope 'admin' => client_id null; scope 'client' => body.clientId required
 */
const createCatalog = async (payload, user) => {
  const scope = String(payload.scope || '').toLowerCase();
  if (scope !== 'admin' && scope !== 'client') {
    const err = new Error('scope must be admin or client');
    err.status = 400;
    throw err;
  }
  if (scope === 'admin') {
    return createAdmin(payload, user);
  }
  const clientId = payload.clientId;
  if (!clientId) {
    const err = new Error('clientId is required for client templates');
    err.status = 400;
    throw err;
  }
  const client = await Client.findByPk(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  return createClient(clientId, payload, user);
};

const updateByIdAny = async (id, payload, user) => {
  const row = await findByPkWithClient(id);
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  const scope = row.scope;
  const clientId = scope === 'client' ? row.clientId : null;
  return update(id, scope, clientId, payload, user);
};

const removeByIdAny = async (id) => {
  const row = await MessageTemplate.findByPk(id);
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  const scope = row.scope;
  const clientId = scope === 'client' ? row.clientId : null;
  return remove(id, scope, clientId);
};

const createAdmin = async (payload, user) => {
  const { name, subject, content, body, channels, templateKey } = payload;
  const text = content ?? body;
  if (!name || !subject || !text) {
    const err = new Error('name, subject and content are required');
    err.status = 400;
    throw err;
  }
  const row = await MessageTemplate.create({
    scope: 'admin',
    clientId: null,
    templateKey: templateKey ? String(templateKey).trim().slice(0, 128) || null : null,
    name: String(name).trim(),
    subject: String(subject).trim(),
    body: String(text),
    channels: normalizeChannels(channels),
    isSystem: false,
    updatedByUserId: user.id,
    updatedByName: user.name || user.email || null,
  });
  return toRow(row);
};

const createClient = async (clientId, payload, user) => {
  const { name, subject, content, body, channels, templateKey } = payload;
  const text = content ?? body;
  if (!name || !subject || !text) {
    const err = new Error('name, subject and content are required');
    err.status = 400;
    throw err;
  }
  const row = await MessageTemplate.create({
    scope: 'client',
    clientId,
    templateKey: templateKey ? String(templateKey).trim().slice(0, 128) || null : null,
    name: String(name).trim(),
    subject: String(subject).trim(),
    body: String(text),
    channels: normalizeChannels(channels),
    isSystem: false,
    updatedByUserId: user.id,
    updatedByName: user.name || user.email || null,
  });
  return toRow(row);
};

const update = async (id, scope, clientId, payload, user) => {
  const row = await findScoped(id, scope, clientId);
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  const { name, subject, content, body, channels, templateKey } = payload;
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (subject !== undefined) updates.subject = String(subject).trim();
  const text = content !== undefined ? content : body;
  if (text !== undefined) updates.body = String(text);
  if (channels !== undefined) updates.channels = normalizeChannels(channels);
  if (templateKey !== undefined && !row.isSystem) {
    updates.templateKey = templateKey ? String(templateKey).trim().slice(0, 128) : null;
  }
  updates.updatedByUserId = user.id;
  updates.updatedByName = user.name || user.email || null;
  await row.update(updates);
  return toRow(row);
};

const remove = async (id, scope, clientId) => {
  const row = await findScoped(id, scope, clientId);
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  if (row.isSystem) {
    const err = new Error('System templates cannot be deleted');
    err.status = 403;
    throw err;
  }
  await row.destroy();
};

/**
 * Resolve rendered template for sending (used by email flows later).
 */
const getByKeyOrFail = async ({ scope, clientId, name }) => {
  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const where = { scope, name: String(name).trim() };
  if (scope === 'client') where.clientId = clientId;
  const row = await MessageTemplate.findOne({ where });
  if (!row) {
    const err = new Error('Template not found');
    err.status = 404;
    throw err;
  }
  return row.get({ plain: true });
};

/**
 * Replace {1}, {2}, … with values[0], values[1], … — use in subject + body.
 */
const applyNumberedPlaceholders = (template, values) => {
  let out = String(template || '');
  const arr = Array.isArray(values) ? values : [];
  for (let i = 0; i < arr.length; i += 1) {
    out = out.replace(new RegExp(`\\{${i + 1}\\}`, 'g'), String(arr[i] ?? ''));
  }
  return out;
};

/** Same logical tokens as `frontend/services/messageTemplatePlaceholders.ts` — `{candidate_first_name}`, etc. */
const MESSAGE_TEMPLATE_NAMED_KEYS = [
  'candidate_first_name',
  'candidate_last_name',
  'candidate_phone',
  'candidate_email',
  'candidate_cv_link',
  'candidate_id',
  'job_referrals',
  'company_name',
  'client_name',
  'contact_name',
  'contact_phone',
  'contact_email',
  'job_title',
  'job_description',
  'job_requirements',
  'recruiter_name',
  'recruiter_email',
  'recruiter_phone',
  'send_date',
  'privacy_policy_link',
  'thank_you_page_link',
];

const escapeRegExp = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches `{token}` or `{ token }` (ASCII braces only — trims spaces inside braces). */
const placeholderTokenRegex = (key) =>
  new RegExp(`\\{\\s*${escapeRegExp(key)}\\s*\\}`, 'g');

/**
 * Replace `{token}` for known keys; unknown `{foo}` left unchanged.
 * @param {string} template
 * @param {Record<string, string>} map
 */
const applyNamedPlaceholders = (template, map) => {
  let out = String(template || '');
  const safe = map && typeof map === 'object' ? map : {};
  for (const key of MESSAGE_TEMPLATE_NAMED_KEYS) {
    const re = placeholderTokenRegex(key);
    const val = safe[key] != null ? String(safe[key]) : '';
    out = out.replace(re, val);
  }
  return out;
};

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlAttr = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Tokens rendered as `<a href>` in HTML bodies when URL is http(s). */
const LINK_PLACEHOLDER_KEYS = new Set([
  'candidate_cv_link',
  'privacy_policy_link',
  'thank_you_page_link',
]);

const LINK_LABEL_HE = {
  candidate_cv_link: 'קורות חיים',
  privacy_policy_link: 'מדיניות פרטיות',
  thank_you_page_link: 'דף תודה',
};

const applyNumberedPlaceholdersHtml = (template, values) => {
  let out = String(template || '');
  const arr = Array.isArray(values) ? values : [];
  for (let i = 0; i < arr.length; i += 1) {
    out = out.replace(new RegExp(`\\{${i + 1}\\}`, 'g'), escapeHtml(String(arr[i] ?? '')));
  }
  return out;
};

/**
 * Like `applyNamedPlaceholders` but escapes plain text; known URL tokens become clickable links.
 */
const applyNamedPlaceholdersHtml = (template, map) => {
  let out = String(template || '');
  const safe = map && typeof map === 'object' ? map : {};
  for (const key of MESSAGE_TEMPLATE_NAMED_KEYS) {
    const re = placeholderTokenRegex(key);
    const val = safe[key] != null ? String(safe[key]) : '';
    if (LINK_PLACEHOLDER_KEYS.has(key)) {
      const url = val.trim();
      const replacement =
        url && /^https?:\/\//i.test(url)
          ? `<a href="${escapeHtmlAttr(url)}">${LINK_LABEL_HE[key] || 'קישור'}</a>`
          : escapeHtml(val);
      out = out.replace(re, replacement);
    } else {
      out = out.replace(re, escapeHtml(val));
    }
  }
  return out;
};

function splitFullName(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return { first: '', last: '' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function formatLinkedJobsSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const lines = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const job = row.job && typeof row.job === 'object' ? row.job : {};
    const title = String(job.title || '').trim() || 'משרה';
    const client = String(job.client || '').trim();
    const status = String(row.status || '').trim();
    const bit = [title, client ? `(${client})` : '', status ? `— ${status}` : ''].filter(Boolean).join(' ');
    if (bit) lines.push(bit);
  }
  return lines.join('\n');
}

function formatRequirements(job) {
  if (!job || typeof job !== 'object') return '';
  const req = job.requirements;
  if (Array.isArray(req)) {
    return req.map((x) => String(x ?? '').trim()).filter(Boolean).join('\n');
  }
  if (typeof req === 'string') return String(req).trim();
  return '';
}

function firstContactFromJob(job) {
  const raw = job && job.contacts;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const c = raw[0];
  if (!c || typeof c !== 'object') return null;
  return {
    name: String(c.name || '').trim(),
    phone: String(c.phone || c.mobile || c.telephone || '').trim(),
    email: String(c.email || '').trim(),
  };
}

function pickRecruiterDisplay(job) {
  if (!job || typeof job !== 'object') return '';
  return (
    String(job.recruiter || '').trim() ||
    String(job.recruitingCoordinator || '').trim() ||
    String(job.accountManager || '').trim()
  );
}

function firstEnvUrl(...keys) {
  for (const key of keys) {
    const v = String(process.env[key] || '').trim();
    if (v) return v;
  }
  return '';
}

/**
 * Build `{candidate_*}` etc. from a candidate row (Sequelize instance or plain).
 * Uses linked `job_candidates` rows when present; optional `ctx.jobId` loads a job if there are no links yet.
 * Optional `ctx.recruiter` fills `{recruiter_*}` (acting staff user — overrides job fields when set).
 * @param {object} cand
 * @param {{ jobId?: string|null; recruiter?: { name?: string; email?: string; phone?: string }|null }} [ctx]
 * @returns {Promise<Record<string, string>>}
 */
async function buildNamedPlaceholdersFromCandidate(cand, ctx = {}) {
  const plain =
    cand && typeof cand.get === 'function'
      ? cand.get({ plain: true })
      : cand && typeof cand === 'object'
        ? cand
        : {};

  const id = plain.id != null && String(plain.id).trim() ? String(plain.id).trim() : '';

  const hintJobId =
    ctx && ctx.jobId != null && String(ctx.jobId).trim() ? String(ctx.jobId).trim() : '';

  const firstFromDb = String(plain.firstName ?? '').trim();
  const lastFromDb = String(plain.lastName ?? '').trim();
  const fullFromDb = String(plain.fullName ?? plain.name ?? '').trim();
  const splitDb = fullFromDb ? splitFullName(fullFromDb) : { first: '', last: '' };

  let links = [];
  if (id) {
    try {
      links = await jobCandidateService.listForCandidate(id);
    } catch (e) {
      console.warn('[message-templates] linked jobs for named placeholders failed:', e?.message || e);
    }
  }

  const usableLinks = links.filter((row) => row.job && row.job.id);

  let primaryJob = null;
  if (usableLinks.length) {
    primaryJob = usableLinks[0].job;
  } else if (hintJobId) {
    try {
      const row = await Job.findByPk(hintJobId);
      primaryJob = row ? row.get({ plain: true }) : null;
    } catch (e) {
      console.warn('[message-templates] hint jobId load failed:', e?.message || e);
    }
  }

  let jobReferrals = formatLinkedJobsSummary(usableLinks.length ? usableLinks : links);
  if (!String(jobReferrals || '').trim() && primaryJob) {
    jobReferrals = formatLinkedJobsSummary([{ job: primaryJob, status: '' }]);
  }

  const sendDate = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'long',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());

  const privacy = firstEnvUrl(
    'PRIVACY_POLICY_LINK',
    'PRIVACY_POLICY_URL',
    'VITE_PRIVACY_POLICY_URL',
  );
  const thankYou = firstEnvUrl(
    'THANK_YOU_PAGE_LINK',
    'THANK_YOU_PAGE_URL',
    'VITE_THANK_YOU_PAGE_URL',
  );

  const clientLabel = primaryJob ? String(primaryJob.client || '').trim() : '';
  const contact = primaryJob ? firstContactFromJob(primaryJob) : null;

  const base = {
    candidate_first_name: firstFromDb || splitDb.first,
    candidate_last_name: lastFromDb || splitDb.last,
    candidate_phone: String(plain.phone ?? '').trim(),
    candidate_email: String(plain.email ?? '').trim(),
    candidate_cv_link: String(plain.resumeUrl ?? '').trim(),
    /** National ID only — matches UI label "תעודת זהות" (`messageTemplatePlaceholders.ts`). */
    candidate_id: String(plain.idNumber ?? '').trim(),
    job_referrals: jobReferrals,
    company_name: clientLabel,
    client_name: clientLabel,
    contact_name: contact ? contact.name : '',
    contact_phone: contact ? contact.phone : '',
    contact_email: contact ? contact.email : '',
    job_title: primaryJob ? String(primaryJob.title || '').trim() : '',
    job_description: primaryJob
      ? String(primaryJob.description ?? primaryJob.PublicDescription ?? '').trim()
      : '',
    job_requirements: primaryJob ? formatRequirements(primaryJob) : '',
    recruiter_name: pickRecruiterDisplay(primaryJob),
    recruiter_email: '',
    recruiter_phone: '',
    send_date: sendDate,
    privacy_policy_link: privacy,
    thank_you_page_link: thankYou,
  };

  const rec = ctx && ctx.recruiter && typeof ctx.recruiter === 'object' ? ctx.recruiter : null;
  if (rec) {
    const n = String(rec.name ?? '').trim();
    const e = String(rec.email ?? '').trim();
    const p = String(rec.phone ?? '').trim();
    if (n) base.recruiter_name = n;
    if (e) base.recruiter_email = e;
    if (p) base.recruiter_phone = p;
  }

  return base;
}

const findTemplateRowForSend = async (name, clientId) => {
  const key = String(name || '').trim();
  if (!key) return null;
  const tryClient = async () => {
    if (!clientId) return null;
    let r = await MessageTemplate.findOne({
      where: { scope: 'client', clientId, name: key },
    });
    if (!r) {
      r = await MessageTemplate.findOne({
        where: { scope: 'client', clientId, name: { [Op.iLike]: key } },
      });
    }
    return r;
  };
  const tryAdmin = async () => {
    let r = await MessageTemplate.findOne({
      where: { scope: 'admin', name: key },
    });
    if (!r) {
      r = await MessageTemplate.findOne({
        where: { scope: 'admin', name: { [Op.iLike]: key } },
      });
    }
    return r;
  };
  const clientRow = await tryClient();
  if (clientRow) return clientRow;
  return tryAdmin();
};

/**
 * Load tenant template (if clientId + row exists) else admin; send via Hiro lane.
 * @param {{ name: string; toEmail: string; placeholderValues?: string[]; namedPlaceholders?: Record<string, string>|null; candidateRecord?: object|null; placeholderContext?: { jobId?: string|null; recruiter?: { name?: string; email?: string; phone?: string }|null }|null; fromEmail?: string|null; clientId?: string|null }} opts
 */
const sendScopedTemplateEmail = async ({
  name,
  toEmail,
  placeholderValues = [],
  namedPlaceholders = null,
  candidateRecord = null,
  placeholderContext = null,
  fromEmail = null,
  clientId = null,
}) => {
  const key = String(name || '').trim();
  if (!key) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (!toEmail || !String(toEmail).includes('@')) {
    const err = new Error('Valid toEmail is required');
    err.status = 400;
    throw err;
  }

  const row = await findTemplateRowForSend(key, clientId);
  if (!row) {
    const keys = await MessageTemplate.findAll({
      where: { scope: 'admin' },
      attributes: ['name'],
      raw: true,
    });
    const found = keys.map((k) => k.name).filter(Boolean);
    console.warn(
      `[message-templates] name="${key}" not found (clientId=${clientId || '—'}). Admin keys:`,
      found.length ? found.join(', ') : '(none)',
    );
    const err = new Error(`Template not found: ${key}`);
    err.status = 404;
    throw err;
  }

  const plain = row.get({ plain: true });

  let namedMap = {};
  if (candidateRecord) {
    namedMap = await buildNamedPlaceholdersFromCandidate(
      candidateRecord,
      placeholderContext && typeof placeholderContext === 'object' ? placeholderContext : {},
    );
  }
  if (namedPlaceholders && typeof namedPlaceholders === 'object') {
    namedMap = { ...namedMap, ...namedPlaceholders };
  }

  let subject = applyNumberedPlaceholders(plain.subject, placeholderValues);
  let body = applyNumberedPlaceholders(plain.body, placeholderValues);
  subject = applyNamedPlaceholders(subject, namedMap);
  body = applyNamedPlaceholders(body, namedMap);

  let bodyHtml = applyNumberedPlaceholdersHtml(plain.body, placeholderValues);
  bodyHtml = applyNamedPlaceholdersHtml(bodyHtml, namedMap);

  const scopeTag = plain.scope === 'client' ? `client:${plain.clientId}` : 'admin';
  console.log(`[message-templates] send ${scopeTag} key="${key}" → ${toEmail} subject="${subject.slice(0, 60)}…"`);

  const result = await emailService.sendEmail({
    toEmail: String(toEmail).trim(),
    subject,
    text: body,
    html: `<div dir="rtl" style="white-space:pre-wrap;font-family:sans-serif;">${bodyHtml.replace(
      /\n/g,
      '<br/>',
    )}</div>`,
    fromEmail: fromEmail || undefined,
    userRole: 'admin',
    clientName: null,
  });

  console.log(`[message-templates] sent key="${key}" providerMessageId=${result?.messageId || result?.id || 'n/a'}`);

  // Audit: 'נשלח דיוור' — automated template email was sent.
  systemEventEmitter.emit(null, {
    ...SYSTEM_EVENTS.MAIL_SENT,
    entityType: 'Candidate',
    entityId: null,
    entityName: toEmail,
    params: { email: key },
  });

  return result;
};

const sendScopedTemplateEmailOptional = async (opts) => {
  try {
    return await sendScopedTemplateEmail(opts);
  } catch (err) {
    const status = err && err.status;
    const msg = err && err.message;
    if (status === 404 || (msg && String(msg).toLowerCase().includes('not found'))) {
      console.warn('[message-templates] optional send skipped:', msg || err);
      return null;
    }
    throw err;
  }
};

/** Admin scope only (ignores any clientId on opts). */
const sendAdminTemplateEmail = async (opts) =>
  sendScopedTemplateEmail({ ...opts, clientId: null });

const sendAdminTemplateEmailOptional = async (opts) =>
  sendScopedTemplateEmailOptional({ ...opts, clientId: null });

/**
 * Fire-and-forget welcome template: client row when `options.clientId` and a `welcome_email`
 * (or CANDIDATE_WELCOME_TEMPLATE_KEY) exists for that tenant; otherwise admin catalog.
 *
 * Gating order:
 *   1. `options.sendWelcomeEmail === false` (per-request) → skip.
 *   2. Missing record / email / onlyIfNoResume guards → skip.
 *   3. Client Usage "מייל התחברות" (`autoThanksEmail`) setting:
 *        • flag `false` → skip
 *        • flag `true`  → send
 *        • unresolved (no clientId or lookup failure) → send (legacy fallthrough)
 *
 * @param {{ onlyIfNoResume?: boolean; clientId?: string | null; sendWelcomeEmail?: boolean; jobId?: string | null; recruiter?: object }} options
 */
const queueCandidateWelcomeEmail = (record, options = {}) => {
  if (options.sendWelcomeEmail === false) {
    console.log('[message-templates] welcome skipped: sendWelcomeEmail false');
    return;
  }
  const id = record?.id || '(no-id)';
  if (!record) {
    console.log('[message-templates] welcome skipped: no record');
    return;
  }
  const email = record.email;
  if (!email || !String(email).includes('@')) {
    console.log('[message-templates] welcome skipped: missing/invalid email', {
      candidateId: id,
      email: email ?? null,
    });
    return;
  }
  if (options.onlyIfNoResume && record.resumeUrl) {
    console.log('[message-templates] welcome skipped: onlyIfNoResume and resumeUrl set', {
      candidateId: id,
    });
    return;
  }

  const displayName =
    String(record.fullName || record.name || email || '').trim() || 'מועמד';
  const dateStr = new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'long',
    timeZone: 'Asia/Jerusalem',
  }).format(new Date());
  const welcomeKey =
    String(process.env.CANDIDATE_WELCOME_TEMPLATE_KEY || '').trim() || 'welcome_email';
  const clientId = options.clientId || null;

  // Gate on the client's autoThanksEmail setting + dispatch (kept fire-and-forget
  // so callers don't need to await; matches the previous void semantics).
  void (async () => {
    if (clientId) {
      const enabled = await clientUsageSettingService.getAutoThanksEmailForClient(clientId);
      if (enabled === false) {
        console.log('[message-templates] welcome skipped: autoThanksEmail disabled', {
          candidateId: id,
          clientId,
        });
        return;
      }
    }

    console.log('[message-templates] welcome queued', {
      candidateId: id,
      to: String(email).trim(),
      templateName: welcomeKey,
      clientId: clientId || null,
    });

    try {
      await sendScopedTemplateEmailOptional({
        name: welcomeKey,
        toEmail: String(email).trim(),
        placeholderValues: [displayName, dateStr],
        candidateRecord: record,
        placeholderContext: {
          jobId:
            options.jobId != null && String(options.jobId).trim()
              ? String(options.jobId).trim()
              : null,
          recruiter:
            options.recruiter && typeof options.recruiter === 'object'
              ? options.recruiter
              : null,
        },
        clientId,
      });
    } catch (err) {
      console.error('[message-templates] welcome email failed', err?.message || err);
    }
  })();
};

module.exports = {
  normalizeChannels,
  toRow,
  toCatalogRow,
  listAdmin,
  listByClient,
  listAllCatalog,
  createAdmin,
  createClient,
  createCatalog,
  update,
  updateByIdAny,
  remove,
  removeByIdAny,
  findByPkWithClient,
  getByKeyOrFail,
  applyNumberedPlaceholders,
  applyNamedPlaceholders,
  buildNamedPlaceholdersFromCandidate,
  sendScopedTemplateEmail,
  sendScopedTemplateEmailOptional,
  sendAdminTemplateEmail,
  sendAdminTemplateEmailOptional,
  queueCandidateWelcomeEmail,
};
