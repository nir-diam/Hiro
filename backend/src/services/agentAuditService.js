const auditLogService = require('./auditLogService');

const listAgentAuditLogs = async (query = {}) => {
  return auditLogService.list({
    ...query,
    actor: 'agent',
  });
};

module.exports = {
  listAgentAuditLogs,
};
