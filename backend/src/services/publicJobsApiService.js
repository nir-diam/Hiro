const { Op, literal } = require('sequelize');
const Job = require('../models/Job');
const JobPublication = require('../models/JobPublication');
const JobCategory = require('../models/JobCategory');
const JobCluster = require('../models/JobCluster');
const JobRole = require('../models/JobRole');
const City = require('../models/City');
const Client = require('../models/Client');
const Organization = require('../models/Organization');
const Tag = require('../models/Tag');
const RecruitmentSource = require('../models/RecruitmentSource');
const jobPublicationService = require('./jobPublicationService');
const { PUBLIC_SITE_KEY_MODES } = require('../constants/publicJobsApi');
const { slugifySegment, buildStableSlug, normalizeSearchText } = require('../utils/publicJobSlug');
const { resolveRegionSlug, regionLabel } = require('../utils/publicJobCatalog');
const {
  isJobListedOnSite,
  wasListedOnSite,
  wasPubliclyPublished,
  withinClosedWindow,
  jobAppearsOnSite,
  boardOf,
} = require('../utils/publicJobVisibility');
const { presentPublicJob, resolveSlug } = require('../utils/publicJobPresenter');
const { sanitizePublicPayload } = require('../utils/publicJobSanitize');
const { buildSynonymGroups, filterPublicJobs } = require('../utils/publicJobQuery');
const { buildTaxonomy } = require('../utils/publicJobTaxonomy');
const {
  validatePublicApplication,
  assertScreeningAnswers,
  hitRateLimit,
  clientIp,
} = require('../utils/publicJobApplication');
const { cosineSimilarity, normalizeEmbedding } = require('./vectorSearchService');

const CACHE_MS = 60 * 1000;
const cache = {
  categories: null,
  categoriesAt: 0,
  cities: null,
  citiesAt: 0,
  tags: null,
  tagsAt: 0,
  industries: null,
  industriesAt: 0,
};

const httpError = (status, message, code, field) => {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (field) err.field = field;
  return err;
};

const siteFromContext = (siteContext) => ({
  id: siteContext?.siteId || null,
  mode: siteContext?.mode,
  clientId: siteContext?.clientId || null,
});

const plain = (row) => (row?.get ? row.get({ plain: true }) : row);

const loadCategories = async () => {
  if (cache.categories && Date.now() - cache.categoriesAt < CACHE_MS) return cache.categories;
  const rows = await JobCategory.findAll({
    include: [{ model: JobCluster, as: 'clusters' }],
    order: [['name', 'ASC']],
  });
  for (const category of rows) {
    if (!category.publicSlug) {
      await category.update({
        publicSlug: buildStableSlug(category.name, category.id),
        slugLocked: true,
      }).catch(() => {});
    }
    for (const cluster of category.clusters || []) {
      if (!cluster.publicSlug) {
        await cluster.update({
          publicSlug: buildStableSlug(cluster.name, cluster.id),
          slugLocked: true,
        }).catch(() => {});
      }
    }
  }
  cache.categories = rows;
  cache.categoriesAt = Date.now();
  return rows;
};

const loadCities = async () => {
  if (cache.cities && Date.now() - cache.citiesAt < CACHE_MS) return cache.cities;
  cache.cities = await City.findAll({
    attributes: ['id', 'cityName', 'city', 'pointX', 'pointY', 'pointx', 'pointy', 'region', 'column4', 'publicSlug', 'slugAliases'],
  });
  for (const city of cache.cities) {
    const label = city.cityName || city.city;
    if (!city.publicSlug && label) {
      city.publicSlug = buildStableSlug(label, city.id);
      city.update({ publicSlug: city.publicSlug }).catch(() => {});
    }
  }
  cache.citiesAt = Date.now();
  return cache.cities;
};

const loadTags = async () => {
  if (cache.tags && Date.now() - cache.tagsAt < CACHE_MS) return cache.tags;
  cache.tags = await Tag.findAll({
    attributes: ['displayNameHe', 'displayNameEn', 'tagKey', 'synonyms', 'aliases', 'type'],
    where: { status: 'active' },
    limit: 8000,
  });
  cache.tagsAt = Date.now();
  return cache.tags;
};

