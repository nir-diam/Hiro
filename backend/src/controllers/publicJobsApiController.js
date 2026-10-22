const publicJobsApiService = require('../services/publicJobsApiService');
const { readMultipartApplication } = require('../utils/publicJobApplication');

const sendServiceError = (res, err) => {
  const status = err.status || 500;
  const payload = { message: err.message || 'Request failed' };
  if (err.code) payload.code = err.code;
  if (err.field) payload.field = err.field;
  if (err.fields) payload.fields = err.fields;
  return res.status(status).json(payload);
};

const health = (req, res) => {
  res.json(publicJobsApiService.health(req.publicSiteContext));
};

const listJobs = async (req, res) => {
  try {
    const payload = await publicJobsApiService.listJobs(req.publicSiteContext, req.query);
    res.set('Cache-Control', 'public, max-age=60');
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const getJob = async (req, res) => {
  try {
    const result = await publicJobsApiService.getJobBySlugOrId(req.publicSiteContext, req.params.slugOrId);
    res.set('Cache-Control', 'public, max-age=60');
    res.status(result.httpStatus || 200).json(result.job);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const listSimilarJobs = async (req, res) => {
  try {
    const payload = await publicJobsApiService.listSimilarJobs(
      req.publicSiteContext,
      req.params.id,
      req.query.limit,
    );
    res.set('Cache-Control', 'public, max-age=120');
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const getTaxonomy = async (req, res) => {
  try {
    const payload = await publicJobsApiService.getTaxonomy(req.publicSiteContext);
    res.set('Cache-Control', 'public, max-age=300');
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const getCompany = async (req, res) => {
  try {
    const payload = await publicJobsApiService.getCompanyBySlug(req.publicSiteContext, req.params.slug);
    res.set('Cache-Control', 'public, max-age=120');
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const getSitemapJobs = async (req, res) => {
  try {
    const items = await publicJobsApiService.getSitemapJobs(req.publicSiteContext);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ items });
  } catch (err) {
    sendServiceError(res, err);
  }
};

const recordView = async (req, res) => {
  try {
    const payload = await publicJobsApiService.recordJobView(
      req.publicSiteContext,
      req.params.id,
      req.body || {},
    );
    res.json(payload);
  } catch (err) {
    sendServiceError(res, err);
  }
};

const submitApplication = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '');
    const body = contentType.includes('multipart/form-data')
      ? await readMultipartApplication(req)
      : (req.body || {});
    const payload = await publicJobsApiService.submitJobApplication(
      req.publicSiteContext,
      req.params.id,
      body,
      { forwardedFor: req.headers['x-forwarded-for'] || req.ip },
    );
    res.status(201).json({ applicationId: payload.applicationId });
  } catch (err) {
    sendServiceError(res, err);
  }
};

module.exports = {
  health,
  listJobs,
  getJob,
  listSimilarJobs,
  getTaxonomy,
  getCompany,
  getSitemapJobs,
  recordView,
  submitApplication,
};
