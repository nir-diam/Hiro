const clientHealthRuleService = require('../services/clientHealthRuleService');
const clientHealthPulseService = require('../services/clientHealthPulseService');
const authService = require('../services/authService');

const resolveCallerRole = (req) => req.dbUser?.role ?? req.user?.role ?? null;

const resolveCallerClientId = async (req) => {
  const fromDb = req.dbUser?.clientId;
  if (fromDb) return String(fromDb);
  const fromJwt = req.user?.clientId;
  if (fromJwt) return String(fromJwt);
  if (req.user?.sub) {
    const cached = await authService.resolveUserTenantClientIdCached(req.user.sub, req.user.role);
    if (cached) return String(cached);
  }
  return null;
};

const assertCanAccessClient = async (req, targetClientId) => {
  const role = resolveCallerRole(req);
  if (role === 'super_admin' || role === 'admin') return true;
  const clientId = await resolveCallerClientId(req);
  if (!clientId) return false;
  return String(clientId) === String(targetClientId);
};

const list = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertCanAccessClient(req, id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const organizationId = req.query.organizationId || null;
    const pipelineId = req.query.pipelineId || null;
    const rules = await clientHealthRuleService.listOrSeedByScope(id, organizationId, pipelineId);
    return res.json({
      rules,
      clientId: id,
      organizationId: organizationId || null,
      pipelineId: pipelineId || (rules[0]?.pipelineId || null),
    });
  } catch (err) {
    return res.status(err.status || 500).json({ message: err.message || 'Failed to load health rules' });
  }
};

const sync = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await assertCanAccessClient(req, id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const body = req.body || {};
    const organizationId = body.organizationId != null ? body.organizationId : (req.query.organizationId || null);
    const pipelineId = body.pipelineId != null ? body.pipelineId : (req.query.pipelineId || null);
    const incoming = Array.isArray(body.rules) ? body.rules : Array.isArray(body) ? body : [];
    const rules = await clientHealthRuleService.syncHealthRules(id, organizationId, incoming, pipelineId);
    return res.json({
      rules,
      clientId: id,
      organizationId: organizationId || null,
      pipelineId: pipelineId || null,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ message: err.message || 'Failed to save health rules' });
  }
};

/** Evaluated pulse for linked orgs (uses saved health rules + live metrics). */
const pulse = async (req, res) => {
  const startedAt = Date.now();
  try {
    const { id } = req.params;
    if (!(await assertCanAccessClient(req, id))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const organizationId = req.query.organizationId
      ? String(req.query.organizationId).trim()
      : null;
    const pipelineId = req.query.pipelineId
      ? String(req.query.pipelineId).trim()
      : null;
    if (organizationId) {
      const result = await clientHealthPulseService.evaluatePulseForOrganization(
        id,
        organizationId,
        pipelineId,
      );
      res.set('Server-Timing', `app;dur=${Date.now() - startedAt}`);
      res.set('Cache-Control', 'private, max-age=45');
      return res.json({ clientId: id, organizationId, pipelineId, pulse: result });
    }
    const byOrganizationId = await clientHealthPulseService.evaluatePulseForClient(id, pipelineId);
    res.set('Server-Timing', `app;dur=${Date.now() - startedAt}`);
    res.set('Cache-Control', 'private, max-age=45');
    return res.json({ clientId: id, pipelineId, byOrganizationId });
  } catch (err) {
    res.set('Server-Timing', `app;dur=${Date.now() - startedAt}`);
    return res.status(err.status || 500).json({ message: err.message || 'Failed to evaluate pulse' });
  }
};

module.exports = { list, sync, pulse };
