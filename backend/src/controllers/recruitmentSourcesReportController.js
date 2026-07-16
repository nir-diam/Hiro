const recruitmentSourcesReportService = require('../services/recruitmentSourcesReportService');
const authService = require('../services/authService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isPlatformAdminRole = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
};

/** GET /api/reports/recruitment-sources */
const getRecruitmentSourcesReport = async (req, res) => {
  try {
    const q = req.query || {};
    const role = req.dbUser?.role || req.user?.role;
    const isAdmin = isPlatformAdminRole(role);

    let clientId = null;
    if (isAdmin) {
      const requested = String(q.clientId || '').trim();
      if (requested && UUID_RE.test(requested)) {
        clientId = requested;
      }
      // no clientId → all clients
    } else {
      const me = req.dbUser;
      clientId =
        (await authService.resolveEffectiveClientIdForUser(me)) ||
        (me?.clientId != null ? String(me.clientId).trim() : null);
      if (!clientId || !UUID_RE.test(clientId)) {
        res.set('Cache-Control', 'private, no-store');
        return res.json({
          startDate: q.startDate,
          endDate: q.endDate,
          source: null,
          clientId: null,
          totals: {
            candidates: 0,
            referrals: 0,
            placements: 0,
            accepted: 0,
            current: 0,
            initial: 0,
            conversionRate: 0,
          },
          topSources: [],
          sourceOptions: [],
          items: [],
          message: 'No client linked to this user',
        });
      }
    }

    const data = await recruitmentSourcesReportService.getRecruitmentSourcesReport({
      startDate: q.startDate,
      endDate: q.endDate,
      source: q.source,
      clientId,
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json(data);
  } catch (err) {
    const status = err.status || 500;
    console.error('[getRecruitmentSourcesReport]', err.message || err);
    return res.status(status).json({ message: err.message || 'Failed to load recruitment sources report' });
  }
};

module.exports = { getRecruitmentSourcesReport };
