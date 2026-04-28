const systemEventService = require('../services/systemEventService');

const list = async (_req, res) => {
  try {
    const rows = await systemEventService.list();
    res.json(rows);
  } catch (err) {
    console.error('[systemEventController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list system events' });
  }
};

const create = async (req, res) => {
  try {
    const row = await systemEventService.create(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[systemEventController.create]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create system event' });
  }
};

const update = async (req, res) => {
  try {
    const updated = await systemEventService.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('[systemEventController.update]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to update system event' });
  }
};

const remove = async (req, res) => {
  try {
    await systemEventService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('[systemEventController.remove]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to delete system event' });
  }
};

module.exports = { list, create, update, remove };
