/**
 * systemEventEmitter
 *
 * Bridges the admin-managed `system_events` catalog and the runtime audit
 * logger.
 *
 * Usage:
 *   const systemEventEmitter = require('../utils/systemEventEmitter');
 *
 *   await systemEventEmitter.emit(req, {
 *     triggerName: 'נקלטו קורות חיים',
 *     eventName:   'קליטת קו"ח',
 *     entityType:  'Candidate',
 *     entityId:    candidate.id,
 *     entityName:  candidate.fullName,
 *     params:      { id: candidate.id },
 *   });
 *
 * Behavior:
 *   1. Looks up the row in `system_events` by (triggerName, eventName).
 *   2. If row missing OR row.isActive=false → silently skip.
 *   3. If the entity flag for the supplied entityType is false → skip.
 *      (Candidate => forCandidate, Job => forJob, Client => forClient.)
 *   4. Renders `{placeholder}` substitutions in row.contentTemplate using
 *      `params`. Missing placeholders fall back to `—`.
 *   5. Writes a row to `audit_logs` via auditLogger, copying triggerName,
 *      eventName, colors and entity context into metadata.
 *
 * The lookup is cached for 30 seconds in-process to avoid hammering the DB.
 */

const SystemEvent = require('../models/SystemEvent');
const auditLogger = require('./auditLogger');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // key = `${trigger}::${event}` → { row, expiresAt }

const cacheKey = (triggerName, eventName) => `${triggerName}::${eventName}`;

const loadFromDb = async (triggerName, eventName) => {
  const row = await SystemEvent.findOne({
    where: { triggerName, eventName },
  });
  return row ? row.get({ plain: true }) : null;
};

const getRow = async (triggerName, eventName) => {
  const key = cacheKey(triggerName, eventName);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.row;
  const row = await loadFromDb(triggerName, eventName);
  cache.set(key, { row, expiresAt: now + CACHE_TTL_MS });
  return row;
};

const invalidateCache = (triggerName, eventName) => {
  if (triggerName && eventName) {
    cache.delete(cacheKey(triggerName, eventName));
  } else {
    cache.clear();
  }
};

const flagAllowsEntity = (row, entityType) => {
  if (!entityType) {
    // No entity context - require at least one flag enabled so we never log
    // events whose admin row has all `for*` flags off.
    return Boolean(row.forCandidate || row.forJob || row.forClient);
  }
  switch (String(entityType).toLowerCase()) {
    case 'candidate':
      return Boolean(row.forCandidate);
    case 'job':
      return Boolean(row.forJob);
    case 'client':
      return Boolean(row.forClient);
    default:
      return Boolean(row.forCandidate || row.forJob || row.forClient);
  }
};

const renderTemplate = (template, params = {}) => {
  if (!template) return '';
  return String(template).replace(/\{([^{}]+)\}/g, (_match, key) => {
    const trimmed = String(key).trim();
    const value = params[trimmed];
    if (value === undefined || value === null || value === '') return '—';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  });
};

const sanitizeEntity = (entityType) => {
  if (!entityType) return null;
  const t = String(entityType).trim();
  if (!t) return null;
  // Capitalize: Candidate / Job / Client
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

/**
 * Fire-and-forget emit. Returns a Promise that always resolves (errors are
 * caught internally and only console.error'd, so audit issues never break
 * primary requests).
 */
const emit = async (req, options = {}) => {
  try {
    const {
      triggerName,
      eventName,
      entityType,
      entityId,
      entityName,
      params = {},
      level,
      action,
    } = options || {};

    if (!triggerName || !eventName) return null;

    const row = await getRow(triggerName, eventName);
    if (!row) return null;
    if (!row.isActive) return null;
    if (!flagAllowsEntity(row, entityType)) return null;

    const description = renderTemplate(row.contentTemplate, params);
    const normalizedEntity = sanitizeEntity(entityType);

    return await auditLogger.log(req, {
      level: level || 'info',
      action: action || 'system',
      description,
      entityType: normalizedEntity,
      entityId: entityId != null ? String(entityId) : null,
      entityName: entityName != null ? String(entityName) : null,
      metadata: {
        systemEvent: {
          rowId: row.id,
          triggerName: row.triggerName,
          eventName: row.eventName,
          textColor: row.textColor,
          bgColor: row.bgColor,
        },
        params,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[systemEventEmitter.emit] failed', err);
    return null;
  }
};

module.exports = {
  emit,
  invalidateCache,
  // exposed for testing / introspection
  _getRow: getRow,
  _renderTemplate: renderTemplate,
};
