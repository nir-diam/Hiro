const recruitmentStatusService = require('../services/recruitmentStatusService');

const assertCanAccessClient = (req, targetClientId) => {
  const u = req.dbUser;
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  if (!u.clientId) return false;
  return String(u.clientId) === String(targetClientId);
};

const list = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const rows = await recruitmentStatusService.listByClientId(id);
    return res.json({ statuses: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load statuses' });
  }
};

const sync = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const body = req.body || {};
    const incoming = Array.isArray(body.statuses) ? body.statuses : Array.isArray(body) ? body : [];
    const rows = await recruitmentStatusService.syncClientStatuses(id, incoming);
    return res.json({ statuses: rows });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to save statuses' });
  }
};

module.exports = { list, sync };
