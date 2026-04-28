const { Op } = require('sequelize');
const MessageTemplate = require('../models/MessageTemplate');
const Client = require('../models/Client');
const emailService = require('./emailService');
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

const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

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
 * @param {{ templateKey: string; toEmail: string; placeholderValues?: string[]; fromEmail?: string | null; clientId?: string | null }} opts
 */
const sendScopedTemplateEmail = async ({
  name,
  toEmail,
  placeholderValues = [],
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
  const subject = applyNumberedPlaceholders(plain.subject, placeholderValues);
  const body = applyNumberedPlaceholders(plain.body, placeholderValues);

  const scopeTag = plain.scope === 'client' ? `client:${plain.clientId}` : 'admin';
  console.log(`[message-templates] send ${scopeTag} key="${key}" → ${toEmail} subject="${subject.slice(0, 60)}…"`);

  const result = await emailService.sendEmail({
    toEmail: String(toEmail).trim(),
    subject,
    text: body,
    html: `<div dir="rtl" style="white-space:pre-wrap;font-family:sans-serif;">${escapeHtml(body).replace(
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
 * @param {{ onlyIfNoResume?: boolean; clientId?: string | null; sendWelcomeEmail?: boolean }} options
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

  console.log('[message-templates] welcome queued', {
    candidateId: id,
    to: String(email).trim(),
    templateName: welcomeKey,
    clientId: clientId || null,
  });

  void sendScopedTemplateEmailOptional({
    name: welcomeKey,
    toEmail: String(email).trim(),
    placeholderValues: [displayName, dateStr],
    clientId,
  }).catch((err) => {
    console.error('[message-templates] welcome email failed', err?.message || err);
  });
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
  sendScopedTemplateEmail,
  sendScopedTemplateEmailOptional,
  sendAdminTemplateEmail,
  sendAdminTemplateEmailOptional,
  queueCandidateWelcomeEmail,
};
