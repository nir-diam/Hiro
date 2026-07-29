const clientPipelineService = require('../services/clientPipelineService');

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
    const pipelines = await clientPipelineService.listOrSeedByClientId(id);
    return res.json({ pipelines });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load pipelines' });
  }
};

const sync = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const body = req.body || {};
    const incoming = Array.isArray(body.pipelines) ? body.pipelines : Array.isArray(body) ? body : [];
    const pipelines = await clientPipelineService.syncClientPipelines(id, incoming);
    return res.json({ pipelines });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to save pipelines' });
  }
};

const create = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const pipeline = await clientPipelineService.createPipeline(id, req.body || {});
    return res.status(201).json(pipeline);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

module.exports = { list, sync, create };
