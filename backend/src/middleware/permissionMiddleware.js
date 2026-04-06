const authMiddleware = require('./authMiddleware');
const User = require('../models/User');
const Client = require('../models/Client');
const { hasPagePermission } = require('../services/permissionService');

/**
 * After authMiddleware: load DB user (and client row when linked) without page permission checks.
 */
const attachDbUser = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await User.findByPk(userId, {
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'displayName'], required: false },
      ],
    });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    req.dbUser = user;
    return next();
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load user' });
  }
};

/**
 * After authMiddleware: load DB user and require a page:* permission.
 * Example: router.use(authMiddleware, requirePagePermission('page:admin'));
 */
const requirePagePermission = (pageKey) => async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (!hasPagePermission(user, pageKey)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.dbUser = user;
    return next();
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Permission check failed' });
  }
};

module.exports = {
  authMiddleware,
  attachDbUser,
  requirePagePermission,
};
