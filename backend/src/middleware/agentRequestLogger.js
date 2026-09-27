const auditLogger = require('../utils/auditLogger');

/** Fire-and-forget audit row for authenticated agent API calls. */
const agentRequestLogger = (req, res, next) => {
  res.on('finish', () => {
    if (!req.agent?.username) return;
    auditLogger.log(req, {
      action: 'system',
      description: `Agent API ${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`,
      userId: null,
      userName: 'סוכן AI (Hiro)',
      userEmail: null,
      metadata: {
        source: 'agent_api',
        actor: 'agent',
        agentUsername: req.agent.username,
        agentName: req.agent.name,
        scopes: req.agent.scopes,
        statusCode: res.statusCode,
      },
    }).catch(() => {});
  });
  return next();
};

module.exports = agentRequestLogger;
