const PromptHistory = require('../models/PromptHistory');

const log = async (prompt, action) => {
  if (!prompt || !prompt.id || !action) return null;
  const payload = {
    promptId: prompt.id,
    name: prompt.name || '',
    description: prompt.description || '',
    template: prompt.template || '',
    model: prompt.model || 'gemini-3-flash-preview',
    temperature: typeof prompt.temperature === 'number' ? prompt.temperature : 0.5,
    variables: Array.isArray(prompt.variables) ? prompt.variables : [],
    category: prompt.category || 'other',
    action,
    comments: prompt.comments || '',
  };
  return PromptHistory.create(payload);
};

const list = (filter = {}) => {
  const where = {};
  if (filter.promptId) where.promptId = filter.promptId;
  return PromptHistory.findAll({
    where,
    order: [['createdAt', 'DESC']],
  });
};

module.exports = { log, list };

