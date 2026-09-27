const { normalizeScopes } = require('../constants/agentScopes');

/**
 * Require one of the given scopes on req.agent (set by agentAuthMiddleware).
 * Example: router.get('/me', agentAuthMiddleware, requireAgentScope('agent:ping'), ...)
 */
const requireAgentScope = (...requiredScopes) => (req, res, next) => {
  const needed = normalizeScopes(requiredScopes);
  if (!needed.length) return next();

  const granted = normalizeScopes(req.agent?.scopes);
  const ok = needed.some((scope) => granted.includes(scope));
  if (!ok) {
    return res.status(403).json({ message: 'Insufficient agent scope' });
  }
  return next();
};

module.exports = requireAgentScope;
