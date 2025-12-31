const jobService = require('../services/jobService');

const list = async (_req, res) => {
  const jobs = await jobService.list();
  res.json(jobs);
};

const get = async (req, res) => {
  try {
    const job = await jobService.getById(req.params.id);
    res.json(job);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const job = await jobService.create(req.body);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const job = await jobService.update(req.params.id, req.body);
    res.json(job);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await jobService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

module.exports = { list, get, create, update, remove };

