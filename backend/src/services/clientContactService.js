const ClientContact = require('../models/ClientContact');
const ClientContactGroup = require('../models/ClientContactGroup');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const { deactivateStaffUserForDeletedContact } = require('./staffUserProvisioningService');

const CLIENT_INCLUDE = {
  model: Client,
  as: 'client',
  required: false,
  attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
};

const ORGANIZATION_INCLUDE = {
  model: Organization,
  as: 'organization',
  required: false,
  attributes: ['id', 'name', 'nameEn', 'logo', 'website'],
};

const buildClientContactWhere = (clientId, { organizationId = null } = {}) => {
  const where = { clientId };
  if (organizationId) where.organizationId = String(organizationId);
  return where;
};

const listByClientId = async (clientId, opts = {}) =>
  ClientContact.findAll({
    where: buildClientContactWhere(clientId, opts),
    order: [['createdAt', 'ASC']],
  });

const listAllWithClient = async ({ clientId = null } = {}) => {
  const rows = await ClientContact.findAll({
    where: clientId ? { clientId: String(clientId) } : undefined,
    include: [CLIENT_INCLUDE, ORGANIZATION_INCLUDE],
    order: [['updatedAt', 'DESC']],
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      ...j,
      organizationName: j.organization?.name || j.organization?.nameEn || null,
      organizationLogo: j.organization?.logo || null,
    };
  });
};

const listByClientIdWithClient = async (clientId, opts = {}) => {
  const rows = await ClientContact.findAll({
    where: buildClientContactWhere(clientId, opts),
    include: [CLIENT_INCLUDE, ORGANIZATION_INCLUDE],
    order: [['createdAt', 'ASC']],
  });
  return rows.map((row) => {
    const j = row.toJSON ? row.toJSON() : row;
    return {
      ...j,
      organizationName: j.organization?.name || j.organization?.nameEn || null,
      organizationLogo: j.organization?.logo || null,
    };
  });
};

const createForClient = async (clientId, payload = {}) => {
  const data = { ...payload, clientId };
  if (data.organizationId != null && String(data.organizationId).trim() === '') {
    data.organizationId = null;
  }
  return ClientContact.create(data);
};

const update = async (id, payload = {}) => {
  const row = await ClientContact.findByPk(id);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const data = { ...payload };
  if (Object.prototype.hasOwnProperty.call(data, 'organizationId')
      && data.organizationId != null
      && String(data.organizationId).trim() === '') {
    data.organizationId = null;
  }
  await row.update(data);
  return row;
};

const remove = async (id) => {
  const row = await ClientContact.findByPk(id);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  await deactivateStaffUserForDeletedContact({
    email: row.email,
    clientId: row.clientId,
  }).catch((err) => {
    console.error('[clientContactService.remove] deactivate user failed', err?.message || err);
  });
  await row.destroy();
};

// Groups
const listGroupsByClientId = async (clientId) =>
  ClientContactGroup.findAll({ where: { clientId }, order: [['createdAt', 'ASC']] });

const createGroupForClient = async (clientId, payload) => {
  return ClientContactGroup.create({ clientId, name: payload?.name });
};

const deleteGroup = async (groupId) => {
  const row = await ClientContactGroup.findByPk(groupId);
  if (!row) {
    const err = new Error('Group not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
};

module.exports = {
  listByClientId,
  listByClientIdWithClient,
  listAllWithClient,
  createForClient,
  update,
  remove,
  listGroupsByClientId,
  createGroupForClient,
  deleteGroup,
};

