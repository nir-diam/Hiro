const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const headersEnabled = () =>
  process.env.APP_CACHE_HEADERS !== 'false' && process.env.APP_CACHE_HEADERS !== '0';

const emptyStore = () => ({ events: [] });

const getActiveStore = () => storage.getStore() || null;

/** Express: run downstream handlers with this request's cache event store. */
const runWithNext = (store, next) => storage.run(store, next);

/**
 * @param {'hit'|'miss'|'bypass'} kind
 * @param {string} scope - short label, e.g. candidates:list (no IDs)
 */
const record = (kind, scope) => {
  const label = String(scope || 'unknown').trim();
  if (!label) return;
  const store = getActiveStore();
  if (!store) return;
  store.events.push({ kind, scope: label });
};

const recordHit = (scope) => record('hit', scope);
const recordMiss = (scope) => record('miss', scope);
const recordBypass = (scope) => record('bypass', scope);

/** @returns {'HIT'|'MISS'|'BYPASS'|null} */
const summarize = (store = getActiveStore()) => {
  if (!store?.events?.length) return null;
  const kinds = store.events.map((e) => e.kind);
  if (kinds.every((k) => k === 'bypass')) return 'BYPASS';
  if (kinds.some((k) => k === 'miss')) return 'MISS';
  if (kinds.some((k) => k === 'hit')) return 'HIT';
  return 'BYPASS';
};

const formatDetail = (store = getActiveStore()) => {
  if (!store?.events?.length) return '';
  const byScope = new Map();
  for (const { kind, scope } of store.events) {
    const prev = byScope.get(scope);
    if (!prev || kind === 'miss' || (kind === 'hit' && prev === 'bypass')) {
      byScope.set(scope, kind);
    }
  }
  return [...byScope.entries()]
    .map(([scope, kind]) => `${scope}=${kind.toUpperCase()}`)
    .join(',');
};

const applyResponseHeaders = (res, store) => {
  if (!headersEnabled()) return;
  if (res.getHeader('X-App-Cache')) return;
  const summary = summarize(store);
  if (!summary) return;
  res.setHeader('X-App-Cache', summary);
  const detail = formatDetail(store);
  if (detail) res.setHeader('X-App-Cache-Detail', detail);
};

const logRequestCache = (req, statusCode, store) => {
  if (!headersEnabled()) return;
  const summary = summarize(store);
  if (!summary) return;
  const detail = formatDetail(store);
  const path = req.originalUrl?.split('?')[0] || req.path || '';
  // eslint-disable-next-line no-console
  console.log(
    `[appCache] ${req.method} ${path} ${statusCode} ${summary}${detail ? ` (${detail})` : ''}`,
  );
};

module.exports = {
  headersEnabled,
  emptyStore,
  runWithNext,
  getActiveStore,
  recordHit,
  recordMiss,
  recordBypass,
  summarize,
  formatDetail,
  applyResponseHeaders,
  logRequestCache,
};
