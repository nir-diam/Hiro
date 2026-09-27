const { getBearerToken } = require('./authMiddleware');
const agentAuthService = require('../services/agentAuthService');

/**
 * Blocks agent JWTs from every route mounted after this middleware.
 * Agent API lives under /api/agent and must be registered before this.
 */
const rejectAgentTokenMiddleware = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return next();

  try {
    agentAuthService.verifyAgentToken(token);
    return res.status(403).json({ message: 'Agent token cannot access this API' });
  } catch {
    return next();
  }
};

module.exports = rejectAgentTokenMiddleware;
