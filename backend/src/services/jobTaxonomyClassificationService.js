const JobCategory = require('../models/JobCategory');
const { embedTextCached } = require('./embeddingService');
const { cosineSimilarity, normalizeEmbedding } = require('./vectorSearchService');
const { sendChat } = require('./geminiService');
const promptService = require('./promptService');
const { loadTaxonomyIndex } = require('./jobTaxonomyResolver');

const PROMPT_ID = 'job_taxonomy_mapping';
const TOP_K_CATEGORIES = 5;
const GENERAL_LABEL = 'כללי';
const CONFIDENCE_THRESHOLD = 0.5;

const resolveGeminiApiKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GEMINI_KEY ||
  process.env.GIMINI_KEY ||
  process.env.API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseJsonFromLlm(raw) {
  const text = String(raw || '').trim();
  let cleaned = text;
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();
  }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const candidate =
    firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned;
  return JSON.parse(candidate);
}

/**
 * Build query text for vector pre-filter: title + top tags + short JD snippet.
 * @param {Record<string, unknown>} parsed
 * @param {string} [rawText]
 */
function buildClassificationQuery(parsed, rawText = '') {
  const title = String(parsed.jobTitle || parsed.title || '').trim();
  const skillSource = Array.isArray(parsed.skills)
    ? parsed.skills
    : Array.isArray(parsed.tags)
      ? parsed.tags
      : [];
  const tags = skillSource
    .slice(0, 5)
    .map((s) => String(s?.name || s?.raw_value || s?.rawValue || '').trim())
    .filter(Boolean);
  const desc = String(parsed.description || parsed.jobDescription || rawText || '')
    .trim()
    .slice(0, 500);
  return [title, ...tags, desc].filter(Boolean).join('\n');
}

/**
 * @param {string} queryText
 * @param {number} [k]
 * @returns {Promise<Array<{ categoryId: string, categoryName: string, similarity: number }>>}
 */
