const { Op, fn, col, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const SystemTag = require('../models/SystemTag');
const {
  SYSTEM_TAG_TYPE_CANDIDATE,
  SYSTEM_TAG_TYPE_JOB,
} = require('../models/SystemTag');

const candidateTagTypeWhere = (where = {}) => ({ ...where, type: SYSTEM_TAG_TYPE_CANDIDATE });
const jobTagTypeWhere = (where = {}) => ({ ...where, type: SYSTEM_TAG_TYPE_JOB });
const Tag = require('../models/Tag');
const Job = require('../models/Job');
const Candidate = require('../models/Candidate');
const User = require('../models/User');
const tagScoringEngine = require('./tagScoringEngine');

const CANDIDATE_TYPE_ALIASES_LOOKUP = {
  education: 'degree',
  certificate: 'certification',
  certificates: 'certification',
  certification: 'certification',
  certifications: 'certification',
  methodology: 'skill',
  methodologies: 'skill',
  domain: 'industry',
  soft: 'soft_skill',
};

const CANDIDATE_ALLOWED_TAG_TYPES = [
  'role', 'skill', 'industry', 'tool', 'certification', 'language', 'seniority', 'degree', 'soft_skill',
];

const normalizeCandidateTagType = (rawType) => {
  if (rawType == null || rawType === '') return null;
  const raw = String(rawType).toLowerCase().trim();
  if (CANDIDATE_TYPE_ALIASES_LOOKUP[raw]) return CANDIDATE_TYPE_ALIASES_LOOKUP[raw];
  return CANDIDATE_ALLOWED_TAG_TYPES.includes(raw) ? raw : null;
};

const looksLikeProfessionalCertificate = (payload = {}) => {
  const text = [
    payload.name,
    payload.quote,
    payload.tag_reason,
    payload.raw_type_reason,
  ]
    .filter(Boolean)
    .join(' ');
  return /\b(תעוד(ה|ת)|לימודי\s+תעודה|הסמכה\s+מקצועית)\b/u.test(text);
};

const looksLikeAcademicDegree = (payload = {}) => {
  const text = [payload.name, payload.quote, payload.tag_reason].filter(Boolean).join(' ');
  return /\b(תואר\s+(ראשון|שני|שלישי)|B\.?\s?A\.?|M\.?\s?A\.?|PhD|MBA)\b/ui.test(text);
};

/** Resolve catalog type from LLM tag payload (fixes degree/context vs certification mismatches). */
const resolveIncomingTagType = (payload = {}, fallbackType = 'role') => {
  const normalized = normalizeCandidateTagType(payload.raw_type ?? payload.type ?? fallbackType);
  if (normalized === 'certification') return 'certification';
  if (
    looksLikeProfessionalCertificate(payload) &&
    !looksLikeAcademicDegree(payload) &&
    (normalized === 'degree' || normalized === 'role' || !normalized)
  ) {
    return 'certification';
  }
  return normalized || 'skill';
};

const TAG_TYPE_MERGE_PRIORITY = {
  certification: 3,
  degree: 2,
  role: 1,
  skill: 1,
};

const pickPreferredResolvedTag = (current, incoming) => {
  const currentType = resolveIncomingTagType(current.payload, current.payload?.raw_type || 'role');
  const incomingType = resolveIncomingTagType(incoming.payload, incoming.payload?.raw_type || 'role');
  const currentPri = TAG_TYPE_MERGE_PRIORITY[currentType] || 0;
  const incomingPri = TAG_TYPE_MERGE_PRIORITY[incomingType] || 0;
  if (incomingPri > currentPri) return incoming;
  if (currentPri > incomingPri) return current;
  if (incomingType === 'certification') return incoming;
  if (currentType === 'certification') return current;
  return incoming;
};

if (!SystemTag.associations?.tag) {
  SystemTag.belongsTo(Tag, { foreignKey: 'tag_id', as: 'tag' });
}

if (!SystemTag.associations?.candidate) {
  SystemTag.belongsTo(Candidate, { foreignKey: 'entity_id', as: 'candidate', constraints: false });
}

/** Catalog Tag.status === 'active' → system_tags.is_active true (CandidateTag / SystemTag rows). */
const isCatalogTagStatusActive = (status) =>
  String(status || '').trim().toLowerCase() === 'active';

/**
 * system_tags.is_active for a job/candidate link:
 * - Catalog tag already existed and is active → true
 * - New catalog row (ensureTagRecord created pending) → false
 * - Catalog tag exists but pending/draft/etc. → false
 */
const systemTagIsActiveForCatalogTag = (tag, { created = false } = {}) => {
  if (!tag) return false;
  if (created) return false;
  return isCatalogTagStatusActive(tag.status);
};

/**
 * When a catalog tag's status changes, mirror it on all system_tags links (candidate + job).
 * Table: system_tags (legacy model name: CandidateTag).
 */
const syncSystemTagsActiveForCatalogTag = async (tagId, catalogStatus, transaction) => {
  if (!tagId) return 0;
  const isActive = isCatalogTagStatusActive(catalogStatus);
  const [count] = await SystemTag.update(
    { is_active: isActive },
    {
      where: {
        tag_id: tagId,
        type: { [Op.in]: [SYSTEM_TAG_TYPE_CANDIDATE, SYSTEM_TAG_TYPE_JOB] },
      },
      ...(transaction ? { transaction } : {}),
    },
  );
  return count;
};

const normalizeEntry = (entry) => {
  if (!entry) return null;
  const nameSources = [
    typeof entry === 'string' ? entry : null,
    typeof entry?.name === 'string' ? entry.name : null,
    typeof entry?.displayNameHe === 'string' ? entry.displayNameHe : null,
    typeof entry?.displayNameEn === 'string' ? entry.displayNameEn : null,
    entry?.raw_type ? entry.raw_type : null,
    entry?.raw_type && entry?.context ? `${entry.context} ${entry.raw_type}` : null,
  ];
  const name = nameSources.find((value) => typeof value === 'string' && value.trim());
  if (!name) return null;
  return {
    name: name.trim(),
    tagKey:
      typeof entry?.tagKey === 'string'
        ? entry.tagKey.trim()
        : (name && typeof name === 'string' ? name.trim() : ''),
    raw_type: entry?.raw_type || entry?.type || entry?.role || null,
    context: entry?.context || null,
    is_current: typeof entry?.is_current === 'boolean' ? entry.is_current : true,
    is_in_summary: typeof entry?.is_in_summary === 'boolean' ? entry.is_in_summary : false,
    confidence_score:
      typeof entry?.confidence_score === 'number' ? entry.confidence_score : null,
    calculated_weight:
      typeof entry?.calculated_weight === 'number' ? entry.calculated_weight : null,
    final_score:
      typeof entry?.final_score === 'number' ? entry.final_score : null,
    raw_type_reason:
      typeof entry?.raw_type_reason === 'string' ? entry.raw_type_reason.trim() : null,
    tag_reason:
      typeof entry?.tag_reason === 'string' ? entry.tag_reason.trim() : null,
    quote: (() => {
      const raw =
        typeof entry?.quote === 'string' && entry.quote.trim()
          ? entry.quote
          : typeof entry?.evidence === 'string' && entry.evidence.trim()
            ? entry.evidence
            : null;
      return raw ? raw.trim() : null;
    })(),
  };
};

const reassignCandidateTag = async (id, targetTagId) => {
  if (!id || !targetTagId) return null;
  const candidateTag = await SystemTag.findOne({
    where: { id, type: SYSTEM_TAG_TYPE_CANDIDATE },
  });
  if (!candidateTag) return null;
  if (candidateTag.tag_id === targetTagId) return candidateTag;
  const targetTag = await Tag.findByPk(targetTagId);
  if (!targetTag) return null;

  const existing = await SystemTag.findOne({
    where: candidateTagTypeWhere({
      entity_id: candidateTag.entity_id,
      tag_id: targetTagId,
    }),
  });

  if (existing) {
    await candidateTag.destroy();
    await recordTagUsage(targetTag);
    return existing;
  }

  await candidateTag.update({ tag_id: targetTagId });
  await recordTagUsage(targetTag);
  return candidateTag;
};

const deleteCandidateTag = async (id) => {
  const entry = await SystemTag.findOne({
    where: { id, type: SYSTEM_TAG_TYPE_CANDIDATE },
  });
  if (!entry) return null;
  await entry.destroy();
  return entry;
};

const bulkUpdateCandidateTags = async (actions = []) => {
  const validActions = Array.isArray(actions) ? actions : [];
  if (!validActions.length) return [];
  for (const entry of validActions) {
    if (!entry?.candidateTagId) {
      throw new Error('Missing candidate tag id');
    }
    if (entry.action === 'reassign') {
      if (!entry.targetTagId) {
        throw new Error('Missing target tag for reassign');
      }
      await reassignCandidateTag(entry.candidateTagId, entry.targetTagId);
      continue;
    }
    await deleteCandidateTag(entry.candidateTagId);
  }
  return validActions;
};

const normalizeForComparison = (value) => {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]/g, '')
    .trim();
};

