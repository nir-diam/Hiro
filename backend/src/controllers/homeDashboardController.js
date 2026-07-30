const homeDashboardService = require('../services/homeDashboardService');
const authService = require('../services/authService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isPlatformAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

/**
 * GET /api/dashboard?scope=personal|company&startDate=&endDate=&range=&clientId=
 *
 * Scope rules:
 * - Platform admin: all tenants by default (clientId=null). Optional ?clientId= filters one client.
 * - Non-admin: always limited to the client the user belongs to.
 * - scope=personal: always further filtered to the logged-in user.
 */
const getHomeDashboard = async (req, res) => {
  try {
    const q = req.query || {};
    const scope = String(q.scope || 'personal').toLowerCase() === 'company' ? 'company' : 'personal';
    const role = req.dbUser?.role || req.user?.role;
    const isAdmin = isPlatformAdminRole(role);
    const userId = String(req.dbUser?.id || req.user?.sub || '').trim();

    let clientId = null;

    if (isAdmin) {
      // Admin sees ALL data unless they explicitly pick a client.
      const requested = String(q.clientId || '').trim();
      if (requested && UUID_RE.test(requested)) {
        clientId = requested;
      } else {
        clientId = null;
      }
    } else {
      clientId =
        (await authService.resolveEffectiveClientIdForUser(req.dbUser)) ||
        (req.dbUser?.clientId != null ? String(req.dbUser.clientId).trim() : null);

      if (!clientId || !UUID_RE.test(clientId)) {
        res.set('Cache-Control', 'private, no-store');
        return res.json({
          scope,
          startDate: null,
          endDate: null,
          clientId: null,
          userId: scope === 'personal' ? userId : null,
          kpis: [],
          goal: { current: 0, target: 0 },
          funnel: { max: 1, data: [] },
          timeToHireSeries: { max: 1, avg: 0, changePct: 0, data: [] },
          recruiterPerformance: [],
          openJobs: [],
          topSources: { max: 1, data: [] },
          tasks: [],
          recentUpdates: [],
          message: 'No client linked to this user',
        });
      }
    }

    const data = await homeDashboardService.getHomeDashboard({
      scope,
      userId,
      clientId, // null = all clients (admin only)
      startDate: q.startDate,
      endDate: q.endDate,
      range: q.range || q.dateRange || 'this_month',
    });

    res.set('Cache-Control', 'private, no-store');
    return res.json({ ...data, isAdmin });
  } catch (err) {
    const status = err.status || 500;
    console.error('[getHomeDashboard]', err.message || err);
    return res.status(status).json({ message: err.message || 'Failed to load dashboard' });
  }
};

module.exports = { getHomeDashboard };
