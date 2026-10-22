/**
 * Read-through / write-through helpers for Redis entity caching.
 *
 * Enable: REDIS_ENABLED=true (default) and successful connect.
 * Disable read-through only: REDIS_READ_THROUGH=false (writes/deletes still update Redis when enabled).
 */
const redis = require('./redisService');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

const getOrLoad = async (key, loader, { ttlSeconds } = {}) => {
  if (isReadThroughEnabled()) {
    try {
      const hit = await redis.get(key);
      if (hit !== null && hit !== undefined) return hit;
    } catch (e) {
      console.warn('[readThroughCache] get failed (non-fatal):', e.message);
    }
  }
  const value = await loader();
  if (value !== null && value !== undefined && isRedisAvailable()) {
    try {
      await redis.set(key, value, { ttlSeconds });
    } catch (e) {
      console.warn('[readThroughCache] set after load failed (non-fatal):', e.message);
    }
  }
  return value;
};

/** Persist to DB first, then mirror in Redis (write-through). */
const writeThrough = async (key, value, { ttlSeconds, persist } = {}) => {
  const saved = persist ? await persist() : value;
  if (saved !== null && saved !== undefined && isRedisAvailable()) {
    try {
      await redis.set(key, saved, { ttlSeconds });
    } catch (e) {
      console.warn('[readThroughCache] writeThrough set failed (non-fatal):', e.message);
    }
  }
  return saved;
};

const invalidate = async (...keys) => {
  const flat = keys.filter(Boolean);
  if (!flat.length || !isRedisAvailable()) return 0;
  try {
    return await redis.del(...flat);
  } catch (e) {
    console.warn('[readThroughCache] invalidate failed (non-fatal):', e.message);
    return 0;
  }
};

module.exports = {
  getOrLoad,
  writeThrough,
  invalidate,
};
