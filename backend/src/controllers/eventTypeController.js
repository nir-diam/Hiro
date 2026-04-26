const eventTypeService = require('../services/eventTypeService');

const list = async (_req, res) => {
  try {
    const rows = await eventTypeService.list();
    res.json(rows);
  } catch (err) {
    console.error('[eventTypeController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list event types' });
  }
};

const create = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    const row = await eventTypeService.create(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[eventTypeController.create]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create event type' });
  }
};

const update = async (req, res) => {
  try {
    const updated = await eventTypeService.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('[eventTypeController.update]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to update event type' });
  }
};

const remove = async (req, res) => {
  try {
    await eventTypeService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('[eventTypeController.remove]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to delete event type' });
  }
};

module.exports = { list, create, update, remove };