async function getTopKCategories(queryText, k = TOP_K_CATEGORIES) {
  const trimmed = String(queryText || '').trim();
  if (!trimmed) return [];

  let queryEmb;
  try {
    queryEmb = normalizeEmbedding(await embedTextCached(trimmed));
  } catch (e) {
    console.warn('[jobTaxonomyClassification] embed query failed:', e.message);
    return [];
  }
  if (!queryEmb?.length) return [];

  const categories = await JobCategory.findAll({
    attributes: ['id', 'name', 'embedding'],
  });

  const scored = [];
  for (const cat of categories) {
    const plain = cat.get ? cat.get({ plain: true }) : cat;
    const emb = normalizeEmbedding(plain.embedding);
    if (!emb?.length) continue;
    scored.push({
      categoryId: String(plain.id),
      categoryName: String(plain.name || '').trim(),
      similarity: cosineSimilarity(queryEmb, emb),
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

/**
 * @param {string[]} categoryIds
 * @param {Awaited<ReturnType<typeof loadTaxonomyIndex>>} index
 */
function buildAvailablePaths(categoryIds, index) {
  const idSet = new Set(categoryIds.map(String));
  const paths = [];
  const categories = index.categories || [];

  for (const cat of categories) {
    const catPlain = cat.get ? cat.get({ plain: true }) : cat;
    if (!idSet.has(String(catPlain.id))) continue;

    for (const cluster of catPlain.clusters || []) {
      for (const role of cluster.roles || []) {
        paths.push({
          path_id: `${catPlain.id}:${cluster.id}:${role.id}`,
          industry: String(catPlain.name || '').trim(),
          cluster: String(cluster.name || '').trim(),
          role: String(role.value || '').trim(),
          categoryId: String(catPlain.id),
          clusterId: String(cluster.id),
          roleId: String(role.id),
        });
      }
    }
  }

  return paths;
}

function isGeneralPathRef(pathRef) {
  if (!pathRef || typeof pathRef !== 'object') return false;
  const vals = [pathRef.industry, pathRef.cluster, pathRef.role].map((v) => norm(v));
  return vals.some((v) => v === 'general' || v === norm(GENERAL_LABEL));
}

function resolvePathInAvailable(pathRef, availablePaths) {
  if (!pathRef || typeof pathRef !== 'object') return null;
  if (isGeneralPathRef(pathRef)) return null;

  const pathId = pathRef.path_id || pathRef.pathId;
  if (pathId) {
    const byId = availablePaths.find((p) => p.path_id === String(pathId));
    if (byId) return byId;
  }

  const ni = norm(pathRef.industry);
  const nc = norm(pathRef.cluster);
  const nr = norm(pathRef.role);
  if (!ni || !nr) return null;

  return (
    availablePaths.find(
      (p) => norm(p.industry) === ni && norm(p.cluster) === nc && norm(p.role) === nr,
    ) ||
    availablePaths.find((p) => norm(p.industry) === ni && norm(p.role) === nr) ||
    null
  );
}

function pathsEqual(a, b) {
  if (!a || !b) return false;
  return a.path_id === b.path_id;
}

function pathToJobField(path) {
  if (!path) return null;
  return {
    category: path.industry,
    fieldType: path.cluster,
    role: path.role,
    categoryId: path.categoryId,
    clusterId: path.clusterId,
    roleId: path.roleId,
  };
}

function buildFallbackResult(reason) {
  return {
    field: GENERAL_LABEL,
    role: GENERAL_LABEL,
    jobField: {
      category: GENERAL_LABEL,
      fieldType: GENERAL_LABEL,
      role: GENERAL_LABEL,
    },
    secondaryJobField: null,
    taxonomyMapping: {
      mapping_decision: {
        primary_path: {
          industry: GENERAL_LABEL,
          cluster: GENERAL_LABEL,
          role: GENERAL_LABEL,
          confidence: 0,
          reasoning: reason || 'לא נמצאה התאמה מספקת בטקסונומיה',
        },
        secondary_path: null,
        fallback_applied: true,
        normalization: { canonical_title: '', aliases_found: [] },
      },
    },
    requiresManualReview: true,
  };
}

function applyMappingDecision(mappingDecision, availablePaths) {
  const primaryRef = mappingDecision?.primary_path;
  const secondaryRef = mappingDecision?.secondary_path;
  const fallbackApplied = Boolean(mappingDecision?.fallback_applied);
  const primaryConfidence =
    typeof primaryRef?.confidence === 'number'
      ? primaryRef.confidence
      : Number(primaryRef?.confidence) || 0;

  const needsFallback =
    fallbackApplied ||
    primaryConfidence < CONFIDENCE_THRESHOLD ||
    isGeneralPathRef(primaryRef) ||
    !primaryRef;

  if (needsFallback) {
    return buildFallbackResult(primaryRef?.reasoning);
  }

  const primaryPath = resolvePathInAvailable(primaryRef, availablePaths);
  if (!primaryPath) {
    return buildFallbackResult('הנתיב שנבחר על ידי המודל אינו ברשימה הסגורה');
  }

  let secondaryJobField = null;
  if (secondaryRef && typeof secondaryRef === 'object') {
    const secondaryConfidence =
      typeof secondaryRef.confidence === 'number'
        ? secondaryRef.confidence
        : Number(secondaryRef.confidence) || 0;
    if (secondaryConfidence >= CONFIDENCE_THRESHOLD && !isGeneralPathRef(secondaryRef)) {
      const secondaryPath = resolvePathInAvailable(secondaryRef, availablePaths);
      if (secondaryPath && !pathsEqual(primaryPath, secondaryPath)) {
        secondaryJobField = pathToJobField(secondaryPath);
      }
    }
  }

  const jobField = pathToJobField(primaryPath);
  return {
    field: jobField.category,
    role: jobField.role,
    jobField,
    secondaryJobField,
    taxonomyMapping: { mapping_decision: mappingDecision },
    requiresManualReview: false,
  };
}

/**
 * Vector pre-filter + LLM classification from closed taxonomy paths.
 * @param {Record<string, unknown>} parsed – analyze JSON (title, skills, description)
 * @param {string} [rawText]
 */
async function classifyJobTaxonomyForAnalyze(parsed, rawText = '') {
  const queryText = buildClassificationQuery(parsed, rawText);
  if (!queryText.trim()) {
    return buildFallbackResult('חסרה כותרת או תוכן לסיווג');
  }

  const index = await loadTaxonomyIndex();
  const topCategories = await getTopKCategories(queryText, TOP_K_CATEGORIES);

  let categoryIds = topCategories.map((c) => c.categoryId).filter(Boolean);
  if (!categoryIds.length) {
    const allCats = (index.categories || []).map((c) => {
      const plain = c.get ? c.get({ plain: true }) : c;
      return String(plain.id);
    });
    categoryIds = allCats.slice(0, TOP_K_CATEGORIES);
  }

  const availablePaths = buildAvailablePaths(categoryIds, index);
  if (!availablePaths.length) {
    return buildFallbackResult('לא נמצאו נתיבים זמינים בטקסונומיה');
  }

  const promptRow = await promptService.ensureById(PROMPT_ID);
  if (!promptRow?.template) {
    console.warn('[jobTaxonomyClassification] prompt missing — using vector top match only');
    const best = availablePaths[0];
    if (!best) return buildFallbackResult('פרומפט סיווג חסר');
    const jobField = pathToJobField(best);
    return {
      field: jobField.category,
      role: jobField.role,
      jobField,
      secondaryJobField: null,
      taxonomyMapping: null,
      requiresManualReview: true,
    };
  }

  const jobTitle = String(parsed.jobTitle || parsed.title || '').trim();
  const jobContent = queryText;
  const availablePathsJson = JSON.stringify(availablePaths, null, 2);

  let systemPrompt = promptRow.template
    .replace(/\$\{jobTitle\}/g, jobTitle)
    .replace(/\$\{jobContent\}/g, jobContent)
    .replace(/\$\{availablePathsJson\}/g, availablePathsJson)
    .replace(/\{\{jobTitle\}\}/g, jobTitle)
    .replace(/\{\{jobContent\}\}/g, jobContent)
    .replace(/\{\{availablePathsJson\}\}/g, availablePathsJson);

  const apiKey = resolveGeminiApiKey();
  if (!apiKey) {
    return buildFallbackResult('מפתח Gemini לא מוגדר');
  }

  try {
    const rawResponse = await sendChat({
      apiKey,
      systemPrompt,
      history: [],
      message: 'Classify the job using only paths from Available Paths. Return JSON only.',
      responseMimeType: 'application/json',
      generationConfig: {
        temperature: promptRow.temperature ?? 0.1,
        maxOutputTokens: 2048,
      },
      promptId: PROMPT_ID,
      llmInputJson: {
        jobTitle,
        jobContent: jobContent.slice(0, 4000),
        availablePathsCount: availablePaths.length,
        topCategoryIds: categoryIds,
      },
    });

    const parsedResponse = parseJsonFromLlm(rawResponse);
    const mappingDecision =
      parsedResponse?.mapping_decision ||
      parsedResponse?.mappingDecision ||
      parsedResponse;

    return applyMappingDecision(mappingDecision, availablePaths);
  } catch (e) {
    console.error('[jobTaxonomyClassification] LLM classification failed:', e.message);
    return buildFallbackResult('שגיאה בסיווג אוטומטי — נדרש אישור ידני');
  }
}

module.exports = {
  PROMPT_ID,
  TOP_K_CATEGORIES,
  buildClassificationQuery,
  getTopKCategories,
  buildAvailablePaths,
  classifyJobTaxonomyForAnalyze,
  applyMappingDecision,
};
