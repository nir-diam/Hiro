const BusinessLogicRule = require('../models/BusinessLogicRule');

const listRules = () => {
  return BusinessLogicRule.findAll({
    order: [['createdAt', 'DESC']],
  });
};

const createRule = (payload = {}) => {
  return BusinessLogicRule.create({
    ruleId: payload.ruleId || `RULE-${Math.floor(Math.random() * 900) + 100}`,
    name: payload.name || 'חוק חדש',
    description: payload.description || '',
    context: payload.context || 'Candidate',
    trigger: payload.trigger || 'On Change',
    conditions: Array.isArray(payload.conditions) ? payload.conditions : [],
    actions: Array.isArray(payload.actions) ? payload.actions : [],
    devStatus: payload.devStatus || 'pending',
  });
};

const findRuleById = (id) => {
  return BusinessLogicRule.findByPk(id);
};

const updateRule = async (id, payload = {}) => {
  const rule = await findRuleById(id);
  if (!rule) return null;
  return rule.update({
    ruleId: payload.ruleId ?? rule.ruleId,
    name: payload.name ?? rule.name,
    description: payload.description ?? rule.description,
    context: payload.context ?? rule.context,
    trigger: payload.trigger ?? rule.trigger,
    conditions: Array.isArray(payload.conditions) ? payload.conditions : rule.conditions,
    actions: Array.isArray(payload.actions) ? payload.actions : rule.actions,
    devStatus: payload.devStatus || rule.devStatus,
  });
};

const deleteRule = async (id) => {
  const rule = await findRuleById(id);
  if (!rule) return false;
  await rule.destroy();
  return true;
};

module.exports = {
  listRules,
  createRule,
  updateRule,
  deleteRule,
};

