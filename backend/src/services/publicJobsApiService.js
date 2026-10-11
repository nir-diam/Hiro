const { Op } = require('sequelize');
const Job = require('../models/Job');
const JobPublication = require('../models/JobPublication');
const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const City = require('../models/City');
const jobPublicationService = require('./jobPublicationService');
const { PUBLIC_SITE_KEY_MODES } = require('../constants/publicJobsApi');
const {
  resolvePublicJobSlug,
  mapPublicJobListItem,
  mapPublicJobDetail,
  slugifySegment,
} = require('../utils/publicJobDtoMapper');

const OPEN_JOB_STATUSES = ['פתוחה'];

/** Interim visibility until dedicated "publish to hiro.co.il" flags ship (see spec §10). */
const isPublishedToPublicSite = (publication) => Boolean(publication?.publishToGeneralBoard);

const httpError = (status, message, code) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  return err;
};

const jobInSiteScope = async (job, siteContext) => {
  if (!siteContext) return false;
  if (siteContext.mode === PUBLIC_SITE_KEY_MODES.AGGREGATOR) return true;
  if (!siteContext.clientId) return false;
  const scoped = await jobPublicationService.jobsForClientScope(siteContext.client);
  return scoped.some((j) => j.id === job.id);
};

const loadPublishedJobPairs = async (siteContext) => {
  const publications = await JobPublication.findAll({
    where: { publishToGeneralBoard: true },
  });
  if (!publications.length) return [];

  const pubByJob = new Map(publications.map((p) => [p.jobId, p]));
  const jobs = await Job.findAll({
    where: {
      id: { [Op.in]: [...pubByJob.keys()] },
      status: { [Op.in]: OPEN_JOB_STATUSES },
    },
    attributes: { exclude: ['embedding', 'internalNotes', 'uniqueEmail', 'cvForwardSettings'] },
    order: [['openDate', 'DESC']],
  });

  let scopedIds = null;
  if (siteContext.mode === PUBLIC_SITE_KEY_MODES.TENANT && siteContext.client) {
    const scoped = await jobPublicationService.jobsForClientScope(siteContext.client);
    scopedIds = new Set(scoped.map((j) => j.id));
  }

  const pairs = [];
  for (const job of jobs) {
    if (scopedIds && !scopedIds.has(job.id)) continue;
    const publication = pubByJob.get(job.id);
    if (!isPublishedToPublicSite(publication)) continue;
    pairs.push({ job, publication });
  }
  return pairs;
};

const mapSiteStatus = (job) => {
  const status = job.status;
  if (status === 'פתוחה') return 'open';
  if (status === 'מוקפאת' || status === 'מאוישת') return 'closed';
  return 'closed';
};

