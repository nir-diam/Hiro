const Organization = require('../models/Organization');

const list = async () => Organization.findAll();

const getById = async (id) => {
  const org = await Organization.findByPk(id);
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  return org;
};

const create = async (payload) => Organization.create(payload);

const update = async (id, payload) => {
  const org = await getById(id);
  await org.update(payload);
  return org;
};

const remove = async (id) => {
  const org = await getById(id);
  await org.destroy();
};

module.exports = { list, getById, create, update, remove };

