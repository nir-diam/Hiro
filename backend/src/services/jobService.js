const { Op, QueryTypes } = require('sequelize');
const redis = require('./redisService');
const { invalidateJobMatches, invalidateJobInAllCandidateOpportunities } = require('./matchingCacheService');
const Job = require('../models/Job');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const Prompt = require('../models/Prompt');
const Client = require('../models/Client');
const ClientContact = require('../models/ClientContact');
const User = require('../models/User');
const clientUsageSettingService = require('./clientUsageSettingService');
const { prepareCvForwardSettingsForSave } = require('../utils/cvForwardSettings');
const { sequelize } = require('../config/db');

const REFERRAL_EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function resolveClientIdForJobReferral(jobRow) {
  if (!jobRow) return null;
  if (jobRow.clientId) return String(jobRow.clientId);

  const label = String(jobRow.client || '').trim();
  if (!label) return null;

  let cid = await clientUsageSettingService.getClientIdForJobClientLabel(label);
  if (cid) return cid;

  const beforeParen = label.split('(')[0].trim();
  if (beforeParen && beforeParen !== label) {
    cid = await clientUsageSettingService.getClientIdForJobClientLabel(beforeParen);
    if (cid) return cid;
  }

  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) {
    cid = await clientUsageSettingService.getClientIdForJobClientLabel(parenMatch[1].trim());
    if (cid) return cid;
  }

  const afterParen = label.replace(/^[^)]*\)\s*/, '').trim();
  if (afterParen && afterParen !== label) {
    cid = await clientUsageSettingService.getClientIdForJobClientLabel(afterParen);
    if (cid) return cid;
  }

  const nc = label.toLowerCase();
  const clients = await Client.findAll({
    where: { isActive: true },
    attributes: ['id', 'name', 'displayName'],
  });
  for (const cl of clients) {
    const name = String(cl.displayName || cl.name || '').trim().toLowerCase();
    if (name && (name === nc || name.includes(nc) || nc.includes(name))) {
      return String(cl.id);
    }
  }
  for (const fragment of [beforeParen, afterParen].filter(Boolean)) {
    const nf = fragment.toLowerCase();
    for (const cl of clients) {
      const name = String(cl.displayName || cl.name || '').trim().toLowerCase();
      if (name && (name === nf || name.includes(nf) || nf.includes(name))) {
        return String(cl.id);
      }
    }
  }

  return null;
}

function pushReferralContact(out, seen, row) {
  const email = String(row.email || '').trim();
  const name = String(row.name || '').trim() || email;
  if (!name) return;

  if (REFERRAL_EMAIL_RE.test(email)) {
    const key = email.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
  } else if (row.id && seen.has(`id:${row.id}`)) {
    return;
  } else if (row.id) {
    seen.add(`id:${row.id}`);
  }

  out.push({
    id: String(row.id),
    name,
    email: REFERRAL_EMAIL_RE.test(email) ? email : '',
    role: String(row.role || '').trim(),
    source: row.source || 'client',
  });
}

/**
 * Resolve referral / screening-CV recipients for a job:
 * - job.clientId or fuzzy client label match
 * - job.contacts JSONB (`kind`+`id` refs or inline name/email)
 * - fallback: all active client_contacts when no job-specific list
 */
async function resolveReferralContactsForJob(job, opts = {}) {
  const plain = job && typeof job.get === 'function' ? job.get({ plain: true }) : { ...job };
  const jobId = plain?.id != null ? String(plain.id) : '';
  const clientIdHint = opts.clientIdHint ? String(opts.clientIdHint).trim() : null;

  let clientId = clientIdHint || (await resolveClientIdForJobReferral(plain));
  let clientRow = null;
  if (clientId) {
    clientRow = await Client.findByPk(clientId, { attributes: ['id', 'name', 'displayName'] });
    if (!clientRow) {
      clientId = null;
    }
  }

  const out = [];
  const seen = new Set();
  const jobJsonContacts = Array.isArray(plain.contacts) ? plain.contacts : [];
  const assignedRefs = jobJsonContacts.filter(
    (c) => c && typeof c === 'object' && (c.kind === 'contact' || c.kind === 'user') && c.id,
  );
  const hasAssignedRefs = assignedRefs.length > 0;

  if (hasAssignedRefs) {
    const contactIds = [];
    const userIds = [];
    for (const c of assignedRefs) {
      const id = String(c.id).trim();
      if (c.kind === 'user') userIds.push(id);
      else contactIds.push(id);
    }

    if (contactIds.length) {
      const rows = await ClientContact.findAll({
        where: { id: contactIds },
        attributes: ['id', 'name', 'email', 'role', 'isActive'],
      });
      for (const r of rows) {
        const c = r.get({ plain: true });
        if (c.isActive === false) continue;
        pushReferralContact(out, seen, {
          id: String(c.id),
          name: String(c.name || '').trim(),
          email: String(c.email || '').trim(),
          role: String(c.role || '').trim(),
          source: 'client',
        });
      }
    }

    if (userIds.length) {
      const rows = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'name', 'email'],
      });
      for (const r of rows) {
        const c = r.get({ plain: true });
        pushReferralContact(out, seen, {
          id: String(c.id),
          name: String(c.name || '').trim() || String(c.email || '').trim(),
          email: String(c.email || '').trim(),
          role: 'משתמש פורטל',
          source: 'user',
        });
      }
    }

    for (let i = 0; i < jobJsonContacts.length; i++) {
      const c = jobJsonContacts[i];
      if (!c || typeof c !== 'object') continue;
      const embeddedName = String(c.name || '').trim();
      const embeddedEmail = String(c.email || '').trim();
      if (!embeddedName && !REFERRAL_EMAIL_RE.test(embeddedEmail)) continue;
      const kind = c.kind === 'user' ? 'user' : c.kind === 'contact' ? 'contact' : null;
      const refId = c.id != null ? String(c.id).trim() : '';
      pushReferralContact(out, seen, {
        id: kind && refId ? `${kind}:${refId}` : `job:${jobId}:${i}`,
        name: embeddedName || embeddedEmail,
        email: embeddedEmail,
        role: String(c.role || '').trim(),
        source: 'job',
      });
    }
  } else if (clientRow) {
    const rows = await ClientContact.findAll({
      where: { clientId: clientRow.id, isActive: true },
      attributes: ['id', 'name', 'email', 'role'],
      order: [['createdAt', 'ASC']],
    });
    for (const r of rows) {
      const c = r.get({ plain: true });
      pushReferralContact(out, seen, {
        id: String(c.id),
        name: String(c.name || '').trim(),
        email: String(c.email || '').trim(),
        role: String(c.role || '').trim(),
        source: 'client',
      });
    }

    for (let i = 0; i < jobJsonContacts.length; i++) {
      const c = jobJsonContacts[i];
      const email = String(c?.email || '').trim();
      const name = String(c?.name || '').trim();
      if (!name && !REFERRAL_EMAIL_RE.test(email)) continue;
      pushReferralContact(out, seen, {
        id: `job:${jobId}:${i}`,
        name: name || email,
        email,
        role: String(c?.role || '').trim(),
        source: 'job',
      });
    }
  } else {
    for (let i = 0; i < jobJsonContacts.length; i++) {
      const c = jobJsonContacts[i];
      const email = String(c?.email || '').trim();
      const name = String(c?.name || '').trim();
      if (!name && !REFERRAL_EMAIL_RE.test(email)) continue;
      pushReferralContact(out, seen, {
        id: `job:${jobId}:${i}`,
        name: name || email,
        email,
        role: String(c?.role || '').trim(),
        source: 'job',
      });
    }
  }

  return {
    clientId: clientRow ? String(clientRow.id) : null,
    clientResolvedName: clientRow ? String(clientRow.displayName || clientRow.name || '') : '',
    jobClientLabel: String(plain.client || ''),
    contacts: out,
  };
}

