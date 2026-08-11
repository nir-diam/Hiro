const appLogService = require('./appLogService');

const SOURCE = 'organization_deep_enrich';

const resolveIdentity = (req) => {
  const userId = req.user?.sub || req.dbUser?.id || null;
  const userEmail = req.dbUser?.email || req.user?.email || null;
  const clientKey = userId
    ? null
    : String(req.ip || req.headers['x-forwarded-for'] || 'anonymous').split(',')[0].trim();
  return { userId, userEmail, clientKey };
};

const recordUsage = async (identity, { companyIds = [] } = {}) => {
  const ids = Array.isArray(companyIds) ? companyIds : [];
  await appLogService.create({
    level: 'info',
    source: SOURCE,
    message: `Deep enrich executed (${ids.length} companies)`,
    userId: identity.userId,
    userEmail: identity.userEmail,
    context: {
      companyIds: ids,
      companyCount: ids.length,
      ...(identity.clientKey ? { clientKey: identity.clientKey } : {}),
    },
  });
};

module.exports = {
  SOURCE,
  resolveIdentity,
  recordUsage,
};
