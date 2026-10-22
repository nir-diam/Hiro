const { jobStatusAppearsOnSite, CLOSED_PUBLIC_WINDOW_MS } = require('./publicJobCatalog');

const boardOf = (publication) => {
  const raw = publication?.publicBoard ?? publication?.get?.('publicBoard');
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
};

const publishedSiteIds = (publication) => {
  const ids = boardOf(publication).publishedSiteIds;
  return Array.isArray(ids) ? ids.map((id) => String(id)).filter(Boolean) : [];
};

const orgPublishesOnHiro = (agency) => {
  const meta = agency?.metadata && typeof agency.metadata === 'object' ? agency.metadata : {};
  return meta.publishOnHiroBoard !== false;
};

/**
 * A job is on a site when that site is selected, or — for rows saved before per-site
 * selection — when the legacy general-board flag is on.
 */
const isJobListedOnSite = ({ publication, jobClientId, site, agency }) => {
  if (!publication || !site) return false;
  if (boardOf(publication).unpublished === true) return false;
  const siteIds = publishedSiteIds(publication);
  const legacy = siteIds.length === 0;
  const general = publication.publishToGeneralBoard === true;

  if (!site.id) {
    if (site.mode === 'aggregator') return orgPublishesOnHiro(agency) && general;
    if (site.clientId && jobClientId && String(jobClientId) !== String(site.clientId)) return false;
    if (site.clientId && !jobClientId) return false;
    return general || siteIds.length > 0;
  }

  if (site.mode === 'aggregator') {
    if (!orgPublishesOnHiro(agency)) return false;
    if (!legacy) return Boolean(site.id) && siteIds.includes(String(site.id));
    return general;
  }

  if (site.clientId && jobClientId && String(jobClientId) !== String(site.clientId)) return false;
  if (site.clientId && !jobClientId) return false;
  if (!legacy) return Boolean(site.id) && siteIds.includes(String(site.id));
  return general;
};

const wasPubliclyPublished = (publication) => {
  if (!publication) return false;
  const board = boardOf(publication);
  if (board.publishedAt || board.publicClosedAt) return true;
  if (publication.publishToGeneralBoard) return true;
  if (publishedSiteIds(publication).length) return true;
  if (Number(publication.visitCount) > 0 || Number(publication.submissionCount) > 0) return true;
  return false;
};

const closedAtMs = (job, publication) => {
  const board = boardOf(publication);
  const stamp = board.publicClosedAt || job?.updatedAt || publication?.updatedAt || null;
  const ms = stamp ? new Date(stamp).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
};

const withinClosedWindow = (job, publication, now = Date.now()) => {
  const ms = closedAtMs(job, publication);
  if (ms == null) return false;
  return now - ms <= CLOSED_PUBLIC_WINDOW_MS;
};

const statusVisibilityOverrides = (agency) => {
  const meta = agency?.metadata && typeof agency.metadata === 'object' ? agency.metadata : {};
  const map = meta.publicJobStatusVisibility;
  return map && typeof map === 'object' && !Array.isArray(map) ? map : null;
};

const jobAppearsOnSite = (job, agency) =>
  jobStatusAppearsOnSite(job?.status, statusVisibilityOverrides(agency));

/** True for a job that is listed now, or was listed on this site before it was unpublished. */
const wasListedOnSite = ({ publication, jobClientId, site, agency }) => {
  const board = boardOf(publication);
  if (board.unpublished !== true) {
    return isJobListedOnSite({ publication, jobClientId, site, agency });
  }
  const replay = {
    publishToGeneralBoard: board.lastPublishToGeneralBoard === true,
    publicBoard: {
      ...board,
      unpublished: false,
      publishedSiteIds: Array.isArray(board.lastPublishedSiteIds) && board.lastPublishedSiteIds.length
        ? board.lastPublishedSiteIds
        : [],
    },
  };
  return isJobListedOnSite({ publication: replay, jobClientId, site, agency });
};

module.exports = {
  boardOf,
  publishedSiteIds,
  orgPublishesOnHiro,
  isJobListedOnSite,
  wasListedOnSite,
  wasPubliclyPublished,
  withinClosedWindow,
  jobAppearsOnSite,
  statusVisibilityOverrides,
};
