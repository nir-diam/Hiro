const appLogService = require('../services/appLogService');

const list = async (req, res) => {
  try {
    const result = await appLogService.list(req.query || {});
    res.json(result);
  } catch (err) {
    console.error('[appLogController.list]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to list logs' });
  }
};

const getOne = async (req, res) => {
  try {
    const row = await appLogService.getById(req.params.id);
    res.json(row);
  } catch (err) {
    console.error('[appLogController.getOne]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load log' });
  }
};

const stats = async (_req, res) => {
  try {
    const result = await appLogService.stats();
    res.json(result);
  } catch (err) {
    console.error('[appLogController.stats]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load stats' });
  }
};

const listSources = async (_req, res) => {
  try {
    const sources = await appLogService.listSources();
    res.json({ sources });
  } catch (err) {
    console.error('[appLogController.listSources]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load sources' });
  }
};

const create = async (req, res) => {
  try {
    const row = await appLogService.create(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[appLogController.create]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to create log' });
  }
};

const remove = async (req, res) => {
  try {
    await appLogService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[appLogController.remove]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to delete log' });
  }
};

module.exports = { list, getOne, stats, listSources, create, remove };
