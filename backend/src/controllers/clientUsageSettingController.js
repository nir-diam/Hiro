const clientUsageSettingService = require('../services/clientUsageSettingService');

const assertCanAccessClient = (req, targetClientId) => {
  const u = req.dbUser;
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  if (!u.clientId) return false;
  return String(u.clientId) === String(targetClientId);
};

const get = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const data = await clientUsageSettingService.getByClientId(id);
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to load usage settings' });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const data = await clientUsageSettingService.upsert(id, req.body || {});
    return res.json(data);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Failed to save usage settings' });
  }
};

module.exports = { get, update };