const loadIndustries = async () => {
  if (cache.industries && Date.now() - cache.industriesAt < CACHE_MS) return cache.industries;
  const orgs = await Organization.findAll({
    attributes: ['mainField'],
    where: { mainField: { [Op.ne]: null } },
    limit: 2000,
  });
  const seen = new Map();
  for (const org of orgs) {
    const label = String(org.mainField || '').trim();
    if (!label) continue;
    const slug = slugifySegment(label);
    if (slug && !seen.has(slug)) seen.set(slug, { slug, label });
  }
  cache.industries = [...seen.values()];
  cache.industriesAt = Date.now();
  return cache.industries;
};

const indexCatalog = (categories) => {
  const byCategoryName = new Map();
  const byClusterName = new Map();
  for (const category of categories) {
    const parent = {
      slug: category.publicSlug || slugifySegment(category.name),
      label: category.name,
      aliases: Array.isArray(category.slugAliases) ? category.slugAliases : [],
    };
    byClusterName.set(normalizeSearchText(category.name), parent);
    for (const cluster of category.clusters || []) {
      const node = {
        slug: cluster.publicSlug || slugifySegment(cluster.name),
        label: cluster.name,
        aliases: Array.isArray(cluster.slugAliases) ? cluster.slugAliases : [],
        parent,
      };
      byCategoryName.set(normalizeSearchText(cluster.name), node);
    }
  }
  return { byCategoryName, byClusterName };
};

const indexCities = (cities) => {
  const byName = new Map();
  for (const city of cities) {
    const label = city.cityName || city.city;
    if (!label) continue;
    const regionSlug = resolveRegionSlug(city.region || city.column4) || null;
    byName.set(normalizeSearchText(label), {
      slug: city.publicSlug || slugifySegment(label),
      label,
      regionSlug,
      regionLabel: regionSlug ? regionLabel(regionSlug) : city.region || null,
      lat: city.pointY ?? city.pointy ?? null,
      lng: city.pointX ?? city.pointx ?? null,
    });
  }
  return byName;
};

const rememberSlug = (publication, slug) => {
  const board = boardOf(publication);
  if (board.publicSlug || !slug || !publication?.update) return;
  publication.update({
    publicBoard: {
      ...board,
      publicSlug: slug,
      publishedAt: board.publishedAt || new Date().toISOString(),
    },
  }).catch(() => {});
};

const loadPublicationPool = async () => {
  const publications = await JobPublication.findAll({
    where: {
      [Op.or]: [
        { publishToGeneralBoard: true },
        literal(`COALESCE(jsonb_array_length("publicBoard"->'publishedSiteIds'), 0) > 0`),
        literal(`COALESCE(("publicBoard"->>'unpublished')::boolean, false) = true`),
      ],
    },
  });
  return publications;
};

const loadJobsForPublications = async (publications) => {
  const ids = publications.map((row) => row.jobId).filter(Boolean);
  if (!ids.length) return [];
  return Job.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: {
      exclude: [
        'embedding',
        'internalNotes',
        'uniqueEmail',
        'cvForwardSettings',
        'contacts',
        'events',
        'aiRawDescription',
        'telephoneQuestions',
        'languages',
        'listNotes',
        'listNotesHistory',
      ],
    },
  });
};

const loadAgencies = async (jobs) => {
  const ids = [...new Set(jobs.map((job) => job.clientId).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await Client.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name', 'displayName', 'logoUrl', 'domain', 'industry', 'metadata'],
  });
  return new Map(rows.map((row) => [String(row.id), plain(row)]));
};

const loadOrgs = async (jobs) => {
  const ids = [...new Set(jobs.map((job) => job.organizationId).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await Organization.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name', 'logo', 'website', 'mainField', 'employeeCount', 'publicSlug', 'slugLocked'],
  });
  for (const row of rows) {
    if (!row.publicSlug && row.name) {
      row.publicSlug = buildStableSlug(row.name, row.id);
      row.slugLocked = true;
      row.save().catch(() => {});
    }
  }
  return new Map(rows.map((row) => [String(row.id), plain(row)]));
};

