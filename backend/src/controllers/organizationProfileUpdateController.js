const organizationProfileUpdateService = require('../services/organizationProfileUpdateService');

const submitForClient = async (req, res) => {
  try {
    const row = await organizationProfileUpdateService.submitForClient(
      req.params.id,
      req.body,
      req.dbUser,
      { organizationId: req.query.organizationId },
    );
    res.status(201).json(row);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Submit failed' });
  }
};

const getPendingForClient = async (req, res) => {
  try {
    const row = await organizationProfileUpdateService.getPendingForClient(
      req.params.id,
      req.dbUser,
      { organizationId: req.query.organizationId },
    );
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Fetch failed' });
  }
};

const listForClient = async (req, res) => {
  try {
    const payload = await organizationProfileUpdateService.listForClient(
      req.params.id,
      req.dbUser,
      req.query,
    );
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'List failed' });
  }
};

const list = async (req, res) => {
  try {
    const payload = await organizationProfileUpdateService.list(req.query);
    res.json(payload);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'List failed' });
  }
};

const countPending = async (_req, res) => {
  try {
    const count = await organizationProfileUpdateService.countPending();
    res.json({ count });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Count failed' });
  }
};

const approve = async (req, res) => {
  try {
    const row = await organizationProfileUpdateService.approve(req.params.id, req.dbUser);
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Approve failed' });
  }
};

const reject = async (req, res) => {
  try {
    const row = await organizationProfileUpdateService.reject(
      req.params.id,
      req.dbUser,
      req.body?.reviewNote,
    );
    res.json(row);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Reject failed' });
  }
};

module.exports = {
  submitForClient,
  getPendingForClient,
  listForClient,
  list,
  countPending,
  approve,
  reject,
};