/**
 * Compute and persist the job embedding in the background (fire-and-forget).
 * Called after create/update so the embedding is ready for future sonar scans.
 */
async function _computeAndSaveJobEmbedding(job) {
  try {
    const { toPlainJobForMatchScore } = module.exports;
    const plain = toPlainJobForMatchScore(job);
    // Delegate to getJobEmbedding which has all the text-building and caching logic
    const { getJobEmbedding } = require('./matchingScoreService');
    const emb = await getJobEmbedding(plain);
    if (emb && emb.length > 0) {
      await Job.update({ embedding: emb }, { where: { id: job.id } });
      console.log(`[jobService] embedding stored for job ${job.id} (${emb.length}d)`);
    }
  } catch (e) {
    console.warn('[jobService] background embedding compute failed (non-fatal):', e.message);
  }
}
const { sendChat } = require('./geminiService');
const cityService = require('./cityService');
const {
  syncTagsForJob,
  hydrateJobSkills,
  hydrateJobsSkills,
  mapSystemTagsToJobSkills,
  listJobTags,
  listJobIdsByTag,
} = require('./candidateTagService');
const { enrichJobAnalyzeResult } = require('../utils/jobAiAnalyzeNormalize');
const { parseLenientJsonObject } = require('../utils/parseLenientJson');
const {
  enrichJobsWithOrganizationIds,
  resolveOrganizationIdForJob,
  resolveOrganizationIdForAnalyze,
} = require('./jobOrganizationResolveService');

/** Normalize LLM output → UI/db-safe daily hours (matches candidate WorkingHoursInput). */
const coercePreferredWorkingHoursFromJobAi = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === '-') return null;
  if (s === 'גמיש' || s === 'ללא אילוצי שעות') return s;
  const lower = s.toLowerCase();
  if (
    /גמישות|שעות גמישות|משמרות גמישות|ללא התחייבות לשעות|עבודה גמישה/i.test(s) ||
    /\bflexible(\s+hours|\s+schedule)?\b/i.test(lower) ||
    /\bvariable\s+hours\b/i.test(lower)
  ) {
    return 'גמיש';
  }
  const m = s.match(/(\d{1,2})\s*:\s*(\d{2})\s*[-–—]\s*(\d{1,2})\s*:\s*(\d{2})/);
  if (m) {
    const hh = (x) => String(Math.min(23, parseInt(x, 10))).padStart(2, '0');
    const mm = (x) => String(Math.min(59, parseInt(x, 10))).padStart(2, '0');
    return `${hh(m[1])}:${mm(m[2])}-${hh(m[3])}:${mm(m[4])}`;
  }
  return s.slice(0, 255);
};

/** Appended so models emit schedule even when DB prompt omits it (frontend embeds via internalNotes marker). */
const JOB_ANALYZE_PREFERRED_HOURS_APPENDIX = `
--- Required JSON field for job schedule (use null if not stated in the posting text) ---
- "preferredWorkingHours": string|null — Preferred daily hours ONLY if explicit in the description.
  Allowed when present: "גמיש", "ללא אילוצי שעות", or one 24h range "HH:mm-HH:mm" (zero-padded, e.g. "09:00-18:00").
  Map "שעות גמישות", "flexible hours", etc. to "גמיש". Do not invent numeric ranges without evidence.
`;

/**
 * Forces the model to attach a verbatim source quote to every skill/tag.
 * Distinct from `tag_reason` (which may be a short paraphrase): `quote` must be
 * a literal substring of the input description, so we can highlight evidence in the UI.
 */
/** Appended so models emit age + availability + licenses even when DB prompt omits them. */
const JOB_ANALYZE_FIELDS_APPENDIX = `
--- Required JSON fields (use null / [] when not stated in the posting) ---
- "ageMin": number|null — Minimum candidate age in years (integer 18–70). Extract only if explicit (e.g. "מגיל 25", "גיל 25-40" → ageMin=25).
- "ageMax": number|null — Maximum candidate age in years (integer 18–70). Extract only if explicit (e.g. "עד גיל 45", "גיל 25-40" → ageMax=40).
  If a range is given, set BOTH ageMin and ageMax. Put the verbatim age requirement in internalNotes as well (ZERO INFORMATION LOSS).
- "availability": string|null — Required candidate start readiness (זמינות להתחלה). Use EXACTLY one of these Hebrew picklist strings when stated:
  * "🟢 מיידי (זמין לעבודה מיד)."
  * "🟡 חודש הודעה (עובד, מחפש אקטיבית)."
  * "🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting)."
  * "🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים)."
  Map synonyms (e.g. "מיידי", "זמין מיד") to the matching emoji option. null if not mentioned.
- "availabilityOptions": string[] — When multiple start-readiness levels are acceptable, list each as the exact picklist string above (OR semantics). [] if not stated.
- "licenseType": string|null — Primary required driving license (Hebrew label or class letter, e.g. "B", "רישיון נהיגה ורכב"). null / omit if not required.
- "licenseTypes": string[] — All acceptable license types when more than one is mentioned (OR). [] if none.
- "client": string|null — Hiring company named in the posting (שם החברה). Short brand only, e.g. "D-AND-D" from "לחברת D-AND-D יבוא ושיווק...". Do not return the job title, the city, or a full sentence. null if no company is named.
`;

