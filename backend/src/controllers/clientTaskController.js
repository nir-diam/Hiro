const clientTaskService = require('../services/clientTaskService');

const list = async (req, res) => {
  const rows = await clientTaskService.listByClientId(req.params.id);
  res.json(rows);
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
    const row = await clientTaskService.createForClient(req.params.id, req.body);
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

