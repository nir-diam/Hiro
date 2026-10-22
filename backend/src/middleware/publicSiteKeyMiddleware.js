const { PUBLIC_SITE_KEY_HEADER } = require('../constants/publicJobsApi');
const publicSiteKeyService = require('../services/publicSiteKeyService');

/**
 * Requires X-Hiro-Site-Key (server-to-server). Sets req.publicSiteContext.
 */
const publicSiteKeyMiddleware = async (req, res, next) => {
  try {
    const raw =
      req.headers[PUBLIC_SITE_KEY_HEADER] ||
      req.headers['X-Hiro-Site-Key'] ||
      req.headers['x-hiro-site-key'];
    const ctx = await publicSiteKeyService.resolveSiteKey(raw);
    if (!ctx) {
      return res.status(401).json({ message: 'Invalid or missing site key', code: 'INVALID_SITE_KEY' });
    }
    req.publicSiteContext = ctx;
    if (ctx.persisted && ctx.id) {
      const PublicSiteKey = require('../models/PublicSiteKey');
      PublicSiteKey.increment('requestCount', { by: 1, where: { id: ctx.id } }).catch(() => {});
      PublicSiteKey.update({ lastUsedAt: new Date() }, { where: { id: ctx.id } }).catch(() => {});
    }
    return next();
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Site key validation failed' });
  }
};

module.exports = {
  publicSiteKeyMiddleware,
};
