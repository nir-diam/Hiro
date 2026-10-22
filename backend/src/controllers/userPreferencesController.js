const userPreferencesService = require('../services/userPreferencesService');

const getMine = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const prefs = await userPreferencesService.getForUser(userId);
    return res.json(prefs);
  } catch (err) {
    console.error('[userPreferencesController.getMine]', err);
    return res.status(500).json({ message: err.message || 'Failed to load preferences' });
  }
};

const patchMine = async (req, res) => {
  try {
    const userId = req.user?.sub;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ message: 'Invalid preferences payload' });
    }
    const prefs = await userPreferencesService.updateForUser(userId, patch);
    return res.json(prefs);
  } catch (err) {
    const code = err?.parent?.code || err?.original?.code;
    console.error('[userPreferencesController.patchMine]', code || err?.name, err?.message || err);
    if (code === '57014' || code === '55P03') {
      return res.status(503).json({ message: 'Database is busy, preference save was not stored' });
    }
    return res.status(500).json({ message: err.message || 'Failed to save preferences' });
  }
};

module.exports = { getMine, patchMine };
