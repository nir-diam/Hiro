const referenceInfoService = require('../services/referenceInfoService');

const list = async (_req, res) => {
  try {
    const rows = await referenceInfoService.list();
    res.json(rows);
  } catch (err) {
    console.error('[referenceInfoController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list reference info entries' });
  }
};

const create = async (req, res) => {
  try {
    const row = await referenceInfoService.create(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    console.error('[referenceInfoController.create]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create reference info entry' });
  }
};

const update = async (req, res) => {
  try {
    const updated = await referenceInfoService.update(req.params.id, req.body || {});
    res.json(updated);
  } catch (err) {
    console.error('[referenceInfoController.update]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to update reference info entry' });
  }
};

const remove = async (req, res) => {
  try {
    await referenceInfoService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    console.error('[referenceInfoController.remove]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to delete reference info entry' });
  }
};

module.exports = { list, create, update, remove };
