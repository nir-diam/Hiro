const clientTaskService = require('../services/clientTaskService');

const list = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    const organizationId = req.query?.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const rows = await clientTaskService.listByClientId(clientId, { organizationId });
    res.json(rows);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list tasks' });
  }
};

const listAll = async (_req, res) => {
  try {
    const rows = await clientTaskService.listAllWithClient();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list tasks' });
  }
};

const create = async (req, res) => {
  try {
    const clientId = String(req.params.id || '').trim();
    const body = { ...(req.body || {}) };
    if (body.organizationId != null) {
      body.organizationId = String(body.organizationId).trim() || null;
    }
    const row = await clientTaskService.createForClient(clientId, body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const row = await clientTaskService.update(req.params.taskId, req.body);
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await clientTaskService.remove(req.params.taskId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, listAll, create, update, remove };
