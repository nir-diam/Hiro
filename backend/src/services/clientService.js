const { Op } = require('sequelize');
const Client = require('../models/Client');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const organizationService = require('./organizationService');
const organizationClientLinkPipelineService = require('./organizationClientLinkPipelineService');
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

/**
 * Defensive helper: if a client's displayName was corrupted by a previous org-sync bug
 * (detectable by metadata.organizationSyncedAt being set), clear it from the serialised
 * response so the client's own `name` field is used instead.
 * This does NOT write back to the DB — run the SQL migration to permanently fix rows:
 *   UPDATE clients SET display_name = NULL
 *   WHERE metadata->>'organizationSyncedAt' IS NOT NULL AND display_name IS NOT NULL;
 */
const sanitizeClientDisplayName = (client) => {
  const plain = client && typeof client.get === 'function' ? client.get({ plain: true }) : client;
  if (!plain) return plain;
  const meta = plain.metadata;
  // If this row was synced from an org, and displayName differs from name, it was likely corrupted.
  if (meta?.organizationSyncedAt && plain.displayName && plain.displayName !== plain.name) {
    return { ...plain, displayName: null };
  }
  return plain;
};

/** Large JSONB columns — kept in DB for journal/history but omitted from GET /api/clients/:id. */
const CLIENT_API_EXCLUDE = ['events', 'documents', 'users', 'finance'];

const ORG_LINK_SUMMARY_ATTRIBUTES = [
  'id',
  'name',
  'nameEn',
  'legalName',
  'mainField',
  'mainField2',
  'subField',
  'secondaryField',
  'employeeCount',
  'type',
  'website',
  'logo',
  'address',
  'phone',
  'location',
  'description',
  'snippet',
  'structure',
  'businessModel',
  'productType',
  'activityStatus',
];

const clientToApiJson = (client) => {
  if (!client) return client;
  const plain = sanitizeClientDisplayName(
    client.toJSON ? client.toJSON() : (typeof client.get === 'function' ? client.get({ plain: true }) : client),
  );
  if (!plain || typeof plain !== 'object') return plain;
  for (const key of CLIENT_API_EXCLUDE) {
    if (key in plain) delete plain[key];
  }
  return plain;
};

