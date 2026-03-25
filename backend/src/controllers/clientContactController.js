const clientContactService = require('../services/clientContactService');

const list = async (req, res) => {
  const rows = await clientContactService.listByClientId(req.params.id);
  res.json(rows);
};

const listAll = async (_req, res) => {
  try {
    const rows = await clientContactService.listAllWithClient();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to list contacts' });
  }
};

const create = async (req, res) => {
  try {
    const row = await clientContactService.createForClient(req.params.id, req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const row = await clientContactService.update(req.params.contactId, req.body);
    res.json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await clientContactService.remove(req.params.contactId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

// Groups
const listGroups = async (req, res) => {
  const rows = await clientContactService.listGroupsByClientId(req.params.id);
  res.json(rows);
};

const createGroup = async (req, res) => {
  try {
    const row = await clientContactService.createGroupForClient(req.params.id, req.body);
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const deleteGroup = async (req, res) => {
  try {
    await clientContactService.deleteGroup(req.params.groupId);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, listAll, create, update, remove, listGroups, createGroup, deleteGroup };

