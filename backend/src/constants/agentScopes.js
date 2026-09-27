/** Scopes for the isolated /api/agent surface. Add new scopes here as endpoints are added. */
const AGENT_SCOPES = {
  PING: 'agent:ping',
  TAG_AI_DECISIONS_READ: 'agent:tag-ai-decisions:read',
  TAG_AI_DECISIONS_WRITE: 'agent:tag-ai-decisions:write',
  ORG_AI_DECISIONS_READ: 'agent:organization-ai-decisions:read',
  ORG_AI_DECISIONS_WRITE: 'agent:organization-ai-decisions:write',
  ORGANIZATIONS_READ: 'agent:organizations:read',
  ORGANIZATIONS_WRITE: 'agent:organizations:write',
  TAGS_READ: 'agent:tags:read',
  TAGS_WRITE: 'agent:tags:write',
  CLIENTS_READ: 'agent:clients:read',
  CLIENTS_WRITE: 'agent:clients:write',
  AUDIT_LOGS_READ: 'agent:audit-logs:read',
};

const ALL_AGENT_SCOPES = Object.freeze(Object.values(AGENT_SCOPES));

const normalizeScopes = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return [...new Set(list.map((s) => String(s || '').trim()).filter(Boolean))];
};

const isKnownScope = (scope) => ALL_AGENT_SCOPES.includes(scope);

const sanitizeScopes = (raw) => normalizeScopes(raw).filter(isKnownScope);

module.exports = {
  AGENT_SCOPES,
  ALL_AGENT_SCOPES,
  normalizeScopes,
  sanitizeScopes,
  isKnownScope,
};
