const promptService = require('./promptService');
const picklistService = require('./picklistService');

/** Canonical id for logging; DB row may be stored under an alias (e.g. cv_parsing_v2). */
const CV_PARSING_PROMPT_ID = 'cv_parsing2';

const CV_PARSING_PROMPT_DB_IDS = ['cv_parsing2', 'cv_parsing2'];

const loadCvParsingPromptRecord = async () => {
  for (const id of CV_PARSING_PROMPT_DB_IDS) {
    const row = await promptService.ensureById(id);
    if (row) {
      if (id !== CV_PARSING_PROMPT_ID) {
        console.log(`[cvParsingPrompt] loaded DB prompt "${id}" (canonical ${CV_PARSING_PROMPT_ID})`);
      }
      return row;
    }
  }
  const err = new Error('Prompt not found');
  err.status = 404;
  throw err;
};

const CV_PARSING_SCHEDULE_AND_AVAILABILITY_APPENDIX = `
--- Backend-required JSON keys (add to the SAME single JSON object; use null when not stated in the CV) ---
- "availability": string|null — Notice period, start date, or employment readiness ONLY if explicitly written (e.g. מיידי, חודש התראה, זמין מ-…).
- "preferredWorkingHours": string|null — Preferred daily work schedule ONLY if explicit. If absent in the CV, use null (do not guess).
  When present, use ONE of: "גמיש", "ללא אילוצי שעות", or a single 24h range "HH:mm-HH:mm" with zero-padded hours (e.g. "09:00-18:00").
  Map phrases like "שעות גמישות", "משמרות גמישות", "flexible hours" to "גמיש".
`;

const CV_PARSING_TAG_QUOTE_APPENDIX = `
--- Required additional field on EVERY object inside the "tags" array ---
- "quote": string|null — The EXACT, verbatim substring copied character-by-character from the
  input CV text that caused this tag to be created.
  STRICT RULES:
  * MUST be a literal substring of the input CV — no paraphrase, no synonyms, no translation,
    no punctuation/whitespace edits beyond trimming leading/trailing spaces.
  * Pick the SHORTEST span that proves the tag (usually a phrase or short sentence). Hard cap ~240 characters.
  * If the same evidence supports multiple tags, repeat the quote per tag — do NOT deduplicate.
  * If the CV does not contain a verbatim phrase that justifies the tag, set "quote" to null (very rare).
  * "quote" is REQUIRED on every tag object and is IN ADDITION to "tag_reason" and the legacy "evidence" field.
  * If you also emit the legacy "evidence" field, it MUST equal "quote" (same verbatim substring).
`;

const CV_PARSING_TAG_COUNT_APPENDIX = `
--- Tag count (OVERRIDES any earlier cap in this prompt) ---
- There is NO maximum tag count. Extract every relevant professional tag supported by evidence in the CV.
- Include roles, skills, tools, seniority, industry, methodologies, degrees, and soft skills whenever they appear.
- Still aim for at least 1-2 Role tags, one Seniority tag, and one Industry tag when the CV supports them.
`;

const CV_PARSING_MILITARY_APPENDIX = `
--- Military service (שירות צבאי) ---
- If the CV mentions IDF / צה"ל / שירות צבאי / army service, add one or more entries to workExperience.
- Use company "צה"ל" (or the specific unit/branch name when stated) and title = role/rank/position when stated.
- Include startDate/endDate when the CV states service years or dates.
- Do NOT omit military service — it belongs in workExperience like civilian jobs (the UI splits it automatically).
`;

const CV_PARSING_ROLE_TAG_APPENDIX = `
--- workExperience[].roleTag (required when a matching role tag exists) ---
- Each workExperience row MUST include "roleTag": the exact "name" of one tag in "tags" where raw_type is "role".
- Multiple jobs may share the same roleTag. One job → one roleTag.
- roleTag uses normalized "/ת" tag wording; workExperience[].title keeps the candidate's gendered wording.
`;

