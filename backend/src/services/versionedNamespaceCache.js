const crypto = require('crypto');
const redis = require('./redisService');
const readThrough = require('./readThroughCacheService');
const processMemory = require('./processMemoryCache');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');

/**
 * Factory for versioned list/read caches (picklists, tags, cities, …).
 * Bump version on writes; keys include v{ver} + hash(fingerprint).
 */
const createVersionedNamespaceCache = (namespace, { ttlSeconds = 300, envFlagName } = {}) => {
  const versionKey = `${namespace}:ver`;
  const ttl = Math.max(30, Number.parseInt(String(ttlSeconds), 10) || 300);

  const enabled = () => {
    if (envFlagName) {
      const v = process.env[envFlagName];
      if (v === 'false' || v === '0') return false;
    }
    return isReadThroughEnabled() || processMemory.isEnabled();
  };

  const getVersion = async () => {
    if (isRedisAvailable()) {
      try {
        const v = await redis.get(versionKey);
        if (v != null) return String(v);
      } catch {
        /* fall through to process memory */
      }
    }
    return processMemory.getCounter(versionKey);
  };

  const bumpVersion = async () => {
    processMemory.increment(versionKey);
    if (!isRedisAvailable()) return;
    try {
      await redis.increment(versionKey);
    } catch (e) {
      console.warn(`[${namespace}Cache] bump version failed (non-fatal):`, e.message);
    }
  };

  const buildKey = async (fingerprint) => {
    const ver = await getVersion();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex')
      .slice(0, 20);
    return `${namespace}:v${ver}:${hash}`;
  };

  const getCached = async (fingerprint, loader, scope = namespace) => {
    if (!enabled()) return loader();
    const key = await buildKey(fingerprint);
    return readThrough.getOrLoad(key, loader, { ttlSeconds: ttl, scope });
  };

  return {
    versionKey,
    ttlSeconds: ttl,
    enabled,
    getVersion,
    bumpVersion,
    buildKey,
    getCached,
  };
};

module.exports = { createVersionedNamespaceCache };
