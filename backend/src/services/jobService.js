const { Op, literal } = require('sequelize');
const redis = require('./redisService');
const { invalidateJobMatches, invalidateJobInAllCandidateOpportunities } = require('./matchingCacheService');
const Job = require('../models/Job');
const Prompt = require('../models/Prompt');

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

const list = async ({ tagId = null } = {}) => {
  const tid = tagId != null && String(tagId).trim() !== '' ? String(tagId).trim() : '';
  if (tid) {
    const ids = await listJobIdsByTag(tid);
    if (!ids.length) return [];
    const rows = await Job.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: { exclude: ['events', 'skills'] },
    });
    await hydrateJobsSkills(rows);
    return rows;
  }
  const rows = await Job.findAll({
    attributes: { exclude: ['events', 'skills'] },
  });
  await hydrateJobsSkills(rows);
  return rows;
};

const listForPicker = async () => {
  const rows = await Job.findAll({
    attributes: [
      'id', 'title', 'client', 'city', 'status', 'openDate', 'healthProfile',
      // Live counts from job_candidates — not relying on stale cached columns
      [
        literal(`(SELECT COUNT(*) FROM job_candidates WHERE "jobId" = "Job"."id")`),
        'associatedCandidates',
      ],
      [
        literal(`(SELECT COUNT(*) FROM job_candidates WHERE "jobId" = "Job"."id" AND status != 'חדש')`),
        'activeProcess',
      ],
    ],
    order: [['title', 'ASC']],
  });
  return rows.map((r) => {
    const plain = r.get({ plain: true });
    plain.associatedCandidates = Number(plain.associatedCandidates) || 0;
    plain.activeProcess = Number(plain.activeProcess) || 0;
    plain.waitingForScreening = 0; // not computed here; health fallback handles it
    return plain;
  });
};

const getById = async (id, { skipCache = false } = {}) => {
  if (!skipCache) {
    try {
      const cached = await redis.get(JOB_KEY(id));
      if (cached) return cached;
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
  await jobCacheSet(job);
  return job;
};

const create = async (payload) => {
  const { data, skills } = stripSkillsFromPayload(payload);
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
  const { data, skills, hasSkills } = stripSkillsFromPayload(payload);
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

const {
  classifyJobTaxonomyForAnalyze,
} = require('./jobTaxonomyClassificationService');

const analyzeRawDescription = async (rawText) => {
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
    llmInputJson: {
      rawDescriptionLength: String(rawText).length,
      rawDescriptionPreview: String(rawText).slice(0, 4000),
    },
  });

  // eslint-disable-next-line no-console
  console.log('[jobService.analyzeRawDescription] received raw AI response length', String(rawResponse || '').length);

  let parsed;
  try {
    const text = String(rawResponse || '').trim();

    // Strip markdown code fences if present
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, ''); // remove ``` or ```json
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();
    }

    // Try to extract JSON object substring if extra text exists
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const candidate =
      firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
        ? cleaned.slice(firstBrace, lastBrace + 1)
        : cleaned;

    parsed = JSON.parse(candidate);
    const pwhRaw = pickPreferredWorkingHoursRawFromParsed(parsed);
    const coerced = coercePreferredWorkingHoursFromJobAi(pwhRaw);
    parsed.preferredWorkingHours = coerced;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[jobService.analyzeRawDescription] Failed to parse AI JSON response:', rawResponse);
    const err = new Error('Failed to parse AI response as JSON');
    err.status = 500;
    throw err;
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
  listForPicker,
  searchForPicker,
  getById,
  create,
  update,
  remove,
  findByPostingCode,
  analyzeRawDescription,
  hydrateJobSkills,
  hydrateJobsSkills,
  toPlainJobForMatchScore,
  mapSystemTagsToJobSkills,
  listJobTags,
};
