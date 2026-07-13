const { Op } = require('sequelize');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const Job = require('../models/Job');
const JobPublication = require('../models/JobPublication');
const Client = require('../models/Client');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const Candidate = require('../models/Candidate');
const JobCandidate = require('../models/JobCandidate');
const jobService = require('./jobService');
const candidateService = require('./candidateService');
const jobCandidateService = require('./jobCandidateService');
const clientUsageSettingService = require('./clientUsageSettingService');
const { createCanvas } = require('@napi-rs/canvas');
const geminiService = require('./geminiService');
const { createS3Client, buildPublicUrl } = require('./s3Service');
const matchingEngineService = require('./matchingEngineService');
const organizationService = require('./organizationService');

const DEFAULT_LANDING_FIELDS = [
  { key: 'fullName', label: 'שם מלא', status: 'mandatory' },
  { key: 'phone', label: 'טלפון', status: 'mandatory' },
  { key: 'email', label: 'דוא"ל', status: 'mandatory' },
  { key: 'cv', label: 'קורות חיים', status: 'mandatory' },
  { key: 'privacy', label: 'אישור פרטיות', status: 'mandatory' },
  { key: 'linkedin', label: 'קישור לינקדאין', status: 'optional' },
];

const DEFAULT_CAREER_THEME = {
  bannerBg: 'linear-gradient(90deg, #1e293b, #334155)',
  bannerText: '#ffffff',
  structure: '#4f46e5',
  buttonBg: '#4f46e5',
  buttonText: '#ffffff',
  formBg: '#f8fafc',
  additionalDetails: '#cbd5e1',
};

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