const JOB_ANALYZE_SKILL_QUOTE_APPENDIX = `
--- Required additional field on EVERY object inside the "skills" array ---
- "quote": string|null — The EXACT, verbatim substring copied character-by-character from the
  input job description text that caused this tag to be created.
  STRICT RULES:
  * MUST be a literal substring of the input text — no paraphrase, no synonyms, no translation,
    no punctuation/whitespace edits beyond trimming leading/trailing spaces.
  * Pick the SHORTEST span that still proves the tag (typically a phrase or sentence). Hard cap ~240 characters.
  * If the same evidence supports multiple tags, repeat the quote per tag — do NOT deduplicate.
  * If the input text does not contain a verbatim phrase that justifies the tag, set "quote" to null.
  * "quote" is REQUIRED on every skill object and is in ADDITION to "tag_reason".
`;

const JOB_KEY = (id) => `job:${id}`;
const JOB_TTL = 60 * 60; // 1 hour

const jobCacheSet = async (job) => {
  try {
    const plain = job?.get ? job.get({ plain: true }) : job;
    if (plain?.id) await redis.set(JOB_KEY(plain.id), plain, { ttlSeconds: JOB_TTL });
  } catch (e) {
    console.warn('[jobService] redis set failed (non-fatal):', e.message);
  }
};

const jobCacheDel = async (id) => {
  try {
    await redis.del(JOB_KEY(id));
  } catch (e) {
    console.warn('[jobService] redis del failed (non-fatal):', e.message);
  }
};

const pickPreferredWorkingHoursRawFromParsed = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return null;
  const keys = [
    'preferredWorkingHours',
    'workingHours',
    'workHours',
    'dailyHours',
    'dailyWorkingHours',
    'jobWorkingHours',
    'shiftHours',
    'scheduleHours',
  ];
  for (const k of keys) {
    const v = parsed[k];
    if (v != null && String(v).trim()) return v;
  }
  return null;
};

const stripSkillsFromPayload = (payload = {}) => {
  const data = { ...payload };
  const hasSkills = Object.prototype.hasOwnProperty.call(payload, 'skills');
  const skills = hasSkills && Array.isArray(data.skills) ? data.skills : null;
  if (hasSkills) delete data.skills;
  return { data, skills, hasSkills };
};

/**
 * List jobs for table/UI — omits `events` (unbounded JSONB) so the query stays fast;
 * skills are loaded from system_tags (type = job).
 */
/** Lightweight title/client search for admin pickers (no skills hydration). */
const searchForPicker = async ({ search, limit = 30 } = {}) => {
  const term = String(search || '').trim();
  if (!term || term.length < 2) return [];

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
  return Job.findAll({
    where: {
      [Op.or]: [
        { title: { [Op.iLike]: `%${term}%` } },
        { publicJobTitle: { [Op.iLike]: `%${term}%` } },
        { client: { [Op.iLike]: `%${term}%` } },
        { postingCode: { [Op.iLike]: `%${term}%` } },
      ],
    },
    attributes: ['id', 'title', 'publicJobTitle', 'client', 'status'],
    limit: safeLimit,
    order: [['updatedAt', 'DESC']],
  });
};

/** Heavy job fields loaded on demand via GET /api/jobs/:id — omitted from list/grid APIs. */
const JOB_LIST_API_EXCLUDE_ATTRIBUTES = [
  'telephoneQuestions',
  'digitalQuestions',
  'recruitmentSources',
  'cvForwardSettings',
  'aiRawDescription',
  'contacts',
  'events',
  'embedding',
  'listNotesHistory',
  'skills',
  'languages',
];

const JOB_LIST_FIND_ATTRIBUTES = {
  exclude: ['events', 'skills', 'embedding', ...JOB_LIST_API_EXCLUDE_ATTRIBUTES.filter(
    (k) => k !== 'events' && k !== 'skills' && k !== 'embedding',
  )],
};

const JOB_COMPOSE_FIND_ATTRIBUTES = ['id', 'title', 'client', 'postingCode'];

function staffActorLabel(actor) {
  if (!actor) return null;
  const name = String(actor.name || '').trim();
  if (name) return name;
  const email = String(actor.email || '').trim();
  if (email) return email;
  return actor.id ? String(actor.id) : null;
}

/** Record that a staff user opened the job profile (edit/view). */
const recordStaffJobView = async (jobId, actor) => {
  const id = String(jobId || '').trim();
  if (!id || !actor?.id) return null;
  const now = new Date();
  const label = staffActorLabel(actor);
  await Job.update(
    {
      lastOpenedByUserId: String(actor.id),
      lastOpenedByName: label,
      lastOpenedAt: now,
    },
    { where: { id } },
  );
  await jobCacheDel(id);
  return {
    lastOpenedByUserId: String(actor.id),
    lastOpenedByName: label,
    lastOpenedAt: now.toISOString(),
  };
};

/** API payloads must never include embedding vectors (large JSONB). */
const toApiJob = (job) => {
  if (!job) return job;
  const plain = typeof job.get === 'function' ? job.get({ plain: true }) : { ...job };
  delete plain.embedding;
  return plain;
};

const toApiJobComposeRow = (job) => {
  const plain = toApiJob(job);
  return {
    id: plain.id,
    title: plain.title,
    client: plain.client,
    postingCode: plain.postingCode ?? null,
  };
};

const toApiJobListRow = (job) => {
  const plain = toApiJob(job);
  for (const key of JOB_LIST_API_EXCLUDE_ATTRIBUTES) {
    delete plain[key];
  }
  return plain;
};

const JOB_GRID_SORT_COLUMNS = {
  title: 'title',
  client: 'client',
  status: 'status',
  priority: 'priority',
  recruiter: 'recruiter',
  postingCode: 'postingCode',
  field: 'field',
  role: 'role',
  clientType: 'clientType',
  location: 'location',
  openDate: 'openDate',
  updatedAt: 'updatedAt',
  lastUpdated: 'updatedAt',
  salaryMin: 'salaryMin',
  salaryRange: 'salaryMin',
  ageMin: 'ageMin',
  ageRange: 'ageMin',
  openPositions: 'openPositions',
  associatedCandidates: 'associatedCandidates',
  waitingForScreening: 'waitingForScreening',
  activeProcess: 'activeProcess',
  rating: 'rating',
  recruitingCoordinator: 'recruitingCoordinator',
  accountManager: 'accountManager',
  validityDays: 'validityDays',
  gender: 'gender',
  licenseType: 'licenseType',
  id: 'id',
};

