const CandidateApplication = require('../models/CandidateApplication');
const Job = require('../models/Job');

const listByCandidate = async (candidateId) =>
  CandidateApplication.findAll({
    where: { candidateId },
    order: [['applicationDate', 'DESC']],
    include: [
      {
        model: Job,
        as: 'job',
        attributes: ['id', 'title', 'client'],
      },
    ],
  });

const create = async (payload) => CandidateApplication.create(payload);

const update = async (id, payload) => {
  const record = await CandidateApplication.findByPk(id);
  if (!record) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
  await record.update(payload);
  return record;
};

const remove = async (id) => {
  const deleted = await CandidateApplication.destroy({ where: { id } });
  if (!deleted) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
};

module.exports = {
  listByCandidate,
  create,
  update,
  remove,
};