const list = async (options = {}) => {
  const activeOnly = Boolean(options.activeOnly);
  const q = {
    order: [['name', 'ASC']],
    attributes: { exclude: CLIENT_API_EXCLUDE },
  };
  if (activeOnly) {
    q.where = { isActive: true };
  }
  const rows = await Client.findAll(q);
  return rows.map(sanitizeClientDisplayName);
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

const CLIENT_BY_ID_CACHE_MS = 30_000;
/** @type {Map<string, { at: number, data: Record<string, unknown> }>} */
const clientByIdApiCache = new Map();

const invalidateClientApiCache = (id) => {
  const key = String(id || '').trim();
  if (key) clientByIdApiCache.delete(key);
};

/** Slim client row for HTTP API (no events journal blob / embedded documents). */
const getByIdForApi = async (id, { skipCache = false } = {}) => {
  const key = String(id || '').trim();
  if (!key) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  if (!skipCache) {
    const hit = clientByIdApiCache.get(key);
    if (hit && Date.now() - hit.at < CLIENT_BY_ID_CACHE_MS) {
      return hit.data;
    }
  }
  const client = await Client.findByPk(key, {
    attributes: { exclude: CLIENT_API_EXCLUDE },
  });
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const data = clientToApiJson(client);
  clientByIdApiCache.set(key, { at: Date.now(), data });
  return data;
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
  const companyName = coerceString(payload.name) || client?.name || '';

  console.log('[orgLinkPipeline] linkOrganizationForClient called', {
    clientId,
    companyName,
    linkedOrganizationId: linkedId || null,
    mode: linkedId ? 'link_existing' : 'new_company',
  });

  if (linkedId) {
    console.log(`[orgLinkPipeline] linking client ${clientId} to existing org ${linkedId}`);
    await clientOrganizationSyncService.linkClientToOrganization(clientId, linkedId, { fullSync: true });
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationId = linkedId;
    console.log(`[orgLinkPipeline] ✓ linked client ${clientId} → org ${linkedId}`);
    return json;
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

  const pipelineResult = await organizationClientLinkPipelineService.processNewCompanyForClientLink({
    ...payload,
    clientId,
    name: payload.name || client.name,
  });

  if (pipelineResult?.organization?.id) {
    const orgId = String(pipelineResult.organization.id);
    console.log(`[orgLinkPipeline] linking client ${clientId} to new org ${orgId} (post-enrichment)`);
    await clientOrganizationSyncService.linkClientToOrganization(clientId, orgId, { fullSync: true });
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationId = orgId;
    json.orgPipeline = pipelineResult.orgPipeline || null;
    console.log(`[orgLinkPipeline] ✓ client ${clientId} linked to enriched org ${orgId}`, json.orgPipeline);
    return json;
  }

  const tmp = pipelineResult?.organizationTmp;
  if (tmp?.id) {
    console.log(`[orgLinkPipeline] linking client ${clientId} to OrganizationTmp ${tmp.id}`);
    await clientOrganizationSyncService.ensureOrganizationTmpLink(clientId, tmp.id, { isPrimary: true });
    const json = await getByIdWithLinks(clientId);
    json.lastLinkedOrganizationTmpId = String(tmp.id);
    json.orgPipeline = pipelineResult.orgPipeline || null;
    console.log(`[orgLinkPipeline] ✓ client ${clientId} staged via tmp ${tmp.id}`, json.orgPipeline);
    return json;
  }

  console.warn(`[orgLinkPipeline] pipeline returned no org/tmp for client ${clientId}`, pipelineResult?.orgPipeline);
  const json = await getByIdWithLinks(clientId);
  json.orgPipeline = pipelineResult?.orgPipeline || null;
  return json;
};

const getByIdWithLinks = async (id, opts = {}) => {
  const includeLinks = opts.includeLinks !== false;
  if (!includeLinks) {
    return getByIdForApi(id, { skipCache: opts.skipCache });
  }
  const [client, links] = await Promise.all([
    Client.findByPk(id, { attributes: { exclude: CLIENT_API_EXCLUDE } }),
    includeLinks
      ? ClientOrganizationLink.findAll({
        where: { clientId: id },
        include: [
          {
            model: Organization,
            as: 'organization',
            required: false,
            attributes: ORG_LINK_SUMMARY_ATTRIBUTES,
          },
          { model: OrganizationTmp, as: 'organizationTmp', required: false, attributes: ['id', 'name'] },
        ],
        order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
      })
      : Promise.resolve([]),
  ]);
  if (!client) {
    const err = new Error('Client not found');
    err.status = 404;
    throw err;
  }
  const json = clientToApiJson(client);
  if (includeLinks) {
    json.organizationLinks = links.map((l) => (l.toJSON ? l.toJSON() : l));
  }
  return json;
};

/** ClientOrganizationLink rows with Organization / OrganizationTmp included. */
const listLinkedOrganizationsForClient = async (clientId) => {
  await getById(clientId);
  const rows = await ClientOrganizationLink.findAll({
    where: { clientId },
    include: [
      { model: Organization, as: 'organization', required: false, attributes: { exclude: ['embedding'] } },
      { model: OrganizationTmp, as: 'organizationTmp', required: false, attributes: { exclude: ['embedding'] } },
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

const updateOrganizationLinkForClient = async (clientId, linkId, payload, actor) => {
  assertCanAccessClientOrganizations(actor, clientId);
  const row = await ClientOrganizationLink.findOne({
    where: { id: linkId, clientId },
  });
  if (!row) {
    const err = new Error('Organization link not found');
    err.status = 404;
    throw err;
  }
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'pipelineId')) {
    const v = payload.pipelineId;
    patch.pipelineId = v != null && String(v).trim() !== '' ? String(v).trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'pipelineStage')) {
    const v = payload.pipelineStage;
    patch.pipelineStage = v != null && String(v).trim() !== '' ? String(v).trim() : null;
  }
  if (Object.keys(patch).length) {
    await row.update(patch);
  }
  return row.reload({
    include: [
      { model: Organization, as: 'organization', required: false, attributes: { exclude: ['embedding'] } },
      { model: OrganizationTmp, as: 'organizationTmp', required: false, attributes: { exclude: ['embedding'] } },
    ],
  });
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
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'logoUrl')) {
    const logo = coerceString(payload.logoUrl);
    clean.logoUrl = logo !== undefined ? logo || null : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload || {}, 'primaryColor')) {
    const pc = coerceString(payload.primaryColor);
    clean.primaryColor = pc !== undefined ? pc || null : null;
  }
  await client.update(clean);
  return getByIdForApi(id);
};

const remove = async (id) => {
  const client = await getById(id);
  await client.destroy();
  invalidateClientApiCache(id);
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
  CLIENT_API_EXCLUDE,
  getByIdForApi,
  invalidateClientApiCache,
  getByIdWithLinks,
  clientToApiJson,
  create,
  update,
  remove,
  findIdByJobClientLabel,
  attachOrganizationAfterCreate,
  linkOrganizationForClient,
  listLinkedOrganizationsForClient,
  unlinkOrganizationFromClient,
  updateOrganizationLinkForClient,
  assertCanAccessClientOrganizations,
  isPlatformAdmin,
  isClientManager,
  isClientTenantStaff,
};