const presentPair = (job, publication, context) => {
  const jobPlain = plain(job);
  const agency = context.agencies.get(String(jobPlain.clientId || '')) || null;
  const org = context.orgs.get(String(jobPlain.organizationId || '')) || null;
  const fieldName = normalizeSearchText((jobPlain.jobFields && jobPlain.jobFields[0]?.fieldType) || jobPlain.field);
  const categoryNode = context.catalog.byCategoryName.get(fieldName) || null;
  const parentName = normalizeSearchText(jobPlain.jobFields?.[0]?.category || '');
  const clusterNode = categoryNode?.parent || context.catalog.byClusterName.get(parentName) || null;
  const cityMeta = context.cities.get(normalizeSearchText(jobPlain.city)) || null;
  const view = presentPublicJob({
    job,
    publication,
    agency,
    org,
    categoryNode,
    clusterNode,
    cityMeta,
    status: 'open',
  });
  view.agency = agency;
  view.job = job;
  view.publication = publication;
  return view;
};

const buildContext = async (jobs) => {
  const [categories, cities, agencies, orgs] = await Promise.all([
    loadCategories(),
    loadCities(),
    loadAgencies(jobs),
    loadOrgs(jobs),
  ]);
  return {
    agencies,
    orgs,
    catalog: indexCatalog(categories.map(plain)),
    cities: indexCities(cities.map(plain)),
    categories,
  };
};

const loadAllViews = async (siteContext) => {
  const publications = await loadPublicationPool();
  const jobs = await loadJobsForPublications(publications);
  const pubByJob = new Map(publications.map((row) => [String(row.jobId), row]));
  const context = await buildContext(jobs);
  const site = siteFromContext(siteContext);
  const views = [];
  for (const job of jobs) {
    const publication = pubByJob.get(String(job.id));
    if (!publication) continue;
    const view = presentPair(job, publication, context);
    view.listed = isJobListedOnSite({
      publication,
      jobClientId: job.clientId,
      site,
      agency: view.agency,
    }) && jobAppearsOnSite(plain(job), view.agency);
    view.wasListed = wasListedOnSite({
      publication,
      jobClientId: job.clientId,
      site,
      agency: view.agency,
    });
    if (view.listed) rememberSlug(publication, view.dto.slug);
    views.push(view);
  }
  return { views, context };
};

const listedViews = async (siteContext) => {
  const { views } = await loadAllViews(siteContext);
  return views.filter((view) => view.listed);
};

const listJobs = async (siteContext, query = {}) => {
  const rows = await listedViews(siteContext);
  const groups = String(query.q || query.search || '').trim()
    ? buildSynonymGroups((await loadTags()).map(plain))
    : [];
  const filtered = filterPublicJobs(rows, query, groups);
  const payload = {
    items: filtered.items.map((row) => sanitizePublicPayload(row.dto)),
    pagination: filtered.pagination,
  };
  if (filtered.facets) payload.facets = filtered.facets;
  return payload;
};

const getJobBySlugOrId = async (siteContext, slugOrId) => {
  let job;
  try {
    job = await jobPublicationService.resolveJobBySlug(slugOrId);
  } catch (err) {
    if (err.status === 404) throw httpError(404, 'Job not found', 'NOT_FOUND');
    throw err;
  }
  const publication = await JobPublication.findOne({ where: { jobId: job.id } });
  if (!publication) throw httpError(404, 'Job not found', 'NOT_FOUND');
  if (!wasPubliclyPublished(publication) && publication.publishToGeneralBoard !== true) {
    const board = boardOf(publication);
    if (!board.publishedAt && !board.publicClosedAt && !(board.publishedSiteIds || []).length) {
      throw httpError(404, 'Job not found', 'NOT_FOUND');
    }
  }
  const context = await buildContext([job]);
  const view = presentPair(job, publication, context);
  const site = siteFromContext(siteContext);
  const args = { publication, jobClientId: job.clientId, site, agency: view.agency };
  if (!isJobListedOnSite(args) && !wasListedOnSite(args)) {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }
  const open = isJobListedOnSite(args) && jobAppearsOnSite(plain(job), view.agency);
  if (!open) {
    if (!wasPubliclyPublished(publication) && !wasListedOnSite(args)) {
      throw httpError(404, 'Job not found', 'NOT_FOUND');
    }
    if (!withinClosedWindow(plain(job), publication)) {
      throw httpError(410, 'Job is closed', 'JOB_CLOSED');
    }
    view.detail.status = 'closed';
    view.dto.status = 'closed';
  }
  if (open) rememberSlug(publication, view.dto.slug);
  return { job: sanitizePublicPayload(view.detail), httpStatus: 200 };
};

