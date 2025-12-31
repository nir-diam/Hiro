const Client = require('../models/Client');

const list = async () => Client.findAll();

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
  const client = await Client.create(payload);
  return client;
};

const update = async (id, payload) => {
  const client = await getById(id);
  await client.update(payload);
  return client;
};

const remove = async (id) => {
  const client = await getById(id);
  await client.destroy();
};

module.exports = { list, getById, create, update, remove };

