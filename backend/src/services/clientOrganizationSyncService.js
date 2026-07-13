const { Op } = require('sequelize');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');

/** Client metadata keys owned by onboarding / CRM — never overwritten from org sync. */
const CLIENT_OWNED_META_KEYS = new Set(['notes', 'contactRole']);

const plainOrg = (org) => (org?.get ? org.get({ plain: true }) : org);

const orgMetadataSnapshot = (org) => {
  const o = plainOrg(org);
  if (!o) return {};

  const pickArray = (v) => (Array.isArray(v) ? v : []);
  const pickStr = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
  };

  return {
    website: pickStr(o.website),
    address: pickStr(o.address) || pickStr(o.location),
    location: pickStr(o.location),
    description: pickStr(o.description) || pickStr(o.snippet),
    snippet: pickStr(o.snippet),
    aliases: pickArray(o.aliases).map((a) => String(a || '').trim()).filter(Boolean),
    linkedinUrl: pickStr(o.linkedinUrl),
    hqCountry: pickStr(o.hqCountry),
    employeeCount: pickStr(o.employeeCount),
    nameEn: pickStr(o.nameEn),
    legalName: pickStr(o.legalName),
    mainField: pickStr(o.mainField),
    mainField2: pickArray(o.mainField2).map((a) => String(a || '').trim()).filter(Boolean),
    subField: pickArray(o.subField).map((a) => String(a || '').trim()).filter(Boolean),
    secondaryField: pickStr(o.secondaryField),
    type: pickStr(o.type),
    classification: pickStr(o.classification),
    foundedYear: pickStr(o.foundedYear),
    businessModel: pickArray(o.businessModel).map((a) => String(a || '').trim()).filter(Boolean),
    productType: pickArray(o.productType).map((a) => String(a || '').trim()).filter(Boolean),
    structure: pickStr(o.structure),
    parentCompany: pickStr(o.parentCompany),
    subsidiaries: pickArray(o.subsidiaries).map((a) => String(a || '').trim()).filter(Boolean),
    growthIndicator: pickStr(o.growthIndicator),
    tags: pickArray(o.tags).map((a) => String(a || '').trim()).filter(Boolean),
    techTags: pickArray(o.techTags).map((a) => String(a || '').trim()).filter(Boolean),
    activityStatus: pickStr(o.activityStatus),
    dataConfidence: pickStr(o.dataConfidence),
    lastVerified: pickStr(o.lastVerified),
    organizationPhone: pickStr(o.phone),
    organizationEmail: pickStr(o.email),
  };
};

const buildClientUpdatesFromOrg = (client, org, { fullSync = false } = {}) => {
  if (!org) return null;
  const plain = client?.get ? client.get({ plain: true }) : client;
  const o = plainOrg(org);
  const updates = {};

  const setIf = (key, value) => {
    if (value == null || value === '') return;
    if (fullSync || plain?.[key] == null || plain[key] === '') {
      updates[key] = value;
    }
  };

  if (fullSync && o.name) {
    updates.name = String(o.name).trim();
    updates.displayName = String(o.name).trim();
  }

  setIf('industry', o.mainField);
  setIf('city', o.location || o.hqCountry);
  setIf('region', o.hqCountry);
  setIf('field', o.type);
  setIf('phone', o.phone);
  setIf('logoUrl', o.logo);

  const existingMeta = plain?.metadata && typeof plain.metadata === 'object' ? plain.metadata : {};
  const preservedClientMeta = {};
  for (const key of CLIENT_OWNED_META_KEYS) {
    if (existingMeta[key] != null && existingMeta[key] !== '') {
      preservedClientMeta[key] = existingMeta[key];
    }
  }

  if (fullSync) {
    const orgMeta = orgMetadataSnapshot(org);
    updates.metadata = {
      ...orgMeta,
      ...preservedClientMeta,
      organizationId: o.id,
      organizationSyncedAt: new Date().toISOString(),
    };
    return updates;
  }

  const meta = { ...existingMeta };
  let metaChanged = false;
  const setMeta = (key, value) => {
    if (value == null || value === '') return;
    if (meta[key] == null || meta[key] === '') {
      meta[key] = value;
      metaChanged = true;
    }
  };

  const orgMeta = orgMetadataSnapshot(org);
  for (const [key, value] of Object.entries(orgMeta)) {
    if (CLIENT_OWNED_META_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      if (!Array.isArray(meta[key]) || !meta[key].length) {
        meta[key] = value;
        metaChanged = true;
      }
    } else {
      setMeta(key, value);
    }
  }

  if (metaChanged) {
    updates.metadata = meta;
  }

  return Object.keys(updates).length ? updates : null;
};