function queryListParam(value) {
  if (value == null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((part) => String(part || '').split(','))
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolFlag(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

async function buildTenantJobScopeWhere(clientId) {
  const effectiveClientId = clientId != null ? String(clientId).trim() : '';
  if (!effectiveClientId) return null;
  const tenantClient = await Client.findByPk(effectiveClientId, { attributes: ['id', 'domain'] });
  const domain = String(tenantClient?.domain || '').trim().toLowerCase();
  const scopeWhere = [{ clientId: effectiveClientId }];
  if (domain) {
    scopeWhere.push(
      { uniqueEmail: { [Op.iLike]: `${domain}+%@app.hiro.co.il` } },
      { uniqueEmail: { [Op.iLike]: `${domain}@app.hiro.co.il` } },
    );
  }
  return { [Op.or]: scopeWhere };
}

function buildJobGridFilterWhere(query = {}) {
  const and = [];
  const search = String(query.search || query.searchTerm || '').trim();
  if (search) {
    const like = { [Op.iLike]: `%${search}%` };
    const or = [
      { title: like },
      { publicJobTitle: like },
      { client: like },
      { location: like },
      { city: like },
      { region: like },
      { postingCode: like },
      { recruiter: like },
    ];
    const uuidish = /^[0-9a-f-]{8,}$/i.test(search);
    if (uuidish) or.push({ id: like });
    and.push({ [Op.or]: or });
  }

  const statuses = queryListParam(query.status || query.statuses);
  if (statuses.length) and.push({ status: { [Op.in]: statuses } });

  const client = String(query.client || '').trim();
  if (client) and.push({ client });

  const recruiter = String(query.recruiter || '').trim();
  if (recruiter) and.push({ recruiter });

  const field = String(query.field || '').trim();
  if (field) and.push({ field });

  const companyIndustry = String(query.companyIndustry || '').trim();
  if (companyIndustry) and.push({ field: companyIndustry });

  const role = String(query.role || '').trim();
  if (role) and.push({ role });

  const priority = String(query.priority || '').trim();
  if (priority) and.push({ priority });

  const clientType = String(query.clientType || '').trim();
  if (clientType) and.push({ clientType });

  const gender = String(query.gender || '').trim();
  if (gender) and.push({ gender });

  const licenseType = String(query.licenseType || '').trim();
  if (licenseType) and.push({ licenseType });

  const recruitingCoordinator = String(query.recruitingCoordinator || '').trim();
  if (recruitingCoordinator) and.push({ recruitingCoordinator });

  const accountManager = String(query.accountManager || '').trim();
  if (accountManager) and.push({ accountManager });

  const postingCode = String(query.postingCode || '').trim();
  if (postingCode) and.push({ postingCode: { [Op.iLike]: `%${postingCode}%` } });

  const jobId = String(query.jobId || '').trim();
  if (jobId) and.push({ id: jobId });

  const mobility = String(query.mobility || '').trim();
  if (mobility === 'כן') and.push({ mobility: true });
  else if (mobility === 'לא') and.push({ mobility: false });

  const cities = queryListParam(query.city || query.cities);
  const regions = queryListParam(query.region || query.regions);
  if (cities.length || regions.length) {
    const locOr = [];
    if (cities.length) {
      locOr.push({ city: { [Op.in]: cities } });
      for (const c of cities) locOr.push({ location: { [Op.iLike]: `%${c}%` } });
    }
    if (regions.length) {
      locOr.push({ region: { [Op.in]: regions } });
      for (const r of regions) locOr.push({ location: { [Op.iLike]: `%${r}%` } });
    }
    and.push({ [Op.or]: locOr });
  }

  const scopes = queryListParam(query.jobScopes || query.jobType);
  if (scopes.length) and.push({ jobType: { [Op.overlap]: scopes } });

  const dateKind = String(query.dateKind || query.dateFilterKind || 'open').trim() === 'updated'
    ? 'updatedAt'
    : 'openDate';
  const fromDate = String(query.fromDate || query.dateFrom || '').trim();
  const toDate = String(query.toDate || query.dateTo || '').trim();
  if (fromDate || toDate) {
    const range = {};
    if (fromDate) range[Op.gte] = new Date(`${fromDate}T00:00:00`);
    if (toDate) range[Op.lte] = new Date(`${toDate}T23:59:59.999`);
    and.push({ [dateKind]: range });
  }

  const addNumericOverlap = (minCol, maxCol, filterMinRaw, filterMaxRaw, activeFlag) => {
    if (!parseBoolFlag(activeFlag)) return;
    const filterMin = Number(filterMinRaw);
    const filterMax = Number(filterMaxRaw);
    if (!Number.isFinite(filterMin) || !Number.isFinite(filterMax)) return;
    and.push({
      [Op.and]: [
        { [Op.or]: [{ [maxCol]: null }, { [maxCol]: { [Op.gte]: filterMin } }] },
        { [Op.or]: [{ [minCol]: null }, { [minCol]: { [Op.lte]: filterMax } }] },
      ],
    });
  };
  addNumericOverlap('salaryMin', 'salaryMax', query.salaryMin, query.salaryMax, query.salaryRangeActive);
  addNumericOverlap('ageMin', 'ageMax', query.ageMin, query.ageMax, query.ageRangeActive);

  if (parseBoolFlag(query.positionsRangeActive)) {
    const pMin = Number(query.positionsMin);
    const pMax = Number(query.positionsMax);
    if (Number.isFinite(pMin) && Number.isFinite(pMax)) {
      and.push({
        [Op.or]: [
          { openPositions: null },
          { openPositions: { [Op.between]: [pMin, pMax] } },
        ],
      });
    }
  }

  const workingHours = String(query.workingHours || '').trim();
  if (workingHours && workingHours !== 'גמיש' && workingHours !== 'ללא אילוצי שעות') {
    const like = { [Op.iLike]: `%${workingHours}%` };
    and.push({
      [Op.or]: [{ description: like }, { internalNotes: like }, { publicJobTitle: like }],
    });
  }

  const validityDays = String(query.validityDays || '').trim();
  if (validityDays && Number.isFinite(Number(validityDays))) {
    and.push({ validityDays: Number(validityDays) });
  }

  return and.length ? { [Op.and]: and } : null;
}

async function listGridFacets(scopeWhere) {
  const where = scopeWhere || {};
  const distinct = async (field) => {
    const rows = await Job.findAll({
      where: {
        [Op.and]: [where, { [field]: { [Op.ne]: null } }, { [field]: { [Op.ne]: '' } }],
      },
      attributes: [field],
      group: [field],
      raw: true,
      order: [[field, 'ASC']],
    });
    return rows.map((r) => String(r[field] || '').trim()).filter(Boolean);
  };
  const [clients, recruiters, fields, roles, clientTypes, recruitingCoordinators, accountManagers] = await Promise.all([
    distinct('client'),
    distinct('recruiter'),
    distinct('field'),
    distinct('role'),
    distinct('clientType'),
    distinct('recruitingCoordinator'),
    distinct('accountManager'),
  ]);
  return { clients, recruiters, fields, roles, clientTypes, recruitingCoordinators, accountManagers };
}

async function listGridStats(scopeWhere) {
  const openWhere = { [Op.and]: [scopeWhere, { status: 'פתוחה' }].filter(Boolean) };
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const [agg, attentionNeeded] = await Promise.all([
    Job.findOne({
      where: openWhere,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'openCount'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('waitingForScreening')), 0), 'totalWaiting'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.literal('CASE WHEN "activeProcess" > 0 THEN 1 ELSE 0 END')), 0), 'momentumJobs'],
        [sequelize.fn('COALESCE', sequelize.fn('AVG', sequelize.literal('EXTRACT(EPOCH FROM (NOW() - "openDate")) / 86400.0')), 0), 'avgDays'],
      ],
      raw: true,
    }),
    Job.count({
      where: {
        [Op.and]: [
          openWhere,
          {
            [Op.or]: [
              { priority: 'קריטית' },
              {
                associatedCandidates: { [Op.or]: [0, null] },
                openDate: { [Op.lt]: fourteenDaysAgo },
              },
            ],
          },
        ],
      },
    }),
  ]);
  return {
    attentionNeeded: Number(attentionNeeded) || 0,
    totalWaiting: Number(agg?.totalWaiting) || 0,
    momentumJobs: Number(agg?.momentumJobs) || 0,
    avgDays: Math.round(Number(agg?.avgDays) || 0),
  };
}

