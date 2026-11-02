const {
  emptyStore,
  applyResponseHeaders,
  logRequestCache,
  headersEnabled,
  runWithNext,
} = require('../utils/appCacheContext');

const attachResponseHooks = (req, res, store) => {
  if (res.__appCacheHooksAttached) return;
  res.__appCacheHooksAttached = true;

  const flushHeaders = () => {
    if (headersEnabled()) applyResponseHeaders(res, store);
  };

  const origJson = res.json.bind(res);
  res.json = (...args) => {
    flushHeaders();
    return origJson(...args);
  };

  const origSend = res.send.bind(res);
  res.send = (...args) => {
    flushHeaders();
    return origSend(...args);
  };

  res.on('finish', () => {
    logRequestCache(req, res.statusCode, store);
  });
};

/** Per-request cache observability (X-App-Cache, X-App-Cache-Detail). */
const appCacheMiddleware = (req, res, next) => {
  const store = emptyStore();
  attachResponseHooks(req, res, store);
  runWithNext(store, next);
};

module.exports = appCacheMiddleware;
