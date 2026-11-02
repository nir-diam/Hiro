const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const EVENT_TYPES_VERSION_KEY = 'event-types:ver';
const EVENT_TYPES_LIST_KEY_PREFIX = 'event-types:list:v';

const TTL_SECONDS = Math.max(
  60,
  Number.parseInt(process.env.EVENT_TYPES_CACHE_TTL || '600', 10) || 600,
);

const cacheEnabled = () =>
  process.env.EVENT_TYPES_CACHE !== 'false'
  && isReadThroughEnabled();

const getVersion = async () => {
  if (!isRedisAvailable()) return '0';
  try {
    const v = await redis.get(EVENT_TYPES_VERSION_KEY);
    return v != null ? String(v) : '0';
  } catch {
    return '0';
  }
};

const bumpEventTypeCacheVersion = async () => {
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(EVENT_TYPES_VERSION_KEY);
  } catch (e) {
    console.warn('[eventTypeCache] bump version failed (non-fatal):', e.message);
  }
};

const getCachedList = async (loader) => {
  if (!cacheEnabled()) return loader();
  const ver = await getVersion();
  const key = `${EVENT_TYPES_LIST_KEY_PREFIX}${ver}`;
  return readThrough.getOrLoad(key, loader, { ttlSeconds: TTL_SECONDS, scope: 'event-types' });
};

module.exports = {
  bumpEventTypeCacheVersion,
  getCachedList,
  cacheEnabled,
};
