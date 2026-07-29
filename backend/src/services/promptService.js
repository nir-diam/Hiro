const Prompt = require('../models/Prompt');
const promptHistoryService = require('./promptHistoryService');

// All prompts are managed exclusively in the database.
// There are no hardcoded defaults — create/edit prompts via the admin UI.

const list = async () => {
  return Prompt.findAll({ order: [['name', 'ASC']] });
};

/** Returns the prompt from the DB, or null if not found. Never creates or overwrites. */
const ensureById = async (id) => {
  return Prompt.findByPk(id);
};

const getById = async (id) => {
  const prompt = await Prompt.findByPk(id);
  if (!prompt) {
    const err = new Error('Prompt not found');
    err.status = 404;
    throw err;
  }
  return prompt;
};

const create = async (payload) => {
  const prompt = await Prompt.create(payload);
  await promptHistoryService.log(prompt, 'create');
  return prompt;
};

const update = async (id, payload) => {
  const prompt = await getById(id);
  await prompt.update(payload);
  await promptHistoryService.log(prompt, 'update');
  return prompt;
};

const remove = async (id) => {
  const deleted = await Prompt.destroy({ where: { id } });
  if (!deleted) {
    const err = new Error('Prompt not found');
    err.status = 404;
    throw err;
  }
};

/** Reset is now a no-op — all prompts live only in the DB and are never auto-generated. */
const reset = async () => {
  return list();
};

module.exports = { list, getById, ensureById, create, update, remove, reset };