const normalizePosthogAnalytics = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const key = String(src.key || src.posthogKey || '').trim();
  const host = String(src.host || src.posthogHost || DEFAULT_POSTHOG_HOST).trim() || DEFAULT_POSTHOG_HOST;
  return { key, host };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stripHtml = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const requirementsList = (publication, job) => {
  const fromPub = publication?.publicJobRequirements;
  if (fromPub && String(fromPub).trim()) {
    return String(fromPub)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  const fromJob = job?.requirements;
  if (Array.isArray(fromJob)) return fromJob.filter(Boolean);
  return [];
};

const pickNonEmptyField = (...values) => {
  for (const value of values) {
    if (value != null && String(value).trim()) return value;
  }
  const last = values[values.length - 1];
  return last == null ? '' : last;
};

const resolveActiveLayoutContent = (publication) => {
  const layoutKey = publication.landingLayout || 'detailed';
  const layouts =
    publication.landingLayouts && typeof publication.landingLayouts === 'object'
      ? publication.landingLayouts
      : {};
  const variant =
    layouts[layoutKey] && typeof layouts[layoutKey] === 'object' ? layouts[layoutKey] : {};
  const detailed =
    layouts.detailed && typeof layouts.detailed === 'object' ? layouts.detailed : {};
  const base = {
    publicJobTitle: publication.publicJobTitle,
    publicJobDescription: publication.publicJobDescription,
    publicJobRequirements: publication.publicJobRequirements,
    contactEmail: publication.contactEmail,
    contactPhone1: publication.contactPhone1,
    contactPhone2: publication.contactPhone2,
  };
  // title_only intentionally omits body copy; other layouts fall back to detailed/top-level.
  const allowCanonicalFallback = layoutKey !== 'title_only';

  const pick = (field) => {
    const fromVariant = variant[field];
    if (fromVariant != null && String(fromVariant).trim()) return fromVariant;
    if (!allowCanonicalFallback) return fromVariant ?? '';
    return pickNonEmptyField(detailed[field], base[field], fromVariant);
  };

  return {
    layoutKey,
    publicJobTitle: pick('publicJobTitle'),
    publicJobDescription: pick('publicJobDescription'),
    publicJobRequirements: pick('publicJobRequirements'),
    contactEmail: pick('contactEmail'),
    contactPhone1: pick('contactPhone1'),
    contactPhone2: pick('contactPhone2'),
  };
};

const jobTypeLabel = (job) => {
  const jt = job?.jobType;
  if (Array.isArray(jt) && jt.length) return jt.join(' / ');
  if (typeof jt === 'string' && jt.trim()) return jt;
  return 'משרה מלאה';
};

const locationLabel = (job) => {
  const parts = [job?.city, job?.region, job?.location].filter((p) => p && String(p).trim());
  return parts.length ? parts.join(' / ') : 'ישראל';
};

const addScopeLabel = (set, value) => {
  const v = String(value || '').trim().toLowerCase();
  if (v) set.add(v);
};

const collectClientScopeLabels = async (client, { includeOrganizations = true } = {}) => {
  if (!client) return new Set();
  const plain = client.get ? client.get({ plain: true }) : client;
  const labels = new Set();
  addScopeLabel(labels, plain.name);
  addScopeLabel(labels, plain.displayName);
  addScopeLabel(labels, plain.domain);
  if (plain.metadata && typeof plain.metadata === 'object') {
    addScopeLabel(labels, plain.metadata.companyName);
    addScopeLabel(labels, plain.metadata.legalName);
    addScopeLabel(labels, plain.metadata.nameEn);
    if (Array.isArray(plain.metadata.aliases)) {
      for (const alias of plain.metadata.aliases) addScopeLabel(labels, alias);
    }
  }
  if (!includeOrganizations || !plain.id) return labels;

  try {
    const links = await ClientOrganizationLink.findAll({
      where: { clientId: plain.id },
      include: [
        {
          model: Organization,
          as: 'organization',
          attributes: ['name', 'nameEn', 'legalName', 'aliases'],
          required: false,
        },
        {
          model: OrganizationTmp,
          as: 'organizationTmp',
          attributes: ['name'],
          required: false,
        },
      ],
    });
    for (const link of links) {
      const org = link.organization;
      const tmp = link.organizationTmp;
      if (org) {
        addScopeLabel(labels, org.name);
        addScopeLabel(labels, org.nameEn);
        addScopeLabel(labels, org.legalName);
        if (Array.isArray(org.aliases)) {
          for (const alias of org.aliases) addScopeLabel(labels, alias);
        }
      }
      if (tmp) addScopeLabel(labels, tmp.name);
    }
  } catch (err) {
    console.warn('[jobsForClientScope] org label load failed', err?.message || err);
  }

  return labels;
};

/** Tenant agency scope: FK, agency labels, or application inbox — not end-customer CRM names. */
const jobMatchesClientScope = async (job, clientId, labels, { agencyTenancy = false } = {}) => {
  const plain = job.get ? job.get({ plain: true }) : job;
  if (plain.clientId && String(plain.clientId) === clientId) return true;

  const label = String(plain.client || '').trim().toLowerCase();
  if (label && labels.has(label)) return true;

  if (agencyTenancy) {
    const inboxClientId = await clientUsageSettingService.resolveClientIdFromJobInbox(plain.uniqueEmail);
    return Boolean(inboxClientId && String(inboxClientId) === clientId);
  }

  const resolvedId = await clientUsageSettingService.getClientIdForJobClientLabel(plain.client);
  if (resolvedId && String(resolvedId) === clientId) return true;

  const fromLabel = await matchingEngineService.resolveClientIdFromJobLabel(plain);
  if (fromLabel && String(fromLabel) === clientId) return true;

  const inboxClientId = await clientUsageSettingService.resolveClientIdFromJobInbox(plain.uniqueEmail);
  return Boolean(inboxClientId && String(inboxClientId) === clientId);
};

const CLIENT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLIENT_BRAND_ATTRIBUTES = ['id', 'name', 'displayName', 'domain', 'logoUrl', 'primaryColor', 'metadata'];

const publicClientRouteKey = (clientRow) => {
  if (!clientRow) return '';
  return String(clientRow.domain || '').trim();
};

const decodeClientBoardParam = (clientParam) => {
  if (!clientParam) return '';
  try {
    return decodeURIComponent(String(clientParam).trim()).trim();
  } catch {
    return String(clientParam).trim();
  }
};

const buildBoardBranding = (clientRow) =>
  clientRow
    ? {
        clientId: clientRow.id,
        clientName: clientRow.displayName || clientRow.name || '',
        domain: clientRow.domain || null,
        logoUrl: clientRow.logoUrl || null,
        primaryColor: clientRow.primaryColor || null,
      }
    : null;

const resolveClientByBoardParam = async (clientParam) => {
  const decoded = decodeClientBoardParam(clientParam);
  if (!decoded) return null;
  if (CLIENT_UUID_RE.test(decoded)) {
    return Client.findByPk(decoded, { attributes: CLIENT_BRAND_ATTRIBUTES });
  }
  return Client.findOne({
    where: {
      [Op.or]: [
        { domain: { [Op.iLike]: decoded } },
        { name: { [Op.iLike]: decoded } },
        { displayName: { [Op.iLike]: decoded } },
      ],
    },
    attributes: CLIENT_BRAND_ATTRIBUTES,
  });
};

const getPublicBoardBranding = async (clientParam) => {
  const boardClient = await resolveClientByBoardParam(clientParam);
  return buildBoardBranding(boardClient);
};

const resolveJobBySlug = async (slug) => {
  const key = String(slug || '').trim();
  if (!key) {
    const err = new Error('Job identifier is required');
    err.status = 400;
    throw err;
  }
  let job = null;
  if (UUID_RE.test(key)) {
    job = await Job.findByPk(key, { attributes: { exclude: ['skills', 'embedding'] } });
  }
  if (!job) {
    job = await Job.findOne({
      where: { postingCode: key },
      attributes: { exclude: ['skills', 'embedding'] },
    });
  }
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return job;
};

const resolveClientForJob = async (job) => {
  const jobPlain = job.get ? job.get({ plain: true }) : job;
  let clientId = await clientUsageSettingService.resolveClientIdFromJobInbox(jobPlain.uniqueEmail);
  if (!clientId) {
    clientId = await clientUsageSettingService.getClientIdForJobClientLabel(jobPlain.client);
  }
  if (!clientId) {
    clientId = await matchingEngineService.resolveClientIdFromJobLabel(jobPlain);
  }
  if (!clientId) return null;
  return Client.findByPk(clientId, {
    attributes: [
      'id',
      'name',
      'displayName',
      'domain',
      'logoUrl',
      'primaryColor',
      'metadata',
      'email',
      'phone',
      'mainContactEmail',
      'mainContactPhone',
    ],
  });
};

const normalizeLandingContact = (raw = {}) => ({
  contactEmail: raw.contactEmail != null ? String(raw.contactEmail).trim() : '',
  contactPhone1: raw.contactPhone1 != null ? String(raw.contactPhone1).trim() : '',
  contactPhone2: raw.contactPhone2 != null ? String(raw.contactPhone2).trim() : '',
});

const deriveLandingContactFromClientRecord = (client) => {
  if (!client) {
    return normalizeLandingContact();
  }
  const phone = String(client.phone || '').trim();
  const mainPhone = String(client.mainContactPhone || '').trim();
  const phone2 = mainPhone && mainPhone !== phone ? mainPhone : '';
  return normalizeLandingContact({
    contactEmail: client.email || client.mainContactEmail,
    contactPhone1: phone || mainPhone,
    contactPhone2: phone2,
  });
};

const resolveClientLandingContact = (client) => {
  if (!client) return normalizeLandingContact();
  const meta = client.metadata && typeof client.metadata === 'object' ? client.metadata : {};
  const stored = normalizeLandingContact(meta.landingContact);
  const derived = deriveLandingContactFromClientRecord(client);
  return normalizeLandingContact({
    contactEmail: pickNonEmptyField(stored.contactEmail, derived.contactEmail),
    contactPhone1: pickNonEmptyField(stored.contactPhone1, derived.contactPhone1),
    contactPhone2: pickNonEmptyField(stored.contactPhone2, derived.contactPhone2),
  });
};

const getOrCreatePublication = async (job) => {
  const jobId = job.id;
  let publication = await JobPublication.findOne({ where: { jobId } });
  if (publication) return publication;

  const requirements = Array.isArray(job.requirements) ? job.requirements.join('\n') : '';
  publication = await JobPublication.create({
    jobId,
    publicJobTitle: job.publicJobTitle || job.title,
    publicJobDescription: job.PublicDescription || job.description || '',
    publicJobRequirements: requirements,
    landingPageFields: DEFAULT_LANDING_FIELDS,
    screeningQuestions: [],
    trackingLinks: [],
    publishToGeneralBoard: true,
    publicationCode: job.postingCode || null,
  });
  return publication;
};

const getPublicJobSlug = (jobOrSlug) => {
  if (!jobOrSlug) return '';
  if (typeof jobOrSlug === 'string') return jobOrSlug;
  return jobOrSlug.postingCode || jobOrSlug.id || '';
};

const publicAppOrigin = () =>
  String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://hiro.co.il').replace(/\/$/, '');

const buildAppUrl = (jobOrSlug, srcKey, clientRow) => {
  const slug = getPublicJobSlug(jobOrSlug);
  if (!slug) return '';
  const base = publicAppOrigin();
  let clientSegment = '';
  const routeKey = publicClientRouteKey(clientRow);
  if (routeKey) {
    clientSegment = `${encodeURIComponent(routeKey)}/`;
  }
  const appPath = `/jobs/${clientSegment}public/${slug}`;
  const query = srcKey ? `?src=${encodeURIComponent(srcKey)}` : '';
  if (base) {
    return `${base}${appPath}${query}`;
  }
  return `${appPath}${query}`;
};

/** Public share link — server HTML with Open Graph tags (WhatsApp, LinkedIn, etc.). */
const buildLandingUrl = (jobOrSlug, srcKey, clientRow) => {
  const slug = getPublicJobSlug(jobOrSlug);
  if (!slug) return '';
  const base = publicAppOrigin();
  const routeKey = publicClientRouteKey(clientRow);
  const clientSegment = routeKey ? `${encodeURIComponent(routeKey)}/` : '';
  const query = srcKey ? `?src=${encodeURIComponent(srcKey)}` : '';
  const path = `/api/public/jobs/share/${clientSegment}${encodeURIComponent(slug)}${query}`;
  return base ? `${base}${path}` : path;
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const absoluteAssetUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  const base = publicAppOrigin();
  if (u.startsWith('/') && base) return `${base}${u}`;
  return u;
};

const truncatePlainText = (text, maxLen = 200) => {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
};

const buildOgPreviewHtml = ({ title, description, shareUrl, appUrl, imageUrl, imageAlt }) => {
  const metaImage = imageUrl
    ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt || title)}" />
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Hiro" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:locale" content="he_IL" />
  ${metaImage}
  <meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <meta http-equiv="refresh" content="0;url=${escapeHtml(appUrl)}" />
</head>
<body>
  <p style="font-family: sans-serif; padding: 1.5rem; text-align: center;">
    <a href="${escapeHtml(appUrl)}">${escapeHtml(title)}</a>
  </p>
  <script>window.location.replace(${JSON.stringify(appUrl)});</script>
