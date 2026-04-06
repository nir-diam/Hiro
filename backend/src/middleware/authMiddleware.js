const jwt = require('jsonwebtoken');

const getBearerToken = (req) => {
  const raw =
    (typeof req.get === 'function' && req.get('Authorization')) ||
    req.headers?.authorization ||
    '';
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('bearer ')) return s.slice(7).trim();
  return s;
};

const authMiddleware = (req, res, next) => {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Missing token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_me');
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/** Sets `req.user` when a valid Bearer token is present; continues without auth if absent or invalid. */
const optionalAuth = (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'change_me');
  } catch {
    req.user = null;
  }
  return next();
};

module.exports = authMiddleware;
module.exports.getBearerToken = getBearerToken;
module.exports.optionalAuth = optionalAuth;

