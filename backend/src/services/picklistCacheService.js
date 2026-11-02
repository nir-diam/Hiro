const crypto = require('crypto');
const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const PICKLIST_VERSION_KEY = 'picklists:ver';

const TTL_SECONDS = Math.max(
  60,
  Number.parseInt(process.env.PICKLIST_CACHE_TTL || '600', 10) || 600,
);

const listCacheEnabled = () =>
  process.env.PICKLIST_CACHE !== 'false'
  && process.env.PICKLIST_CACHE !== '0'
  && isReadThroughEnabled();

const getVersion = async () => {
  if (!isRedisAvailable()) return '0';
  try {
    const v = await redis.get(PICKLIST_VERSION_KEY);
    return v != null ? String(v) : '0';
  } catch {
    return '0';
  }
};

const bumpPicklistCacheVersion = async () => {
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(PICKLIST_VERSION_KEY);
  } catch (e) {
    console.warn('[picklistCache] bump version failed (non-fatal):', e.message);
  }
};

const buildKey = async (parts) => {
  const ver = await getVersion();
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 20);
  return `picklists:v${ver}:${hash}`;
};

const getCached = async (keyParts, loader, scope = 'picklists') => {
  if (!listCacheEnabled()) return loader();
  const key = await buildKey(keyParts);
  return readThrough.getOrLoad(key, loader, { ttlSeconds: TTL_SECONDS, scope });
};

module.exports = {
  PICKLIST_VERSION_KEY,
  TTL_SECONDS,
  listCacheEnabled,
  bumpPicklistCacheVersion,
  getCached,
};