/** Gemini structured-output schema for CV parse JSON (see candidateController history). */
const buildResumeResponseSchema = () => ({
  type: 'object',
  description: 'Parsed CV data. Every key MUST be present even if its value is null/empty.',
  propertyOrdering: [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'address',
    'birthYear', 'birthMonth', 'birthDay', 'age',
    'maritalStatus', 'gender',
    'mobility', 'drivingLicenses',
    'availability', 'preferredWorkingHours',
    'title', 'professionalSummary', 'keyFacts',
    'skills', 'tags', 'languages', 'workExperience', 'education',
    'industryAnalysis',
  ],
  required: [
    'firstName', 'lastName', 'fullName', 'email', 'phone', 'address',
    'birthYear', 'birthMonth', 'birthDay', 'age',
    'maritalStatus', 'gender',
    'mobility', 'drivingLicenses',
    'availability', 'preferredWorkingHours',
    'title', 'professionalSummary',
    'skills', 'tags', 'languages', 'workExperience', 'education',
  ],
  properties: {
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    fullName: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    birthYear: { type: 'integer', nullable: true },
    birthMonth: { type: 'integer', nullable: true },
    birthDay: { type: 'integer', nullable: true },
    age: { type: 'integer', nullable: true },
    maritalStatus: { type: 'string', nullable: true },
    gender: { type: 'string', nullable: true },
    mobility: { type: 'string', nullable: true },
    drivingLicenses: { type: 'array', items: { type: 'string' } },
    availability: { type: 'string', nullable: true },
    preferredWorkingHours: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    professionalSummary: { type: 'string', nullable: true },
    keyFacts: { type: 'array', items: { type: 'string' }, nullable: true },
    skills: {
      type: 'object',
      required: ['soft', 'technical'],
      properties: {
        soft: { type: 'array', items: { type: 'string' } },
        technical: { type: 'array', items: { type: 'string' } },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'evidence', 'quote', 'raw_type', 'context'],
        properties: {
          name: { type: 'string' },
          evidence: { type: 'string', nullable: true },
          quote: { type: 'string', nullable: true },
          raw_type: {
            type: 'string',
            enum: ['role', 'skill', 'tool', 'degree', 'certification', 'language', 'methodology', 'seniority', 'industry', 'soft_skill'],
          },
          context: { type: 'string', enum: ['Core', 'Tool', 'Degree', 'Profile'] },
          raw_type_reason: { type: 'string', nullable: true },
          tag_reason: { type: 'string', nullable: true },
          is_current: { type: 'boolean', nullable: true },
          confidence_score: { type: 'number', nullable: true },
        },
      },
    },
    languages: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          level: { type: 'integer', nullable: true },
          levelText: { type: 'string', nullable: true },
        },
      },
    },
    workExperience: {
      type: 'array',
      items: {
        type: 'object',
        required: ['title', 'company'],
        properties: {
          title: { type: 'string', nullable: true },
          company: { type: 'string', nullable: true },
          companyField: { type: 'string', nullable: true },
          startDate: { type: 'string', nullable: true },
          endDate: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
          roleTag: {
            type: 'string',
            nullable: true,
            description: 'Exact tags[].name for a role tag linked to this job',
          },
          isMilitaryService: { type: 'boolean', nullable: true },
          datesSuspicious: { type: 'boolean', nullable: true },
        },
      },
    },
    education: {
      type: 'array',
      items: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'string' } },
      },
    },
    industryAnalysis: {
      type: 'object',
      properties: {
        primaryIndustry: { type: 'string', nullable: true },
        years: { type: 'number', nullable: true },
      },
    },
  },
});

const buildResumeSchemaJsonForPrompt = () => JSON.stringify(buildResumeResponseSchema(), null, 2);

