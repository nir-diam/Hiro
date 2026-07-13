const { Op } = require('sequelize');
const Client = require('../models/Client');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const organizationService = require('./organizationService');
const clientOrganizationSyncService = require('./clientOrganizationSyncService');

const isPlatformAdmin = (dbUser) =>
  dbUser?.role === 'super_admin' || dbUser?.role === 'admin';

const isClientManager = (dbUser) => dbUser?.role === 'manager';

const isClientTenantStaff = (dbUser) =>
  Boolean(dbUser?.clientId) && !isPlatformAdmin(dbUser);

const coerceString = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

const coerceStringArray = (v) => {
  if (!Array.isArray(v)) return undefined;
  const clean = v.map((item) => String(item || '').trim()).filter(Boolean);
  return clean.length ? clean : undefined;
};

const buildClientCreatePayload = (payload = {}) => {
  const meta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : {};
  const mainField = coerceString(payload.mainField) || coerceString(payload.industry);
  const mainField2 = coerceStringArray(payload.mainField2) ?? coerceStringArray(meta.mainField2);
  const subField = coerceStringArray(payload.subField) ?? coerceStringArray(meta.subField);
  const secondaryField = coerceString(payload.secondaryField) ?? coerceString(meta.secondaryField);

  const out = {
    name: coerceString(payload.name) || coerceString(payload.clientName) || 'Client',
    displayName: coerceString(payload.displayName) || coerceString(payload.name) || coerceString(payload.clientName),
    industry: mainField,
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
      ...(mainField ? { mainField } : {}),
      ...(mainField2 ? { mainField2 } : {}),
      ...(subField ? { subField } : {}),
      ...(secondaryField ? { secondaryField } : {}),
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
  const domain = coerceString(payload.domain);
  if (domain !== undefined && payload.domain != null) out.domain = domain || null;
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

/**
 * Platform admin: optionally link to existing org only (no OrganizationTmp staging).
 * Manager / staff: not used on client create.
 */
const attachOrganizationAfterCreate = async (client, payload = {}, options = {}) => {
  if (!client?.id) return client;
  if (options.skipOrganizationStaging) return client;

  const linkedId = coerceString(payload.linkedOrganizationId) || coerceString(payload.organizationId);
  if (linkedId) {
    const linked = await clientOrganizationSyncService.linkClientToOrganization(client.id, linkedId);
    if (linked) return linked;
  }

  return client;
};

/**
 * Client manager: link existing Organization or stage OrganizationTmp for their tenant client.
 * Does not create a new Client row.
 */
const linkOrganizationForClient = async (clientId, payload = {}) => {
  const client = await getById(clientId);
  const linkedId = coerceString(payload.linkedOrganizationId) || coerceString(payload.organizationId);

  if (linkedId) {
    return clientOrganizationSyncService.linkClientToOrganization(clientId, linkedId, { fullSync: true });
  }

  const patch = buildClientCreatePayload(payload);
  const clientUpdates = {};
  if (patch.industry) clientUpdates.industry = patch.industry;
  if (patch.phone) clientUpdates.phone = patch.phone;
  if (patch.logoUrl != null) clientUpdates.logoUrl = patch.logoUrl;
  if (patch.metadata) {
    clientUpdates.metadata = { ...(client.metadata || {}), ...patch.metadata };
  }
  if (Object.keys(clientUpdates).length) {
    await client.update(clientUpdates);
  }

  const tmp = await organizationService.stageOrganizationFromClientCreate({
    ...payload,
    clientId,
    name: payload.name || client.name,
  });

  if (tmp?.id) {
    await clientOrganizationSyncService.ensureOrganizationTmpLink(clientId, tmp.id, { isPrimary: true });
    return client.reload();
  }

  return client;
};

const getByIdWithLinks = async (id) => {
  const client = await getById(id);
  const links = await clientOrganizationSyncService.listLinksForClient(id);
  const json = client.toJSON ? client.toJSON() : { ...client.get() };
  json.organizationLinks = links.map((l) => (l.toJSON ? l.toJSON() : l));
  return json;
};

/** ClientOrganizationLink rows with Organization / OrganizationTmp included. */
const listLinkedOrganizationsForClient = async (clientId) => {
  await getById(clientId);
  const rows = await ClientOrganizationLink.findAll({
    where: { clientId },
    include: [
      { model: Organization, as: 'organization', required: false },
      { model: OrganizationTmp, as: 'organizationTmp', required: false },
    ],
    order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
  });
  return rows.map((row) => (row.toJSON ? row.toJSON() : row.get()));
};

const assertCanAccessClientOrganizations = (actor, clientId) => {
  if (!actor) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  if (isPlatformAdmin(actor)) return;
  if (actor.clientId && String(actor.clientId) === String(clientId)) return;
  const err = new Error('Forbidden');
  err.status = 403;
  throw err;
};

const unlinkOrganizationFromClient = async (clientId, linkId, actor) => {
  assertCanAccessClientOrganizations(actor, clientId);
  const row = await ClientOrganizationLink.findOne({
    where: { id: linkId, clientId },
  });
  if (!row) {
    const err = new Error('Organization link not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return true;
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

module.exports = {
  list,
  getById,
  getByIdWithLinks,
  create,
  update,
  remove,
  findIdByJobClientLabel,
  attachOrganizationAfterCreate,
  linkOrganizationForClient,
  listLinkedOrganizationsForClient,
  unlinkOrganizationFromClient,
  assertCanAccessClientOrganizations,
  isPlatformAdmin,
  isClientManager,
  isClientTenantStaff,
};

