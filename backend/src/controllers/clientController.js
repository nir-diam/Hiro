const clientService = require('../services/clientService');

const list = async (_req, res) => {
  const clients = await clientService.list();
  res.json(clients);
};

const get = async (req, res) => {
  try {
    const client = await clientService.getById(req.params.id);
    res.json(client);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const client = await clientService.create(req.body);
    res.status(201).json(client);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const client = await clientService.update(req.params.id, req.body);
    res.json(client);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await clientService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, get, create, update, remove };

