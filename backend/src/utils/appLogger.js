const appLogService = require('../services/appLogService');

const TRACKED_PROMPT_IDS = new Set([
  'tag_correction_agent',
  'tag_ai_enriched',
  'job_categories_synonyms_ai_completed',
  'company_enrichment',
  'internal_opinion',
  'create_new_job',
  'candidate_job_description_written_by_ai',
  'candidate_Profile Summary AI-Enhanced',
  'cv_parsing',
  'Admin_Job_Categories_Smart_Agent',
  'job_taxonomy_mapping',
  'organization_ai_enriched',
  'experience_ai',
  'candidate_ai_agent',
]);

const truncate = (value, max = 12000) => {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (!s || s.length <= max) return s;
  return `${s.slice(0, max)}…[truncated ${s.length - max} chars]`;
};

const tryParseJson = (text) => {
  try {
    let cleaned = String(text || '').trim();
    if (!cleaned) return null;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();
    }
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    const candidate = jsonMatch ? jsonMatch[1] : cleaned;
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

/**
 * Full LLM request payload for logging — includes resolved system prompt from DB, not just user variables.
 */
const buildLlmInputForLog = ({
  systemPrompt = '',
  message = '',
  history = [],
  generationConfig = null,
  variables = null,
  model = null,
} = {}) => {
  const out = {};
  if (model) out.model = model;

  const sp = String(systemPrompt || '').trim();
  if (sp) out.systemPrompt = truncate(sp, 80000);

  const parsedMsg = tryParseJson(message);
  if (parsedMsg != null) {
    out.userMessage = parsedMsg;
  } else if (message) {
    const m = String(message);
    out.userMessage = m.length > 20000
      ? { textLength: m.length, textPreview: truncate(m, 4000) }
      : m;
  }

  if (Array.isArray(history) && history.length) {
    out.history = history.slice(-5).map((t) => ({
      role: t.role,
      text: truncate(t.text, 4000),
    }));
  }

  if (generationConfig && typeof generationConfig === 'object' && Object.keys(generationConfig).length) {
    out.generationConfig = generationConfig;
  }

  if (variables != null) out.variables = variables;

  return out;
};

/**
 * Log input/output JSON for tracked LLM prompts (shown in /admin/logs).
 */
const logPromptExchange = ({
  promptId,
  inputJson,
  outputText,
  level = 'info',
  error = null,
} = {}) => {
  if (!promptId || !TRACKED_PROMPT_IDS.has(promptId)) return null;

  const outputJson = outputText != null ? tryParseJson(outputText) : null;
  const hasOutput = outputText != null && String(outputText).trim().length > 0;
  const context = {
    promptId,
    inputJson: inputJson ?? null,
    outputJson: outputJson ?? (hasOutput ? truncate(outputText) : null),
    outputRaw: hasOutput ? truncate(outputText) : null,
  };
  if (error) {
    context.error = String(error?.message || error);
  }

  return log({
    level: error ? 'error' : level,
    source: `prompt:${promptId}`,
    message: error
      ? `LLM failed (${promptId})`
      : `LLM exchange (${promptId})${hasOutput ? ' — input + output' : ' — input only'}`,
    context,
    stackTrace: error?.stack ? truncate(error.stack, 4000) : null,
  });
};

/**
 * Write an application log row (fire-and-forget).
 * @example appLogger.log({ level: 'error', source: 'emailController', message: 'SMTP timeout', context: { jobId } });
 */
const log = (payload = {}) => {
  return appLogService.create(payload).catch((err) => {
    console.error('[appLogger] failed to write app log', err?.message || err);
    return null;
  });
};

const logAwait = async (payload = {}) => {
  try {
    return await appLogService.create(payload);
  } catch (err) {
    console.error('[appLogger] failed to write app log', err?.message || err);
    return null;
  }
};

const fromRequest = (req, overrides = {}) => {
  const dbUser = req?.dbUser;
  return {
    userId: dbUser?.id || req?.user?.sub || null,
    userEmail: dbUser?.email || null,
    requestId: req?.headers?.['x-request-id'] || null,
    ...overrides,
  };
};

module.exports = {
  TRACKED_PROMPT_IDS,
  logPromptExchange,
  buildLlmInputForLog,
  log,
  logAwait,
  fromRequest,
  truncate,
  tryParseJson,
};
