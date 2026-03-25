const ClientTask = require('../models/ClientTask');
const Client = require('../models/Client');

const listByClientId = async (clientId) =>
  ClientTask.findAll({ where: { clientId }, order: [['dueDate', 'ASC'], ['createdAt', 'ASC']] });

const listAllWithClient = async () =>
  ClientTask.findAll({
    include: [
      {
        model: Client,
        as: 'client',
        required: false,
        attributes: ['id', 'name', 'displayName', 'logoUrl', 'metadata'],
      },
    ],
    order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
  });

const createForClient = async (clientId, payload) => {
  return ClientTask.create({ ...payload, clientId });
};

const update = async (id, payload) => {
  const row = await ClientTask.findByPk(id);
  if (!row) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await row.update(payload);
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

