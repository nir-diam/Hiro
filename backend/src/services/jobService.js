const Job = require('../models/Job');

const list = async () => Job.findAll();

const getById = async (id) => {
  const job = await Job.findByPk(id);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return job;
};

const create = async (payload) => Job.create(payload);

const update = async (id, payload) => {
  const job = await getById(id);
  await job.update(payload);
  return job;
};

const remove = async (id) => {
  const job = await getById(id);
  await job.destroy();
};

module.exports = { list, getById, create, update, remove };

