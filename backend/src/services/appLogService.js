const { Op, fn, col, where, cast } = require('sequelize');
const AppLog = require('../models/AppLog');

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 25;

const sanitizeLevel = (val) => {
  const v = String(val || '').toLowerCase();
  return AppLog.LEVELS.includes(v) ? v : 'info';
};

const toPlain = (row) => row.get({ plain: true });

const buildWhereFromQuery = (query = {}) => {
  const where_ = {};

  if (query.level && query.level !== 'all' && AppLog.LEVELS.includes(query.level)) {
    where_.level = query.level;
  }

  const source = String(query.source || '').trim();
  if (source && source !== 'all') {
    where_.source = { [Op.iLike]: source };
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
      { message: { [Op.iLike]: like } },
      { source: { [Op.iLike]: like } },
      { userEmail: { [Op.iLike]: like } },
      { requestId: { [Op.iLike]: like } },
      { stackTrace: { [Op.iLike]: like } },
      where(cast(col('id'), 'TEXT'), { [Op.iLike]: like }),
    ];
  }

  return where_;
};

const list = async (query = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * pageSize;

  const { rows, count } = await AppLog.findAndCountAll({
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
  const row = await AppLog.findByPk(id);
  if (!row) {
    const err = new Error('Log entry not found');
    err.status = 404;
    throw err;
  }
  return toPlain(row);
};

const create = async (payload = {}) => {
  const row = await AppLog.create({
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    level: sanitizeLevel(payload.level),
    source: String(payload.source || 'system').slice(0, 128),
    message: String(payload.message || '').slice(0, 8000),
    context: payload.context && typeof payload.context === 'object' ? payload.context : {},
    userId: payload.userId || null,
    userEmail: payload.userEmail ? String(payload.userEmail).slice(0, 255) : null,
    requestId: payload.requestId ? String(payload.requestId).slice(0, 64) : null,
    stackTrace: payload.stackTrace ? String(payload.stackTrace).slice(0, 12000) : null,
  });
  return toPlain(row);
};

const remove = async (id) => {
  const row = await AppLog.findByPk(id);
  if (!row) {
    const err = new Error('Log entry not found');
    err.status = 404;
    throw err;
  }
  await row.destroy();
  return true;
};

const stats = async () => {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [logsToday, errors24h, sourcesRows] = await Promise.all([
    AppLog.count({ where: { timestamp: { [Op.gte]: startOfToday } } }),
    AppLog.count({
      where: {
        level: { [Op.in]: ['error', 'fatal'] },
        timestamp: { [Op.gte]: last24h },
      },
    }),
    AppLog.findAll({
      attributes: [[fn('DISTINCT', col('source')), 'source']],
      where: { timestamp: { [Op.gte]: last24h } },
      raw: true,
    }),
  ]);

  return {
    logsToday,
    errors24h,
    activeSources: sourcesRows.length,
  };
};

const listSources = async () => {
  const rows = await AppLog.findAll({
    attributes: [[fn('DISTINCT', col('source')), 'source']],
    order: [[col('source'), 'ASC']],
    raw: true,
  });
  return rows.map((r) => r.source).filter(Boolean);
};

module.exports = {
  list,
  getById,
  create,
  remove,
  stats,
  listSources,
};
