/**
 * Process-local TTL cache. Used as L1 when Redis is on, and as the only cache
 * when REDIS_ENABLED=false (staging/dev). One worker, bounded entries, TTL expiry.
 */
const DEFAULT_MAX_ENTRIES = Math.max(
  50,
  Number.parseInt(process.env.PROCESS_MEMORY_CACHE_MAX || '200', 10) || 200,
);

const isEnabled = () =>
  process.env.PROCESS_MEMORY_CACHE !== 'false'
  && process.env.PROCESS_MEMORY_CACHE !== '0';

const store = new Map();
const counters = new Map();

const pruneExpired = () => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  while (store.size > DEFAULT_MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
};

const get = (key) => {
  if (!isEnabled()) return undefined;
  const k = String(key || '').trim();
  if (!k) return undefined;
  const entry = store.get(k);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(k);
    return undefined;
  }
  return entry.value;
};

const set = (key, value, ttlSeconds = 90) => {
  if (!isEnabled() || value === undefined) return;
  const k = String(key || '').trim();
  if (!k) return;
  const ttl = Math.max(1, Number(ttlSeconds) || 90);
  store.delete(k);
  store.set(k, { value, expiresAt: Date.now() + ttl * 1000 });
  if (store.size > DEFAULT_MAX_ENTRIES) pruneExpired();
};

const del = (...keys) => {
  let n = 0;
  for (const key of keys) {
    const k = String(key || '').trim();
    if (!k) continue;
    if (store.delete(k)) n += 1;
    counters.delete(k);
  }
  return n;
};

const increment = (key) => {
  const k = String(key || '').trim();
  if (!k) return 0;
  const next = (Number(counters.get(k) || 0) || 0) + 1;
  counters.set(k, next);
  return next;
};

const getCounter = (key) => {
  const k = String(key || '').trim();
  if (!k) return '0';
  const v = counters.get(k);
  return v != null ? String(v) : '0';
};

const clear = () => {
  store.clear();
  counters.clear();
};

module.exports = {
  isEnabled,
  get,
  set,
  del,
  increment,
  getCounter,
  clear,
  size: () => store.size,
};