/**
 * Paginated jobs grid (JobsView): tenant-scoped or platform-wide, with search/filters on the DB.
 */
const listGrid = async ({ clientId = null, query = {} } = {}) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(10, parseInt(query.limit, 10) || 50));
  const offset = (page - 1) * limit;
  const sortKey = JOB_GRID_SORT_COLUMNS[String(query.sort || 'openDate')] || 'openDate';
  const sortDir = String(query.dir || query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const scopeWhere = clientId ? await buildTenantJobScopeWhere(clientId) : null;
  const filterWhere = buildJobGridFilterWhere(query);
  const whereParts = [scopeWhere, filterWhere].filter(Boolean);
  const where = whereParts.length ? { [Op.and]: whereParts } : {};

  const emptyFacets = {
    clients: [],
    recruiters: [],
    fields: [],
    roles: [],
    clientTypes: [],
    recruitingCoordinators: [],
    accountManagers: [],
  };
  const emptyStats = { attentionNeeded: 0, totalWaiting: 0, momentumJobs: 0, avgDays: 0 };
  const [count, rows, facets, stats] = await Promise.all([
    Job.count({ where }),
    Job.findAll({
      where,
      attributes: JOB_LIST_FIND_ATTRIBUTES,
      order: [[sortKey, sortDir], ['id', 'DESC']],
      limit,
      offset,
    }),
    listGridFacets(scopeWhere || {}).catch(() => emptyFacets),
    listGridStats(scopeWhere || {}).catch(() => emptyStats),
  ]);

  await Promise.all([
    enrichJobsWithCandidateCounts(rows),
    enrichJobsWithOrganizationIds(rows),
  ]);

  return {
    jobs: rows.map(toApiJobListRow),
    total: count,
    page,
    limit,
    facets,
    stats,
  };
};

/**
 * Jobs for a tenant client: rows with matching clientId, plus jobs whose application inbox
 * uses the tenant domain prefix (e.g. humand+1000017@…) when clientId was never set on create.
 */
const findJobsScopedToClient = async (clientId, { attributes = JOB_LIST_FIND_ATTRIBUTES } = {}) => {
  const effectiveClientId = clientId != null ? String(clientId).trim() : '';
  if (!effectiveClientId) return [];

  let queryAttributes = attributes;
  if (Array.isArray(attributes) && !attributes.includes('organizationId')) {
    queryAttributes = [...attributes, 'organizationId'];
  }

  const scopeWhere = await buildTenantJobScopeWhere(effectiveClientId);
  if (!scopeWhere) return [];

  return Job.findAll({
    where: scopeWhere,
    attributes: queryAttributes,
    order: [['openDate', 'DESC']],
  });
};

const list = async ({ tagId = null } = {}) => {
  const tid = tagId != null && String(tagId).trim() !== '' ? String(tagId).trim() : '';
  if (tid) {
    const ids = await listJobIdsByTag(tid);
    if (!ids.length) return [];
    const rows = await Job.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: JOB_LIST_FIND_ATTRIBUTES,
    });
    await Promise.all([
      enrichJobsWithCandidateCounts(rows),
      enrichJobsWithOrganizationIds(rows),
    ]);
    return rows.map(toApiJobListRow);
  }
  const rows = await Job.findAll({
    attributes: JOB_LIST_FIND_ATTRIBUTES,
  });
  await Promise.all([
    enrichJobsWithCandidateCounts(rows),
    enrichJobsWithOrganizationIds(rows),
  ]);
  return rows.map(toApiJobListRow);
};

const listForTenantGrid = async (clientId) => {
  const rows = await findJobsScopedToClient(clientId, { attributes: JOB_LIST_FIND_ATTRIBUTES });
  await Promise.all([
    enrichJobsWithCandidateCounts(rows),
    enrichJobsWithOrganizationIds(rows),
  ]);
  return rows.map(toApiJobListRow);
};

const listForComposePicker = async ({ clientId, platformAdmin }) => {
  if (platformAdmin) {
    const rows = await Job.findAll({
      attributes: JOB_COMPOSE_FIND_ATTRIBUTES,
      order: [['openDate', 'DESC']],
    });
    return rows.map(toApiJobComposeRow);
  }
  if (!clientId) return [];
  const rows = await findJobsScopedToClient(clientId, { attributes: JOB_COMPOSE_FIND_ATTRIBUTES });
  return rows.map(toApiJobComposeRow);
};

