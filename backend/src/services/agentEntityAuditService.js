const auditLogger = require('../utils/auditLogger');

const AGENT_ACTOR = {
  userId: null,
  userName: 'סוכן AI (Hiro)',
  userEmail: null,
};

function plainRow(row) {
  if (!row) return null;
  return row.get ? row.get({ plain: true }) : { ...row };
}

function pushChange(changes, field, oldValue, newValue) {
  const oldS = oldValue == null ? '' : String(oldValue);
  const newS = newValue == null ? '' : String(newValue);
  if (oldS === newS) return;
  changes.push({ field, oldValue: oldS, newValue: newS });
}

function buildFieldChanges(before, after, fields = []) {
  const changes = [];
  const b = before || {};
  const a = after || {};
  for (const field of fields) {
    pushChange(changes, field, b[field], a[field]);
  }
  return changes;
}

/**
 * Structured audit row for agent writes (enrich, merge, staging patch, etc.).
 */
async function recordAgentEntityAudit(req, {
  action = 'update',
  entityType,
  entityId,
  entityName = '',
  description = '',
  before = null,
  after = null,
  trackedFields = [],
  metadata = {},
}) {
  const beforePlain = plainRow(before);
  const afterPlain = plainRow(after) || beforePlain;
  const changes = trackedFields.length
    ? buildFieldChanges(beforePlain, afterPlain, trackedFields)
    : [];

  await auditLogger.log(req, {
    level: 'info',
    action,
    description: description || `Agent ${action} on ${entityType}`,
    entityType,
    entityId: String(entityId),
    entityName: String(entityName || '').slice(0, 255),
    metadata: {
      source: 'agent_api',
      actor: 'agent',
      agentUsername: req?.agent?.username || null,
      ...(metadata || {}),
    },
    changes,
    ...AGENT_ACTOR,
  });
}

module.exports = {
  AGENT_ACTOR,
  recordAgentEntityAudit,
  buildFieldChanges,
};
