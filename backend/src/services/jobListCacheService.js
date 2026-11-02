const crypto = require('crypto');
const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const processMemory = require('./processMemoryCache');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const JOBS_LIST_VERSION_KEY = 'jobs:list:ver';

const TTL_SECONDS = Math.max(
  30,
  Number.parseInt(process.env.JOBS_LIST_CACHE_TTL || '120', 10) || 120,
);

const listCacheEnabled = () =>
  process.env.JOBS_LIST_CACHE !== 'false'
  && process.env.JOBS_LIST_CACHE !== '0'
  && (isReadThroughEnabled() || processMemory.isEnabled());

const getVersion = async () => {
  if (isRedisAvailable()) {
    try {
      const v = await redis.get(JOBS_LIST_VERSION_KEY);
      if (v != null) return String(v);
    } catch {
      /* fall through to process memory */
    }
  }
  return processMemory.getCounter(JOBS_LIST_VERSION_KEY);
};

const bumpJobListCacheVersion = async () => {
  processMemory.increment(JOBS_LIST_VERSION_KEY);
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(JOBS_LIST_VERSION_KEY);
  } catch (e) {
    console.warn('[jobListCache] bump version failed (non-fatal):', e.message);
  }
};

const buildKey = async (kind, fingerprint) => {
  const ver = await getVersion();
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(fingerprint))
    .digest('hex')
    .slice(0, 20);
  return `jobs:list:${kind}:v${ver}:${hash}`;
};

const getCached = async (kind, fingerprint, loader, scope = 'jobs:list') => {
  if (!listCacheEnabled()) return loader();
  const key = await buildKey(kind, fingerprint);
  return readThrough.getOrLoad(key, loader, { ttlSeconds: TTL_SECONDS, scope });
};

module.exports = {
  JOBS_LIST_VERSION_KEY,
  TTL_SECONDS,
  listCacheEnabled,
  bumpJobListCacheVersion,
  getCached,
};