</body>
</html>`;
};

const buildBoardAppUrl = (clientRow) => {
  const base = publicAppOrigin();
  const routeKey = publicClientRouteKey(clientRow);
  const clientSegment = routeKey ? `${encodeURIComponent(routeKey)}/` : '';
  const path = `/jobs/${clientSegment}public/board`;
  return base ? `${base}${path}` : path;
};

const buildBoardShareUrl = (clientRow) => {
  const base = publicAppOrigin();
  const routeKey = publicClientRouteKey(clientRow);
  const clientSegment = routeKey ? `${encodeURIComponent(routeKey)}/` : '';
  const path = `/api/public/jobs/share/${clientSegment}board`;
  return base ? `${base}${path}` : path;
};

const renderBoardSharePreviewPage = async ({ clientHint }) => {
  const clientRow = clientHint ? await resolveClientByBoardParam(clientHint) : null;
  const branding = buildBoardBranding(clientRow);
  const appUrl = buildBoardAppUrl(clientRow);
  const shareUrl = buildBoardShareUrl(clientRow);
  const companyName = branding?.clientName || 'Hiro';
  const title = `לוח משרות — ${companyName}`;
  const description = `גלו את המשרות הפתוחות ב-${companyName}. הגישו מועמדות online.`;
  const imageUrl = absoluteAssetUrl(branding?.logoUrl);

  return buildOgPreviewHtml({
    title,
    description,
    shareUrl,
    appUrl,
    imageUrl,
    imageAlt: companyName,
  });
};

const renderSharePreviewPage = async ({ clientHint, slug, srcKey }) => {
  const landing = await getPublicLanding(slug, srcKey, clientHint);
  const clientRow = clientHint ? await resolveClientByBoardParam(clientHint) : null;
  const appUrl = buildAppUrl(
    { postingCode: landing.postingCode, id: landing.jobId },
    srcKey,
    clientRow || { domain: landing.clientBranding?.domain },
  );
  const shareUrl = buildLandingUrl(
    { postingCode: landing.postingCode, id: landing.jobId },
    srcKey,
    clientRow || { domain: landing.clientBranding?.domain },
  );

  const title = landing.jobTitle || 'משרה פתוחה';
  const company = landing.companyName ? `${landing.companyName} · ` : '';
  const location = landing.location ? ` · ${landing.location}` : '';
  const description =
    truncatePlainText(landing.descriptionPlain, 220) ||
    `${company}${title}${location}`.trim() ||
    'הצטרפו אלינו — הגישו מועמדות online';
  const imageUrl =
    absoluteAssetUrl(landing.heroImage) ||
    absoluteAssetUrl(landing.logo) ||
    absoluteAssetUrl(landing.clientBranding?.logoUrl);

  return buildOgPreviewHtml({
    title,
    description,
    shareUrl,
    appUrl,
    imageUrl,
    imageAlt: title,
  });
};

const normalizeTrackingLinks = (links, jobOrSlug, clientRow) => {
  if (!Array.isArray(links)) return [];
  const slug = getPublicJobSlug(jobOrSlug);
  return links.map((link, idx) => {
    const srcKey = link.srcKey || link.source?.toLowerCase().replace(/\s+/g, '_') || `link_${idx + 1}`;
    return {
      id: link.id || srcKey,
      source: link.source || 'קישור',
      srcKey,
      url: slug ? buildLandingUrl(jobOrSlug, srcKey, clientRow) : (link.url || ''),
      visits: Number(link.visits ?? link.views ?? 0) || 0,
      submissions: Number(link.submissions ?? link.applicants ?? 0) || 0,
    };
  });
};

const bumpTrackingLink = (links, srcKey, field) => {
  const normalized = normalizeTrackingLinks(links, null);
  const key = String(srcKey || 'direct').trim() || 'direct';
  let found = normalized.find((l) => l.srcKey === key);
  if (!found) {
    found = {
      id: key,
      source: key,
      srcKey: key,
      url: '',
      visits: 0,
      submissions: 0,
    };
    normalized.push(found);
  }
  found[field] = (Number(found[field]) || 0) + 1;
  return normalized;
};

const buildPublicLandingPayload = async (job, publication, client, srcKey) => {
  const baseTheme =
    (client?.metadata && client.metadata.careerPageTheme) || DEFAULT_CAREER_THEME;
  const brandColor = client?.primaryColor?.trim() || null;
  const theme = brandColor
    ? {
        ...baseTheme,
        structure: brandColor,
        buttonBg: brandColor,
        bannerBg: brandColor,
      }
    : { ...baseTheme };
  const active = resolveActiveLayoutContent(publication);
  const description =
    active.publicJobDescription ||
    job.PublicDescription ||
    job.description ||
    '';
  const publishedQuestions = (Array.isArray(publication.screeningQuestions)
    ? publication.screeningQuestions
    : []
  ).filter((q) => q && q.isPublished !== false);

  const pubForRequirements = {
    publicJobRequirements: active.publicJobRequirements,
  };

  return {
    jobId: job.id,
    postingCode: job.postingCode,
    companyName: client?.displayName || client?.name || job.client,
    jobTitle: active.publicJobTitle || job.publicJobTitle || job.title,
    location: locationLabel(job),
    jobType: jobTypeLabel(job),
    logo: client?.logoUrl || null,
    heroImage: publication.heroImageUrl || null,
    videoUrl: publication.videoUrl || null,
    description,
    descriptionPlain: stripHtml(description),
    requirements: requirementsList(pubForRequirements, job),
    landingPageFields: publication.landingPageFields?.length
      ? publication.landingPageFields
      : DEFAULT_LANDING_FIELDS,
    screeningQuestions: publishedQuestions,
    theme,
    status: job.status,
    shareUrl: buildLandingUrl(job, srcKey || null, client),
    companyId: client?.id || null,
    clientBranding: {
      logoUrl: client?.logoUrl || null,
      primaryColor: client?.primaryColor || null,
      domain: client?.domain || null,
    },
    ...resolveClientLandingContact(client),
    landingLayout: active.layoutKey,
    posthog: normalizePosthogAnalytics(
      client?.metadata && typeof client.metadata === 'object' ? client.metadata.posthogAnalytics : null,
    ),
  };
};

const getPublicLanding = async (slug, srcKey, clientHint) => {
  const job = await resolveJobBySlug(slug);
  if (job.status === 'טיוטה') {
    const err = new Error('Job is not published');
    err.status = 404;
    throw err;
  }
  const publication = await getOrCreatePublication(job);
  const hintClient = clientHint ? await resolveClientByBoardParam(clientHint) : null;
  const client = hintClient || (await resolveClientForJob(job));
  return buildPublicLandingPayload(job, publication, client, srcKey);
};

const recordVisit = async (slug, srcKey) => {
  const job = await resolveJobBySlug(slug);
  const publication = await getOrCreatePublication(job);
  const client = await resolveClientForJob(job);
  const trackingLinks = bumpTrackingLink(publication.trackingLinks, srcKey, 'visits');
  await publication.update({
    visitCount: (Number(publication.visitCount) || 0) + 1,
    trackingLinks: trackingLinks.map((l) => ({
      ...l,
      url: l.url || buildLandingUrl(job, l.srcKey, client),
    })),
  });
  return { ok: true };
};

const trimField = (v) => String(v ?? '').trim();

const resolveApplicantFullName = (body = {}) => {
  const fullName = trimField(body.fullName);
  if (fullName) return fullName;
  const firstName = trimField(body.firstName);
  const lastName = trimField(body.lastName);
  return [firstName, lastName].filter(Boolean).join(' ');
};

const buildApplicationNotes = (body = {}) => {
  const parts = [];
  const linkedin = trimField(body.linkedin);
  const notes = trimField(body.notes);
  const interestedInJobs = trimField(body.interestedInJobs);
  if (linkedin) parts.push(`LinkedIn: ${linkedin}`);
  if (notes) parts.push(notes);
  if (interestedInJobs) parts.push(`מתעניין במשרות: ${interestedInJobs}`);
  return parts.join('\n');
};

const formatScreeningAnswersNote = (screeningAnswers = {}, questions = []) => {
  const lines = [];
  for (const q of questions) {
    if (!q || q.id == null) continue;
    const answer = screeningAnswers[String(q.id)];
    if (answer == null || String(answer).trim() === '') continue;
    const label = trimField(q.question) || `שאלה ${q.id}`;
    lines.push(`${label}: ${String(answer).trim()}`);
  }
  return lines.length ? `תשובות סינון מדף פרסום:\n${lines.join('\n')}` : '';
};

const buildApplicationCandidatePayload = (body, srcKey, existing = null) => {
  const firstName = trimField(body.firstName);
  const lastName = trimField(body.lastName);
  const fullName = resolveApplicantFullName(body);
  const email = trimField(body.email).toLowerCase();
  const phone = trimField(body.phone);
  const city = trimField(body.city);
  const idNumber = trimField(body.idNumber);
  const drivingLicense = trimField(body.drivingLicense);
  const applicationNotes = buildApplicationNotes(body);
  const source = `דף פרסום${srcKey !== 'direct' ? ` (${srcKey})` : ''}`;

  const payload = { email, source };
  if (fullName) payload.fullName = fullName;
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (phone) payload.phone = phone;
  if (city) {
    payload.location = city;
    payload.address = city;
  }
  if (idNumber) payload.idNumber = idNumber;
  if (drivingLicense) {
    payload.drivingLicense = drivingLicense;
    payload.drivingLicenses = [drivingLicense];
  }
  if (applicationNotes) payload.candidateNotes = applicationNotes;

  if (!existing) return payload;

  const merged = { ...payload };
  for (const key of Object.keys(merged)) {
    if (merged[key] == null || merged[key] === '') delete merged[key];
  }
  if (merged.candidateNotes && existing.candidateNotes) {
    merged.candidateNotes = `${String(existing.candidateNotes).trim()}\n${merged.candidateNotes}`;
  }
  return merged;
};

const uploadResumeBuffer = async (candidateId, buffer, filename, mimeType) => {
  if (!buffer || !buffer.length) return null;
  const name = filename ? path.basename(filename) : `resume-${Date.now()}.pdf`;
  const key = `resumes/${candidateId}/${Date.now()}-${name}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  });
  const client = createS3Client();
  await client.send(command);
  return buildPublicUrl(key);
};