/**
 * Live candidate funnel counts from job_candidates (not stale Job.* integer columns).
 * - associatedCandidates: all links
 * - waitingForScreening: status is "חדש" / empty (ממתינים לסינון)
 * - activeProcess: any other status (בתהליך)
 */
const enrichJobsWithCandidateCounts = async (jobs) => {
  if (!Array.isArray(jobs) || !jobs.length) return jobs || [];
  const ids = jobs
    .map((j) => (j?.id != null ? String(j.id) : null))
    .filter(Boolean);
  if (!ids.length) return jobs;

  let rows = [];
  try {
    rows = await sequelize.query(
      `
      SELECT
        "jobId"::text AS "jobId",
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(TRIM(status), ''), 'חדש') = 'חדש'
        )::int AS waiting,
        COUNT(*) FILTER (
          WHERE COALESCE(NULLIF(TRIM(status), ''), 'חדש') <> 'חדש'
        )::int AS active
      FROM job_candidates
      WHERE "jobId" IN (:ids)
      GROUP BY "jobId"
      `,
      { replacements: { ids }, type: QueryTypes.SELECT },
    );
  } catch (err) {
    console.warn('[jobService] enrichJobsWithCandidateCounts failed:', err.message || err);
    return jobs;
  }

  const byJob = new Map(
    (Array.isArray(rows) ? rows : []).map((r) => [
      String(r.jobId),
      {
        total: Number(r.total) || 0,
        waiting: Number(r.waiting) || 0,
        active: Number(r.active) || 0,
      },
    ]),
  );

  const referralsByJob = await loadJobReferralCounts(ids);

  for (const job of jobs) {
    const id = job?.id != null ? String(job.id) : '';
    const counts = byJob.get(id) || { total: 0, waiting: 0, active: 0 };
    const referrals = referralsByJob.get(id) || 0;
    if (typeof job.setDataValue === 'function') {
      job.setDataValue('associatedCandidates', counts.total);
      job.setDataValue('waitingForScreening', counts.waiting);
      job.setDataValue('activeProcess', counts.active);
      job.setDataValue('referralsCount', referrals);
    } else {
      job.associatedCandidates = counts.total;
      job.waitingForScreening = counts.waiting;
      job.activeProcess = counts.active;
      job.referralsCount = referrals;
    }
  }
  return jobs;
};

/** CV sends to client for a job (`notification_messages.category = screening_cv`). */
const loadJobReferralCounts = async (jobIds) => {
  const out = new Map();
  if (!Array.isArray(jobIds) || !jobIds.length) return out;
  try {
    const rows = await sequelize.query(
      `
      SELECT
        NULLIF(TRIM(metadata #>> '{taskPayload,jobId}'), '') AS "jobId",
        COUNT(*)::int AS n
      FROM notification_messages
      WHERE category = 'screening_cv'
        AND NULLIF(TRIM(metadata #>> '{taskPayload,jobId}'), '') IN (:ids)
      GROUP BY 1
      `,
      { replacements: { ids: jobIds }, type: QueryTypes.SELECT },
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      const id = r?.jobId != null ? String(r.jobId).trim() : '';
      if (id) out.set(id, Number(r.n) || 0);
    }
  } catch (err) {
    console.warn('[jobService] loadJobReferralCounts failed:', err.message || err);
  }
  return out;
};

const JOB_PICKER_ATTRIBUTES = [
  'id',
  'title',
  'client',
  'city',
  'status',
  'openDate',
  'healthProfile',
  'associatedCandidates',
  'waitingForScreening',
  'activeProcess',
  'postingCode',
  'recruiter',
  'recruitingCoordinator',
  'accountManager',
];

const mapJobPickerRows = async (rows) => {
  await enrichJobsWithCandidateCounts(rows);
  return rows.map((r) => {
    const plain = typeof r.get === 'function' ? r.get({ plain: true }) : { ...r };
    plain.associatedCandidates = Number(plain.associatedCandidates) || 0;
    plain.activeProcess = Number(plain.activeProcess) || 0;
    plain.waitingForScreening = Number(plain.waitingForScreening) || 0;
    plain.referralsCount = Number(plain.referralsCount) || 0;
    return plain;
  });
};

/** Staff job picker — tenant-scoped; platform admins see all jobs. */
const listForPicker = async ({ clientId, platformAdmin } = {}) => {
  let rows;
  if (platformAdmin) {
    rows = await Job.findAll({
      attributes: JOB_PICKER_ATTRIBUTES,
      order: [['title', 'ASC']],
    });
  } else if (clientId) {
    rows = await findJobsScopedToClient(clientId, { attributes: JOB_PICKER_ATTRIBUTES });
  } else {
    return [];
  }
  return mapJobPickerRows(rows);
};

const getById = async (id, { skipCache = false } = {}) => {
  if (!skipCache) {
    try {
      const cached = await redis.get(JOB_KEY(id));
      if (cached) {
        const [enriched] = await enrichJobsWithCandidateCounts([cached]);
        return enriched;
      }
    } catch (e) {
      console.warn('[jobService] redis get failed (non-fatal):', e.message);
    }
  }

  const job = await Job.findByPk(id, {
    attributes: { exclude: ['skills'] },
  });
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  await hydrateJobSkills(job);
  await enrichJobsWithCandidateCounts([job]);
  await jobCacheSet(job);
  return job;
};

/** Keep an explicitly chosen organization on the job and label the job with that company name. */
const bindExplicitJobOrganization = async (data, { requireClientLink = false } = {}) => {
  const orgId = data.organizationId ? String(data.organizationId).trim() : '';
  if (!orgId) return;
  const org = await Organization.findByPk(orgId, { attributes: ['id', 'name'] });
  if (!org) {
    const err = new Error('החברה שנבחרה לא נמצאה');
    err.status = 400;
    throw err;
  }
  data.organizationId = String(org.id);
  const orgName = String(org.name || '').trim();
  if (orgName) data.client = orgName;

  if (!requireClientLink) return;
  const clientId = data.clientId ? String(data.clientId).trim() : '';
  if (!clientId) return;
  const link = await ClientOrganizationLink.findOne({
    where: { clientId, organizationId: data.organizationId },
    attributes: ['id'],
  });
  if (!link) {
    const err = new Error('החברה שנבחרה אינה מקושרת לחשבון');
    err.status = 400;
    throw err;
  }
};

