const Candidate = require('../models/Candidate');

const list = async () => Candidate.findAll();

const getById = async (id) => {
  const candidate = await Candidate.findByPk(id);
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }
  return candidate;
};

const getByUserId = async (userId) => Candidate.findOne({ where: { userId } });

const create = async (payload) => Candidate.create(payload);

const update = async (id, payload) => {
  const candidate = await getById(id);
  await candidate.update(payload);
  return candidate;
};

const remove = async (id) => {
  const candidate = await getById(id);
  await candidate.destroy();
};

module.exports = { list, getById, getByUserId, create, update, remove };