const submitApplication = async (slug, body = {}) => {
  const job = await resolveJobBySlug(slug);
  if (job.status !== 'פתוחה' && job.status !== 'מוקפאת') {
    const err = new Error('This job is not accepting applications');
    err.status = 400;
    throw err;
  }

  const publication = await getOrCreatePublication(job);
  const fields = publication.landingPageFields?.length
    ? publication.landingPageFields
    : DEFAULT_LANDING_FIELDS;
  const srcKey = body.src || body.source || 'direct';

  const fullName = resolveApplicantFullName(body);
  const email = trimField(body.email).toLowerCase();

  for (const field of fields) {
    if (field.status !== 'mandatory') continue;
    const val = body[field.key];
    if (field.key === 'cv') {
      if (!body.cvBase64 && !body.cvFileName) {
        const err = new Error('קורות חיים נדרשים');
        err.status = 400;
        throw err;
      }
      continue;
    }
    if (field.key === 'privacy') {
      if (!body.privacyAccepted) {
        const err = new Error('יש לאשר את תנאי השימוש');
        err.status = 400;
        throw err;
      }
      continue;
    }
    if (field.key === 'fullName') {
      if (!resolveApplicantFullName(body)) {
        const err = new Error(`${field.label || field.key} is required`);
        err.status = 400;
        throw err;
      }
      continue;
    }
    if (!val || !String(val).trim()) {
      const err = new Error(`${field.label || field.key} is required`);
      err.status = 400;
      throw err;
    }
  }

  if (!fullName || !email) {
    const err = new Error('שם מלא ודוא"ל נדרשים');
    err.status = 400;
    throw err;
  }

  const screeningAnswers = body.screeningAnswers || {};
  const publishedQuestions = (Array.isArray(publication.screeningQuestions)
    ? publication.screeningQuestions
    : []
  ).filter((q) => q && q.isPublished !== false);

  for (const q of publishedQuestions) {
    if (!q.isMandatory) continue;
    const answer = screeningAnswers[String(q.id)];
    if (answer == null || String(answer).trim() === '') {
      const err = new Error(`נדרש מענה לשאלה: ${q.question}`);
      err.status = 400;
      throw err;
    }
  }

  const screeningNote = formatScreeningAnswersNote(screeningAnswers, publishedQuestions);

  let candidate = await candidateService.findByEmail(email);
  const candidatePayload = buildApplicationCandidatePayload(body, srcKey, candidate);
  if (screeningNote) {
    candidatePayload.internalNotes = candidate?.internalNotes
      ? `${String(candidate.internalNotes).trim()}\n\n${screeningNote}`
      : screeningNote;
  }

  if (candidate) {
    await candidateService.update(candidate.id, candidatePayload);
    candidate = await candidateService.getById(candidate.id);
  } else {
    candidate = await candidateService.create(candidatePayload);
    candidate = await candidateService.getById(candidate.id);
  }

  if (body.cvBase64) {
    try {
      await candidateController.processResumeUploadForCandidate(
        candidate.id,
        body.cvBase64,
        body.cvFileName,
        body.cvMimeType,
        { preserveFormFields: true },
      );
      candidate = await candidateService.getById(candidate.id);
    } catch (uploadErr) {
      console.warn('[jobPublicationService] CV upload failed', uploadErr.message || uploadErr);
    }
  }

  const { created } = await jobCandidateService.associateCandidateWithJob({
    jobId: job.id,
    candidateId: candidate.id,
    status: 'חדש',
    source: `public_apply:${srcKey}`,
    workflowMetaPatch: {
      landingPageSubmission: true,
      recruitmentSource: srcKey,
      screeningAnswers,
      submittedAt: new Date().toISOString(),
    },
  });

  const client = await resolveClientForJob(job);

  if (created) {
    const trackingLinks = bumpTrackingLink(publication.trackingLinks, srcKey, 'submissions');
    await publication.update({
      submissionCount: (Number(publication.submissionCount) || 0) + 1,
      trackingLinks: trackingLinks.map((l) => ({
        ...l,
        url: l.url || buildLandingUrl(job, l.srcKey, client),
      })),
    });
  }

  return {
    ok: true,
    candidateId: candidate.id,
    companyName: client?.displayName || client?.name || job.client,
  };
};

const submissionCountsBySourceKey = async (jobId) => {
  const batch = await submissionCountsByJobIds([jobId]);
  return batch.get(jobId) || new Map();
};

/** @returns {Promise<Map<string, Map<string, number>>>} jobId -> (srcKey -> count) */
const submissionCountsByJobIds = async (jobIds) => {
  const result = new Map();
  if (!jobIds.length) return result;

  const rows = await JobCandidate.findAll({
    where: {
      jobId: { [Op.in]: jobIds },
      source: { [Op.like]: 'public_apply:%' },
    },
    attributes: ['jobId', 'source'],
    raw: true,
  });

  for (const row of rows) {
    const jid = String(row.jobId || '');
    if (!jid) continue;
    let counts = result.get(jid);
    if (!counts) {
      counts = new Map();
      result.set(jid, counts);
    }
    const src = String(row.source || '').replace(/^public_apply:/, '') || 'direct';
    counts.set(src, (counts.get(src) || 0) + 1);
  }
  return result;
};

const publicationListFallback = (job) => ({
  publicJobTitle: job.publicJobTitle || job.title,
  visitCount: 0,
  heroImageUrl: null,
  trackingLinks: [],
  publicationCode: job.postingCode || null,
});

const enrichPublicationTrackingLinks = async (job, publication, clientRow) => {
  const plain = publication.get ? publication.get({ plain: true }) : publication;
  const counts = await submissionCountsBySourceKey(job.id);
  const trackingLinks = normalizeTrackingLinks(plain.trackingLinks, job, clientRow).map((link) => ({
    ...link,
    submissions: counts.get(link.srcKey) || 0,
  }));
  let submissionCount = 0;
  for (const n of counts.values()) submissionCount += n;
  return { trackingLinks, submissionCount };
};

