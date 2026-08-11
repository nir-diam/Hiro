const candidatePipelineService = require('../services/candidatePipelineService');

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
    const pipelines = await candidatePipelineService.listOrSeedByClientId(id);
    return res.json({ pipelines });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to load candidate pipelines' });
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
    const pipelines = await candidatePipelineService.syncClientCandidatePipelines(id, incoming);
    return res.json({ pipelines });
  } catch (err) {
    return res.status(400).json({ message: err.message || 'Failed to save candidate pipelines' });
  }
};

const create = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const pipeline = await candidatePipelineService.createPipeline(id, req.body || {});
    return res.status(201).json(pipeline);
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

module.exports = { list, sync, create };
