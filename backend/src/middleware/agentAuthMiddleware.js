const { getBearerToken } = require('./authMiddleware');
const agentAuthService = require('../services/agentAuthService');
const { normalizeScopes } = require('../constants/agentScopes');

const agentAuthMiddleware = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ message: 'Missing agent token' });
  }

  try {
    const decoded = agentAuthService.verifyAgentToken(token);
    req.agentToken = decoded;
    req.agent = {
      id: decoded.sub,
      username: decoded.username,
      name: decoded.name,
      scopes: normalizeScopes(decoded.scopes),
    };
    return next();
  } catch (err) {
    return res.status(err.status || 401).json({ message: err.message || 'Invalid agent token' });
  }
};

module.exports = agentAuthMiddleware;