const publicationToResponse = async (job, publication) => {
  const plain = publication.get ? publication.get({ plain: true }) : publication;
  const client = await resolveClientForJob(job);
  const enriched = await enrichPublicationTrackingLinks(job, publication, client);
  const clientLandingContact = resolveClientLandingContact(client);
  const { trackingLinks, submissionCount } = enriched;
  return {
    ...plain,
    submissionCount,
    trackingLinks,
    clientLandingContact,
    clientBranding: {
      clientName: client?.displayName || client?.name || '',
      logoUrl: client?.logoUrl || null,
      primaryColor: client?.primaryColor || null,
      domain: client?.domain || null,
    },
    publicJobTitle: plain.publicJobTitle || job.publicJobTitle || job.title,
    publicJobDescription:
      plain.publicJobDescription || job.PublicDescription || job.description || '',
    publicJobRequirements:
      plain.publicJobRequirements ||
      (Array.isArray(job.requirements) ? job.requirements.join('\n') : ''),
  };
};

const getPublicationForJob = async (jobId) => {
  const job = await Job.findByPk(jobId, { attributes: { exclude: ['skills', 'embedding'] } });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  const publication = await getOrCreatePublication(job);
  return publicationToResponse(job, publication);
};

const updatePublicationForJob = async (jobId, payload = {}) => {
  const job = await Job.findByPk(jobId, { attributes: { exclude: ['skills', 'embedding'] } });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  const publication = await getOrCreatePublication(job);

  const pubData = {};
  const allowed = [
    'publicJobTitle',
    'publicJobDescription',
    'publicJobRequirements',
    'landingPageFields',
    'screeningQuestions',
    'trackingLinks',
    'publishToGeneralBoard',
    'heroImageUrl',
    'videoUrl',
    'contactEmail',
    'contactPhone1',
    'contactPhone2',
    'landingLayout',
    'landingLayouts',
  ];
  for (const key of allowed) {
    if (payload[key] !== undefined) pubData[key] = payload[key];
  }
  if (Array.isArray(pubData.trackingLinks)) {
    const client = await resolveClientForJob(job);
    pubData.trackingLinks = normalizeTrackingLinks(pubData.trackingLinks, job, client);
  }

  // Top-level publication fields hold the full publish copy (detailed variant), not layout-truncated empties.
  if (payload.landingLayouts && typeof payload.landingLayouts === 'object') {
    const canonical =
      payload.landingLayouts.detailed ||
      (payload.landingLayout ? payload.landingLayouts[payload.landingLayout] : null);
    if (canonical && typeof canonical === 'object') {
      if (canonical.publicJobTitle !== undefined) pubData.publicJobTitle = canonical.publicJobTitle;
      if (canonical.publicJobDescription != null && String(canonical.publicJobDescription).trim()) {
        pubData.publicJobDescription = canonical.publicJobDescription;
      }
      if (canonical.publicJobRequirements != null && String(canonical.publicJobRequirements).trim()) {
        pubData.publicJobRequirements = canonical.publicJobRequirements;
      }
      if (canonical.contactEmail !== undefined) pubData.contactEmail = canonical.contactEmail;
      if (canonical.contactPhone1 !== undefined) pubData.contactPhone1 = canonical.contactPhone1;
      if (canonical.contactPhone2 !== undefined) pubData.contactPhone2 = canonical.contactPhone2;
    }
  }

  await publication.update(pubData);

  const jobUpdates = {};
  if (payload.publicJobTitle !== undefined) jobUpdates.publicJobTitle = payload.publicJobTitle;
  if (payload.publicJobDescription !== undefined) {
    jobUpdates.PublicDescription = payload.publicJobDescription;
  }
  if (payload.publicJobRequirements !== undefined) {
    jobUpdates.requirements = String(payload.publicJobRequirements)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }
  if (Object.keys(jobUpdates).length) {
    await jobService.update(job.id, jobUpdates);
  }

  await publication.reload();
  return publicationToResponse(job, publication);
};

const JOB_SCOPE_ATTRIBUTES = ['id', 'title', 'publicJobTitle', 'client', 'clientId', 'status', 'postingCode', 'uniqueEmail'];

/** Draft / generic labels — not real placement employers for publishing dashboards. */
const PLACEHOLDER_EMPLOYER_LABELS = ['לקוח כללי', 'לקוח חדש', 'לא צוין'];

const jobsForClientScope = async (clientRow) => {
  if (!clientRow) {
    return Job.findAll({
      attributes: JOB_SCOPE_ATTRIBUTES,
      order: [['openDate', 'DESC']],
    });
  }

  const clientId = String(clientRow.id || clientRow.get?.('id') || '').trim();
  if (!clientId) return [];

  // Tenant scope: only jobs explicitly linked via jobs.client_id FK.
  return Job.findAll({
    where: { clientId },
    attributes: JOB_SCOPE_ATTRIBUTES,
    order: [['openDate', 'DESC']],
  });
};

/** Publishing dashboard: tenant FK + open jobs with a real employer label. */
const jobsForPublishingScope = async (clientRow) => {
  if (!clientRow) return [];

  const clientId = String(clientRow.id || clientRow.get?.('id') || '').trim();
  if (!clientId) return [];

  return Job.findAll({
    where: {
      clientId,
      status: 'פתוחה',
      client: { [Op.notIn]: PLACEHOLDER_EMPLOYER_LABELS },
    },
    attributes: JOB_SCOPE_ATTRIBUTES,
    order: [['openDate', 'DESC']],
  });
};

const resolvePubHeroImage = (pub) => {
  if (!pub) return null;
  const url = pub.heroImageUrl ?? pub.get?.('heroImageUrl');
  return typeof url === 'string' && url.trim() ? url.trim() : null;
};

const resolveJobClientId = (job) => {
  const plain = job?.get ? job.get({ plain: true }) : job;
  const id = plain?.clientId;
  return id ? String(id) : null;
};

const listDashboardLinks = async (clientRow) => {
  const jobs = await jobsForPublishingScope(clientRow);
  const jobIds = jobs.map((j) => j.id);
  if (!jobIds.length) return [];

  const [publications, submissionCountsByJob] = await Promise.all([
    JobPublication.findAll({ where: { jobId: { [Op.in]: jobIds } } }),
    submissionCountsByJobIds(jobIds),
  ]);
  const pubByJob = new Map(publications.map((p) => [p.jobId, p]));

  const rows = [];
  for (const job of jobs) {
    const pub = pubByJob.get(job.id) || publicationListFallback(job);
    const counts = submissionCountsByJob.get(job.id) || new Map();
    const links = normalizeTrackingLinks(pub.trackingLinks, job, clientRow).map((link) => ({
      ...link,
      submissions: counts.get(link.srcKey) || 0,
    }));
    const totalSubmissions = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const visitCount = Number(pub.visitCount) || 0;
    const heroImage = resolvePubHeroImage(pub);
    const jobTitle = pub.publicJobTitle || job.publicJobTitle || job.title;
    const postingCode = pub.publicationCode || job.postingCode || null;
    const clientId = resolveJobClientId(job);

    if (!links.length) {
      rows.push({
        id: `${job.id}-default`,
        jobId: job.id,
        clientId,
        client: job.client,
        employer: job.client,
        jobTitle,
        status: job.status,
        source: 'קישור ישיר',
        visits: visitCount,
        submissions: totalSubmissions,
        subPercent: visitCount ? Math.round((totalSubmissions / visitCount) * 1000) / 10 : 0,
        url: buildLandingUrl(job, null, clientRow),
        heroImage,
        heroImageUrl: heroImage,
        postingCode,
      });
      continue;
    }
    for (const link of links) {
      const visits = Number(link.visits) || 0;
      const submissions = Number(link.submissions) || 0;
      rows.push({
        id: `${job.id}-${link.id}`,
        jobId: job.id,
        clientId,
        client: job.client,
        employer: job.client,
        jobTitle,
        status: job.status,
        source: link.source,
        visits,
        submissions,
        subPercent: visits ? Math.round((submissions / visits) * 1000) / 10 : 0,
        url: link.url || buildLandingUrl(job, link.srcKey, clientRow),
        heroImage,
        heroImageUrl: heroImage,
        postingCode,
      });
    }
  }
  return rows;
};

