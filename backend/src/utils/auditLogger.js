const auditLogService = require('../services/auditLogService');

/**
 * Lightweight async fire-and-forget logger.
 * Failures are swallowed (and logged) so audit-trail bugs never break the
 * primary request.
 *
 * Use either with an Express `req` (auto-fills user/ip/UA from the request)
 * or with explicit fields when called from non-HTTP contexts (cron, queues).
 *
 * Examples:
 *   auditLogger.log(req, { action: 'create', description: 'Job created', entity: { type: 'Job', id, name } });
 *   auditLogger.log(null, { level: 'error', action: 'system', description: 'SMTP timeout' });
 */
const extractIp = (req) => {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) {
    const first = String(xff).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || req.connection?.remoteAddress || null;
};

const extractUserAgent = (req) => {
  if (!req) return null;
  return req.headers?.['user-agent'] || null;
};

const userFromRequest = (req) => {
  if (!req) return {};
  const dbUser = req.dbUser;
  const jwtUser = req.user || {};
  const user = dbUser || jwtUser;
  if (!user) return {};
  const name = user.fullName || user.name || dbUser?.firstName
    ? `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() || user.name || user.email
    : user.email;
  return {
    userId: user.id || jwtUser.sub || null,
    userName: name || null,
    userEmail: user.email || null,
    userRole: user.role || null,
  };
};

const log = (req, payload = {}) => {
  const baseUser = userFromRequest(req);
  const merged = {
    timestamp: payload.timestamp || new Date(),
    level: payload.level || 'info',
    action: payload.action || 'system',
    description: payload.description || '',
    userId: payload.userId !== undefined ? payload.userId : baseUser.userId,
    userName: payload.userName !== undefined ? payload.userName : baseUser.userName,
    userEmail: payload.userEmail !== undefined ? payload.userEmail : baseUser.userEmail,
    userRole: payload.userRole !== undefined ? payload.userRole : baseUser.userRole,
    userIp: payload.userIp !== undefined ? payload.userIp : extractIp(req),
    userAvatar: payload.userAvatar,
    entityType: payload.entity?.type ?? payload.entityType ?? null,
    entityId: payload.entity?.id ?? payload.entityId ?? null,
    entityName: payload.entity?.name ?? payload.entityName ?? null,
    metadata: {
      ...(extractUserAgent(req) ? { userAgent: extractUserAgent(req) } : {}),
      ...(payload.metadata || {}),
    },
    changes: Array.isArray(payload.changes) ? payload.changes : [],
  };

  // Fire-and-forget. Never let audit failures break callers.
  return auditLogService.create(merged).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[auditLogger] failed to write audit log', err);
  });
};

module.exports = { log };
