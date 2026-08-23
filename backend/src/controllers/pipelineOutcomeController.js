const pipelineOutcomeService = require('../services/pipelineOutcomeService');

const execute = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = await pipelineOutcomeService.executeOutcome(req, {
      pipelineKind: body.pipelineKind === 'candidate' ? 'candidate' : 'client',
      clientId: String(body.clientId || req.dbUser?.clientId || '').trim() || null,
      pipelineId: String(body.pipelineId || '').trim() || null,
      stageId: String(body.stageId || '').trim() || null,
      outcomeId: String(body.outcomeId || '').trim() || null,
      context: body.context && typeof body.context === 'object' ? body.context : {},
      source: body.source === 'system_event' ? 'system_event' : 'manual',
      skipManualApproval: body.skipManualApproval === true,
    });
    return res.json(result);
  } catch (err) {
    console.error('[pipelineOutcomeController.execute]', err.message || err);
    return res.status(err.status || 500).json({ message: err.message || 'Failed to execute outcome' });
  }
};

const approveAutomations = async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const automationIds = Array.isArray(body.automationIds) ? body.automationIds : [];
    const result = await pipelineOutcomeService.approveAutomations(req, {
      pipelineKind: body.pipelineKind === 'candidate' ? 'candidate' : 'client',
      clientId: String(body.clientId || req.dbUser?.clientId || '').trim() || null,
      pipelineId: String(body.pipelineId || '').trim() || null,
      stageId: String(body.stageId || '').trim() || null,
      outcomeId: String(body.outcomeId || '').trim() || null,
      context: body.context && typeof body.context === 'object' ? body.context : {},
      automationIds,
    });
    return res.json(result);
  } catch (err) {
    console.error('[pipelineOutcomeController.approveAutomations]', err.message || err);
    return res.status(err.status || 500).json({ message: err.message || 'Failed to approve automations' });
  }
};

module.exports = { execute, approveAutomations };
