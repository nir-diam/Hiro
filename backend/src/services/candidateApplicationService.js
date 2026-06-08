const CandidateApplication = require('../models/CandidateApplication');
const Job = require('../models/Job');
const redis = require('./redisService');

const APP_LIST_KEY = (candidateId) => `applications:candidate:${candidateId}`;
const APP_TTL = 5 * 60; // 5 minutes

const appCacheInvalidate = async (candidateId) => {
  try {
    if (candidateId) await redis.del(APP_LIST_KEY(candidateId));
  } catch (e) {
    console.warn('[candidateApplicationService] redis del failed (non-fatal):', e.message);
  }
};

const listByCandidate = async (candidateId) => {
  try {
    const cached = await redis.get(APP_LIST_KEY(candidateId));
    if (cached) return cached;
  } catch (e) {
    console.warn('[candidateApplicationService] redis get failed (non-fatal):', e.message);
  }

  const records = await CandidateApplication.findAll({
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

  try {
    await redis.set(APP_LIST_KEY(candidateId), records, { ttlSeconds: APP_TTL });
  } catch (e) {
    console.warn('[candidateApplicationService] redis set failed (non-fatal):', e.message);
  }

  return records;
};

const create = async (payload) => {
  const record = await CandidateApplication.create(payload);
  await appCacheInvalidate(payload.candidateId);
  return record;
};

const update = async (id, payload) => {
  const record = await CandidateApplication.findByPk(id);
  if (!record) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
  await record.update(payload);
  await appCacheInvalidate(record.candidateId);
  return record;
};

const remove = async (id) => {
  const record = await CandidateApplication.findByPk(id);
  const candidateId = record?.candidateId;
  const deleted = await CandidateApplication.destroy({ where: { id } });
  if (!deleted) {
    const err = new Error('Application not found');
    err.status = 404;
    throw err;
  }
  await appCacheInvalidate(candidateId);
};

module.exports = {
  listByCandidate,
  create,
  update,
  remove,
};
