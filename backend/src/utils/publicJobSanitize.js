const { PUBLIC_JOBS_RESPONSE_BLOCKLIST } = require('../constants/publicJobsApi');

const BLOCKED = new Set([
  ...PUBLIC_JOBS_RESPONSE_BLOCKLIST,
  'clientId',
  'organizationId',
  'publicBoard',
  'heroBrandSource',
  'cvForwardSettings',
  '_secrets',
  'embedding',
]);

const sanitizePublicPayload = (value) => {
  if (Array.isArray(value)) return value.map((item) => sanitizePublicPayload(item));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED.has(key)) continue;
    out[key] = sanitizePublicPayload(child);
  }
  return out;
};

const collectKeys = (value, found = new Set()) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    found.add(key);
    collectKeys(child, found);
  }
  return found;
};

module.exports = {
  BLOCKED,
  sanitizePublicPayload,
  collectKeys,
};
