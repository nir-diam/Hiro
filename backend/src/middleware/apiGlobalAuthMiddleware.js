const authMiddleware = require('./authMiddleware');

/**
 * Paths under /api that must stay reachable without a staff JWT.
 * Use req.originalUrl (full path). Match prefix or exact.
 */
const PUBLIC_PREFIXES = [
  '/api/auth',
  '/api/public/v1',
  '/api/public/jobs',
  /** Location catalog — used by pickers via plain fetch (no staff JWT). */
  '/api/cities',
];

const PUBLIC_EXACT = new Set([
  'POST /api/inforu/webhooks/mo',
  'POST /api/inforu/webhooks/dlr',
  'POST /api/email-uploads/email-upload',
]);

const normalizePath = (req) => {
  const fromOriginal = String(req.originalUrl || '').split('?')[0];
  if (fromOriginal.startsWith('/api')) {
    return fromOriginal.replace(/\/+$/, '') || '/';
  }
  const base = String(req.baseUrl || '');
  const rel = String(req.url || req.path || '').split('?')[0];
  const combined = `${base}${rel}`.replace(/\/{2,}/g, '/');
  return combined.replace(/\/+$/, '') || '/';
};

/** Read-only picklist taxonomy (labels/values for forms). Mutations stay JWT-protected. */
const isPublicPicklistRead = (req) => {
  if (String(req.method || 'GET').toUpperCase() !== 'GET') return false;
  const path = normalizePath(req);
  return path === '/api/picklists' || path.startsWith('/api/picklists/');
};

const isPublicApiRequest = (req) => {
  if (req.method === 'OPTIONS') return true;
  const path = normalizePath(req);
  if (PUBLIC_EXACT.has(`${req.method.toUpperCase()} ${path}`)) return true;
  if (isPublicPicklistRead(req)) return true;
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
};

/** Require valid staff JWT on all /api routes except the public allowlist above. */
const apiGlobalAuthMiddleware = (req, res, next) => {
  if (isPublicApiRequest(req)) return next();
  return authMiddleware(req, res, next);
};

module.exports = apiGlobalAuthMiddleware;
module.exports.isPublicApiRequest = isPublicApiRequest;
module.exports.PUBLIC_PREFIXES = PUBLIC_PREFIXES;
module.exports.PUBLIC_EXACT = PUBLIC_EXACT;