const injectCvParsingSchemaIntoTemplate = (template, schemaJson) => {
  let out = String(template || '');
  const replacements = [
    [/\{\{Json\}\}/gi, schemaJson],
    [/\$\{JSON\}/g, schemaJson],
    [/\$JSON\b/g, schemaJson],
  ];
  for (const [re, value] of replacements) {
    out = out.replace(re, value);
  }
  return out;
};

/**
 * Load cv_parsing2 from DB and inject dynamic JSON schema + picklists.
 * @param {{ appendices?: 'full' | 'email' | 'none' }} opts
 */
const CODE_FALLBACK_CV_TEMPLATE = `
You are an expert CV parser (Hebrew/English). Return ONLY valid JSON matching this schema (no markdown):
{{Json}}

Rules:
- Do NOT invent facts. Use null/empty when unknown.
- Every workExperience row MUST include "roleTag": exact tags[].name for one tag with raw_type "role".
- One job → one roleTag; different jobs may use different role tags.
- Include keyFacts (0–3 strings), datesSuspicious, isMilitaryService on work rows when applicable.
`.trim();

const appendPromptParts = (baseTemplate, recordTemplate, appendices) => {
  const parts = [String(baseTemplate).trimEnd()];
  if (appendices === 'none') return parts.join('\n');
  parts.push(CV_PARSING_SCHEDULE_AND_AVAILABILITY_APPENDIX);
  parts.push(CV_PARSING_TAG_QUOTE_APPENDIX);
  parts.push(CV_PARSING_ROLE_TAG_APPENDIX);
  const v7DynamicQuota = /12[\u2013-]20\s*tags/i.test(String(recordTemplate || ''));
  if (appendices === 'full' && !v7DynamicQuota) {
    parts.push(CV_PARSING_TAG_COUNT_APPENDIX);
  }
  if (appendices === 'full') {
    parts.push(CV_PARSING_MILITARY_APPENDIX);
  }
  return parts.join('\n');
};

const getResumePromptTemplate = async (opts = {}) => {
  const appendices = opts.appendices || 'full';
  const schemaJson = buildResumeSchemaJsonForPrompt();
  let mobilityPicklist = '';
  let drivingPicklist = '';
  try {
    mobilityPicklist = await picklistService.formatCategoryValuesForLlmPrompt('mobility');
    drivingPicklist = await picklistService.formatCategoryValuesForLlmPrompt('driving_license');
  } catch (pickErr) {
    console.warn('[cvParsingPrompt] picklists unavailable', pickErr?.message || pickErr);
  }

  try {
    const record = await loadCvParsingPromptRecord();
    let template = injectCvParsingSchemaIntoTemplate(record.template, schemaJson);
    template = template.replace(/\$\{Mobility\}/g, mobilityPicklist);
    template = template.replace(/\$\{DrivingLicenses\}/g, drivingPicklist);
    return {
      ...record,
      template: appendPromptParts(template, record.template, appendices),
    };
  } catch (err) {
    console.warn(
      `[cvParsingPrompt] none of [${CV_PARSING_PROMPT_DB_IDS.join(', ')}] in DB — code fallback with roleTag rules`,
      err.message || err,
    );
    let template = injectCvParsingSchemaIntoTemplate(CODE_FALLBACK_CV_TEMPLATE, schemaJson);
    template = template.replace(/\$\{Mobility\}/g, mobilityPicklist);
    template = template.replace(/\$\{DrivingLicenses\}/g, drivingPicklist);
    return {
      id: CV_PARSING_PROMPT_ID,
      model: 'gemini-3-flash-preview',
      template: appendPromptParts(template, '', appendices),
    };
  }
};

module.exports = {
  CV_PARSING_PROMPT_ID,
  CV_PARSING_PROMPT_DB_IDS,
  buildResumeResponseSchema,
  buildResumeSchemaJsonForPrompt,
  injectCvParsingSchemaIntoTemplate,
  getResumePromptTemplate,
};