const listSimilarJobs = async (siteContext, jobId, limit = 6) => {
  const rows = await listedViews(siteContext);
  const source = rows.find((row) => String(row.job.id) === String(jobId) || row.dto.slug === String(jobId));
  const cap = Math.min(20, Math.max(1, Number(limit) || 6));
  const pool = rows.filter((row) => row !== source).slice(0, 200);
  let ranked = pool;
  if (source) {
    const ids = [source.job.id, ...pool.map((row) => row.job.id)];
    const embeddings = await Job.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ['id', 'embedding'],
    });
    const byId = new Map(embeddings.map((row) => [String(row.id), normalizeEmbedding(row.embedding)]));
    const sourceVector = byId.get(String(source.job.id)) || [];
    ranked = [...pool].sort((a, b) => {
      const score = (row) => {
        const vector = byId.get(String(row.job.id)) || [];
        const cosine = sourceVector.length && vector.length ? cosineSimilarity(sourceVector, vector) : -1;
        if (cosine >= 0) return cosine;
        let fallback = 0;
        if (row.meta.categorySlugs?.[0] && row.meta.categorySlugs[0] === source.meta.categorySlugs?.[0]) fallback += 0.4;
        if (row.meta.citySlug && row.meta.citySlug === source.meta.citySlug) fallback += 0.2;
        return fallback;
      };
      return score(b) - score(a);
    });
  }
  return { items: ranked.slice(0, cap).map((row) => sanitizePublicPayload(row.dto)) };
};