const listDashboardCandidates = async (clientRow) => {
  const jobs = await jobsForPublishingScope(clientRow);
  const jobIds = jobs.map((j) => j.id);
  if (!jobIds.length) return [];

  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const links = await JobCandidate.findAll({
    where: {
      jobId: { [Op.in]: jobIds },
      source: { [Op.like]: 'public_apply:%' },
    },
    include: [
      {
        model: Candidate,
        as: 'candidate',
        required: true,
        attributes: ['id', 'fullName', 'location', 'email', 'phone'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: 500,
  });

  return links.map((row) => {
    const plain = row.get({ plain: true });
    const job = jobMap.get(plain.jobId);
    const src = String(plain.source || '').replace(/^public_apply:/, '') || 'direct';
    const created = plain.createdAt ? new Date(plain.createdAt) : new Date();
    return {
      id: plain.id,
      candidateId: plain.candidateId,
      name: plain.candidate?.fullName || '—',
      client: job?.client || '—',
      jobTitle: job?.publicJobTitle || job?.title || '—',
      city: plain.candidate?.location || '—',
      date: created.toLocaleDateString('he-IL'),
      time: created.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      source: src,
    };
  });
};

const getDashboardStats = async (clientRow) => {
  const jobs = await jobsForPublishingScope(clientRow);
  const jobIds = jobs.map((j) => j.id);
  const openJobs = jobs.length;

  if (!jobIds.length) {
    return {
      totalPublishedJobs: 0,
      jobsWithActiveLinks: 0,
      totalLinks: 0,
      totalVisits: 0,
      totalSubmissions: 0,
      conversionRate: 0,
    };
  }

  const publications = await JobPublication.findAll({ where: { jobId: { [Op.in]: jobIds } } });
  let totalVisits = 0;
  let totalSubmissions = 0;
  let totalLinks = 0;
  let jobsWithLinks = 0;

  for (const pub of publications) {
    totalVisits += Number(pub.visitCount) || 0;
    totalSubmissions += Number(pub.submissionCount) || 0;
    const job = jobs.find((j) => j.id === pub.jobId);
    const links = normalizeTrackingLinks(pub.trackingLinks, job || pub.jobId, clientRow);
    if (links.length) {
      jobsWithLinks += 1;
      totalLinks += links.length;
    }
  }

  return {
    totalPublishedJobs: jobs.length,
    jobsWithActiveLinks: jobsWithLinks || jobs.length,
    totalLinks: totalLinks || jobs.length,
    totalVisits,
    totalSubmissions,
    conversionRate: totalVisits
      ? Math.round((totalSubmissions / totalVisits) * 1000) / 10
      : 0,
  };
};

const getCareerTheme = async (clientRow) => {
  if (!clientRow) return DEFAULT_CAREER_THEME;
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? clientRow.metadata : {};
  return meta.careerPageTheme || DEFAULT_CAREER_THEME;
};

const updateCareerTheme = async (clientRow, theme) => {
  if (!clientRow) {
    const err = new Error('Client context required');
    err.status = 400;
    throw err;
  }
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? { ...clientRow.metadata } : {};
  meta.careerPageTheme = { ...DEFAULT_CAREER_THEME, ...theme };
  await clientRow.update({ metadata: meta });
  return meta.careerPageTheme;
};

const getPosthogAnalytics = async (clientRow) => {
  if (!clientRow) {
    return normalizePosthogAnalytics(null);
  }
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? clientRow.metadata : {};
  return normalizePosthogAnalytics(meta.posthogAnalytics);
};

const updatePosthogAnalytics = async (clientRow, payload = {}) => {
  if (!clientRow) {
    const err = new Error('Client context required');
    err.status = 400;
    throw err;
  }
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? { ...clientRow.metadata } : {};
  const prev = normalizePosthogAnalytics(meta.posthogAnalytics);
  meta.posthogAnalytics = normalizePosthogAnalytics({
    key: payload.key != null ? payload.key : prev.key,
    host: payload.host != null ? payload.host : prev.host,
  });
  await clientRow.update({ metadata: meta });
  return meta.posthogAnalytics;
};

const getLandingContact = async (clientRow) => resolveClientLandingContact(clientRow);

const updateLandingContact = async (clientRow, payload = {}) => {
  if (!clientRow) {
    const err = new Error('Client context required');
    err.status = 400;
    throw err;
  }
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? { ...clientRow.metadata } : {};
  const prev = normalizeLandingContact(meta.landingContact);
  meta.landingContact = normalizeLandingContact({
    contactEmail: payload.contactEmail != null ? payload.contactEmail : prev.contactEmail,
    contactPhone1: payload.contactPhone1 != null ? payload.contactPhone1 : prev.contactPhone1,
    contactPhone2: payload.contactPhone2 != null ? payload.contactPhone2 : prev.contactPhone2,
  });
  await clientRow.update({ metadata: meta });
  return resolveClientLandingContact({ ...clientRow.get({ plain: true }), metadata: meta });
};

const listCandidatesForJob = async (jobId) => {
  const links = await JobCandidate.findAll({
    where: {
      jobId,
      source: { [Op.like]: 'public_apply:%' },
    },
    include: [
      {
        model: Candidate,
        as: 'candidate',
        required: true,
        attributes: ['id', 'fullName', 'location', 'email', 'phone', 'status', 'matchScore'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit: 200,
  });

  return links.map((row) => {
    const plain = row.get({ plain: true });
    const src = String(plain.source || '').replace(/^public_apply:/, '') || 'direct';
    const created = plain.createdAt ? new Date(plain.createdAt) : new Date();
    return {
      id: plain.id,
      candidateId: plain.candidateId,
      name: plain.candidate?.fullName || '—',
      city: plain.candidate?.location || '—',
      source: src,
      date: created.toLocaleDateString('he-IL'),
      status: plain.status || plain.candidate?.status || 'חדש',
      matchScore: Number(plain.candidate?.matchScore) || 0,
    };
  });
};

const relativePostedLabel = (date) => {
  if (!date) return 'לאחרונה';
  const diffMs = Date.now() - new Date(date).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  if (days === 2) return 'לפני יומיים';
  if (days < 7) return `לפני ${days} ימים`;
  if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
  return new Date(date).toLocaleDateString('he-IL');
};

const clientNameMatchesFilter = (clientRow, jobClientLabel, clientFilterNorm) => {
  if (!clientFilterNorm) return true;
  const names = [
    clientRow?.displayName,
    clientRow?.name,
    jobClientLabel,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim().toLowerCase());
  return names.includes(clientFilterNorm);
};

const resolveEmployerIndustryMap = async (employerNames) => {
  const unique = [...new Set(
    employerNames.map((n) => String(n || '').trim()).filter(Boolean),
  )];
  const map = new Map();
  await Promise.all(
    unique.map(async (name) => {
      try {
        const org = await organizationService.findByName(name);
        if (!org) return;
        const industry =
          String(org.mainField || '').trim() ||
          (Array.isArray(org.mainField2) ? org.mainField2.map((v) => String(v || '').trim()).find(Boolean) : '') ||
          '';
        if (industry) map.set(name, industry);
      } catch {
        /* ignore lookup failures */
      }
    }),
  );
  return map;
};

const listPublicBoardJobs = async (filters = {}) => {
  const search = String(filters.search || '').trim().toLowerCase();
  const locationFilter = String(filters.location || '').trim().toLowerCase();
  const jobTypeFilter = String(filters.jobType || '').trim().toLowerCase();
  const boardClient = filters.client ? await resolveClientByBoardParam(filters.client) : null;
  let clientFilterNorm = '';
  if (filters.client) {
    clientFilterNorm = decodeClientBoardParam(filters.client).toLowerCase();
    if (CLIENT_UUID_RE.test(clientFilterNorm)) clientFilterNorm = '';
  }

  const publications = await JobPublication.findAll({
    where: { publishToGeneralBoard: true },
  });

  if (!publications.length) {
    return { branding: buildBoardBranding(boardClient), jobs: [] };
  }

  const jobIds = publications.map((p) => p.jobId);
  const jobs = await Job.findAll({
    where: {
      id: { [Op.in]: jobIds },
      status: { [Op.ne]: 'טיוטה' },
    },
    attributes: { exclude: ['skills', 'embedding'] },
    order: [['openDate', 'DESC']],
  });

  const pubByJob = new Map(publications.map((p) => [p.jobId, p]));
  const rows = [];

  let scopedJobIds = null;
  if (boardClient) {
    const scopedJobs = await jobsForClientScope(boardClient);
    scopedJobIds = new Set(scopedJobs.map((j) => j.id));
  }

  const employerIndustryMap = await resolveEmployerIndustryMap(jobs.map((j) => j.client));

  for (const job of jobs) {
    const pub = pubByJob.get(job.id);
    if (!pub) continue;

    if (scopedJobIds) {
      if (!scopedJobIds.has(job.id)) continue;
    } else if (clientFilterNorm) {
      const client = await resolveClientForJob(job);
      if (!clientNameMatchesFilter(client, job.client, clientFilterNorm)) continue;
    }

    const title = pub.publicJobTitle || job.publicJobTitle || job.title;
    const loc = locationLabel(job);
    const jt = jobTypeLabel(job);
    const description = stripHtml(
      pub.publicJobDescription || job.PublicDescription || job.description || '',
    );
    const requirements = requirementsList(pub, job);

    if (search) {
      const hay = [title, job.client, description, ...requirements].join(' ').toLowerCase();
      if (!hay.includes(search)) continue;
    }
    if (locationFilter && !loc.toLowerCase().includes(locationFilter)) continue;
    if (jobTypeFilter && !jt.toLowerCase().includes(jobTypeFilter)) continue;

    rows.push({
      jobId: job.id,
      postingCode: job.postingCode,
      title,
      companyName: job.client,
      client: job.client,
      employerName: job.client,
      field: job.field || '',
      role: job.role || '',
      industry: employerIndustryMap.get(job.client) || '',
      city: job.city || '',
      region: job.region || '',
      location: loc,
      jobType: jt,
      logo: boardClient?.logoUrl || null,
      primaryColor: boardClient?.primaryColor || null,
      heroImage: resolvePubHeroImage(pub),
      heroImageUrl: resolvePubHeroImage(pub),
      description: description.slice(0, 1200),
      requirements,
      tags: requirements.slice(0, 5),
      postedDate: relativePostedLabel(job.openDate || job.createdAt),
      salaryMin: Number(job.salaryMin) || 0,
      salaryMax: Number(job.salaryMax) || 0,
      landingUrl: buildLandingUrl(job, 'job_board', boardClient),
      isPromoted: false,
    });
  }

  return { branding: buildBoardBranding(boardClient), jobs: rows };
};

const getHeroGallery = (clientRow) => {
  if (!clientRow) return [];
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? clientRow.metadata : {};
  return Array.isArray(meta.landingHeroImages) ? meta.landingHeroImages : [];
};

const saveHeroGallery = async (clientRow, images) => {
  if (!clientRow) {
    const err = new Error('Client context required');
    err.status = 400;
    throw err;
  }
  const meta = clientRow.metadata && typeof clientRow.metadata === 'object' ? { ...clientRow.metadata } : {};
  meta.landingHeroImages = Array.isArray(images) ? images : [];
  await clientRow.update({ metadata: meta });
  return meta.landingHeroImages;
};

const addHeroGalleryImage = async (clientRow, image) => {
  const current = getHeroGallery(clientRow);
  const entry = {
    id: image.id || `img-${Date.now()}`,
    url: image.url,
    label: image.label || '',
    createdAt: new Date().toISOString(),
  };
  return saveHeroGallery(clientRow, [entry, ...current]);
};

const removeHeroGalleryImage = async (clientRow, imageId) => {
  const current = getHeroGallery(clientRow);
  return saveHeroGallery(
    clientRow,
    current.filter((img) => img.id !== imageId),
  );
};

const uploadPublicAssetBuffer = async (key, buffer, mimeType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  });
  const s3 = createS3Client();
  await s3.send(command);
  return buildPublicUrl(key);
};

const renderHeroCanvas = ({ title, tagline, brandColor }) => {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const base = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#1e293b';

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, base);
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(width * 0.85, height * 0.2, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(width * 0.15, height * 0.85, 140, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.font = 'bold 56px Arial';
  const safeTitle = String(title || 'משרה').slice(0, 80);
  const titleLines = [];
  let line = '';
  for (const word of safeTitle.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > width - 160) {
      if (line) titleLines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) titleLines.push(line);
  titleLines.slice(0, 3).forEach((t, i) => {
    ctx.fillText(t, width - 80, 200 + i * 70);
  });

  if (tagline) {
    ctx.font = '32px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(String(tagline).slice(0, 60), width - 80, 420);
  }

  return canvas.toBuffer('image/png');
};

const splitPromptLines = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*•]+/, '').trim())
    .filter(Boolean);

const mapLayoutToPromptStyle = (layout) => {
  const map = {
    detailed: 'detailed',
    summary: 'minimal',
    short: 'title_desc',
    title_only: 'title_only',
  };
  return map[layout] || 'detailed';
};

const buildHeroPosterPrompt = ({
  promptStyle,
  clientName,
  title,
  subtitle,
  description,
  requirements,
  brandColor,
  contactEmail,
  contactPhone1,
  contactPhone2,
  hasLogo,
}) => {
  const roleLines = splitPromptLines(description);
  const reqLines = splitPromptLines(requirements);

  let textContent = '';
  if (promptStyle === 'detailed') {
    textContent = `
התפקיד כולל:
${roleLines.map((d) => `* ${d}`).join('\n') || '* פרטים יפורסמו בקרוב'}

דרישות:
${reqLines.map((d) => `* ${d}`).join('\n') || '* לפי תיאור המשרה'}
`;
  } else if (promptStyle === 'minimal') {
    textContent = `
נקודות עיקריות (Main Points Summary):
${roleLines.slice(0, 2).map((d) => `* ${d}`).join('\n')}
${reqLines.slice(0, 2).map((d) => `* ${d}`).join('\n')}
`;
  } else if (promptStyle === 'title_desc') {
    textContent = `
Short Description: We are looking for an experienced ${title} to join our creative environment!
${description ? String(description).slice(0, 280) : ''}
`;
  } else if (promptStyle === 'title_only') {
    textContent = `
[No additional description body, just the title heavily emphasized]
`;
  }

  const contactBlock = [
    contactEmail ? `שלחו קורות חיים למייל: ${contactEmail}` : '',
    contactPhone1 ? `או בנייד: ${contactPhone1}` : '',
    contactPhone2 ? `או טלפון נוסף: ${contactPhone2}` : '',
  ].filter(Boolean).join('\n');

  return `Create a highly detailed, professional job advertisement hero banner for a website landing page.
Format: Widescreen landscape 16:9 aspect ratio — fill the entire frame edge-to-edge with no letterboxing.
Text MUST be strictly in Hebrew, written correctly from right-to-left.
CRITICAL: NEVER include the employer organization name, hiring company name, or any organization mentioned in the job description as visible text on the banner. Only the staffing agency / client brand name below may appear as a company name (if provided).
You MUST include ALL of the following details on the banner layout:

${clientName ? `Staffing agency / client brand (only company name allowed): ${clientName}` : 'Do not render any company or organization name on the banner.'}
Title: ${title}
${subtitle && promptStyle !== 'title_only' ? `Subtitle: ${subtitle}` : ''}
${textContent}

Contact Information (at the bottom):
${contactBlock || 'Contact details on the landing page'}

Visual theme: A high-quality, ultra-realistic or slick graphic design widescreen hero banner for a job opening.
Vibe: Corporate, clean, inviting.
Colors: Use ${brandColor} prominently.
Include modern graphic elements related to business and careers.
Layout: Compose for a wide horizontal hero slot — keep key text and logo in the central safe area; avoid tall vertical stacking.
${hasLogo ? 'CRITICAL: Incorporate the provided company logo image into the banner design prominently and accurately.' : ''}
CRITICAL: The text must be highly legible, structured clearly, and well-contrasted against the background, just like a professional Photoshop template.`;
};

const resolveClientNameForHeroPoster = (client, options = {}) => {
  const fromOptions = String(options.clientName || options.companyName || '').trim();
  if (fromOptions) return fromOptions;
  return String(client?.displayName || client?.name || '').trim();
};

const generateHeroImageForJob = async (jobId, options = {}) => {
  const job = await Job.findByPk(jobId, { attributes: { exclude: ['skills', 'embedding'] } });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  const [publication, client] = await Promise.all([
    getOrCreatePublication(job),
    resolveClientForJob(job),
  ]);
  const title = options.publicJobTitle
    || publication.publicJobTitle
    || job.publicJobTitle
    || job.title;
  const brandColor = options.brandColor || client?.primaryColor || '#1e293b';
  const clientName = resolveClientNameForHeroPoster(client, options);
  const landingContact = resolveClientLandingContact(client);
  const contactEmail = options.contactEmail || landingContact.contactEmail || '';
  const contactPhone1 = options.contactPhone1 || landingContact.contactPhone1 || '';
  const contactPhone2 = options.contactPhone2 || landingContact.contactPhone2 || '';
  const description = options.publicJobDescription
    ?? publication.publicJobDescription
    ?? job.PublicDescription
    ?? job.description
    ?? '';
  const requirements = options.publicJobRequirements
    ?? publication.publicJobRequirements
    ?? '';
  const layout = options.landingLayout || publication.landingLayout || 'detailed';
  const promptStyle = mapLayoutToPromptStyle(layout);
  const logoDataUrl = options.companyLogo || null;
  const apiKey = geminiService.resolveGeminiApiKey?.() || '';

  let buffer = null;
  let mimeType = 'image/png';

  if (apiKey) {
    const plainDescription = stripHtml(description);
    const imagePrompt = buildHeroPosterPrompt({
      promptStyle,
      clientName,
      title,
      subtitle: options.companySlogan || client?.slogan || '',
      description: plainDescription,
      requirements,
      brandColor,
      contactEmail,
      contactPhone1,
      contactPhone2,
      hasLogo: Boolean(logoDataUrl),
    });

    try {
      const generated = await geminiService.generateNanoBananaImage({
        apiKey,
        prompt: imagePrompt,
        aspectRatio: options.aspectRatio || '16:9',
        imageSize: options.imageSize || '2K',
        logoDataUrl,
      });
      if (generated?.buffer?.length) {
        buffer = generated.buffer;
        mimeType = generated.mimeType || 'image/png';
      }
    } catch (err) {
      console.warn('[generateHeroImageForJob] Nano Banana image generation failed', {
        message: err?.message,
      });
      throw err;
    }
  }

  if (!buffer) {
    const err = new Error('יצירת התמונה ב-Nano Banana נכשלה. ודא ש-GEMINI_API_KEY מוגדר ונסה שוב.');
    err.status = 502;
    throw err;
  }

  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const key = `landing-heroes/${job.id}/${Date.now()}.${ext}`;
  const url = await uploadPublicAssetBuffer(key, buffer, mimeType);

  if (client) {
    await addHeroGalleryImage(client, { url, label: title });
  }

  await publication.update({ heroImageUrl: url });
  return { url, heroImageUrl: url };
};

const listCompanyCreatedImages = async (clientRow) => {
  const gallery = getHeroGallery(clientRow).map((img) => ({
    id: img.id,
    url: img.url,
    label: img.label || '',
    createdAt: img.createdAt || null,
    source: 'gallery',
    jobId: null,
    canDelete: true,
  }));
  const seenUrls = new Set(gallery.map((img) => img.url).filter(Boolean));

  const jobs = await jobsForPublishingScope(clientRow);
  const jobIds = jobs.map((j) => j.id);
  if (!jobIds.length) return gallery;

  const publications = await JobPublication.findAll({
    where: {
      jobId: { [Op.in]: jobIds },
      heroImageUrl: { [Op.ne]: null },
    },
    attributes: ['jobId', 'heroImageUrl', 'publicJobTitle', 'updatedAt'],
  });
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const extras = [];

  for (const pub of publications) {
    const url = String(pub.heroImageUrl || '').trim();
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);
    const job = jobMap.get(pub.jobId);
    extras.push({
      id: `pub-${pub.jobId}`,
      url,
      label: pub.publicJobTitle || job?.publicJobTitle || job?.title || '',
      createdAt: pub.updatedAt ? new Date(pub.updatedAt).toISOString() : null,
      source: 'publication',
      jobId: pub.jobId,
      canDelete: false,
    });
  }

  const merged = [...gallery, ...extras];
  merged.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return merged;
};

const listCompanyCreatedImagesForJob = async (jobKey) => {
  const job = await resolveJobBySlug(jobKey);
  const client = await resolveClientForJob(job);
  const publication = await getOrCreatePublication(job);
  const results = client ? await listCompanyCreatedImages(client) : [];
  const seenUrls = new Set(results.map((img) => img.url).filter(Boolean));

  const pushImage = (entry) => {
    const url = String(entry?.url || '').trim();
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    results.push(entry);
  };

  const heroUrl = resolvePubHeroImage(publication);
  if (heroUrl) {
    pushImage({
      id: `pub-${job.id}`,
      url: heroUrl,
      label: publication.publicJobTitle || job.publicJobTitle || job.title || '',
      createdAt: publication.updatedAt ? new Date(publication.updatedAt).toISOString() : null,
      source: 'publication',
      jobId: job.id,
      canDelete: false,
    });
  }

  if (!client && job.client) {
    const siblingJobs = await Job.findAll({
      where: { client: job.client },
      attributes: ['id', 'title', 'publicJobTitle', 'client'],
    });
    const siblingIds = siblingJobs.map((j) => j.id);
    if (siblingIds.length) {
      const siblingPubs = await JobPublication.findAll({
        where: {
          jobId: { [Op.in]: siblingIds },
          heroImageUrl: { [Op.ne]: null },
        },
        attributes: ['jobId', 'heroImageUrl', 'publicJobTitle', 'updatedAt'],
      });
      const jobMap = new Map(siblingJobs.map((j) => [j.id, j]));
      for (const pub of siblingPubs) {
        const url = String(pub.heroImageUrl || '').trim();
        if (!url) continue;
        const siblingJob = jobMap.get(pub.jobId);
        pushImage({
          id: `pub-${pub.jobId}`,
          url,
          label: pub.publicJobTitle || siblingJob?.publicJobTitle || siblingJob?.title || '',
          createdAt: pub.updatedAt ? new Date(pub.updatedAt).toISOString() : null,
          source: 'publication',
          jobId: pub.jobId,
          canDelete: false,
        });
      }
    }
  }

  results.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return results;
};

module.exports = {
  DEFAULT_CAREER_THEME,
  DEFAULT_LANDING_FIELDS,
  buildLandingUrl,
  buildAppUrl,
  buildAppHashUrl: buildAppUrl,
  buildBoardShareUrl,
  renderBoardSharePreviewPage,
  renderSharePreviewPage,
  getPublicLanding,
  recordVisit,
  submitApplication,
  getPublicationForJob,
  updatePublicationForJob,
  listDashboardLinks,
  jobsForClientScope,
  jobsForPublishingScope,
  listDashboardCandidates,
  getDashboardStats,
  getCareerTheme,
  updateCareerTheme,
  getPosthogAnalytics,
  updatePosthogAnalytics,
  getLandingContact,
  updateLandingContact,
  DEFAULT_POSTHOG_HOST,
  listCandidatesForJob,
  listPublicBoardJobs,
  getPublicBoardBranding,
  getHeroGallery,
  saveHeroGallery,
  addHeroGalleryImage,
  removeHeroGalleryImage,
  generateHeroImageForJob,
  listCompanyCreatedImages,
  listCompanyCreatedImagesForJob,
};
