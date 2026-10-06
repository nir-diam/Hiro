const CandidateApplication = require('../models/CandidateApplication');
const Job = require('../models/Job');

const PORTAL_APPLICATION_SOURCES = new Set(['candidate_portal', 'job_matching']);
const { Op } = require('sequelize');
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
        attributes: ['id', 'title', 'client', 'digitalQuestions'],
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

const listByCandidates = async (candidateIds) => {
  const ids = [...new Set(candidateIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  if (ids.length === 1) return listByCandidate(ids[0]);

  return CandidateApplication.findAll({
    where: { candidateId: { [Op.in]: ids } },
    order: [['applicationDate', 'DESC']],
    include: [
      {
        model: Job,
        as: 'job',
        attributes: ['id', 'title', 'client', 'digitalQuestions'],
      },
    ],
  });
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

/** Mirror portal / matching apply into the candidate's applications ledger. */
const ensureForPortalApplication = async ({ candidateId, jobId, source }) => {
  const cid = String(candidateId || '').trim();
  const jid = String(jobId || '').trim();
  const src = String(source || '').trim();
  if (!cid || !jid || !PORTAL_APPLICATION_SOURCES.has(src)) return null;

  const existing = await CandidateApplication.findOne({
    where: { candidateId: cid, jobId: jid },
  });
  if (existing) return existing;

  const job = await Job.findByPk(jid, {
    attributes: ['id', 'title', 'client'],
  });
  if (!job) return null;
  const plain = job.get ? job.get({ plain: true }) : job;

  return create({
    candidateId: cid,
    jobId: jid,
    company: String(plain.client || '').trim() || '—',
    role: String(plain.title || '').trim() || '—',
    status: src === 'candidate_portal' ? 'הוגש מהפורטל' : 'נשלח',
    applicationDate: new Date().toISOString().slice(0, 10),
  });
};

module.exports = {
  listByCandidate,
  listByCandidates,
  create,
  update,
  remove,
  ensureForPortalApplication,
  PORTAL_APPLICATION_SOURCES,
};
