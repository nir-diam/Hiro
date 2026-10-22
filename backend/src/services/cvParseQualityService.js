const candidateTagService = require('./candidateTagService');
const candidateService = require('./candidateService');
const appLogger = require('../utils/appLogger');
const { assessCvParseQuality, withCvReviewTags } = require('./cvParseQuality');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tag sync is the stage that fails in bursts (pool / rate limit) and leaves
 * a parsed candidate with experience and zero tags. Retry up to 3 times.
 */
async function syncTagsWithRetry(candidateId, entries, meta = {}) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!candidateId || !list.length) return [];
  const delays = [0, 1500, 4000];
  let lastError = null;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await sleep(delays[attempt]);
    try {
      const rows = await candidateTagService.syncTagsForCandidate(candidateId, list);
      const saved = Array.isArray(rows) ? rows.length : 0;
      if (saved > 0) {
        if (attempt > 0) {
          console.log('[cv-tags] sync recovered', { candidateId, attempt: attempt + 1, saved });
        }
        return rows;
      }
      lastError = new Error('tag sync saved 0 rows');
    } catch (err) {
      lastError = err;
    }
    console.warn('[cv-tags] sync attempt failed', {
      candidateId,
      attempt: attempt + 1,
      message: lastError?.message || lastError,
      source: meta.source || null,
    });
    appLogger.log({
      level: 'warn',
      source: 'cv_parse_quality',
      message: 'tag sync failed',
      context: {
        candidateId,
        attempt: attempt + 1,
        error: String(lastError?.message || lastError || ''),
        source: meta.source || null,
        tagCount: list.length,
      },
    });
  }
  appLogger.log({
    level: 'error',
    source: 'cv_parse_quality',
    message: 'tag sync exhausted retries',
    context: {
      candidateId,
      error: String(lastError?.message || lastError || ''),
      source: meta.source || null,
      tagCount: list.length,
    },
  });
  return [];
}

async function stampCvParseQuality(candidateId, assessment, meta = {}) {
  if (!candidateId || !assessment) return null;
  let existingTags = [];
  try {
    const row = await candidateService.getById(candidateId);
    existingTags = Array.isArray(row?.internalTags) ? row.internalTags : [];
  } catch (err) {
    console.warn('[cv-parse] quality stamp read failed', candidateId, err?.message || err);
  }
  const internalTags = withCvReviewTags(existingTags, assessment);
  try {
    await candidateService.update(candidateId, { internalTags });
  } catch (err) {
    console.warn('[cv-parse] quality stamp write failed', candidateId, err?.message || err);
  }
  const payload = {
    level: assessment.partial ? 'warn' : 'info',
    source: 'cv_parse_quality',
    message: assessment.partial ? 'partial cv parse' : 'cv parse ok',
    context: {
      candidateId,
      partial: Boolean(assessment.partial),
      reasons: assessment.reasons || [],
      stage: assessment.stage || null,
      sourceName: meta.source || null,
      model: meta.model || null,
      textLength: meta.textLength ?? null,
      retriedWithPro: Boolean(meta.retriedWithPro),
    },
  };
  if (assessment.partial) {
    console.warn('[cv-parse] partial', payload.context);
  } else {
    console.log('[cv-parse] ok', {
      candidateId,
      model: meta.model || null,
      source: meta.source || null,
    });
  }
  appLogger.log(payload);
  return internalTags;
}

/** Stamp from the saved profile. `tags` on the mapped row are the active tags the list shows. */
async function stampSavedCandidateQuality(candidateId, meta = {}) {
  if (!candidateId) return null;
  let row = null;
  try {
    row = await candidateService.getById(candidateId);
  } catch (err) {
    console.warn('[cv-parse] saved quality read failed', candidateId, err?.message || err);
    return null;
  }
  if (!row) return null;
  const textLength = meta.textLength != null
    ? meta.textLength
    : String(row.searchText || '').trim().length;
  const assessment = assessCvParseQuality({
    fullName: row.fullName,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    workExperience: row.workExperience,
    tagCount: Array.isArray(row.tags) ? row.tags.length : 0,
    extractedTextLength: textLength,
    hasResumeFile: meta.hasResumeFile != null ? Boolean(meta.hasResumeFile) : Boolean(row.resumeUrl),
  });
  return stampCvParseQuality(candidateId, assessment, {
    ...meta,
    textLength,
  });
}

module.exports = {
  syncTagsWithRetry,
  stampCvParseQuality,
  stampSavedCandidateQuality,
};
