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
    });
    return res.json(result);
  } catch (err) {
    console.error('[pipelineOutcomeController.execute]', err.message || err);
    return res.status(err.status || 500).json({ message: err.message || 'Failed to execute outcome' });
  }
};

module.exports = { execute };
