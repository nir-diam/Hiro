const ClientTask = require('../models/ClientTask');
const Client = require('../models/Client');
const Organization = require('../models/Organization');

const buildTaskWhere = (clientId, { organizationId = null } = {}) => {
  const where = { clientId };
  if (organizationId) where.organizationId = String(organizationId);
  return where;
};

const listByClientId = async (clientId, opts = {}) =>
  ClientTask.findAll({
    where: buildTaskWhere(clientId, opts),
    include: [
      {
        model: Organization,
        as: 'organization',
        required: false,
        attributes: ['id', 'name', 'logo'],
      },
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
  });

const listAllWithClient = async () =>
  ClientTask.findAll({
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
      },
      {
        model: Organization,
        as: 'organization',
        required: false,
        attributes: ['id', 'name', 'logo'],
      },
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
  });

const createForClient = async (clientId, payload = {}) => {
  const data = { ...payload, clientId };
  if (data.organizationId != null && String(data.organizationId).trim() === '') {
    data.organizationId = null;
  }
  return ClientTask.create(data);
};

const update = async (id, payload = {}) => {
  const row = await ClientTask.findByPk(id);
  if (!row) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  const data = { ...payload };
  if (
    Object.prototype.hasOwnProperty.call(data, 'organizationId')
    && data.organizationId != null
    && String(data.organizationId).trim() === ''
  ) {
    data.organizationId = null;
  }
  await row.update(data);
  return row;
};

const remove = async (id) => {
  const row = await ClientTask.findByPk(id);
  if (!row) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
};

module.exports = { listByClientId, listAllWithClient, createForClient, update, remove };
