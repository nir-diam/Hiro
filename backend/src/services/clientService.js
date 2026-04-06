const { Op } = require('sequelize');
const Client = require('../models/Client');

const coerceString = (v) => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

const buildClientCreatePayload = (payload = {}) => {
  const meta = (payload.metadata && typeof payload.metadata === 'object') ? payload.metadata : {};

  return {
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
  const clean = buildClientUpdatePayload(client, payload);
  await client.update(clean);
  return client;
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

