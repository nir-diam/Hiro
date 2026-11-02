/**
 * Read-through / write-through helpers for Redis + process-local memory.
 *
 * Enable Redis: REDIS_ENABLED=true (default) and successful connect.
 * Disable Redis reads only: REDIS_READ_THROUGH=false (writes still update Redis when enabled).
 * Process memory stays on unless PROCESS_MEMORY_CACHE=false, so lists stay fast when Redis is off.
 */
const redis = require('./redisService');
const processMemory = require('./processMemoryCache');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');
const { recordHit, recordMiss, recordBypass } = require('../utils/appCacheContext');

const scopeFromKey = (key) => {
  const parts = String(key || '').split(':').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
  return parts[0] || 'redis';
};

/** Per-process in-flight loaders (one Postgres load per cache key per wave). */
const inflight = new Map();

const canCacheReads = () => isReadThroughEnabled() || processMemory.isEnabled();

const singleflightEnabled = () => {
  const flag = process.env.CACHE_SINGLEFLIGHT;
  if (flag === 'false' || flag === '0') return false;
  return true;
};

const tryMemoryGet = (key, scopeLabel) => {
  if (!processMemory.isEnabled()) return undefined;
  const hit = processMemory.get(key);
  if (hit !== undefined) {
    recordHit(scopeLabel);
    return hit;
  }
  return undefined;
};

const tryRedisGet = async (key, scopeLabel) => {
  if (!isReadThroughEnabled() || !isRedisAvailable()) return undefined;
  try {
    const hit = await redis.get(key);
    if (hit !== null && hit !== undefined) {
      if (processMemory.isEnabled()) processMemory.set(key, hit, 90);
      recordHit(scopeLabel);
      return hit;
    }
  } catch (e) {
    console.warn('[readThroughCache] get failed (non-fatal):', e.message);
  }
  return undefined;
};

const persistValue = async (key, value, ttlSeconds) => {
  if (value === null || value === undefined) return;
  if (processMemory.isEnabled()) {
    processMemory.set(key, value, ttlSeconds);
  }
  if (isRedisAvailable()) {
    try {
      await redis.set(key, value, { ttlSeconds });
    } catch (e) {
      console.warn('[readThroughCache] set after load failed (non-fatal):', e.message);
    }
  }
};

const loadAndSet = async (key, loader, { ttlSeconds, scopeLabel }) => {
  recordMiss(scopeLabel);
  const value = await loader();
  await persistValue(key, value, ttlSeconds);
  return value;
};

const getOrLoad = async (key, loader, { ttlSeconds, scope } = {}) => {
  const cacheKey = String(key || '').trim();
  const scopeLabel = scope || scopeFromKey(cacheKey);
  if (!cacheKey) return loader();

  if (!canCacheReads()) {
    recordBypass(scopeLabel);
    return loader();
  }

  const memHit = tryMemoryGet(cacheKey, scopeLabel);
  if (memHit !== undefined) return memHit;

  const cached = await tryRedisGet(cacheKey, scopeLabel);
  if (cached !== undefined) return cached;

  if (!singleflightEnabled()) {
    return loadAndSet(cacheKey, loader, { ttlSeconds, scopeLabel });
  }

  const existing = inflight.get(cacheKey);
  if (existing) {
    recordMiss(scopeLabel);
    return existing;
  }

  const flight = (async () => {
    try {
      const again = tryMemoryGet(cacheKey, scopeLabel);
      if (again !== undefined) return again;
      const hit = await tryRedisGet(cacheKey, scopeLabel);
      if (hit !== undefined) return hit;
      return loadAndSet(cacheKey, loader, { ttlSeconds, scopeLabel });
    } finally {
      inflight.delete(cacheKey);
    }
  })();

  inflight.set(cacheKey, flight);
  return flight;
};

/** Persist to DB first, then mirror in memory + Redis (write-through). */
const writeThrough = async (key, value, { ttlSeconds, persist } = {}) => {
  const saved = persist ? await persist() : value;
  await persistValue(key, saved, ttlSeconds);
  return saved;
};

const invalidate = async (...keys) => {
  const flat = keys.filter(Boolean);
  if (!flat.length) return 0;
  let n = processMemory.del(...flat);
  if (isRedisAvailable()) {
    try {
      n += await redis.del(...flat);
    } catch (e) {
      console.warn('[readThroughCache] invalidate failed (non-fatal):', e.message);
    }
  }
  return n;
};

module.exports = {
  getOrLoad,
  writeThrough,
  invalidate,
  canCacheReads,
  /** @internal test / diagnostics */
  _inflightSize: () => inflight.size,
};
