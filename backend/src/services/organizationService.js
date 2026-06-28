const { Op } = require('sequelize');
const Organization = require('../models/Organization');
const CandidateOrganization = require('../models/CandidateOrganization');
const { sendChat, resolveGeminiApiKey } = require('./geminiService');
const OrganizationTmp = require('../models/OrganizationTmp');
const OrganizationAiDecision = require('../models/OrganizationAiDecision');
const picklistService = require('./picklistService');
const { normalizeEmployeeCount } = require('../utils/normalizeEmployeeCount');
const { scheduleOrganizationEmbedding } = require('./organizationEmbeddingService');
const { scheduleOrganizationEnrichment } = require('./organizationEnrichmentService');
const { embedTextCached } = require('./embeddingService');
const promptService = require('./promptService');
const {
  GENERIC_BUCKET_SUFFIXES,
  normalizeGenericBucketLabel,
} = require('../constants/genericOrganizationBuckets');

// ─── Embedding helpers ────────────────────────────────────────────────────────

/** Cosine similarity between two equal-length numeric arrays; returns -1 on error. */
const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : -1;
};

/** Normalize embedding stored as JSONB (may arrive as array or object). */
const normalizeEmbedding = (emb) => {
  if (!emb) return null;
  if (Array.isArray(emb)) return emb;
  if (emb.data) return Array.from(emb.data).map(Number);
  return null;
};

/**
 * Dice coefficient string similarity (bigram overlap), returns 0-100.
 * Used as a fallback when no embeddings exist.
 */
const diceCoefficient = (a = '', b = '') => {
  const normalize = (s) => s.toLowerCase().replace(/[^\u0590-\u05FFa-z0-9]/g, '');
  const s1 = normalize(a);
  const s2 = normalize(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 100;
  if (s1.length < 2 || s2.length < 2) return 0;
  const bigrams1 = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    if (bigrams1.has(bg) && bigrams1.get(bg) > 0) {
      intersection++;
      bigrams1.set(bg, bigrams1.get(bg) - 1);
    }
  }
  return Math.round((2 * intersection) / (s1.length - 1 + s2.length - 1) * 100);
};

const API_ATTRIBUTES = { exclude: ['embedding'] };

/** ILIKE on name fields + any entry in aliases[] */
const organizationSearchWhere = (search) => {
  const trimmed = String(search || '').trim();
  if (!trimmed) return {};

  const sequelize = Organization.sequelize;
  const orConditions = [
    { name: { [Op.iLike]: `%${trimmed}%` } },
    { nameEn: { [Op.iLike]: `%${trimmed}%` } },
    { legalName: { [Op.iLike]: `%${trimmed}%` } },
  ];

  if (sequelize) {
    const escapedLike = sequelize.escape(`%${trimmed}%`);
    orConditions.push(
      sequelize.literal(
        `EXISTS (SELECT 1 FROM unnest(COALESCE("aliases", ARRAY[]::text[])) alias WHERE alias ILIKE ${escapedLike})`,
      ),
    );
  }

  return { [Op.or]: orConditions };
};

const parseInclusiveDateFrom = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }
  return new Date(trimmed);
};