const getTaxonomy = async (siteContext) => {
  const rows = await listedViews(siteContext);
  const [categories, cities, industries, roles] = await Promise.all([
    loadCategories(),
    loadCities(),
    loadIndustries(),
    JobRole.findAll({ attributes: ['clusterId', 'value', 'synonyms'], limit: 5000 }),
  ]);
  const clusterSlugById = new Map();
  for (const category of categories) {
    for (const cluster of category.clusters || []) {
      clusterSlugById.set(String(cluster.id), cluster.publicSlug || slugifySegment(cluster.name));
    }
  }
  const synonymsByCategorySlug = new Map();
  for (const role of roles) {
    const slug = clusterSlugById.get(String(role.clusterId));
    if (!slug) continue;
    const bag = synonymsByCategorySlug.get(slug) || [];
    if (role.value) bag.push(role.value);
    for (const synonym of role.synonyms || []) bag.push(synonym);
    synonymsByCategorySlug.set(slug, bag);
  }
  for (const [slug, bag] of synonymsByCategorySlug) {
    synonymsByCategorySlug.set(slug, [...new Set(bag.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12));
  }
  return buildTaxonomy({
    rows,
    categories: categories.map(plain),
    cities: cities.map(plain),
    industries,
    synonymsByCategorySlug,
  });
};

const getCompanyBySlug = async (siteContext, companySlug) => {
  const slug = String(companySlug || '').trim();
  if (!slug) throw httpError(400, 'Company slug is required');
  const rows = (await listedViews(siteContext)).filter(
    (row) => !row.meta.confidential && row.meta.companySlug === slug,
  );
  if (!rows.length) throw httpError(404, 'Company not found', 'NOT_FOUND');
  const company = rows[0].dto.company;
  return {
    ...company,
    jobs: rows.map((row) => sanitizePublicPayload(row.dto)),
  };
};

const getSitemapJobs = async (siteContext) => {
  const rows = await listedViews(siteContext);
  return rows.map((row) => ({
    slug: row.dto.slug,
    updatedAt: row.dto.updatedAt,
  }));
};

const recordJobView = async (siteContext, slugOrId, body = {}) => {
  const result = await getJobBySlugOrId(siteContext, slugOrId);
  if (result.job.status === 'closed') return { ok: true, status: 'closed' };
  const src = body.channel || body.src || body.source || 'public_site_v1';
  await jobPublicationService.recordVisit(result.job.slug, src);
  return { ok: true };
};

const recruitmentSourceNameFor = (siteContext, agency) => {
  if (siteContext?.recruitmentSourceName) return String(siteContext.recruitmentSourceName);
  if (siteContext?.mode === PUBLIC_SITE_KEY_MODES.AGGREGATOR) return 'אתר Hiro';
  const label = agency?.displayName || agency?.name || siteContext?.name || '';
  return label ? `אתר ${label}` : 'אתר Hiro';
};

const ensureRecruitmentSource = async (clientId, name) => {
  if (!clientId || !name) return;
  const existing = await RecruitmentSource.findOne({ where: { clientId, name } });
  if (existing) return existing;
  const max = await RecruitmentSource.max('sortIndex', { where: { clientId } });
  return RecruitmentSource.create({
    clientId,
    name,
    sortIndex: (Number(max) || 0) + 1,
    addresses: '',
    isActive: true,
  });
};

const submitJobApplication = async (siteContext, slugOrId, body = {}, reqMeta = {}) => {
  const parsed = validatePublicApplication(body);
  const ip = clientIp(reqMeta.forwardedFor);
  if (hitRateLimit({ ip, phone: parsed.phone })) {
    throw httpError(429, 'Too many applications', 'RATE_LIMITED');
  }

  let job;
  try {
    job = await jobPublicationService.resolveJobBySlug(slugOrId);
  } catch (err) {
    if (err.status === 404) throw httpError(404, 'Job not found', 'NOT_FOUND');
    throw err;
  }
  const publication = await JobPublication.findOne({ where: { jobId: job.id } });
  if (!publication) throw httpError(404, 'Job not found', 'NOT_FOUND');
  const context = await buildContext([job]);
  const view = presentPair(job, publication, context);
  const site = siteFromContext(siteContext);
  const args = { publication, jobClientId: job.clientId, site, agency: view.agency };
  if (!wasListedOnSite(args) && !isJobListedOnSite(args)) {
    throw httpError(404, 'Job not found', 'NOT_FOUND');
  }
  if (!isJobListedOnSite(args) || !jobAppearsOnSite(plain(job), view.agency)) {
    throw httpError(410, 'Job is closed', 'JOB_CLOSED');
  }
  assertScreeningAnswers(publication.screeningQuestions, parsed.answers);

  const sourceName = recruitmentSourceNameFor(siteContext, view.agency);
  if (view.agency?.id) {
    await ensureRecruitmentSource(view.agency.id, sourceName);
  }
  const testMode = siteContext?.environment === 'test';
  const slug = resolveSlug(plain(job), publication);
  try {
    const { response } = await jobPublicationService.submitApplication(slug, {
      publicSiteApply: true,
      rejectIfExists: true,
      fullName: parsed.fullName,
      phone: parsed.phone,
      email: parsed.email,
      screeningAnswers: parsed.answers,
      cvBase64: parsed.cv?.contentBase64,
      cvFileName: parsed.cv?.filename,
      cvMimeType: parsed.cv?.mimeType,
      recruitmentSourceName: sourceName,
      consent: parsed.consent,
      optIns: parsed.optIns,
      utm: parsed.utm,
      skipCvForward: testMode,
      testSubmission: testMode,
      src: 'public_site_v1',
    });
    return { applicationId: response?.applicationId || response?.candidateId };
  } catch (err) {
    if (err.status === 409 || err.code === 'ALREADY_APPLIED') {
      throw httpError(409, 'Already applied', 'ALREADY_APPLIED');
    }
    if (err.status === 422) throw err;
    throw err;
  }
};

const health = (siteContext) => ({
  ok: true,
  site: siteContext.name,
  mode: siteContext.mode,
  environment: siteContext.environment || null,
  domain: siteContext.domain || null,
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
