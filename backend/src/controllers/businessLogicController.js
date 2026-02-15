const businessLogicService = require('../services/businessLogicService');

const listLogicRules = async (_req, res) => {
  try {
    const rules = await businessLogicService.listRules();
    res.json(rules);
  } catch (err) {
    console.error('Failed to list rules', err);
    res.status(500).json({ message: 'Failed to load rules' });
  }
};

const createLogicRule = async (req, res) => {
  try {
    const rule = await businessLogicService.createRule(req.body || {});
    res.status(201).json(rule);
  } catch (err) {
    console.error('Failed to create rule', err);
    res.status(400).json({ message: err.message || 'Unable to create rule' });
  }
};

const updateLogicRule = async (req, res) => {
  try {
    const updated = await businessLogicService.updateRule(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Failed to update rule', err);
    res.status(400).json({ message: err.message || 'Unable to update rule' });
  }
};

const deleteLogicRule = async (req, res) => {
  try {
    const removed = await businessLogicService.deleteRule(req.params.id);
    if (!removed) {
      return res.status(404).json({ message: 'Rule not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete rule', err);
    res.status(400).json({ message: err.message || 'Unable to delete rule' });
  }
};

module.exports = {
  listLogicRules,
  createLogicRule,
  updateLogicRule,
  deleteLogicRule,
};