const parseInclusiveDateTo = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999Z`);
  }
  return new Date(trimmed);
};

const list = async ({
  includeMerged = false,
  page = 1,
  limit = 50,
  search = '',
  activityDate,
  activityFrom,
  activityTo,
} = {}) => {
  const activityWhere = includeMerged ? {} : {
    [Op.or]: [
      { activityStatus: { [Op.ne]: 'merged' } },
      { activityStatus: null },
    ],
  };

  const searchWhere = organizationSearchWhere(search);

  const where = { [Op.and]: [activityWhere, searchWhere] };

  if (activityDate || activityFrom || activityTo) {
    const rangeStart = parseInclusiveDateFrom(activityFrom || activityDate);
    const rangeEnd = parseInclusiveDateTo(activityTo || activityDate);
    const createdRange = {};
    const updatedRange = {};
    if (rangeStart) {
      createdRange[Op.gte] = rangeStart;
      updatedRange[Op.gte] = rangeStart;
    }
    if (rangeEnd) {
      createdRange[Op.lte] = rangeEnd;
      updatedRange[Op.lte] = rangeEnd;
    }
    where[Op.and].push({
      [Op.or]: [{ createdAt: createdRange }, { updatedAt: updatedRange }],
    });
  }
  const offset = (page - 1) * limit;

  const { count, rows: orgs } = await Organization.findAndCountAll({
    attributes: API_ATTRIBUTES,
    where,
    order: [['name', 'ASC']],
    limit,
    offset,
  });

  const links = await CandidateOrganization.findAll({
    attributes: ['organizationId', 'candidateId'],
    raw: true,
  });
  const countByOrg = links.reduce((acc, row) => {
    const id = row.organizationId != null ? String(row.organizationId).toLowerCase() : null;
    const candidateId = row.candidateId != null ? String(row.candidateId) : null;
    if (!id || !candidateId) return acc;
    if (!acc[id]) acc[id] = new Set();
    acc[id].add(candidateId);
    return acc;
  }, /** @type {Record<string, Set<string>>} */ ({}));

  const data = orgs.map((o) => {
    const json = o.toJSON ? o.toJSON() : { ...o.get() };
    const orgKey = o.id != null ? String(o.id).toLowerCase() : null;
    json.candidateCount = orgKey && countByOrg[orgKey] ? countByOrg[orgKey].size : 0;
    return json;
  });

  return { data, total: count, page, limit };
};

const getById = async (id) => {
  const org = await Organization.findByPk(id, { attributes: API_ATTRIBUTES });
  if (!org) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }
  return org;
};

const findByAnyName = async ({ name, nameEn, legalName }) => {
  const candidates = [];
  const pushCandidate = (field, value) => {
    if (value && String(value).trim()) {
      candidates.push({
        [field]: {
          [Op.iLike]: String(value).trim(),
        },
      });
    }
  };

  pushCandidate('name', name);
  pushCandidate('nameEn', nameEn);
  pushCandidate('legalName', legalName);

  if (!candidates.length) return null;
  return Organization.findOne({
    where: {
      [Op.or]: candidates,
    },
  });
};

const ensureIndustryPicklistEntries = async (mainField, subField) => {
  if (!mainField) return null;
  const mainCategory = await picklistService.ensureMainFieldCategory(mainField);
  const subFields = Array.isArray(subField)
    ? subField.map((s) => String(s || '').trim()).filter(Boolean)
    : subField
      ? [String(subField).trim()].filter(Boolean)
      : [];
  if (mainCategory) {
    for (const sf of subFields) {
      await picklistService.ensureCategoryValueByLabel(mainCategory.id, sf);
    }
  }
  return mainCategory;
};

// Empty string "" is invalid for numeric columns; normalize to null
const sanitizePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload;
  const out = { ...payload };
  const numericFields = ['latitude', 'longitude'];
  numericFields.forEach((key) => {
    if (key in out && (out[key] === '' || (typeof out[key] === 'string' && out[key].trim() === ''))) {
      out[key] = null;
    }
    if (key in out && out[key] != null) {
      const n = Number(out[key]);
      if (Number.isNaN(n)) out[key] = null;
      else out[key] = n;
    }
  });
  if ('employeeCount' in out && out.employeeCount != null && out.employeeCount !== '') {
    const bucket = normalizeEmployeeCount(out.employeeCount);
    out.employeeCount = bucket || null;
  }
  for (const key of ['mainField2', 'subField', 'businessModel', 'productType']) {
    if (!(key in out)) continue;
    const val = out[key];
    if (Array.isArray(val)) {
      out[key] = val.map((x) => String(x || '').trim()).filter(Boolean);
    } else if (val != null && String(val).trim() !== '') {
      out[key] = [String(val).trim()];
    } else {
      out[key] = [];
    }
  }
  delete out.embedding;
  return out;
};

const create = async (payload) => {
  const clean = sanitizePayload(payload);
  const existing = await findByAnyName(clean);
  if (existing) {
    const err = new Error('Company already exists in the global database');
    err.status = 409;
    err.existing = {
      id: existing.id,
      name: existing.name,
      nameEn: existing.nameEn,
      legalName: existing.legalName,
    };
    throw err;
  }
  await ensureIndustryPicklistEntries(clean.mainField, clean.subField);
  for (const mf of clean.mainField2 || []) {
    await ensureIndustryPicklistEntries(mf, []);
  }
  const org = await Organization.create(clean);
  scheduleOrganizationEmbedding(org);
  return org;
};

const update = async (id, payload) => {
  const org = await getById(id);
  const clean = sanitizePayload(payload);
  await ensureIndustryPicklistEntries(clean.mainField || org.mainField, clean.subField || org.subField);
  const extraMains = clean.mainField2 ?? org.mainField2 ?? [];
  for (const mf of extraMains) {
    await ensureIndustryPicklistEntries(mf, []);
  }
  await org.update(clean);
  scheduleOrganizationEmbedding(org);
  return org;
};

const remove = async (id) => {
  const org = await getById(id);
  await org.destroy();
};

const getByIds = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const uniqueIds = Array.from(new Set(ids));
  return Organization.findAll({ where: { id: uniqueIds } });
};

const findByName = async (name) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  const org = await Organization.findOne({
    where: {
      name: {
        [Op.iLike]: trimmed,
      },
    },
  });
  if (org) return org;
  return findByAlias(trimmed);
};

const findByAlias = async (aliasValue) => {
  if (!aliasValue || !String(aliasValue).trim()) return null;
  const trimmed = String(aliasValue).trim();
  const sequelize = Organization.sequelize;
  if (!sequelize) return null;
  const escaped = sequelize.escape(trimmed);
  const aliasCondition = sequelize.literal(
    `EXISTS (SELECT 1 FROM unnest(COALESCE("aliases", ARRAY[]::text[])) alias WHERE LOWER(alias) = LOWER(${escaped}))`
  );
  return Organization.findOne({ where: aliasCondition });
};

const findTmpByName = async (name) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();
  return OrganizationTmp.findOne({
    where: {
      name: {
        [Op.iLike]: trimmed,
      },
    },
  });
};

/**
 * Find similar organizations using embedding cosine similarity (top N).
 * scope: 'regular' = exclude generic buckets; 'generic' = only generic buckets.
 * Falls back to text fuzzy-match when no embeddings are available.
 * Returns [{id, name, similarity}] where similarity is 0-100.
 */
const buildScopeNameFilter = (scope) => {
  const suffixConditions = GENERIC_BUCKET_SUFFIXES.map((suffix) => ({
    name: { [Op.iLike]: `%${suffix}%` },
  }));
  if (scope === 'generic') return { [Op.or]: suffixConditions };
  if (scope === 'regular') return { [Op.not]: { [Op.or]: suffixConditions } };
  return {};
};

const findSimilarOrganizations = async (name, topN = 10, { scope = 'regular' } = {}) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return [];
  const scopeFilter = buildScopeNameFilter(scope);

  // ── 1. Try embedding-based similarity ──────────────────────────────────────
  try {
    const queryEmbedding = await embedTextCached(trimmed);

    if (Array.isArray(queryEmbedding) && queryEmbedding.length) {
      const rows = await Organization.findAll({
        attributes: ['id', 'name', 'nameEn', 'embedding'],
        where: {
          [Op.and]: [
            { embedding: { [Op.ne]: null } },
            scopeFilter,
          ],
        },
        raw: true,
      });

      const scored = rows
        .map((r) => {
          const emb = normalizeEmbedding(r.embedding);
          if (!emb || !emb.length) return null;
          const sim = cosineSimilarity(queryEmbedding, emb);
          if (sim < 0) return null;
          return {
            id: r.id,
            name: r.name || r.nameEn || '',
            similarity: Math.round(sim * 100),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topN);

      if (scored.length) return scored;
    }
  } catch (err) {
    console.warn('[orgService] embedding similarity failed, falling back to text search:', err?.message);
  }

  // ── 2. Text fuzzy-match fallback ─────────────────────────────────────────────
  try {
    const searchPrefix = trimmed.substring(0, 20);
    const rows = await Organization.findAll({
      attributes: ['id', 'name', 'nameEn'],
      where: {
        [Op.and]: [
          scopeFilter,
          {
            [Op.or]: [
              { name: { [Op.iLike]: `%${searchPrefix}%` } },
              { nameEn: { [Op.iLike]: `%${searchPrefix}%` } },
            ],
          },
        ],
      },
      limit: topN * 3,
      raw: true,
    });
    return rows
      .map((r) => {
        const displayName = r.name || r.nameEn || '';
        const simName = diceCoefficient(trimmed, r.name || '');
        const simNameEn = diceCoefficient(trimmed, r.nameEn || '');
        return { id: r.id, name: displayName, similarity: Math.max(simName, simNameEn) };
      })
      .filter((r) => r.similarity >= 20)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN);
  } catch {
    return [];
  }
};

/** Load generic-bucket Organization rows (כללי / legacy גנרי). */
const findGenericBucketOrganizations = async () => {
  const suffixConditions = GENERIC_BUCKET_SUFFIXES.map((suffix) => ({
    name: { [Op.iLike]: `%${suffix}%` },
  }));
  const rows = await Organization.findAll({
    attributes: ['id', 'name'],
    where: { [Op.or]: suffixConditions },
    order: [['name', 'ASC']],
    raw: true,
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
};

const addTermAsAlias = async (targetOrg, term) => {
  if (!targetOrg || !term) return false;
  const trimmed = String(term).trim();
  if (!trimmed) return false;
  const currentAliases = Array.isArray(targetOrg.aliases) ? targetOrg.aliases : [];
  const alreadyAlias =
    currentAliases.some((a) => String(a).toLowerCase() === trimmed.toLowerCase()) ||
    String(targetOrg.name || '').toLowerCase() === trimmed.toLowerCase();
  if (alreadyAlias) return false;
  await targetOrg.update({ aliases: [...currentAliases, trimmed] });
  return true;
};

/** Similar-entity list for UI + AI decision log — embedding-ranked, single scope. */
const buildSimilarEntities = (similarCompanies = [], kind = 'company') => {
  const merged = [];
  const seen = new Set();

  for (const c of similarCompanies) {
    const name = String(c.name || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    merged.push({
      name,
      similarity: typeof c.similarity === 'number' ? c.similarity : 0,
      kind: kind === 'generic' ? 'generic' : 'company',
    });
  }

  return merged.sort((a, b) => b.similarity - a.similarity);
};

const similarEntitiesForDecision = (decision, { regularSimilar, genericSimilar, parsedSimilar, genericBuckets }) => {
  const isGenericDecision = decision === 'map_generic';
  const semanticPool = isGenericDecision ? genericSimilar : regularSimilar;
  const kind = isGenericDecision ? 'generic' : 'company';
  const allowedNames = isGenericDecision
    ? [...semanticPool.map((c) => c.name), ...genericBuckets.map((b) => b.name)]
    : regularSimilar.map((c) => c.name);

  const aiSimilar = sanitizeAiSimilarEntities(parsedSimilar, allowedNames).map((e) => ({
    ...e,
    kind,
  }));
  return aiSimilar.length ? aiSimilar : buildSimilarEntities(semanticPool, kind);
};

const resolveGenericBucketTarget = (target, genericBuckets = []) => {
  const raw = String(target || '').trim();
  if (!raw || !genericBuckets.length) return null;

  const candidates = [raw, normalizeGenericBucketLabel(raw)];
  for (const c of candidates) {
    const exact = genericBuckets.find((b) => b.name === c);
    if (exact) return exact;
    const ci = genericBuckets.find((b) => String(b.name).toLowerCase() === c.toLowerCase());
    if (ci) return ci;
  }

  const normalizedTarget = normalizeGenericBucketLabel(raw).toLowerCase();
  return (
    genericBuckets.find(
      (b) => normalizeGenericBucketLabel(b.name).toLowerCase() === normalizedTarget,
    ) || null
  );
};

const sanitizeAiSimilarEntities = (entities, allowedNames) => {
  const allowed = new Set([...allowedNames].map((n) => String(n).toLowerCase()));
  if (!Array.isArray(entities)) return [];
  return entities
    .map((e) => ({
      name: String(e?.name || '').trim(),
      similarity: typeof e?.similarity === 'number' ? e.similarity : 0,
    }))
    .filter((e) => e.name && allowed.has(e.name.toLowerCase()));
};

/**
 * Ask Gemini (via the organization_ai_enriched prompt) whether a company name
 * should result in a new entry, a merge, or be routed to manual review.
 * similarCompanies should be [{id, name, similarity}] from embedding search.
 * Returns null on any error so the caller can fall back to safe defaults.
 */
const askAiForOrgDecision = async ({ term, context = 'resume', similarCompanies = [], genericSimilar = [] }) => {
  try {
    const genericBuckets = await findGenericBucketOrganizations();
    const promptRow = await promptService.ensureById('organization_ai_enriched');
    if (!promptRow) {
      console.warn('[orgService] organization_ai_enriched prompt not found');
      return null;
    }

    const inputJson = JSON.stringify({
      original_term: term,
      context,
      existing_companies: similarCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        similarity: c.similarity ?? 0,
      })),
      generic_buckets: genericBuckets.map((b) => ({ id: b.id, name: b.name })),
      generic_similar: genericSimilar.map((c) => ({
        id: c.id,
        name: c.name,
        similarity: c.similarity ?? 0,
      })),
    });

    const systemPrompt = promptRow.template.replace('{{input_json}}', inputJson);

    console.log(`[orgService] asking AI for term: "${term}" | similar: ${similarCompanies.length}`);

    const rawText = await sendChat({
      apiKey: resolveGeminiApiKey(),
      systemPrompt,
      history: [],
      message: 'Classify the company term provided in the system prompt. Return JSON only.',
      responseMimeType: 'application/json',
    });

    const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[orgService] AI returned no JSON for term:', term, '| raw:', text.substring(0, 200));
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]);

    let decision = parsed.decision || 'create_company';
    let target = parsed.target || null;
    let targetId = parsed.targetId || null;

    if (decision === 'map_generic') {
      const resolved = resolveGenericBucketTarget(target, genericBuckets);
      if (resolved) {
        target = resolved.name;
        targetId = resolved.id;
      } else {
        console.warn(`[orgService] map_generic invented/unknown target "${target}" — forcing manual review`);
        decision = 'manual_review';
        target = null;
        targetId = null;
        parsed.hesitationLevel = Math.max(typeof parsed.hesitationLevel === 'number' ? parsed.hesitationLevel : 0, 70);
      }
    } else if (decision === 'merge_company' && targetId) {
      const mergeMatch = similarCompanies.find((c) => String(c.id) === String(targetId));
      if (mergeMatch) target = mergeMatch.name;
    }

    const similarEntities = similarEntitiesForDecision(decision, {
      regularSimilar: similarCompanies,
      genericSimilar,
      parsedSimilar: parsed.similarEntities,
      genericBuckets,
    });

    console.log(`[orgService] AI decision for "${term}":`, {
      decision,
      target,
      targetId,
      hesitationLevel: parsed.hesitationLevel,
    });
    const hesitationLevel = typeof parsed.hesitationLevel === 'number' ? parsed.hesitationLevel : null;

    return {
      decision,
      target,
      targetId,
      explanation: parsed.explanation || '',
      hesitationLevel,
      dilemmaReasoning: parsed.dilemmaReasoning || '',
      similarEntities,
      needsManualReview: hesitationLevel !== null && hesitationLevel >= 40,
    };
  } catch (err) {
    console.error('[orgService] askAiForOrgDecision error:', err.message);
    return null;
  }
};

// ─── Hesitation thresholds ────────────────────────────────────────────────────
// ודאי  (certain)  = hesitation  < 30  → GREEN  → act immediately, no staging
// בינוני (medium)  = hesitation 30-59  → ORANGE → stage in OrganizationTmp, pending_review
// נמוך  (low conf) = hesitation ≥ 60   → RED   → stage in OrganizationTmp, manual queue
const HESITATION_VODAI  = 30;   // below this = ודאי
const HESITATION_NAMUCH = 60;   // at or above this = נמוך (manual queue)

const hesitationBand = (level) => {
  if (level === null || level === undefined) return 'namuch'; // unknown → treat as uncertain
  if (level < HESITATION_VODAI)  return 'vodai';
  if (level < HESITATION_NAMUCH) return 'binoni';
  return 'namuch';
};

const reviewStatusFromBand = (band) =>
  band === 'namuch' ? 'manual' : 'pending_review';

/**
 * Main entry-point used during candidate creation.
 *
 * Decision matrix:
 *  ┌──────────────────┬─────────────────┬──────────────────────────────────────────────┐
 *  │ AI decision      │ hesitation      │ outcome                                      │
 *  ├──────────────────┼─────────────────┼──────────────────────────────────────────────┤
 *  │ merge_company    │ ודאי  (< 30)   │ auto-merge into existing org; no staging     │
 *  │ merge_company    │ בינוני/נמוך    │ OrganizationTmp + AI decision log            │
 *  │ map_generic      │ ודאי  (< 30)   │ skip; only log AI decision                   │
 *  │ map_generic      │ בינוני/נמוך    │ OrganizationTmp + AI decision log            │
 *  │ create_company   │ any             │ Organization (direct) + enrich; reviewStatus  │
 *  │                  │                 │ = pending_review (ודאי/בינוני) or manual (נמוך)│
 *  │ manual_review    │ any             │ OrganizationTmp, reviewStatus=manual (forced) │
 *  │ AI unavailable   │ –               │ OrganizationTmp, reviewStatus=manual          │
 *  └──────────────────┴─────────────────┴──────────────────────────────────────────────┘
 */
const findOrCreateByName = async (name, defaults = {}) => {
  if (!name || !String(name).trim()) return null;
  const trimmed = String(name).trim();

  // 1. Exact match in canonical Organization table → return immediately
  const existing = await findByName(trimmed);
  if (existing) {
    console.log(`[orgService] "${trimmed}" → already in Organization (${existing.id}) — skipping AI`);
    return existing;
  }

  // 2. Already staged in OrganizationTmp → don't duplicate
  const existingTmp = await findTmpByName(trimmed);
  if (existingTmp) {
    console.log(`[orgService] "${trimmed}" → already in OrganizationTmp (${existingTmp.id}) — skipping AI`);
    return existingTmp;
  }

  // 3. Find similar organizations by embedding cosine similarity
  console.log(`[orgService] "${trimmed}" → new term, starting AI classification...`);
  const { candidateId, context: ctxOverride, ...restDefaults } = defaults;
  const context = ctxOverride || 'resume';
  const similarCompanies = await findSimilarOrganizations(trimmed, 10, { scope: 'regular' });
  const genericSimilar = await findSimilarOrganizations(trimmed, 10, { scope: 'generic' });

  // 4. Ask the AI to classify this company name
  const aiResult = await askAiForOrgDecision({ term: trimmed, context, similarCompanies, genericSimilar });

  const band = hesitationBand(aiResult?.hesitationLevel ?? null);
  // LLM-declared manual_review always forces 'manual' regardless of hesitation band
  const reviewStatus = aiResult?.decision === 'manual_review' ? 'manual' : reviewStatusFromBand(band);
  const similarEntities = aiResult
    ? aiResult.similarEntities
    : buildSimilarEntities(similarCompanies, 'company');

  const saveDecision = (extra = {}) =>
    OrganizationAiDecision.create({
      originalTerm: trimmed,
      candidateId: candidateId || null,
      aiDecision: aiResult ? aiResult.decision : 'create_company',
      aiSuggestedTarget: aiResult ? aiResult.target : null,
      aiSuggestedTargetId: aiResult ? aiResult.targetId : null,
      aiReasoning: aiResult ? aiResult.explanation : null,
      hesitationLevel: aiResult ? aiResult.hesitationLevel : null,
      dilemmaReasoning: aiResult ? aiResult.dilemmaReasoning : null,
      similarEntities,
      context,
      reviewStatus,
      ...extra,
    }).catch((e) => console.error('[orgService] failed to save AI decision:', e.message));

  // ── 5. merge_company + ודאי → auto-merge ──────────────────────────────────
  if (aiResult?.decision === 'merge_company' && band === 'vodai' && aiResult.targetId) {
    const targetOrg = await Organization.findByPk(aiResult.targetId);
    if (targetOrg) {
      const added = await addTermAsAlias(targetOrg, trimmed);
      if (added) {
        console.log(`[orgService] merge_company: added alias "${trimmed}" → "${targetOrg.name}"`);
      }
      saveDecision({ reviewStatus: 'approved', reviewerAction: 'auto_merge' });
      return targetOrg;
    }
  }

  // ── 6. map_generic + ודאי → alias on generic bucket org ───────────────────
  if (aiResult?.decision === 'map_generic' && band === 'vodai' && aiResult.targetId) {
    const targetOrg = await Organization.findByPk(aiResult.targetId);
    if (targetOrg) {
      const added = await addTermAsAlias(targetOrg, trimmed);
      if (added) {
        console.log(`[orgService] map_generic: added alias "${trimmed}" → "${targetOrg.name}"`);
      }
      saveDecision({ reviewStatus: 'approved', reviewerAction: 'auto_map_generic' });
      return targetOrg;
    }
  }

  if (aiResult?.decision === 'map_generic' && band === 'vodai') {
    saveDecision({ reviewStatus: 'pending_review' });
    return null;
  }

  // ── 6b. manual_review → LLM explicitly uncertain; always stage as manual ──
  if (aiResult?.decision === 'manual_review') {
    const tmpPayload = {
      name: trimmed,
      isCompany: true,
      candidateId: candidateId || null,
      ...restDefaults,
    };
    const tmpOrg = await OrganizationTmp.create(tmpPayload);
    // reviewStatus is already 'manual' (set above); pass organizationTmpId so
    // the AI Decisions tab can link directly to the staging record.
    saveDecision({ organizationTmpId: tmpOrg.id });
    console.log(`[orgService] "${trimmed}" → manual_review → staged in OrganizationTmp (${tmpOrg.id})`);
    return tmpOrg;
  }

  // ── 7. create_company → always add to canonical Organization + enrich ───────
  //    reviewStatus already reflects hesitation (pending_review / manual)
  //    so human reviewers can still audit low-confidence decisions in the UI,
  //    but the org is always created and enriched immediately.
  if (aiResult?.decision === 'create_company') {
    const orgPayload = sanitizePayload({ name: trimmed, ...restDefaults });
    const org = await Organization.create(orgPayload);
    scheduleOrganizationEmbedding(org);
    scheduleOrganizationEnrichment(org);   // company_enrichment prompt via Gemini
    saveDecision();                        // uses reviewStatus from band (or 'manual')
    return org;
  }

  // ── 8. Everything else → stage in OrganizationTmp ────────────────────────
  //    merge/map_generic with בינוני/נמוך, or AI unavailable
  const tmpPayload = {
    name: trimmed,
    isCompany: aiResult ? aiResult.decision !== 'map_generic' : true,
    candidateId: candidateId || null,
    ...restDefaults,
  };
  const tmpOrg = await OrganizationTmp.create(tmpPayload);
  saveDecision({ organizationTmpId: tmpOrg.id });

  return tmpOrg;
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getByIds,
  findByName,
  findOrCreateByName,
  findGenericBucketOrganizations,
};

