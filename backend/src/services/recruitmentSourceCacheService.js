const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const VERSION_KEY = 'recruitment-sources:ver';
const TTL_SECONDS = Math.max(60, Number.parseInt(process.env.RECRUITMENT_SOURCES_CACHE_TTL || '300', 10) || 300);

const cacheEnabled = () =>
  process.env.RECRUITMENT_SOURCES_CACHE !== 'false' && isReadThroughEnabled();

const getVersion = async () => {
  if (!isRedisAvailable()) return '0';
  try {
    const v = await redis.get(VERSION_KEY);
    return v != null ? String(v) : '0';
  } catch {
    return '0';
  }
};

const bumpRecruitmentSourceCacheVersion = async () => {
  if (!isRedisAvailable()) return;
  try {
    await redis.increment(VERSION_KEY);
  } catch (e) {
    console.warn('[recruitmentSourceCache] bump failed (non-fatal):', e.message);
  }
};

const getCachedOptions = async (clientId, loader) => {
  if (!cacheEnabled()) return loader();
  const ver = await getVersion();
  const cid = clientId ? String(clientId).trim() : 'global';
  const key = `recruitment-sources:options:v${ver}:${cid}`;
  return readThrough.getOrLoad(key, loader, { ttlSeconds: TTL_SECONDS, scope: 'recruitment-sources' });
};

module.exports = {
  bumpRecruitmentSourceCacheVersion,
  getCachedOptions,
};
