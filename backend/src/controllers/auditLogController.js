const auditLogService = require('../services/auditLogService');
const auditLogger = require('../utils/auditLogger');

const list = async (req, res) => {
  try {
    const result = await auditLogService.list(req.query || {});
    res.json(result);
  } catch (err) {
    console.error('[auditLogController.list]', err);
    res.status(500).json({ message: err.message || 'Failed to list audit logs' });
  }
};

const getOne = async (req, res) => {
  try {
    const row = await auditLogService.getById(req.params.id);
    res.json(row);
  } catch (err) {
    console.error('[auditLogController.getOne]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load audit log' });
  }
};

const stats = async (_req, res) => {
  try {
    const result = await auditLogService.stats();
    res.json(result);
  } catch (err) {
    console.error('[auditLogController.stats]', err);
    res.status(500).json({ message: err.message || 'Failed to load stats' });
  }
};

/**
 * GET …/by-entity/:type/:entityId
 * type: candidate | job | client (or Candidate | Job | Client)
 * Returns all audit log rows for that entity (paginated; default pageSize 500, max 1000).
 */
const listByEntity = async (req, res) => {
  try {
    const result = await auditLogService.listByEntity(req.params.type, req.params.entityId, req.query || {});
    res.json(result);
  } catch (err) {
    console.error('[auditLogController.listByEntity]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load entity audit logs' });
  }
};

const create = async (req, res) => {
  try {
    const row = await auditLogService.create({
      ...req.body,
      userIp: req.body?.userIp || req.ip,
    });
    res.status(201).json(row);
  } catch (err) {
    console.error('[auditLogController.create]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to create audit log' });
  }
};

const remove = async (req, res) => {
  try {
    await auditLogService.remove(req.params.id);
    // Self-audit the deletion.
    auditLogger.log(req, {
      level: 'warning',
      action: 'delete',
      description: `נמחקה רשומת יומן: ${req.params.id}`,
      entity: { type: 'AuditLog', id: req.params.id, name: 'Audit log entry' },
    });
    res.status(204).end();
  } catch (err) {
    console.error('[auditLogController.remove]', err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to delete audit log' });
  }
};

module.exports = { list, getOne, stats, listByEntity, create, remove };
