const crypto = require('crypto');
const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const processMemory = require('./processMemoryCache');
const { isRedisAvailable } = require('../config/redis');

const LIST_SCORE_TTL_SECONDS = Math.max(
  30,
  Number.parseInt(process.env.MATCH_LIST_SCORE_CACHE_TTL || '120', 10) || 120,
);

const BATCH_SCORE_TTL_SECONDS = Math.max(
  30,
  Number.parseInt(process.env.MATCH_BATCH_SCORE_CACHE_TTL || String(LIST_SCORE_TTL_SECONDS), 10)
    || LIST_SCORE_TTL_SECONDS,
);

const BATCH_VERSION_KEY = 'match-scores:batch:ver';

const listScoreKey = (jobId, candidateId) =>
  `list-score:${String(jobId).trim()}:${String(candidateId).trim()}`;

const getBatchVersion = async () => {
  if (isRedisAvailable()) {
    try {
      const v = await redis.get(BATCH_VERSION_KEY);
      if (v != null) return String(v);
    } catch {
      /* fall through to process memory */
    }
  }
  return processMemory.getCounter(BATCH_VERSION_KEY);
};

const bumpBatchScoreVersion = async () => {
  processMemory.increment(BATCH_VERSION_KEY);
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(BATCH_VERSION_KEY);
  } catch (e) {
    console.warn('[matchScoreCache] bump batch version failed (non-fatal):', e.message);
  }
};

const buildBatchScoresCacheKey = (pairs, tenantClientId, version) => {
  const normalized = (pairs || [])
    .map(({ candidateId, jobId }) => ({
      c: String(candidateId || '').trim(),
      j: String(jobId || '').trim(),
    }))
    .filter((p) => p.c && p.j)
    .sort((a, b) => a.c.localeCompare(b.c) || a.j.localeCompare(b.j));
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ v: version, tenant: tenantClientId || '', pairs: normalized }))
    .digest('hex')
    .slice(0, 24);
  return `match-scores:batch:v${version}:${hash}`;
};

/**
 * Cache full POST /match-scores/batch response (scores map) for identical item sets.
 */
const getBatchScoresOrCompute = async (pairs, tenantClientId, loader) => {
  const version = await getBatchVersion();
  const key = buildBatchScoresCacheKey(pairs, tenantClientId, version);
  return readThrough.getOrLoad(key, loader, {
    ttlSeconds: BATCH_SCORE_TTL_SECONDS,
    scope: 'match-scores:batch',
  });
};

/** Drop per-pair list scores for one candidate (all jobs). */
const invalidateListScoresForCandidate = async (candidateId) => {
  const id = String(candidateId || '').trim();
  if (!id || !isRedisAvailable()) return;
  try {
    const keys = await redis.keys(`list-score:*:${id}`);
    if (keys.length) await redis.del(...keys);
  } catch (e) {
    console.warn('[matchScoreCache] invalidate list-score keys failed (non-fatal):', e.message);
  }
};

/** Profile / tags changed — batch payloads and per-pair scores may be stale. */
const invalidateCandidateMatchScoreCaches = async (candidateId) => {
  await invalidateListScoresForCandidate(candidateId);
  await bumpBatchScoreVersion();
};

module.exports = {
  LIST_SCORE_TTL_SECONDS,
  BATCH_SCORE_TTL_SECONDS,
  listScoreKey,
  getBatchScoresOrCompute,
  invalidateListScoresForCandidate,
  invalidateCandidateMatchScoreCaches,
  bumpBatchScoreVersion,
};
