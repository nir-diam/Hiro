const { Op } = require('sequelize');
const Client = require('../models/Client');

const coerceString = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

const buildClientCreatePayload = (payload = {}) => {
  const meta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : {};

  const out = {
    name: coerceString(payload.name) || coerceString(payload.clientName) || 'Client',
    displayName: coerceString(payload.displayName) || coerceString(payload.name) || coerceString(payload.clientName),
    industry: coerceString(payload.industry),
    phone: coerceString(payload.phone),
    email: coerceString(payload.email),
    status: coerceString(payload.status),
    accountManager: coerceString(payload.accountManager),
    city: coerceString(payload.city),
    region: coerceString(payload.region),
    mainContactName: coerceString(payload.mainContactName),
    mainContactEmail: coerceString(payload.mainContactEmail),
    mainContactPhone: coerceString(payload.mainContactPhone),
    metadata: {
      ...meta,
      // keep commonly-used meta keys even if callers send them top-level
      website: meta.website ?? payload.website,
      address: meta.address ?? payload.address,
      contactRole: meta.contactRole ?? payload.contactRole,
      notes: meta.notes ?? payload.notes,
    },
  };
  if (payload.modules && typeof payload.modules === 'object' && !Array.isArray(payload.modules)) {
    out.modules = payload.modules;
  }
  const pkg = coerceString(payload.packageType);
  if (pkg) out.packageType = pkg;
  if (payload.isActive === true || payload.isActive === false) out.isActive = payload.isActive;
  const pc = coerceString(payload.primaryColor);
  if (pc) out.primaryColor = pc;
  const logo = coerceString(payload.logoUrl);
  if (logo !== undefined && payload.logoUrl != null) out.logoUrl = logo || null;
  const sms = coerceString(payload.smsSource);
  if (sms !== undefined && payload.smsSource != null) out.smsSource = sms || null;
  const ips = coerceString(payload.authorizedIps);
  if (ips !== undefined && payload.authorizedIps != null) out.authorizedIps = ips || null;
  if (payload.renewalDate) {
    const d = new Date(payload.renewalDate);
    if (!Number.isNaN(d.getTime())) out.renewalDate = d;
  }
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const cvT = n(payload.cvQuotaTotal);
  if (cvT !== undefined) out.cvQuotaTotal = cvT;
  const tagsT = n(payload.tagsQuotaTotal);
  if (tagsT !== undefined) out.tagsQuotaTotal = tagsT;
  const jobsT = n(payload.jobsTotal);
  if (jobsT !== undefined) out.jobsTotal = jobsT;
  const usersT = n(payload.usersTotal);
  if (usersT !== undefined) out.usersTotal = usersT;
  const smsTot = n(payload.smsTotal);
  if (smsTot !== undefined) out.smsTotal = smsTot;
  const emailsT = n(payload.emailsQuotaTotal);
  if (emailsT !== undefined) out.emailsQuotaTotal = emailsT;
  const storageT = n(payload.storageQuotaTotal);
  if (storageT !== undefined) out.storageQuotaTotal = storageT;
  const aiT = n(payload.aiCreditsQuotaTotal);
  if (aiT !== undefined) out.aiCreditsQuotaTotal = aiT;
  return out;
};

const buildClientUpdatePayload = (client, payload = {}) => {
  const incomingMeta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : null;
  const mergedMeta = incomingMeta ? { ...(client.metadata || {}), ...incomingMeta } : undefined;

  const out = { ...payload };
  if (mergedMeta) out.metadata = mergedMeta;
  return out;
};

const list = async (options = {}) => {
  const activeOnly = Boolean(options.activeOnly);
  const q = { order: [['name', 'ASC']] };
  if (activeOnly) {
    q.where = { isActive: true };
  }
  return Client.findAll(q);
};

const getById = async (id) => {
  const client = await Client.findByPk(id);
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  return client;
};

const create = async (payload) => {
  const clean = buildClientCreatePayload(payload);
  const client = await Client.create(clean);
  return client;
};

const update = async (id, payload) => {
  const client = await getById(id);
  const merged = buildClientUpdatePayload(client, payload);
  const allowed = new Set(Object.keys(Client.rawAttributes));
  const clean = {};
  for (const [k, v] of Object.entries(merged)) {
    if (!allowed.has(k) || k === 'id') continue;
    if (v === undefined) continue;
    clean[k] = v;
  }
  await client.update(clean);
  return client.reload();
};

const remove = async (id) => {
  const client = await getById(id);
  await client.destroy();
};

/** Map Job.client (free-text company label) to Client.id for templates / tenancy. */
const findIdByJobClientLabel = async (label) => {
  const t = String(label || '').trim();
  if (!t) return null;
  const row = await Client.findOne({
    where: {
      [Op.or]: [
        { name: t },
        { displayName: t },
        { name: { [Op.iLike]: t } },
        { displayName: { [Op.iLike]: t } },
      ],
    },
    attributes: ['id'],
  });
  return row ? row.id : null;
};

module.exports = { list, getById, create, update, remove, findIdByJobClientLabel };

