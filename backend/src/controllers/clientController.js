const clientService = require('../services/clientService');
const User = require('../models/User');

const list = async (req, res) => {
  const raw = req.query?.activeOnly;
  const activeOnly = raw === true || raw === 'true' || raw === '1';
  const clients = await clientService.list({ activeOnly });
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

/** Staff users (User.clientId) for job distribution / notifications — no passwords. */
const listStaffUsers = async (req, res) => {
  try {
    const clientId = req.params.id;
    const rows = await User.findAll({
      where: { clientId },
      attributes: ['id', 'name', 'email', 'role', 'phone', 'isActive'],
      order: [['name', 'ASC']],
    });
    res.json(rows.map((u) => u.toJSON()));
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list staff users' });
  }
};

module.exports = { list, get, create, update, remove, listStaffUsers };

