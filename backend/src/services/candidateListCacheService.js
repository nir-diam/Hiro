const crypto = require('crypto');
const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const processMemory = require('./processMemoryCache');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const CANDIDATE_LIST_VERSION_KEY = 'candidates:list:ver';

const LIST_CACHE_TTL_SECONDS = Math.max(
  15,
  Number.parseInt(process.env.CANDIDATE_LIST_CACHE_TTL || '90', 10) || 90,
);

const listCacheEnabled = () =>
  process.env.CANDIDATE_LIST_CACHE !== 'false'
  && process.env.CANDIDATE_LIST_CACHE !== '0'
  && (isReadThroughEnabled() || processMemory.isEnabled());

const getCandidateListCacheVersion = async () => {
  if (isRedisAvailable()) {
    try {
      const v = await redis.get(CANDIDATE_LIST_VERSION_KEY);
      if (v != null) return String(v);
    } catch {
      /* fall through to process memory */
    }
  }
  return processMemory.getCounter(CANDIDATE_LIST_VERSION_KEY);
};

/** Bump version so new list keys miss; old keys expire by TTL. */
const bumpCandidateListCacheVersion = async () => {
  processMemory.increment(CANDIDATE_LIST_VERSION_KEY);
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(CANDIDATE_LIST_VERSION_KEY);
  } catch (e) {
    console.warn('[candidateListCache] bump version failed (non-fatal):', e.message);
  }
};

const buildCandidateListCacheKey = (version, params = {}) => {
  const fingerprint = {
    page: params.page ?? 1,
    limit: params.limit ?? 100,
    search: String(params.search || '').trim(),
    advanced: params.advanced ?? null,
    jobId: params.jobId ? String(params.jobId) : '',
    tagId: params.tagId ? String(params.tagId) : '',
    tenantClientId: params.tenantClientId ? String(params.tenantClientId) : '',
    blacklistedEmails: [...(params.blacklistedEmails || [])].map(String).sort(),
    blacklistedPhones: [...(params.blacklistedPhones || [])].map(String).sort(),
    listProfileKind: params.listProfileKind ? String(params.listProfileKind) : 'primary',
  };
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprint))
    .digest('hex')
    .slice(0, 24);
  return `candidates:list:v${version}:${hash}`;
};

const shouldCacheListPaginated = (params = {}) => {
  if (!listCacheEnabled()) return false;
  if (params.includeEngineScores || params.matchLastJobScores) return false;
  if (params.jobId) return false;
  return true;
};

const getCachedListPaginated = async (params, loader) => {
  const version = await getCandidateListCacheVersion();
  const key = buildCandidateListCacheKey(version, params);
  return readThrough.getOrLoad(key, loader, {
    ttlSeconds: LIST_CACHE_TTL_SECONDS,
    scope: 'candidates:list',
  });
};

module.exports = {
  CANDIDATE_LIST_VERSION_KEY,
  LIST_CACHE_TTL_SECONDS,
  listCacheEnabled,
  getCandidateListCacheVersion,
  bumpCandidateListCacheVersion,
  buildCandidateListCacheKey,
  shouldCacheListPaginated,
  getCachedListPaginated,
};