const create = async (payload) => {
  const { data, skills } = stripSkillsFromPayload(prepareCvForwardSettingsForSave(payload));
  await bindExplicitJobOrganization(data, { requireClientLink: true });
  if (!data.organizationId) {
    const resolved = await resolveOrganizationIdForJob({
      organizationId: data.organizationId,
      client: data.client,
      clientId: data.clientId,
    });
    if (resolved) data.organizationId = resolved;
  }
  const job = await Job.create(data);
  if (Array.isArray(skills)) {
    await syncTagsForJob(job.id, skills);
  }
  await hydrateJobSkills(job);
  await jobCacheSet(job);
  // Compute and persist embedding in the background (non-blocking)
  _computeAndSaveJobEmbedding(job).catch(() => {});
  return job;
};

const update = async (id, payload) => {
  const existing = await Job.findByPk(id, { attributes: { exclude: ['skills'] } });
  if (!existing) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  const { data, skills, hasSkills } = stripSkillsFromPayload(prepareCvForwardSettingsForSave(payload));
  for (const key of ['city', 'location', 'region']) {
    if (Object.prototype.hasOwnProperty.call(data, key) && !String(data[key] ?? '').trim()) {
      data[key] = null;
    }
  }
  if (data.organizationId) {
    await bindExplicitJobOrganization(data, { requireClientLink: false });
  }
  const nextClient = data.client !== undefined ? data.client : existing.client;
  const nextClientId = data.clientId !== undefined ? data.clientId : existing.clientId;
  if (data.organizationId === undefined || data.organizationId == null) {
    const resolved = await resolveOrganizationIdForJob({
      organizationId: data.organizationId || existing.organizationId,
      client: nextClient,
      clientId: nextClientId,
    });
    if (resolved) data.organizationId = resolved;
  }
  await existing.update(data);
  if (hasSkills) {
    await syncTagsForJob(existing.id, skills || []);
  }
  await hydrateJobSkills(existing);
  await jobCacheSet(existing);
  // Job changed → wipe its candidate matches + remove it from every candidate's opportunities
  invalidateJobMatches(id).catch(() => {});
  invalidateJobInAllCandidateOpportunities(id).catch(() => {});
  // Recompute embedding in the background whenever job content changes
  _computeAndSaveJobEmbedding(existing).catch(() => {});
  return existing;
};

const remove = async (id) => {
  const job = await getById(id, { skipCache: true });
  const instance = job?.destroy ? job : await Job.findByPk(id);
  if (instance?.destroy) await instance.destroy();
  await jobCacheDel(id);
};

const findByPostingCode = async (code) => {
  if (!code) return null;
  const job = await Job.findOne({
    where: { postingCode: code },
    attributes: { exclude: ['skills'] },
  });
  if (!job) return null;
  return hydrateJobSkills(job);
};

/** First posting code for newly created jobs (then +1 per job, no random). */
const POSTING_CODE_FIRST = 1_000_000;

/** Only codes in [POSTING_CODE_FIRST … POSTING_CODE_ALLOC_MAX] participate in auto-allocation (ignores legacy 6-digit and stray huge values). */
const POSTING_CODE_ALLOC_MAX = 9_999_999;

/** Minimum numeric posting code accepted when matching inbound email (+ or bare number in headers/subject). */
const POSTING_CODE_MATCH_MIN = 100_000;

function isPostingCodeValidForMatch(code) {
  const raw = String(code || '').trim();
  if (!raw) return false;
  if (!/^\d+$/.test(raw)) return true;
  const n = Number(raw);
  return Number.isFinite(n) && n >= POSTING_CODE_MATCH_MIN;
}

/** Postgres advisory lock key — serializes posting-code allocation across app instances. */
const POSTING_CODE_ALLOC_LOCK_KEY = 891_234;

/**
 * Next posting code in the official sequence (1_000_000, 1_000_001, …).
 * Syncs `job_posting_code_seq` to max allocated code in DB, then nextval (+1).
 * Legacy / stray codes outside the band do not affect the counter.
 */
const allocateNextPostingCode = async () => {
  return sequelize.transaction(async (transaction) => {
    await sequelize.query('SELECT pg_advisory_xact_lock(:lockKey)', {
      replacements: { lockKey: POSTING_CODE_ALLOC_LOCK_KEY },
      transaction,
    });
    const rows = await sequelize.query(
      `SELECT MAX(CAST("postingCode" AS BIGINT)) AS max
       FROM jobs
       WHERE "postingCode" ~ '^[0-9]+$'
         AND CAST("postingCode" AS BIGINT) >= :first
         AND CAST("postingCode" AS BIGINT) <= :allocMax`,
      {
        type: QueryTypes.SELECT,
        transaction,
        replacements: { first: POSTING_CODE_FIRST, allocMax: POSTING_CODE_ALLOC_MAX },
      },
    );
    const maxRaw = rows?.[0]?.max;
    const maxNum = maxRaw != null && maxRaw !== '' ? Number(maxRaw) : NaN;
    if (Number.isFinite(maxNum) && maxNum >= POSTING_CODE_FIRST) {
      await sequelize.query(
        `SELECT setval('job_posting_code_seq', :maxNum::bigint, true)`,
        { transaction, replacements: { maxNum } },
      );
    } else {
      // next nextval() → POSTING_CODE_FIRST (is_called = false)
      await sequelize.query(
        `SELECT setval('job_posting_code_seq', :first::bigint, false)`,
        { transaction, replacements: { first: POSTING_CODE_FIRST } },
      );
    }
    const [nextRow] = await sequelize.query(
      `SELECT nextval('job_posting_code_seq') AS next`,
      { type: QueryTypes.SELECT, transaction },
    );
    const next = nextRow?.next != null ? Number(nextRow.next) : POSTING_CODE_FIRST;
    if (!Number.isFinite(next) || next < POSTING_CODE_FIRST || next > POSTING_CODE_ALLOC_MAX) {
      const err = new Error('Posting code sequence exhausted or invalid');
      err.status = 500;
      throw err;
    }
    return String(next);
  });
};

const {
  classifyJobTaxonomyForAnalyze,
} = require('./jobTaxonomyClassificationService');

