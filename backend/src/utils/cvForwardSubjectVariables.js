const PLACEHOLDER_PATTERN = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * @typedef {{
 *   job?: {
 *     title?: string | null,
 *     publicJobTitle?: string | null,
 *     postingCode?: string | null,
 *     client?: string | null,
 *   } | null,
 *   candidate?: {
 *     source?: string | null,
 *     fullName?: string | null,
 *     name?: string | null,
 *   } | null,
 *   jobCandidate?: { source?: string | null, workflowMeta?: Record<string, unknown> | null } | null,
 *   recruitmentSourceName?: string | null,
 *   intakeChannel?: string | null,
 * }} CvForwardSubjectContext
 */

function pickString(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
}

function resolveRecruitmentSourceLabel(ctx = {}) {
  const explicit = pickString(ctx.recruitmentSourceName);
  if (explicit) return explicit;

  const candidateSource = pickString(ctx.candidate?.source);
  if (candidateSource) return candidateSource;

  const jcSource = pickString(ctx.jobCandidate?.source);
  if (jcSource && !jcSource.startsWith('public_apply:')) {
    return jcSource;
  }

  const workflowMeta = ctx.jobCandidate?.workflowMeta;
  if (workflowMeta && typeof workflowMeta === 'object') {
    const fromMeta = pickString(workflowMeta.recruitmentSource, workflowMeta.source);
    if (fromMeta) return fromMeta;
  }

  if (jcSource.startsWith('public_apply:')) {
    const srcKey = jcSource.slice('public_apply:'.length).trim();
    if (srcKey) return srcKey;
  }

  return '';
}

function resolveJobTitle(ctx = {}) {
  return pickString(ctx.job?.title, ctx.job?.publicJobTitle);
}

function resolveJobPostingCode(ctx = {}) {
  return pickString(ctx.job?.postingCode);
}

function resolveClientName(ctx = {}) {
  return pickString(ctx.job?.client);
}

function resolveCandidateName(ctx = {}) {
  return pickString(ctx.candidate?.fullName, ctx.candidate?.name);
}

/** @type {Array<{ key: string, labelHe: string, labelEn: string, resolve: (ctx: CvForwardSubjectContext) => string }>} */
const CV_FORWARD_SUBJECT_VARIABLES = [
  {
    key: 'מקור_גיוס',
    labelHe: 'מקור גיוס',
    labelEn: 'Recruitment source',
    resolve: resolveRecruitmentSourceLabel,
  },
  {
    key: 'שם_משרה',
    labelHe: 'שם משרה',
    labelEn: 'Job title',
    resolve: resolveJobTitle,
  },
  {
    key: 'קוד_משרה',
    labelHe: 'קוד משרה',
    labelEn: 'Job posting code',
    resolve: resolveJobPostingCode,
  },
  {
    key: 'שם_לקוח',
    labelHe: 'שם לקוח',
    labelEn: 'Client name',
    resolve: resolveClientName,
  },
  {
    key: 'שם_מועמד',
    labelHe: 'שם מועמד',
    labelEn: 'Candidate name',
    resolve: resolveCandidateName,
  },
];

/**
 * Metadata for UI / API — no resolver functions exposed.
 * @returns {Array<{ key: string, labelHe: string, labelEn: string, token: string }>}
 */
function listCvForwardSubjectVariablesForApi() {
  return CV_FORWARD_SUBJECT_VARIABLES.map(({ key, labelHe, labelEn }) => ({
    key,
    labelHe,
    labelEn,
    token: `{{${key}}}`,
  }));
}

/**
 * Replace {{variable}} placeholders in a subject-prefix template.
 * Unknown placeholders are left unchanged for forward compatibility.
 * @param {string} template
 * @param {CvForwardSubjectContext} context
 * @returns {string}
 */
function resolveSubjectPrefixTemplate(template, context = {}) {
  const raw = template == null ? '' : String(template);
  if (!raw.trim()) return '';

  const resolverByKey = new Map(
    CV_FORWARD_SUBJECT_VARIABLES.map((variable) => [variable.key, variable.resolve]),
  );

  return raw.replace(PLACEHOLDER_PATTERN, (match, keyRaw) => {
    const key = String(keyRaw || '').trim();
    const resolve = resolverByKey.get(key);
    if (!resolve) return match;
    return resolve(context);
  }).trim();
}

/**
 * Build final forwarded email subject: `{resolved prefix} {original subject}`.
 * @param {string} subjectPrefixTemplate
 * @param {string} originalSubject
 * @param {CvForwardSubjectContext} context
 * @returns {string}
 */
function buildCvForwardEmailSubject(subjectPrefixTemplate, originalSubject, context = {}) {
  const prefix = resolveSubjectPrefixTemplate(subjectPrefixTemplate, context);
  const subject = String(originalSubject || '').trim();
  if (!prefix) return subject;
  if (!subject) return prefix;
  return `${prefix} ${subject}`;
}

/**
 * @param {Record<string, unknown>} input
 * @returns {CvForwardSubjectContext}
 */
function buildCvForwardSubjectContext(input = {}) {
  const job = input.job && typeof input.job === 'object' ? input.job : null;
  const candidate = input.candidate && typeof input.candidate === 'object' ? input.candidate : null;
  const jobCandidate =
    input.jobCandidate && typeof input.jobCandidate === 'object' ? input.jobCandidate : null;

  return {
    job,
    candidate,
    jobCandidate,
    recruitmentSourceName:
      input.recruitmentSourceName != null ? String(input.recruitmentSourceName) : null,
    intakeChannel: input.intakeChannel != null ? String(input.intakeChannel) : null,
  };
}

module.exports = {
  CV_FORWARD_SUBJECT_VARIABLES,
  listCvForwardSubjectVariablesForApi,
  resolveSubjectPrefixTemplate,
  buildCvForwardEmailSubject,
  buildCvForwardSubjectContext,
  resolveRecruitmentSourceLabel,
  resolveJobTitle,
  resolveJobPostingCode,
  resolveClientName,
  resolveCandidateName,
};
