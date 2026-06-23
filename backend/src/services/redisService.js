const { getRedisClient, isRedisAvailable } = require('../config/redis');

/**
 * Store a value under `key`.
 * @param {string} key
 * @param {*}      value   - any JSON-serialisable value, or a plain string
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds]  - expire after N seconds (omit for no expiry)
 */
const set = async (key, value, { ttlSeconds } = {}) => {
  if (!isRedisAvailable()) return;
  const client = getRedisClient();
  const serialised = typeof value === 'string' ? value : JSON.stringify(value);

  if (ttlSeconds) {
    await client.set(key, serialised, 'EX', ttlSeconds);
  } else {
    await client.set(key, serialised);
  }
};

/**
 * Retrieve the value stored under `key`.
 * Returns the parsed object/string, or `null` when the key does not exist.
 * @param {string} key
 * @returns {Promise<*|null>}
 */
const get = async (key) => {
  if (!isRedisAvailable()) return null;
  const client = getRedisClient();
  const raw = await client.get(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/**
 * Delete one or more keys.
 * @param {...string} keys
 * @returns {Promise<number>} number of keys actually deleted
 */
const del = async (...keys) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return client.del(...keys);
};

/**
 * Update an existing key — same as `set` but semantically signals intent.
 * If the key does not yet exist it will be created.
 * @param {string} key
 * @param {*}      value
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds]
 */
const update = async (key, value, opts = {}) => set(key, value, opts);

/**
 * Check whether a key exists.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
const exists = async (key) => {
  if (!isRedisAvailable()) return false;
  const client = getRedisClient();
  const count = await client.exists(key);
  return count > 0;
};

/**
 * Set a TTL (time-to-live) on an existing key.
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<boolean>} true if the TTL was applied
 */
const expire = async (key, ttlSeconds) => {
  if (!isRedisAvailable()) return false;
  const client = getRedisClient();
  const result = await client.expire(key, ttlSeconds);
  return result === 1;
};

/**
 * Get the remaining TTL of a key in seconds.
 * Returns -1 if the key has no expiry, -2 if the key does not exist.
 * @param {string} key
 * @returns {Promise<number>}
 */
const ttl = async (key) => {
  if (!isRedisAvailable()) return -2;
  const client = getRedisClient();
  return client.ttl(key);
};

/**
 * Increment a numeric counter stored at `key` by `amount` (default 1).
 * Creates the key with value 0 before incrementing if it does not exist.
 * @param {string} key
 * @param {number} [amount=1]
 * @returns {Promise<number>} new value after increment
 */
const increment = async (key, amount = 1) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return amount === 1 ? client.incr(key) : client.incrby(key, amount);
};

/**
 * Find keys matching a glob pattern.
 * Avoid on large keyspaces in production — prefer SCAN-based iteration.
 * @param {string} pattern  e.g. "user:*"
 * @returns {Promise<string[]>}
 */
const keys = async (pattern) => {
  if (!isRedisAvailable()) return [];
  const client = getRedisClient();
  return client.keys(pattern);
};

// ─── Sorted Set (ZSET) operations ─────────────────────────────────────────────

/**
 * Add or update one member in a sorted set.
 * ZADD key score member
 * @param {string} key
 * @param {number} score
 * @param {string} member
 */
const zadd = async (key, score, member) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return client.zadd(key, score, member);
};

/**
 * Add multiple members at once.
 * @param {string} key
 * @param {Array<{ score: number, member: string }>} entries
 */
const zaddMany = async (key, entries) => {
  if (!entries?.length) return 0;
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  const flat = entries.flatMap(({ score, member }) => [score, member]);
  return client.zadd(key, ...flat);
};

/**
 * Get members ordered by score descending (highest first).
 * @param {string} key
 * @param {number} [start=0]
 * @param {number} [stop=49]   inclusive index (-1 = all)
 * @param {boolean} [withScores=false]
 * @returns {Promise<string[] | Array<{ member: string, score: number }>>}
 */
const zrevrange = async (key, start = 0, stop = 49, withScores = false) => {
  if (!isRedisAvailable()) return [];
  const client = getRedisClient();
  if (withScores) {
    const raw = await client.zrevrange(key, start, stop, 'WITHSCORES');
    const result = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
    }
    return result;
  }
  return client.zrevrange(key, start, stop);
};

/**
 * Remove one or more members from a sorted set.
 * @param {string} key
 * @param {...string} members
 */
const zrem = async (key, ...members) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return client.zrem(key, ...members);
};

/**
 * Get the score of a member (returns null if not found).
 * @param {string} key
 * @param {string} member
 * @returns {Promise<number|null>}
 */
const zscore = async (key, member) => {
  if (!isRedisAvailable()) return null;
  const client = getRedisClient();
  const raw = await client.zscore(key, member);
  return raw === null ? null : parseFloat(raw);
};

/**
 * Count members in a sorted set.
 * @param {string} key
 * @returns {Promise<number>}
 */
const zcard = async (key) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return client.zcard(key);
};

/**
 * Get members with scores within a numeric score range (descending).
 * @param {string} key
 * @param {number} min
 * @param {number} max
 * @returns {Promise<Array<{ member: string, score: number }>>}
 */
const zrangebyscore = async (key, min, max) => {
  if (!isRedisAvailable()) return [];
  const client = getRedisClient();
  const raw = await client.zrangebyscore(key, min, max, 'WITHSCORES');
  const result = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
  }
  return result;
};

// ─── Hash operations ───────────────────────────────────────────────────────────

/**
 * Set one field in a hash.
 * @param {string} key
 * @param {string} field
 * @param {*} value
 */
const hset = async (key, field, value) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  const serialised = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return client.hset(key, field, serialised);
};

/**
 * Set multiple fields in a hash at once.
 * @param {string} key
 * @param {Record<string, *>} data
 */
const hmset = async (key, data) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  const flat = Object.entries(data).flatMap(([f, v]) => [
    f,
    typeof v === 'object' ? JSON.stringify(v) : String(v),
  ]);
  return client.hset(key, ...flat);
};

/**
 * Get one field from a hash.
 * @param {string} key
 * @param {string} field
 * @returns {Promise<*|null>}
 */
const hget = async (key, field) => {
  if (!isRedisAvailable()) return null;
  const client = getRedisClient();
  const raw = await client.hget(key, field);
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return raw; }
};

/**
 * Get all fields and values of a hash as a plain object.
 * Numeric-looking values are auto-cast to numbers.
 * @param {string} key
 * @returns {Promise<Record<string, *>|null>}
 */
const hgetall = async (key) => {
  if (!isRedisAvailable()) return null;
  const client = getRedisClient();
  const raw = await client.hgetall(key);
  if (!raw) return null;
  const result = {};
  for (const [f, v] of Object.entries(raw)) {
    try { result[f] = JSON.parse(v); } catch { result[f] = v; }
  }
  return result;
};

/**
 * Delete one or more fields from a hash.
 * @param {string} key
 * @param {...string} fields
 */
const hdel = async (key, ...fields) => {
  if (!isRedisAvailable()) return 0;
  const client = getRedisClient();
  return client.hdel(key, ...fields);
};

module.exports = {
  // String / generic
  set, get, del, update, exists, expire, ttl, increment, keys,
  // Sorted Set
  zadd, zaddMany, zrevrange, zrem, zscore, zcard, zrangebyscore,
  // Hash
  hset, hmset, hget, hgetall, hdel,
};
