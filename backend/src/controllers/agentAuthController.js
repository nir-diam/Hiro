const agentAuthService = require('../services/agentAuthService');
const auditLogger = require('../utils/auditLogger');

const login = async (req, res) => {
  try {
    const username = req.body?.username ?? req.body?.user;
    const password = req.body?.password ?? req.body?.pass;
    const payload = agentAuthService.authenticate({ username, password });

    auditLogger.log(req, {
      action: 'login',
      description: `Agent login for ${payload.agent.username}`,
      metadata: {
        agentUsername: payload.agent.username,
        scopes: payload.agent.scopes,
      },
    }).catch(() => {});

    return res.json(payload);
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Authentication failed' });
  }
};

module.exports = {
  login,
};