const applyOrgToClient = async (client, org, options = {}) => {
  if (!client || !org) return null;
  const updates = buildClientUpdatesFromOrg(client, org, options);
  if (!updates) return client;
  await client.update(updates);
  return client.reload();
};

const ensureOrganizationLink = async (clientId, organizationId, { isPrimary = false } = {}) => {
  if (!clientId || !organizationId) return null;
  const [link] = await ClientOrganizationLink.findOrCreate({
    where: { clientId, organizationId },
    defaults: { isPrimary },
  });
  if (isPrimary && !link.isPrimary) {
    await link.update({ isPrimary: true });
  }
  return link;
};

const ensureOrganizationTmpLink = async (clientId, organizationTmpId, { isPrimary = false } = {}) => {
  if (!clientId || !organizationTmpId) return null;
  const [link] = await ClientOrganizationLink.findOrCreate({
    where: { clientId, organizationTmpId },
    defaults: { isPrimary },
  });
  if (isPrimary && !link.isPrimary) {
    await link.update({ isPrimary: true });
  }
  return link;
};

const linkClientToOrganization = async (clientId, organizationId, options = {}) => {
  const [client, org] = await Promise.all([
    Client.findByPk(clientId),
    Organization.findByPk(organizationId),
  ]);
  if (!client || !org) return null;
  await ensureOrganizationLink(clientId, organizationId, {
    isPrimary: options.isPrimary !== false,
  });
  return applyOrgToClient(client, org, { fullSync: options.fullSync !== false });
};

const getLinkedClientIdsForOrganization = async (organizationId) => {
  const rows = await ClientOrganizationLink.findAll({
    where: { organizationId },
    attributes: ['clientId'],
  });
  return [...new Set(rows.map((r) => r.clientId).filter(Boolean))];
};

const promoteClientsFromTmp = async (tmpId, orgId) => {
  if (!tmpId || !orgId) return 0;
  const org = await Organization.findByPk(orgId);
  if (!org) return 0;

  const links = await ClientOrganizationLink.findAll({ where: { organizationTmpId: tmpId } });
  let promoted = 0;
  for (const link of links) {
    const existingOrgLink = await ClientOrganizationLink.findOne({
      where: { clientId: link.clientId, organizationId: org.id },
    });
    if (existingOrgLink) {
      await link.destroy();
    } else {
      await link.update({ organizationId: org.id, organizationTmpId: null });
    }
    const client = await Client.findByPk(link.clientId);
    if (client) await applyOrgToClient(client, org, { fullSync: true });
    promoted += 1;
  }
  return promoted;
};

const promoteClientsForNewOrganization = async (org) => {
  if (!org?.id || !org?.name) return 0;

  const name = String(org.name).trim();
  if (!name) return 0;

  let promoted = 0;

  const tmps = await OrganizationTmp.findAll({
    where: { name: { [Op.iLike]: name } },
    attributes: ['id'],
  });
  for (const tmp of tmps) {
    promoted += await promoteClientsFromTmp(tmp.id, org.id);
  }

  const tmpLinks = await ClientOrganizationLink.findAll({
    where: { organizationId: null, organizationTmpId: { [Op.ne]: null } },
    include: [{ model: Client, as: 'client', attributes: ['id', 'name'], required: true }],
  });
  for (const link of tmpLinks) {
    const clientName = String(link.client?.name || '').trim();
    if (!clientName || clientName.toLowerCase() !== name.toLowerCase()) continue;
    await link.update({ organizationId: org.id, organizationTmpId: null });
    const client = await Client.findByPk(link.clientId);
    if (client) {
      await applyOrgToClient(client, org, { fullSync: true });
      promoted += 1;
    }
  }

  return promoted;
};

const syncOrganizationToLinkedClients = async (organizationId) => {
  if (!organizationId) return 0;
  const org = await Organization.findByPk(organizationId);
  if (!org) return 0;

  const clientIds = await getLinkedClientIdsForOrganization(organizationId);
  for (const clientId of clientIds) {
    const client = await Client.findByPk(clientId);
    if (client) await applyOrgToClient(client, org, { fullSync: true });
  }
  return clientIds.length;
};

const listLinksForClient = async (clientId) => {
  if (!clientId) return [];
  return ClientOrganizationLink.findAll({
    where: { clientId },
    order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
  });
};

module.exports = {
  buildClientUpdatesFromOrg,
  orgMetadataSnapshot,
  applyOrgToClient,
  ensureOrganizationLink,
  ensureOrganizationTmpLink,
  linkClientToOrganization,
  getLinkedClientIdsForOrganization,
  promoteClientsFromTmp,
  promoteClientsForNewOrganization,
  syncOrganizationToLinkedClients,
  listLinksForClient,
};
