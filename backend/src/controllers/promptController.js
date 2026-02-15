const promptService = require('../services/promptService');
const promptHistoryService = require('../services/promptHistoryService');

const list = async (_req, res) => {
  const prompts = await promptService.list();
  res.json(prompts);
};

const create = async (req, res) => {
  try {
    const prompt = await promptService.create(req.body);
    res.status(201).json(prompt);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const prompt = await promptService.update(req.params.id, req.body);
    res.json(prompt);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await promptService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const reset = async (_req, res) => {
  try {
    const prompts = await promptService.reset();
    res.json(prompts);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

const history = async (req, res) => {
  try {
    const { promptId } = req.query;
    const entries = await promptHistoryService.list({ promptId });
    res.json(entries);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to load history' });
  }
};

module.exports = { list, create, update, remove, reset, history };