const listJobs = async (siteContext, query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const search = String(query.q || query.search || '').trim().toLowerCase();

  let pairs = await loadPublishedJobPairs(siteContext);

  if (search) {
    pairs = pairs.filter(({ job, publication }) => {
      const pub = publication.get({ plain: true });
      const plain = job.get({ plain: true });
      const title = pub.publicJobTitle || plain.title;
      const hay = [
        title,
        plain.field,
        plain.role,
        plain.client,
        plain.city,
        pub.publicJobDescription,
        plain.description,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  }

  const total = pairs.length;
  const slice = pairs.slice((page - 1) * limit, page * limit);
  const items = slice.map(({ job, publication }) =>
    mapPublicJobListItem(job, publication, { status: mapSiteStatus(job.get({ plain: true })) }),
  );

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    facets: query.facets === 'true' || query.facets === '1' ? {} : undefined,
  };
};

const getJobBySlugOrId = async (siteContext, slugOrId) => {
  let job;
  try {
    job = await jobPublicationService.resolveJobBySlug(slugOrId);
  } catch (err) {
    if (err.status === 404) throw httpError(404, 'Job not found', 'NOT_FOUND');
    throw err;
  }

  const publication = await jobPublicationService.getOrCreatePublication(job);
  if (!isPublishedToPublicSite(publication)) {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }
  if (!(await jobInSiteScope(job, siteContext))) {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }

  const plain = job.get({ plain: true });
  if (plain.status === 'טיוטה') {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }

  const siteStatus = mapSiteStatus(plain);
  if (siteStatus === 'closed') {
    return {
      job: mapPublicJobDetail(job, publication, { status: 'closed' }),
      httpStatus: 200,
    };
  }

  return {
    job: mapPublicJobDetail(job, publication, { status: 'open' }),
    httpStatus: 200,
  };
};

const listSimilarJobs = async (siteContext, jobId, limit = 6) => {
  const pairs = await loadPublishedJobPairs(siteContext);
  const items = pairs
    .filter(({ job }) => job.id !== jobId)
    .slice(0, Math.min(20, Number(limit) || 6))
    .map(({ job, publication }) =>
      mapPublicJobListItem(job, publication, { status: mapSiteStatus(job.get({ plain: true })) }),
    );
  return { items };
};

const getTaxonomy = async (siteContext) => {
  const pairs = await loadPublishedJobPairs(siteContext);
  const categoryCounts = new Map();
  const industryCounts = new Map();
  const cityCounts = new Map();

  for (const { job } of pairs) {
    const plain = job.get({ plain: true });
    if (plain.field) {
      const slug = slugifySegment(plain.field);
      categoryCounts.set(slug, {
        slug,
        label: plain.field,
        count: (categoryCounts.get(slug)?.count || 0) + 1,
      });
    }
    if (plain.city) {
      const slug = slugifySegment(plain.city);
      cityCounts.set(slug, {
        slug,
        label: plain.city,
        count: (cityCounts.get(slug)?.count || 0) + 1,
      });
    }
  }

  const [categories, clusters, cities] = await Promise.all([
    JobCategory.findAll({ attributes: ['id', 'name'], limit: 500 }),
    JobCluster.findAll({ attributes: ['id', 'name'], limit: 200 }).catch(() => []),
    City.findAll({ attributes: ['id', 'cityName', 'city', 'pointX', 'pointY'], limit: 500 }),
  ]);

  return {
    clusters: clusters.map((c) => ({
      slug: slugifySegment(c.name),
      label: c.name,
      count: 0,
      categories: [],
    })),
    categories: categories.map((c) => {
      const slug = slugifySegment(c.name);
      const counted = categoryCounts.get(slug);
      return {
        slug,
        label: c.name,
        count: counted?.count || 0,
        synonyms: [],
      };
    }),
    industries: [...industryCounts.values()],
    regions: [],
    cities: cities
      .map((row) => {
        const label = row.cityName || row.city;
        if (!label) return null;
        const slug = slugifySegment(label);
        const counted = cityCounts.get(slug);
        return {
          slug,
          label,
          count: counted?.count || 0,
          lat: row.pointY ?? row.pointy ?? null,
          lng: row.pointX ?? row.pointx ?? null,
        };
      })
      .filter(Boolean),
    employmentTypes: [],
    workModels: [{ value: 'office', label: 'מהמשרד', count: pairs.length }],
    seniorities: [],
    suitableFor: [],
    marketingTags: [{ value: 'urgent', label: 'דחוף', count: pairs.filter(({ job }) => job.priority === 'דחופה' || job.priority === 'קריטית').length }],
  };
};

const getCompanyBySlug = async (siteContext, companySlug) => {
  const slug = String(companySlug || '').trim();
  if (!slug) throw httpError(400, 'Company slug is required');
  const pairs = await loadPublishedJobPairs(siteContext);
  const matched = pairs.filter(({ job }) => slugifySegment(job.client) === slug);
  if (!matched.length) throw httpError(404, 'Company not found', 'NOT_FOUND');
  const companyName = matched[0].job.client;
  return {
    slug,
    name: companyName,
    jobs: matched.map(({ job, publication }) =>
      mapPublicJobListItem(job, publication, { status: mapSiteStatus(job.get({ plain: true })) }),
    ),
  };
};

const getSitemapJobs = async (siteContext) => {
  const pairs = await loadPublishedJobPairs(siteContext);
  return pairs.map(({ job, publication }) => ({
    slug: resolvePublicJobSlug(job, publication),
    updatedAt: job.updatedAt || job.openDate,
  }));
};

const recordJobView = async (siteContext, slugOrId, body = {}) => {
  const result = await getJobBySlugOrId(siteContext, slugOrId);
  const slug = result.job.slug;
  const src = body.channel || body.src || body.source || 'public_site_v1';
  await jobPublicationService.recordVisit(slug, src);
  return { ok: true };
};

const submitJobApplication = async (siteContext, slugOrId, body = {}) => {
  let job;
  try {
    job = await jobPublicationService.resolveJobBySlug(slugOrId);
  } catch (err) {
    if (err.status === 404) throw httpError(404, 'Job not found', 'NOT_FOUND');
    throw err;
  }

  const plain = job.get({ plain: true });
  if (plain.status !== 'פתוחה') {
    throw httpError(410, 'Job is closed', 'JOB_CLOSED');
  }

  const publication = await jobPublicationService.getOrCreatePublication(job);
  if (!isPublishedToPublicSite(publication) || !(await jobInSiteScope(job, siteContext))) {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }

  const slug = resolvePublicJobSlug(job, publication);
  try {
    const { response } = await jobPublicationService.submitApplication(slug, {
      fullName: body.fullName,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      city: body.city,
      notes: body.notes,
      screeningAnswers: body.answers || body.screeningAnswers,
      resumeBase64: body.cv?.contentBase64 || body.resumeBase64,
      resumeFilename: body.cv?.filename || body.resumeFilename,
      resumeMimeType: body.cv?.mimeType || body.resumeMimeType,
      src: body.utm?.utm_source || 'public_site_v1',
      source: body.utm?.utm_source || 'public_site_v1',
    });
    return { applicationId: response?.applicationId || response?.candidateId || response?.id, raw: response };
  } catch (err) {
    const msg = String(err.message || '');
    if (/already applied|כבר הגיש/i.test(msg)) {
      throw httpError(409, msg, 'ALREADY_APPLIED');
    }
    throw err;
  }
};

const health = (siteContext) => ({
  ok: true,
  site: siteContext.name,
  mode: siteContext.mode,
});

module.exports = {
  listJobs,
  getJobBySlugOrId,
  listSimilarJobs,
  getTaxonomy,
  getCompanyBySlug,
  getSitemapJobs,
  recordJobView,
  submitJobApplication,
  health,
};