const pickHiringCompanyName = (parsed) => {
  if (!parsed || typeof parsed !== 'object') return '';
  const keys = [
    'client',
    'clientName',
    'company',
    'companyName',
    'employer',
    'employerName',
    'organization',
    'organizationName',
    'hiringCompany',
  ];
  for (const key of keys) {
    const value = parsed[key];
    if (value && typeof value === 'object') {
      const nested = value.name || value.label || value.companyName;
      if (nested != null && String(nested).trim()) return String(nested).trim();
      continue;
    }
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
};

const analyzeRawDescription = async (rawText, options = {}) => {
  if (!rawText || !String(rawText).trim()) {
    const err = new Error('Raw job description is required');
    err.status = 400;
    throw err;
  }

  // eslint-disable-next-line no-console
  console.log('[jobService.analyzeRawDescription] incoming text length', String(rawText).length);

  const apiKey =
    process.env.GIMINI_KEY ||
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY;

  const promptRow = await Prompt.findByPk('create_new_job');
  if (!promptRow || !promptRow.template) {
    const err = new Error('Prompt "create_new_job" not found or has no template');
    err.status = 500;
    throw err;
  }
  const systemPrompt = `${promptRow.template.trim()}\n${JOB_ANALYZE_FIELDS_APPENDIX}\n${JOB_ANALYZE_PREFERRED_HOURS_APPENDIX}\n${JOB_ANALYZE_SKILL_QUOTE_APPENDIX}`;

  // eslint-disable-next-line no-console
  console.log('[jobService.analyzeRawDescription] calling sendChat with prompt length', systemPrompt.length);

  const rawResponse = await sendChat({
    apiKey,
    systemPrompt,
    history: [],
    message: String(rawText),
    promptId: 'create_new_job',
    responseMimeType: 'application/json',
    llmInputJson: {
      rawDescriptionLength: String(rawText).length,
      rawDescriptionPreview: String(rawText).slice(0, 4000),
    },
  });

  // eslint-disable-next-line no-console
  console.log('[jobService.analyzeRawDescription] received raw AI response length', String(rawResponse || '').length);

  let parsed;
  try {
    parsed = parseLenientJsonObject(rawResponse);
    const pwhRaw = pickPreferredWorkingHoursRawFromParsed(parsed);
    const coerced = coercePreferredWorkingHoursFromJobAi(pwhRaw);
    parsed.preferredWorkingHours = coerced;
  } catch (e) {
    const cause = e?.cause || e;
    const positionMatch = String(cause?.message || '').match(/position\s+(\d+)/i);
    const pos = positionMatch ? Number(positionMatch[1]) : null;
    const raw = String(rawResponse || '');
    // eslint-disable-next-line no-console
    console.error('[jobService.analyzeRawDescription] Failed to parse AI JSON response', {
      message: cause?.message || e?.message,
      length: raw.length,
      around: pos == null ? raw.slice(0, 240) : raw.slice(Math.max(0, pos - 80), pos + 80),
    });
    if (!e.status) e.status = 500;
    throw e;
  }

  enrichJobAnalyzeResult(parsed);

  // Taxonomy: ignore free-form field/role from the parse prompt — classify via vector Top-K + closed-list LLM.
  const aiSuggestedField = parsed.field;
  const aiSuggestedRole = parsed.role;
  delete parsed.field;
  delete parsed.role;

  try {
    const taxonomy = await classifyJobTaxonomyForAnalyze(parsed, rawText);
    Object.assign(parsed, taxonomy);
    if (aiSuggestedField || aiSuggestedRole) {
      parsed.aiSuggestedField = aiSuggestedField ?? null;
      parsed.aiSuggestedRole = aiSuggestedRole ?? null;
    }
  } catch (taxonomyErr) {
    // eslint-disable-next-line no-console
    console.error('[jobService.analyzeRawDescription] taxonomy classification failed:', taxonomyErr);
    parsed.field = 'כללי';
    parsed.role = 'כללי';
    parsed.jobField = { category: 'כללי', fieldType: 'כללי', role: 'כללי' };
    parsed.requiresManualReview = true;
  }

  // Resolve location/city via City table: exact match first, then fuzzy. Only set when found.
  const rawLocation = parsed.city || parsed.location || '';
  if (rawLocation && String(rawLocation).trim()) {
    const resolved = await cityService.resolveCityForJob(String(rawLocation).trim());
    if (resolved) {
      parsed.city = resolved;
      parsed.location = resolved;
    } else {
      parsed.city = null;
      parsed.location = null;
    }
  }

  const hiringCompany = pickHiringCompanyName(parsed);
  if (hiringCompany) parsed.client = hiringCompany;

  if (parsed.client && String(parsed.client).trim()) {
    try {
      const Organization = require('../models/Organization');
      const scopeClientId = options.clientId ? String(options.clientId).trim() : '';
      const orgId = await resolveOrganizationIdForAnalyze({
        client: parsed.client,
        clientId: scopeClientId || null,
      });
      if (orgId) {
        parsed.suggestedOrganizationId = orgId;
        const org = await Organization.findByPk(orgId, { attributes: ['name'] });
        if (org?.name) parsed.clientResolvedName = String(org.name).trim();
      }
    } catch (orgErr) {
      console.warn('[jobService.analyzeRawDescription] org resolve failed:', orgErr?.message || orgErr);
    }
  }

  return parsed;
};

/**
 * Plain job object for matching — preserves hydrated skills when the DB query excluded the skills column.
 */
const toPlainJobForMatchScore = (job) => {
  if (!job) return null;
  if (typeof job.get === 'function') {
    const plain = job.get({ plain: true });
    const skills = job.get('skills');
    if (Array.isArray(skills)) plain.skills = skills;
    else if (!Array.isArray(plain.skills)) plain.skills = [];
    return plain;
  }
  const plain = { ...job };
  if (!Array.isArray(plain.skills)) plain.skills = [];
  return plain;
};

module.exports = {
  list,
  listGrid,
  listForTenantGrid,
  listForComposePicker,
  listForPicker,
  searchForPicker,
  getById,
  create,
  update,
  remove,
  findByPostingCode,
  allocateNextPostingCode,
  POSTING_CODE_FIRST,
  POSTING_CODE_ALLOC_MAX,
  POSTING_CODE_MATCH_MIN,
  isPostingCodeValidForMatch,
  analyzeRawDescription,
  hydrateJobSkills,
  hydrateJobsSkills,
  enrichJobsWithCandidateCounts,
  toApiJob,
  toApiJobComposeRow,
  toApiJobListRow,
  findJobsScopedToClient,
  toPlainJobForMatchScore,
  mapSystemTagsToJobSkills,
  listJobTags,
  resolveReferralContactsForJob,
  recordStaffJobView,
};
