const Job = require('../models/Job');
const Prompt = require('../models/Prompt');
const { sendChat } = require('./geminiService');
const cityService = require('./cityService');

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

/**
 * List jobs for table/UI — omits `events` (unbounded JSONB) so the query stays fast;
 * use getById or job events API for a single job’s journal.
 */
const list = async () =>
  Job.findAll({
    attributes: { exclude: ['events'] },
  });

const getById = async (id) => {
  const job = await Job.findByPk(id);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return job;
};

const create = async (payload) => Job.create(payload);

const update = async (id, payload) => {
const job = await getById(id);
  await job.update(payload);
  return job;
};

const remove = async (id) => {
  const job = await getById(id);
  await job.destroy();
};

const findByPostingCode = async (code) => {
  if (!code) return null;
  return Job.findOne({ where: { postingCode: code } });
};

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
  const systemPrompt = `${promptRow.template.trim()}\n${JOB_ANALYZE_PREFERRED_HOURS_APPENDIX}\n${JOB_ANALYZE_SKILL_QUOTE_APPENDIX}`;

  // eslint-disable-next-line no-console
  console.log('[jobService.analyzeRawDescription] calling sendChat with prompt length', systemPrompt.length);

  const rawResponse = await sendChat({
    apiKey,
    systemPrompt,
    history: [],
    message: String(rawText),
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

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  findByPostingCode,
  analyzeRawDescription,
};

