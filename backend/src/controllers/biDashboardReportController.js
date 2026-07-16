const biDashboardReportService = require('../services/biDashboardReportService');
const authService = require('../services/authService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isPlatformAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

/** GET /api/reports/bi-dashboard */
const getBiDashboard = async (req, res) => {
  try {
    const q = req.query || {};
    const role = req.dbUser?.role || req.user?.role;
    const isAdmin = isPlatformAdminRole(role);

    let clientId = null;
    if (isAdmin) {
      const requested = String(q.clientId || '').trim();
      if (requested && UUID_RE.test(requested)) clientId = requested;
    } else {
      const me = req.dbUser;
      clientId =
        (await authService.resolveEffectiveClientIdForUser(me)) ||
        (me?.clientId != null ? String(me.clientId).trim() : null);
      if (!clientId || !UUID_RE.test(clientId)) {
        res.set('Cache-Control', 'private, no-store');
        return res.json({
          startDate: null,
          endDate: null,
          previousStartDate: null,
          previousEndDate: null,
          clientId: null,
          recruiterId: null,
          granularity: 'month',
          metricId: 'hires',
          recruiters: [],
          kpis: [],
          series: { metricId: 'hires', points: [] },
          comparison: [],
          recruiterGaps: [],
          funnel: {
            cv_ingestions: 0,
            screenings_done: 0,
            passed_screening: 0,
            moved_to_hired: 0,
          },
          heatmap: [],
          message: 'No client linked to this user',
        });
      }
    }

    const data = await biDashboardReportService.getBiDashboard({
      startDate: q.startDate,
      endDate: q.endDate,
      range: q.range || q.dateRange,
      clientId,
      recruiterId: q.recruiterId,
      granularity: q.granularity,
      metric: q.metric,
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    console.error('[getBiDashboard]', err.message || err);
    return res.status(status).json({ message: err.message || 'Failed to load BI dashboard' });
  }
};

module.exports = { getBiDashboard };
