const recruitmentSourceService = require('../services/recruitmentSourceService');

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
    const rows = await recruitmentSourceService.listByClientId(id);
    return res.json({ sources: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load sources' });
  }
};

const listOptions = async (req, res) => {
  try {
    const clientId = req.dbUser?.clientId || null;
    const rows = await recruitmentSourceService.listOptions({ clientId });
    return res.json({ sources: rows });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load sources' });
  }
};

const create = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const row = await recruitmentSourceService.createForClient(id, req.body || {});
    return res.status(201).json({ source: row });
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to create source' });
  }
};

const update = async (req, res) => {
  try {
    const { id, sourceId } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const row = await recruitmentSourceService.updateForClient(id, sourceId, req.body || {});
    return res.json({ source: row });
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to update source' });
  }
};

const remove = async (req, res) => {
  try {
    const { id, sourceId } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    await recruitmentSourceService.removeForClient(id, sourceId);
    return res.status(204).send();
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ message: err.message || 'Failed to delete source' });
  }
};

module.exports = { list, listOptions, create, update, remove };
