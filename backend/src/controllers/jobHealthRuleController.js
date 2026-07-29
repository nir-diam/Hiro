const jobHealthRuleService = require('../services/jobHealthRuleService');
const jobHealthPulseService = require('../services/jobHealthPulseService');
const RecruitmentStatus = require('../models/RecruitmentStatus');

const assertCanAccessClient = (req, targetClientId) => {
  const u = req.dbUser;
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  if (!u.clientId) return false;
  return String(u.clientId) === String(targetClientId);
};

const list = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const organizationId = req.query.organizationId || null;
    const data = await jobHealthRuleService.listOrSeedByScope(id, organizationId);

    let stages = [];
    try {
      const rows = await RecruitmentStatus.findAll({
        where: { clientId: id, isActive: true },
        attributes: ['name'],
        order: [['sortIndex', 'ASC']],
      });
      stages = rows.map((r) => r.name).filter(Boolean);
    } catch {
      stages = [];
    }
    if (!stages.length) {
      stages = ['חדש', 'סינון טלפוני', 'ראיון HR', 'הועבר למנהל', 'ראיון מקצועי', 'הצעת שכר', 'בדיקת ממליצים'];
    }

    return res.json({
      clientId: id,
      organizationId: organizationId || null,
      isSystemActive: data.isSystemActive,
      profiles: data.profiles,
      stages,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to load job health rules' });
  }
};

const sync = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const body = req.body || {};
    const organizationId = body.organizationId != null ? body.organizationId : (req.query.organizationId || null);
    const data = await jobHealthRuleService.syncJobHealth(id, organizationId, body);
    return res.json({
      clientId: id,
      organizationId: organizationId || null,
      isSystemActive: data.isSystemActive,
      profiles: data.profiles,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Failed to save job health rules' });
  }
};

const pulse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const organizationId = req.query.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const data = await jobHealthPulseService.evaluatePulseForClient(id, organizationId);
    return res.json({ clientId: id, organizationId, ...data });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to evaluate job pulse' });
  }
};

module.exports = { list, sync, pulse };
