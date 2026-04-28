const { Op, fn, col, where, cast } = require('sequelize');
const AuditLog = require('../models/AuditLog');

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 20;
/** All rows for one entity (audit “all his data”) — hard cap to protect DB. */
const BY_ENTITY_MAX_PAGE_SIZE = 1000;
const DEFAULT_BY_ENTITY_PAGE_SIZE = 500;

const ENTITY_TYPE_FROM_KEY = {
  candidate: 'Candidate',
  job: 'Job',
  client: 'Client',
};

const resolveEntityType = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (ENTITY_TYPE_FROM_KEY[lower]) return ENTITY_TYPE_FROM_KEY[lower];
  if (['Candidate', 'Job', 'Client'].includes(s)) return s;
  return null;
};

const buildAvatarFromName = (name) => {
  const s = String(name || '').trim();
  if (!s) return null;
  const parts = s.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 3) || null;
};

const sanitizeLevel = (val) => {
  const v = String(val || '').toLowerCase();
  return AuditLog.LEVELS.includes(v) ? v : 'info';
};

const sanitizeAction = (val) => {
  const v = String(val || '').toLowerCase();
  return AuditLog.ACTIONS.includes(v) ? v : 'system';
};

const toPlain = (row) => row.get({ plain: true });

const buildWhereFromQuery = (query = {}) => {
  const where_ = {};

  if (query.level && query.level !== 'all' && AuditLog.LEVELS.includes(query.level)) {
    where_.level = query.level;
  }
  if (query.action && query.action !== 'all' && AuditLog.ACTIONS.includes(query.action)) {
    where_.action = query.action;
  }

  if (query.from || query.to) {
    where_.timestamp = {};
    if (query.from) {
      const d = new Date(query.from);
      if (!Number.isNaN(d.getTime())) where_.timestamp[Op.gte] = d;
    }
    if (query.to) {
      const d = new Date(query.to);
      if (!Number.isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        where_.timestamp[Op.lte] = d;
      }
    }
    if (Object.keys(where_.timestamp).length === 0) delete where_.timestamp;
  }

  const search = String(query.search || '').trim();
  if (search) {
    const like = `%${search}%`;
    where_[Op.or] = [
      { description: { [Op.iLike]: like } },
      { userName: { [Op.iLike]: like } },
      { userEmail: { [Op.iLike]: like } },
      { userIp: { [Op.iLike]: like } },
      { entityName: { [Op.iLike]: like } },
      { entityId: { [Op.iLike]: like } },
      // id is UUID; allow partial match by casting to text
      where(cast(col('id'), 'TEXT'), { [Op.iLike]: like }),
    ];
  }

  return where_;
};

const list = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const { rows, count } = await AuditLog.findAndCountAll({
    where: buildWhereFromQuery(query),
    order: [['timestamp', 'DESC']],
    limit: pageSize,
    offset,
  });

  return {
    items: rows.map(toPlain),
    total: count,
    page,
    pageSize,
    hasMore: offset + rows.length < count,
  };
};

const getById = async (id) => {
  const row = await AuditLog.findByPk(id);
  if (!row) {
    const err = new Error('Audit log not found');
    err.status = 404;
    throw err;
  }
  return toPlain(row);
};

const create = async (payload = {}) => {
  const row = await AuditLog.create({
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    level: sanitizeLevel(payload.level),
    action: sanitizeAction(payload.action),
    description: String(payload.description || '').slice(0, 4000),
    userId: payload.userId || null,
    userName: payload.userName ? String(payload.userName).slice(0, 255) : null,
    userEmail: payload.userEmail ? String(payload.userEmail).slice(0, 255) : null,
    userRole: payload.userRole ? String(payload.userRole).slice(0, 64) : null,
    userIp: payload.userIp ? String(payload.userIp).slice(0, 64) : null,
    userAvatar: payload.userAvatar
      ? String(payload.userAvatar).slice(0, 8)
      : buildAvatarFromName(payload.userName),
    entityType: payload.entityType ? String(payload.entityType).slice(0, 64) : null,
    entityId: payload.entityId ? String(payload.entityId).slice(0, 128) : null,
    entityName: payload.entityName ? String(payload.entityName).slice(0, 255) : null,
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    changes: Array.isArray(payload.changes) ? payload.changes : [],
  });
  return toPlain(row);
};

const remove = async (id) => {
  const row = await AuditLog.findByPk(id);
  if (!row) {
    const err = new Error('Audit log not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return true;
};

/**
 * All audit log rows for a given business entity (Candidate / Job / Client).
 * `type` query param style: candidate | job | client (case-insensitive) or PascalCase.
 */
const listByEntity = async (typeKey, entityId, query = {}) => {
  const entityType = resolveEntityType(typeKey);
  if (!entityType) {
    const err = new Error('Invalid type: use candidate, job, or client');
    err.status = 400;
    throw err;
  }
  const id = String(entityId || '').trim();
  if (!id) {
    const err = new Error('entity id is required');
    err.status = 400;
    throw err;
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    BY_ENTITY_MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_BY_ENTITY_PAGE_SIZE),
  );
  const offset = (page - 1) * pageSize;

  const { rows, count } = await AuditLog.findAndCountAll({
    where: {
      entityType,
      entityId: id,
    },
    order: [['timestamp', 'DESC']],
    limit: pageSize,
    offset,
  });

  return {
    type: typeKey,
    entityType,
    entityId: id,
    items: rows.map(toPlain),
    total: count,
    page,
    pageSize,
    hasMore: offset + rows.length < count,
  };
};

const stats = async () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [eventsToday, errors24h, activeUsersRows] = await Promise.all([
    AuditLog.count({ where: { timestamp: { [Op.gte]: startOfToday } } }),
    AuditLog.count({
      where: {
        level: { [Op.in]: ['error', 'critical'] },
        timestamp: { [Op.gte]: last24h },
      },
    }),
    AuditLog.findAll({
      attributes: [[fn('DISTINCT', col('userEmail')), 'email']],
      where: {
        userEmail: { [Op.ne]: null },
        timestamp: { [Op.gte]: last24h },
      },
      raw: true,
    }),
  ]);

  return {
    eventsToday,
    errors24h,
    activeUsers: activeUsersRows.length,
  };
};

module.exports = {
  list,
  getById,
  create,
  remove,
  stats,
  listByEntity,
};
