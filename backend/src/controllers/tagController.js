const tagService = require('../services/tagService');

const enrich = async (req, res) => {
  try {
    const suggestions = await tagService.enrichSuggestions(req.body.tags || []);
    res.json({ suggestions });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Enrich failed' });
  }
};

const list = async (_req, res) => {
  const tags = await tagService.list();
  res.json(tags);
};

const get = async (req, res) => {
  try {
    const tag = await tagService.getById(req.params.id);
    res.json(tag);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const tag = await tagService.create(req.body);
    res.status(201).json(tag);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const tag = await tagService.update(req.params.id, req.body);
    res.json(tag);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await tagService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, get, create, update, remove, enrich };

