/** Map Sequelize / Postgres pool & timeout errors to HTTP status codes. */
const isDbPoolOrTimeoutError = (err) => {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || '');
  const code = err?.parent?.code || err?.original?.code;
  if (name === 'SequelizeConnectionAcquireTimeoutError') return true;
  if (/ConnectionAcquireTimeoutError/i.test(name)) return true;
  if (/Operation timeout/i.test(msg)) return true;
  if (code === '57014' || code === '55P03') return true;
  if (/statement timeout/i.test(msg) || /lock timeout/i.test(msg)) return true;
  return false;
};

const httpStatusForDbError = (err, { defaultStatus = 500 } = {}) => {
  if (isDbPoolOrTimeoutError(err)) return 503;
  if (err?.status && Number.isFinite(Number(err.status))) return Number(err.status);
  return defaultStatus;
};

module.exports = {
  isDbPoolOrTimeoutError,
  httpStatusForDbError,
};
