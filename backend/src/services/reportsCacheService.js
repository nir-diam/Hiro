const { createVersionedNamespaceCache } = require('./versionedNamespaceCache');

const biReportCache = createVersionedNamespaceCache('reports:bi', {
  ttlSeconds: Number.parseInt(process.env.BI_REPORT_CACHE_TTL || '300', 10) || 300,
  envFlagName: 'BI_REPORT_CACHE',
});

const recruitmentSourcesReportCache = createVersionedNamespaceCache('reports:recruitment-sources', {
  ttlSeconds: Number.parseInt(process.env.RECRUITMENT_SOURCES_REPORT_CACHE_TTL || '300', 10) || 300,
  envFlagName: 'RECRUITMENT_SOURCES_REPORT_CACHE',
});

const biFingerprint = (opts = {}) => ({
  startDate: opts.startDate != null ? String(opts.startDate) : null,
  endDate: opts.endDate != null ? String(opts.endDate) : null,
  range: opts.range != null ? String(opts.range) : null,
  clientId: opts.clientId != null ? String(opts.clientId) : null,
  recruiterId: opts.recruiterId != null ? String(opts.recruiterId) : null,
  granularity: opts.granularity != null ? String(opts.granularity) : null,
  metric: opts.metric != null ? String(opts.metric) : null,
});

const recruitmentFingerprint = (opts = {}) => ({
  startDate: opts.startDate != null ? String(opts.startDate) : null,
  endDate: opts.endDate != null ? String(opts.endDate) : null,
  source: opts.source != null ? String(opts.source) : null,
  clientId: opts.clientId != null ? String(opts.clientId) : null,
});

const getCachedBiDashboard = (opts, loader) =>
  biReportCache.getCached(biFingerprint(opts), loader, 'reports:bi');

const getCachedRecruitmentSourcesReport = (opts, loader) =>
  recruitmentSourcesReportCache.getCached(recruitmentFingerprint(opts), loader, 'reports:recruitment-sources');

const bumpReportsCache = async () => {
  await Promise.all([biReportCache.bumpVersion(), recruitmentSourcesReportCache.bumpVersion()]);
};

module.exports = {
  getCachedBiDashboard,
  getCachedRecruitmentSourcesReport,
  bumpReportsCache,
  biReportCache,
  recruitmentSourcesReportCache,
};