const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
};

const stringSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - distance / maxLen;
};

const buildAliasMatchLiteral = (lowerTrimmed) =>
  sequelize.where(
    sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE("Tag"."aliases", ARRAY[]::text[])) AS alias
        WHERE lower(trim(COALESCE(alias, '')::text)) = ${sequelize.escape(lowerTrimmed)}
      )
    `),
    true
  );

const buildSynonymMatchLiteral = (lowerTrimmed) => {
  // Match only on synonym `phrase` values — not raw JSON (avoids false positives on keys like "priority").
  const escaped = sequelize.escape(lowerTrimmed);
  return sequelize.where(
    sequelize.literal(`
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE("Tag"."synonyms", '[]'::jsonb)) AS syn_elem
        WHERE jsonb_typeof(syn_elem) = 'object'
          AND (syn_elem ? 'phrase')
          AND length(trim(COALESCE(syn_elem->>'phrase', ''))) > 0
          AND strpos(lower(syn_elem->>'phrase'), lower(${escaped}::text)) > 0
      )
    `),
    true,
  );
};

const findTagByNameOrAlias = async (name, options = {}) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return null;

  const lowerTrimmed = trimmed.toLowerCase();
  const escaped = sequelize.escape(lowerTrimmed);
  const statusFilter = options.status
    ? `AND lower(trim(COALESCE(status::text, ''))) = lower(${sequelize.escape(String(options.status))})`
    : '';

  // Prefer raw query so synonym/alias match is reliable (no Sequelize alias or literal issues)
  const rows = await sequelize.query(
    `
        SELECT id
    FROM public.tags
    WHERE (
      lower(trim(COALESCE(display_name_he, '')::text)) = lower(${escaped})
      OR lower(trim(COALESCE(display_name_en, '')::text)) = lower(${escaped})
      OR lower(trim(COALESCE(tag_key, '')::text)) = lower(${escaped})
      OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(synonyms, '[]'::jsonb)) AS syn_elem
          WHERE jsonb_typeof(syn_elem) = 'object'
            AND (syn_elem ? 'phrase')
            AND lower(trim(COALESCE(syn_elem->>'phrase', ''))) = lower(${escaped})
      )
      OR EXISTS (
          SELECT 1
          FROM unnest(COALESCE(aliases, ARRAY[]::text[])) AS alias
          WHERE lower(trim(COALESCE(alias, '')::text)) = lower(${escaped})
      )
    )
    ${statusFilter}
    ORDER BY
      CASE lower(COALESCE(status::text, ''))
        WHEN 'active' THEN 0
        WHEN 'draft' THEN 1
        WHEN 'pending' THEN 2
        ELSE 3
      END,
      usage_count DESC NULLS LAST
    LIMIT 1;
    `,
    { type: QueryTypes.SELECT }
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (row && row.id) {
    return Tag.findByPk(row.id);
  }
  return null;
};

/** If a pending duplicate exists but an active catalog tag matches, prefer the active tag. */
const preferActiveCatalogTag = async (found, searchTargets = []) => {
  if (!found) return found;
  if (String(found.status || '').toLowerCase() === 'active') return found;

  for (const target of searchTargets) {
    const trimmed = String(target || '').trim();
    if (!trimmed) continue;
    const active = await findTagByNameOrAlias(trimmed, { status: 'active' });
    if (active) return active;
  }
  return found;
};

const doesTagNameOrAliasExist = async (name) => Boolean(await findTagByNameOrAlias(name));

const recordTagUsage = async (tagRecord) => {
  if (!tagRecord) return;
  tagRecord.usageCount = (tagRecord.usageCount || 0) + 1;
  tagRecord.lastUsedAt = new Date();
  await tagRecord.save();
};

const findFuzzyTag = async (value) => {
  const normalizedValue = normalizeForComparison(value);
  if (!normalizedValue) return null;
  const candidates = await Tag.findAll({ where: { status: 'active' } });
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const options = [
      candidate.tagKey,
      candidate.displayNameHe,
      candidate.displayNameEn,
      ...(Array.isArray(candidate.aliases) ? candidate.aliases : []),
    ];
    for (const option of options) {
      const normalizedOption = normalizeForComparison(option);
      if (!normalizedOption) continue;
      const score = stringSimilarity(normalizedValue, normalizedOption);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
      if (score >= 0.9) return candidate;
    }
  }
  return bestScore >= 0.9 ? best : null;
};

const ensureTagRecord = async (tagKey, defaults = {}) => {
  if (!tagKey) return null;
  const searchTargets = [tagKey, defaults.displayNameHe, defaults.displayNameEn];
  const contextSample =
    defaults.contextSample ||
    defaults.context ||
    defaults.quote ||
    defaults.tag_reason ||
    '';

  // Compute the normalized incoming type once so we can potentially fix an existing tag.
  const normalizedIncoming =
    normalizeCandidateTagType(defaults.type) ||
    resolveIncomingTagType(
      {
        raw_type: defaults.type,
        name: defaults.displayNameHe || tagKey,
        quote: defaults.contextSample,
      },
      'skill',
    );

  /**
   * Self-heal catalog type when we have better evidence from the CV parser.
   * - Always upgrade generic 'role' → specific type.
   * - For pending tags, sync to the latest resolved type (e.g. degree → certification).
   */
  const maybeUpgradeType = async (catalogTag) => {
    if (!normalizedIncoming || normalizedIncoming === 'role') return catalogTag;

    const current = String(catalogTag.type || '').toLowerCase();
    const status = String(catalogTag.status || '').toLowerCase();

    if (status === 'pending' && current === 'certification' && normalizedIncoming === 'degree') {
      return catalogTag;
    }

    const shouldUpdate =
      current === 'role' ||
      (status === 'pending' && current !== normalizedIncoming);

    if (shouldUpdate && current !== normalizedIncoming) {
      try {
        await catalogTag.update({ type: normalizedIncoming });
        catalogTag.type = normalizedIncoming;
        console.info('[ensureTagRecord] upgraded catalog tag type', {
          tagId: catalogTag.id,
          from: current,
          to: normalizedIncoming,
          tagKey,
        });
      } catch (err) {
        console.warn('[ensureTagRecord] type upgrade failed', err?.message || err);
      }
    }
    return catalogTag;
  };

  for (const target of searchTargets) {
    const found = await findTagByNameOrAlias(target);
    if (found) {
      // Blacklisted tags are stored as 'deprecated' — skip silently.
      if (String(found.status).toLowerCase() === 'deprecated') return null;
      const catalogTag = await preferActiveCatalogTag(found, searchTargets);
      // If the best catalog match is also deprecated, skip it.
      if (String(catalogTag.status).toLowerCase() === 'deprecated') return null;
      if (
        normalizedIncoming &&
        String(catalogTag.type || '').toLowerCase() !== normalizedIncoming
      ) {
        console.warn('[ensureTagRecord] catalog reuse type mismatch', {
          tagId: catalogTag.id,
          catalogType: catalogTag.type,
          incomingType: normalizedIncoming,
          tagKey,
          displayNameHe: defaults.displayNameHe,
          matchedTarget: target,
        });
      }
      await maybeUpgradeType(catalogTag);
      if (String(catalogTag.status).toLowerCase() === 'pending') {
        try {
          const tagCorrectionAgentService = require('./tagCorrectionAgentService');
          tagCorrectionAgentService.schedulePendingIfNeeded(catalogTag.id, contextSample, {
            clientId: defaults.clientId || null,
          });
        } catch (err) {
          console.warn('[ensureTagRecord] schedule pending if needed failed', err?.message || err);
        }
      }
      return { tag: catalogTag, created: false };
    }
  }

  for (const target of searchTargets) {
    const trimmed = String(target || '').trim();
    if (!trimmed) continue;
    const active = await findTagByNameOrAlias(trimmed, { status: 'active' });
    if (active) {
      if (String(active.status).toLowerCase() === 'deprecated') return null;
      await maybeUpgradeType(active);
      return { tag: active, created: false };
    }
  }
  // NEVER RETURN THIS CODE!!!
  //const fuzzy = await findFuzzyTag(defaults.displayNameHe || defaults.displayNameEn || tagKey);
  //if (fuzzy) return { tag: fuzzy, created: false };

  let typeValue = typeof defaults.type === 'string' ? defaults.type.toLowerCase().trim() : 'skill';
  typeValue = CANDIDATE_TYPE_ALIASES_LOOKUP[typeValue] ?? typeValue;
  const tagType = normalizedIncoming || (CANDIDATE_ALLOWED_TAG_TYPES.includes(typeValue) ? typeValue : 'skill');

  // Final safety check: if a deprecated tag exists for this tagKey, don't recreate it.
  const deprecatedCheck = await Tag.findOne({ where: { tagKey, status: 'deprecated' } });
  if (deprecatedCheck) return null;

  const tag = await Tag.create({
    tagKey,
    displayNameHe: defaults.displayNameHe || tagKey,
    displayNameEn: defaults.displayNameEn || tagKey,
    type: tagType,
    source: defaults.source || 'ai',
    status: 'pending',
  });

  try {
    const tagCorrectionAgentService = require('./tagCorrectionAgentService');
    tagCorrectionAgentService.scheduleDecisionForPendingTag(tag.id, contextSample, {
      clientId: defaults.clientId || null,
    });
  } catch (err) {
    console.warn('[ensureTagRecord] tag correction agent schedule failed', err?.message || err);
  }

  return { tag, created: true };
};

const JOB_TAG_TYPE_MAP = {
  role: 'role',
  skill: 'skill',
  industry: 'industry',
  tool: 'tool',
  certification: 'certification',
  certifications: 'certification',
  certificate: 'certification',
  certificates: 'certification',
  language: 'language',
  seniority: 'seniority',
  degree: 'degree',
  education: 'degree',
  methodology: 'skill',
  methodologies: 'skill',
  domain: 'industry',
  soft: 'soft_skill',
  soft_skill: 'soft_skill',
};

const normalizeJobTagType = (tagType) => {
  const raw = String(tagType || 'skill').toLowerCase().trim();
  if (raw === 'soft') return 'soft_skill';
  if (raw === 'education') return 'degree';
  return JOB_TAG_TYPE_MAP[raw] || 'skill';
};

const normalizeJobSkillEntry = (skill) => {
  if (!skill || !skill.name) return null;
  const name = String(skill.name).trim();
  const tagKey = String(skill.key ?? skill.name).trim();
  if (!name || !tagKey) return null;
  const modeRaw = String(skill.mode || 'normal').trim().toLowerCase();
  const mode = ['mandatory', 'negative', 'normal'].includes(modeRaw) ? modeRaw : 'normal';
  const relevance =
    typeof skill.relevance_score === 'number'
      ? skill.relevance_score
      : skill.relevance_score != null && skill.relevance_score !== ''
        ? Number(skill.relevance_score)
        : null;
  return {
    name,
    tagKey,
    raw_type: skill.tagType || skill.tag_type || skill.type || 'skill',
    mode,
    tag_reason: typeof skill.tag_reason === 'string' ? skill.tag_reason.trim() : null,
    quote:
      typeof skill.quote === 'string' && skill.quote.trim() ? skill.quote.trim() : null,
    confidence_score: Number.isFinite(relevance) ? relevance : null,
    raw_type_reason:
      skill.aiMode != null && String(skill.aiMode).trim() ? String(skill.aiMode).trim() : null,
  };
};

const mapSystemTagsToJobSkills = (rows = []) =>
  rows.map((row) => {
    const plain = row.get ? row.get({ plain: true }) : row;
    const tag = plain.tag || row.tag;
    const tagPlain = tag?.get ? tag.get({ plain: true }) : tag;
    const tagSource = String(tagPlain?.source || '').toLowerCase();
    const uiSource = tagSource === 'ai' ? 'ai' : 'manual';
    return {
      id: tagPlain?.id || plain.tag_id,
      name: tagPlain?.displayNameHe || tagPlain?.displayNameEn || tagPlain?.tagKey || '',
      key: tagPlain?.tagKey || '',
      mode: plain.mode || 'normal',
      source: uiSource,
      tagType: plain.raw_type || tagPlain?.type || 'skill',
      tag_reason: plain.tag_reason || undefined,
      quote: plain.quote || undefined,
      relevance_score:
        plain.confidence_score != null && plain.confidence_score !== undefined
          ? plain.confidence_score
          : undefined,
      aiMode: plain.raw_type_reason || undefined,
      status: tagPlain?.status || 'pending',
    };
  });

const listJobTags = async (jobId) =>
  SystemTag.findAll({
    where: jobTagTypeWhere({ entity_id: jobId }),
    include: [{ model: Tag, as: 'tag' }],
    order: [['created_at', 'ASC']],
  });

const listJobTagsByJobIds = async (jobIds = []) => {
  const ids = (Array.isArray(jobIds) ? jobIds : []).map(String).filter(Boolean);
  if (!ids.length) return new Map();
  const rows = await SystemTag.findAll({
    where: jobTagTypeWhere({ entity_id: { [Op.in]: ids } }),
    include: [{ model: Tag, as: 'tag' }],
    order: [['created_at', 'ASC']],
  });
  const map = new Map();
  for (const row of rows) {
    const key = String(row.entity_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};

const resolveEntityId = (row) => {
  if (!row) return null;
  if (row.id != null && typeof row.id !== 'object') return String(row.id);
  if (typeof row.get === 'function') {
    const direct = row.get('id');
    if (direct != null && typeof direct !== 'object') return String(direct);
    const plain = row.get({ plain: true });
    if (plain?.id != null) return String(plain.id);
  }
  return null;
};

const assignJobSkills = (job, skills) => {
  const list = Array.isArray(skills) ? skills : [];
  if (typeof job.set === 'function') job.set('skills', list);
  else job.skills = list;
  return list;
};

/** Map jobs.skills JSONB (legacy column) into the shape expected by matchingScoreService. */
const mapLegacyJobSkillsJson = (skills = []) =>
  (Array.isArray(skills) ? skills : [])
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const name = String(s.name || s.displayNameHe || s.displayNameEn || '').trim();
      const key = String(s.key || s.tagKey || name).trim();
      if (!name && !key) return null;
      return {
        id: s.id,
        name: name || key,
        key: key || name,
        mode: s.mode || 'normal',
        source: s.source || 'ai',
        tagType: s.tagType || s.tag_type || s.type || 'skill',
        tag_reason: s.tag_reason || undefined,
        quote: s.quote || undefined,
        relevance_score: s.relevance_score,
        aiMode: s.aiMode,
        status: s.status || 'pending',
      };
    })
    .filter(Boolean);

const loadLegacyJobSkillsByIds = async (jobIds = []) => {
  const ids = [...new Set((Array.isArray(jobIds) ? jobIds : []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await Job.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'skills'],
  });
  const map = new Map();
  for (const row of rows) {
    map.set(String(row.id), mapLegacyJobSkillsJson(row.skills));
  }
  return map;
};

const backfillJobSkillsToSystemTags = (jobId, skills) => {
  if (!jobId || !Array.isArray(skills) || !skills.length) return;
  syncTagsForJob(jobId, skills).catch((e) => {
    console.warn('[candidateTagService] legacy job skills backfill failed', jobId, e.message || e);
  });
};

const hydrateJobSkills = async (job) => {
  if (!job) return job;
  const id = resolveEntityId(job);
  if (!id) return job;
  const rows = await listJobTags(id);
  let skills = mapSystemTagsToJobSkills(rows);
  if (!skills.length) {
    const legacyById = await loadLegacyJobSkillsByIds([id]);
    const legacy = legacyById.get(id) || [];
    if (legacy.length) {
      skills = legacy;
      backfillJobSkillsToSystemTags(id, legacy);
    }
  }
  assignJobSkills(job, skills);
  return job;
};

const hydrateJobsSkills = async (jobs = []) => {
  if (!Array.isArray(jobs) || !jobs.length) return jobs;
  const ids = jobs.map((j) => resolveEntityId(j)).filter(Boolean);
  const byJob = await listJobTagsByJobIds(ids);
  const needLegacy = [];
  for (const job of jobs) {
    const id = resolveEntityId(job) || '';
    let skills = mapSystemTagsToJobSkills(byJob.get(id) || []);
    if (!skills.length && id) needLegacy.push({ job, id });
    else assignJobSkills(job, skills);
  }
  if (needLegacy.length) {
    const legacyById = await loadLegacyJobSkillsByIds(needLegacy.map((x) => x.id));
    for (const { job, id } of needLegacy) {
      const skills = legacyById.get(id) || [];
      assignJobSkills(job, skills);
      if (skills.length) backfillJobSkillsToSystemTags(id, skills);
    }
  }
  return jobs;
};

/**
 * Sync job skills into system_tags (type = job). Tags are ensured in Tag table first.
 * - Existing catalog tag with status active → SystemTag.is_active true
 * - New catalog tag (status pending) → SystemTag.is_active false
 */
const syncTagsForJob = async (jobId, skills = [], uploadedByUserId = null) => {
  if (!jobId) return [];
  const entries = (Array.isArray(skills) ? skills : [])
    .map(normalizeJobSkillEntry)
    .filter(Boolean)
    .reduce((acc, curr) => {
      const key = curr.tagKey.toLowerCase();
      if (!acc.has(key)) acc.set(key, curr);
      return acc;
    }, new Map());
  const payloads = Array.from(entries.values());

  await SystemTag.destroy({ where: jobTagTypeWhere({ entity_id: jobId }) });
  if (!payloads.length) return [];

  const resolved = await Promise.all(
    payloads.map(async (payload) => {
      const { tag, created } = await ensureTagRecord(payload.tagKey, {
        displayNameHe: payload.name,
        displayNameEn: payload.name,
        type: normalizeJobTagType(payload.raw_type),
        source: 'job',
      });
      return tag ? { tag, created, payload } : null;
    }),
  );

  const byTagId = new Map();
  resolved.filter(Boolean).forEach((r) => {
    if (!byTagId.has(r.tag.id)) byTagId.set(r.tag.id, r);
  });

  await Promise.all(
    Array.from(byTagId.values()).map(async ({ tag, created, payload }) => {
      const score = tagScoringEngine.scoreTag(payload);
      const isActive = systemTagIsActiveForCatalogTag(tag, { created });
      await SystemTag.create({
        type: SYSTEM_TAG_TYPE_JOB,
        entity_id: jobId,
        tag_id: tag.id,
        mode: payload.mode,
        raw_type: payload.raw_type,
        tag_reason: payload.tag_reason,
        quote: payload.quote,
        confidence_score: payload.confidence_score,
        raw_type_reason: payload.raw_type_reason,
        calculated_weight: score.calculatedWeight,
        final_score: score.finalScore,
        is_active: isActive,
        is_current: true,
        is_in_summary: false,
        ...(uploadedByUserId ? { created_by: uploadedByUserId } : {}),
      });
      await recordTagUsage(tag);
    }),
  );

  return listJobTags(jobId);
};

/**
 * Sync all given tag entries to SystemTag for a candidate.
 * Every entry is inserted; is_active is true only when the tag exists in Tag with status === 'active'.
 * @param {string} candidateId - Candidate UUID
 * @param {Array} entries - Tag entries (strings or objects with tagKey/name/displayNameHe, etc.)
 * @param {string} [uploadedByUserId] - Optional UUID of the user who uploaded the resume (stored in created_by)
 */
const syncTagsForCandidate = async (candidateId, entries = [], uploadedByUserId = null) => {
  if (!candidateId || !entries.length) return [];
  const normalizedEntries = entries
    .map(normalizeEntry)
    .filter(Boolean)
    .reduce((acc, curr) => {
      const key = curr.tagKey.toLowerCase();
      if (!acc.has(key)) acc.set(key, curr);
      return acc;
    }, new Map());
  const payloads = Array.from(normalizedEntries.values());
  if (!payloads.length) return [];

  await SystemTag.destroy({ where: candidateTagTypeWhere({ entity_id: candidateId }) });

  let clientId = null;
  try {
    const candidate = await Candidate.findByPk(candidateId, { attributes: ['userId'] });
    if (candidate?.userId) {
      const user = await User.findByPk(candidate.userId, { attributes: ['clientId'] });
      clientId = user?.clientId || null;
    }
  } catch {
    clientId = null;
  }

  // Resolve each payload to a tag (find existing or create pending). Deduplicate by tag.id.
  const resolved = await Promise.all(
    payloads.map(async (payload) => {
      const resolvedType = resolveIncomingTagType(payload);
      const { tag, created } = await ensureTagRecord(payload.tagKey, {
        displayNameHe: payload.name,
        type: resolvedType,
        contextSample: payload.quote || payload.context || payload.tag_reason || '',
        clientId,
      });
      return tag ? { tag, created, payload, resolvedType } : null;
    }),
  );
  const byTagId = new Map();
  resolved.filter(Boolean).forEach((r) => {
    if (!byTagId.has(r.tag.id)) byTagId.set(r.tag.id, r);
    else byTagId.set(r.tag.id, pickPreferredResolvedTag(byTagId.get(r.tag.id), r));
  });
  const uniqueResolved = Array.from(byTagId.values());

  // Insert every tag: is_active mirrors catalog status (see systemTagIsActiveForCatalogTag).
  await Promise.all(
    uniqueResolved.map(async ({ tag, created, payload, resolvedType }) => {
      const score = tagScoringEngine.scoreTag(payload);
      const isActive = systemTagIsActiveForCatalogTag(tag, { created });
      await SystemTag.create({
        type: SYSTEM_TAG_TYPE_CANDIDATE,
        entity_id: candidateId,
        tag_id: tag.id,
        raw_type: resolvedType || payload.raw_type,
        context: payload.context,
        raw_type_reason: payload.raw_type_reason,
        tag_reason: payload.tag_reason,
        quote: payload.quote,
        is_current: payload.is_current,
        is_in_summary: payload.is_in_summary,
        confidence_score: payload.confidence_score,
        calculated_weight: score.calculatedWeight,
        final_score: score.finalScore,
        is_active: isActive,
        ...(uploadedByUserId ? { created_by: uploadedByUserId } : {}),
      });
      await recordTagUsage(tag);
    }),
  );

  return SystemTag.findAll({
    where: candidateTagTypeWhere({ entity_id: candidateId }),
    include: [{ model: Tag, as: 'tag' }],
  });
};

const removeAbsentTags = async (candidateId, tags = []) => {
  if (!candidateId) return;
  const normalized = new Set(
    tags
      .map((tag) => (typeof tag === 'string' ? tag : String(tag || '')))
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean),
  );
  const existing = await SystemTag.findAll({
    where: candidateTagTypeWhere({ entity_id: candidateId }),
    include: [{ model: Tag, as: 'tag' }],
  });
  await Promise.all(
    existing.map(async (entry) => {
      const key = String(entry.tag?.tagKey || entry.tag?.displayNameHe || entry.tag?.displayNameEn || '').trim().toLowerCase();
      if (key && normalized.has(key)) return null;
      return entry.destroy();
    }),
  );
  return existing;
};

/** Tag columns for admin lists — avoid embedding/synonyms/aliases JSONB (OOM on large datasets). */
const TAG_ADMIN_LIST_ATTRIBUTES = [
  'id',
  'tagKey',
  'displayNameHe',
  'displayNameEn',
  'type',
  'category',
  'status',
  'qualityState',
  'source',
  'matchable',
  'usageCount',
];

/**
 * Paginated admin listing with optional search (DB) and is_active filter.
 * @param {{
 *   candidateId?: string,
 *   limit?: number,
 *   offset?: number,
 *   search?: string,
 *   isActive?: 'all' | boolean
 * }} opts
 */
const listCandidateTagsPaginatedForAdmin = async ({
  candidateId,
  limit = 500,
  offset = 0,
  search,
  isActive = 'all',
} = {}) => {
  const base = candidateTagTypeWhere();
  if (candidateId) {
    base.entity_id = String(candidateId).trim();
  }
  if (isActive === true) {
    base.is_active = true;
  }
  if (isActive === false) {
    base.is_active = false;
  }

  const searchTrim = typeof search === 'string' ? search.trim() : '';
  let whereClause = base;
  if (searchTrim) {
    const like = `%${searchTrim}%`;
    // Do not use $assoc.field$ — Sequelize can emit wrong column names (e.g. "tag"."tagKey" vs tag_key).
    // Tag model uses underscored DB columns; Candidate uses camelCase attribute names as columns.
    whereClause = {
      [Op.and]: [
        base,
        {
          [Op.or]: [
            { raw_type: { [Op.iLike]: like } },
            { context: { [Op.iLike]: like } },
            sequelize.where(sequelize.col('tag.tag_key'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('tag.display_name_he'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('tag.display_name_en'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.fullName'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.email'), { [Op.iLike]: like }),
            sequelize.where(sequelize.col('candidate.phone'), { [Op.iLike]: like }),
            sequelize.literal(
              `("SystemTag"."entity_id")::text ILIKE ${sequelize.escape(like)}`,
            ),
          ],
        },
      ],
    };
  }

  const safeLimit = Math.min(2000, Math.max(1, Number(limit) || 500));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const include = [
    { model: Tag, as: 'tag', attributes: TAG_ADMIN_LIST_ATTRIBUTES, required: false },
    { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email', 'phone'], required: false },
  ];

  const { rows, count } = await SystemTag.findAndCountAll({
    where: whereClause,
    limit: safeLimit,
    offset: safeOffset,
    order: [['created_at', 'DESC']],
    subQuery: false,
    distinct: true,
    col: 'id',
    include,
  });

  return {
    rows,
    count,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + rows.length < count,
  };
};

/** @deprecated Prefer listCandidateTagsPaginatedForAdmin — loads full table (risk of OOM). */
const listAllCandidateTags = () =>
  SystemTag.findAll({
    where: candidateTagTypeWhere(),
    include: [
      { model: Tag, as: 'tag', attributes: TAG_ADMIN_LIST_ATTRIBUTES },
      { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
    ],
    limit: 5000,
  });

// Find a tag by human name/alias/synonym and return all CandidateTag records for it
const listCandidateTagsByTagName = async (name) => {
  const tag = await findTagByNameOrAlias(name);
  if (!tag) return [];
  return SystemTag.findAll({
    where: candidateTagTypeWhere({ tag_id: tag.id, is_active: true }),
    include: [
      { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
      { model: Tag, as: 'tag' },
    ],
  });
};

const countRowsByTagId = (rows) =>
  rows.reduce((acc, row) => {
    acc[row.tag_id] = Number(row.get('count')) || 0;
    return acc;
  }, {});

const listJobIdsByTag = async (tagId, { activeOnly = true } = {}) => {
  const tid = String(tagId || '').trim();
  if (!tid) return [];
  const rows = await SystemTag.findAll({
    attributes: ['entity_id'],
    where: jobTagTypeWhere({
      tag_id: tid,
      ...(activeOnly ? { is_active: true } : {}),
    }),
    group: ['entity_id'],
  });
  return rows.map((row) => row.entity_id).filter(Boolean);
};

const countTagUsage = async (tagIds = []) => {
  if (!Array.isArray(tagIds) || !tagIds.length) {
    return { candidates: {}, jobs: {} };
  }
  const activeWhere = { tag_id: { [Op.in]: tagIds }, is_active: true };
  const [candidateRows, jobRows] = await Promise.all([
    SystemTag.findAll({
      attributes: ['tag_id', [fn('COUNT', col('id')), 'count']],
      where: candidateTagTypeWhere(activeWhere),
      group: ['tag_id'],
    }),
    SystemTag.findAll({
      attributes: ['tag_id', [fn('COUNT', col('id')), 'count']],
      where: jobTagTypeWhere(activeWhere),
      group: ['tag_id'],
    }),
  ]);
  return {
    candidates: countRowsByTagId(candidateRows),
    jobs: countRowsByTagId(jobRows),
  };
};

module.exports = {
  syncTagsForCandidate,
  syncTagsForJob,
  removeAbsentTags,
  ensureTagRecord,
  findTagByNameOrAlias,
  mapSystemTagsToJobSkills,
  listJobTags,
  listJobTagsByJobIds,
  hydrateJobSkills,
  hydrateJobsSkills,
  assignJobSkills,
  createCandidateTag: async (payload) => {
    if (!payload?.tagKey) throw new Error('tagKey required');
    const entityId = payload.entity_id || payload.candidate_id || payload.candidateId;
    if (!entityId) throw new Error('candidate_id and tagKey required');
    const { tag, created } = await ensureTagRecord(payload.tagKey, {
      displayNameHe: payload.displayNameHe,
      displayNameEn: payload.displayNameEn,
      type: payload.raw_type || 'role',
    });
    if (!tag) throw new Error('Unable to ensure tag record');
    const score = tagScoringEngine.scoreTag(payload);
    const normalizedQuote =
      typeof payload.quote === 'string' && payload.quote.trim()
        ? payload.quote.trim()
        : typeof payload.evidence === 'string' && payload.evidence.trim()
          ? payload.evidence.trim()
          : null;
    const entry = await SystemTag.create({
      type: SYSTEM_TAG_TYPE_CANDIDATE,
      entity_id: entityId,
      tag_id: tag.id,
      raw_type: payload.raw_type,
      context: payload.context,
      raw_type_reason: payload.raw_type_reason ?? null,
      tag_reason: payload.tag_reason ?? null,
      quote: normalizedQuote,
      is_current: payload.is_current,
      is_in_summary: payload.is_in_summary,
      confidence_score: payload.confidence_score,
      calculated_weight: score.calculatedWeight,
      final_score: score.finalScore,
      is_active: true,
    });
    await recordTagUsage(tag);
    return entry;
  },
  updateCandidateTag: async (id, updates = {}) => {
    const candidateTag = await SystemTag.findOne({
      where: { id, type: SYSTEM_TAG_TYPE_CANDIDATE },
    });
    if (!candidateTag) return null;

    let newTag = null;
    if (updates.tagKey) {
      const result = await ensureTagRecord(updates.tagKey, {
        displayNameHe: updates.displayNameHe,
        displayNameEn: updates.displayNameEn,
        type: updates.raw_type || 'role',
      });
      if (result.tag) {
        updates.tag_id = result.tag.id;
        newTag = result.tag;
      }
    }

    const mergedPayload = {
      raw_type: updates.raw_type ?? candidateTag.raw_type,
      context: updates.context ?? candidateTag.context,
      is_current: typeof updates.is_current === 'boolean' ? updates.is_current : candidateTag.is_current,
      is_in_summary: typeof updates.is_in_summary === 'boolean' ? updates.is_in_summary : candidateTag.is_in_summary,
      confidence_score: typeof updates.confidence_score === 'number' ? updates.confidence_score : candidateTag.confidence_score,
    };
    if (typeof updates.quote === 'string') {
      const q = updates.quote.trim();
      updates.quote = q || null;
    } else if (typeof updates.evidence === 'string') {
      const q = updates.evidence.trim();
      updates.quote = q || null;
    }
    const manualWeight = Number(updates.calculated_weight);
    const manualFinal = Number(updates.final_score);
    const hasManualScore = Number.isFinite(manualWeight) && Number.isFinite(manualFinal);
    if (hasManualScore) {
      updates.calculated_weight = manualWeight;
      updates.final_score = manualFinal;
    } else {
      const score = tagScoringEngine.scoreTag(mergedPayload);
      updates.calculated_weight = score.calculatedWeight;
      updates.final_score = score.finalScore;
    }

    await candidateTag.update(updates);
    if (newTag) {
      await recordTagUsage(newTag);
    }
    return candidateTag;
  },
  deleteCandidateTag,
  reassignCandidateTag,
  bulkUpdateCandidateTags,
  listCandidateTags: async (candidateId) =>
    SystemTag.findAll({
      where: candidateTagTypeWhere({ entity_id: candidateId, is_active: true }),
      include: [
        { model: Tag, as: 'tag' },
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName'] },
      ],
    }),
  listCandidateTagsByTag: async (tagId, { activeOnly = true } = {}) =>
    SystemTag.findAll({
      where: candidateTagTypeWhere({
        tag_id: tagId,
        ...(activeOnly ? { is_active: true } : {}),
      }),
      include: [
        { model: Candidate, as: 'candidate', attributes: ['id', 'fullName', 'email', 'phone'] },
      ],
    }),
  listCandidateTagsByTagName,
  listAllCandidateTags,
  listCandidateTagsPaginatedForAdmin,
  countTagUsage,
  listJobIdsByTag,
  isCatalogTagStatusActive,
  syncSystemTagsActiveForCatalogTag,
  resolveIncomingTagType,
  normalizeCandidateTagType,
};

