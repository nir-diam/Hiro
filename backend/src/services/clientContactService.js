const ClientContact = require('../models/ClientContact');
const ClientContactGroup = require('../models/ClientContactGroup');
const Client = require('../models/Client');
const { deactivateStaffUserForDeletedContact } = require('./staffUserProvisioningService');

const listByClientId = async (clientId) => ClientContact.findAll({ where: { clientId }, order: [['createdAt', 'ASC']] });

const listByClientIdWithClient = async (clientId) =>
  ClientContact.findAll({
    where: { clientId },
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
      },
    ],
    order: [['createdAt', 'ASC']],
  });

const listAllWithClient = async () =>
  ClientContact.findAll({
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
      },
    ],
    order: [['updatedAt', 'DESC']],
  });

const createForClient = async (clientId, payload) => {
  return ClientContact.create({ ...payload, clientId });
};

const update = async (id, payload) => {
  const row = await ClientContact.findByPk(id);
  if (!row) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  await row.update(payload);
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

