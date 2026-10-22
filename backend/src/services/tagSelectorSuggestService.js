const { Op, QueryTypes } = require('sequelize');
const Tag = require('../models/Tag');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const { sequelize } = require('../config/db');
const { embedText } = require('./embeddingService');

const MAX_SUGGESTIONS = 8;
/** Profile/job ↔ catalog tags — much lower than AI dedup threshold (0.6). */
const SELECTOR_VECTOR_MIN = 0.24;
const SELECTOR_VECTOR_PREFERRED = 0.38;
const VECTOR_WEIGHT = 0.55;
const COOCCUR_WEIGHT = 0.45;

const normalizeEmbedding = (emb) => {
  if (!emb) return [];
  if (Array.isArray(emb)) return emb.filter((n) => Number.isFinite(n));
  if (typeof emb === 'string') {
    const cleaned = emb.trim().replace(/^\(|\)$/g, '');
    return cleaned
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
  }
  if (emb?.data) {
    return Array.from(emb.data)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
  }
  return [];
};

const cosineSimilarity = (a = [], b = []) => {
  if (!a.length || !b.length || a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const catalogTagType = (category) => {
  const normalized = String(category || '').trim().toLowerCase();
  if (!normalized || normalized === 'all') return null;
  if (normalized === 'education') return 'degree';
  return normalized;
};

const buildTypeWhere = (category) => {
  const type = catalogTagType(category);
  return type ? { type } : {};
};

const uniqueUuidList = (values = []) =>
  [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];

const fetchCoOccurrenceMap = async ({
  entityType,
  seedTagIds,
  jobFieldCategory,
  excludeTagIds,
}) => {
  const scores = new Map();
  const systemType = entityType === 'job' ? 'job' : 'candidate';
  const exclude = uniqueUuidList(excludeTagIds);

  if (seedTagIds.length) {
    const notInIds = uniqueUuidList([...seedTagIds, ...exclude]);
    const rows = await sequelize.query(
      `
      SELECT st2.tag_id AS "tagId", COUNT(DISTINCT st2.entity_id)::int AS cnt
      FROM system_tags st1
      INNER JOIN system_tags st2
        ON st1.entity_id = st2.entity_id AND st1.type = st2.type
      WHERE st1.type = :systemType
        AND st1.is_active = true
        AND st2.is_active = true
        AND st1.tag_id IN (:seedTagIds)
        AND st2.tag_id NOT IN (:notInIds)
      GROUP BY st2.tag_id
      ORDER BY cnt DESC
      LIMIT 40
      `,
      {
        replacements: { systemType, seedTagIds, notInIds },
        type: QueryTypes.SELECT,
      },
    );
    let maxCnt = 1;
    for (const row of rows) {
      const cnt = Number(row.cnt) || 0;
      if (cnt > maxCnt) maxCnt = cnt;
      if (exclude.includes(String(row.tagId))) continue;
      scores.set(String(row.tagId), cnt / maxCnt);
    }
  }

  const jobCategory = String(jobFieldCategory || '').trim();
  if (entityType === 'job' && jobCategory) {
    const likePattern = `%${jobCategory.replace(/%/g, '\\%')}%`;
    const rows = await sequelize.query(
      `
      SELECT st.tag_id AS "tagId", COUNT(*)::int AS cnt
      FROM system_tags st
      INNER JOIN jobs j ON j.id = st.entity_id
      WHERE st.type = 'job'
        AND st.is_active = true
        AND (
          j.field ILIKE :likePattern
          OR j."jobFields"::text ILIKE :likePattern
        )
      GROUP BY st.tag_id
      ORDER BY cnt DESC
      LIMIT 40
      `,
      {
        replacements: { likePattern },
        type: QueryTypes.SELECT,
      },
    );
    let maxCnt = 1;
    for (const row of rows) {
      const cnt = Number(row.cnt) || 0;
      if (cnt > maxCnt) maxCnt = cnt;
    }
    for (const row of rows) {
      const id = String(row.tagId);
      if (exclude.includes(id)) continue;
      const normalized = (Number(row.cnt) || 0) / maxCnt;
      const prev = scores.get(id) || 0;
      scores.set(id, Math.max(prev, normalized * 0.85));
    }
  }

  return scores;
};

const resolveSourceEmbedding = async ({ context, candidateId, jobId, contextText }) => {
  if (context === 'candidate' && candidateId) {
    const row = await Candidate.findByPk(candidateId, {
      attributes: ['embedding', 'searchText', 'professionalSummary', 'title'],
      raw: true,
    });
    if (!row) return [];
    const emb = normalizeEmbedding(row.embedding);
    if (emb.length) return emb;
    const text = String(contextText || row.searchText || row.professionalSummary || row.title || '').trim();
    if (text.length < 40) return [];
    try {
      return normalizeEmbedding(await embedText(text.slice(0, 12000)));
    } catch {
      return [];
    }
  }

  if (context === 'job') {
    if (jobId) {
      const row = await Job.findByPk(jobId, {
        attributes: ['embedding', 'description', 'title', 'requirements', 'field', 'role', 'jobFields'],
        raw: true,
      });
      if (row) {
        const emb = normalizeEmbedding(row.embedding);
        if (emb.length) return emb;
        const reqText = Array.isArray(row.requirements) ? row.requirements.join('\n') : row.requirements;
        const text = [
          row.title,
          row.field,
          row.role,
          row.description,
          reqText,
          contextText,
        ]
          .filter(Boolean)
          .join('\n')
          .trim();
        if (text.length >= 20) {
          try {
            return normalizeEmbedding(await embedText(text.slice(0, 12000)));
          } catch {
            return [];
          }
        }
      }
    }
    const draft = String(contextText || '').trim();
    if (draft.length >= 40) {
      try {
        return normalizeEmbedding(await embedText(draft.slice(0, 12000)));
      } catch {
        return [];
      }
    }
  }

  return [];
};

/**
 * @returns {Promise<{ tagIds: string[], items: Array<{ tagId: string, score: number, vectorScore?: number, coScore?: number }>, hasVector: boolean }>}
 */
const suggestTagsForSelector = async (payload = {}) => {
  const context = payload.context === 'job' ? 'job' : 'candidate';
  const category = payload.category || 'all';
  const excludeTagIds = uniqueUuidList([
    ...(payload.excludeTagIds || []),
    ...(payload.associatedTagIds || []),
    ...(payload.selectedTagIds || []),
  ]);
  const seedTagIds = uniqueUuidList([
    ...(payload.associatedTagIds || []),
    ...(payload.selectedTagIds || []),
  ]);

  const typeWhere = buildTypeWhere(category);
  const sourceEmbedding = await resolveSourceEmbedding({
    context,
    candidateId: payload.candidateId,
    jobId: payload.jobId,
    contextText: payload.contextText,
  });

  const coMap = await fetchCoOccurrenceMap({
    entityType: context,
    seedTagIds,
    jobFieldCategory: payload.jobFieldCategory,
    excludeTagIds,
  });

  const tagWhere = {
    status: 'active',
    ...typeWhere,
  };

  const tags = await Tag.findAll({
    where: tagWhere,
    attributes: [
      'id',
      'tagKey',
      'displayNameHe',
      'displayNameEn',
      'type',
      'embedding',
      'usageCount',
      'qualityState',
      'domains',
    ],
    limit: 1200,
  });

  const roleDomain = String(payload.roleDomainFilter || '').trim();
  const passesRoleDomain = (plain) => {
    if (!roleDomain || catalogTagType(category) !== 'role') return true;
    const domains = Array.isArray(plain.domains) ? plain.domains : [];
    if (!domains.length) return true;
    return domains.some((d) => String(d).includes(roleDomain) || roleDomain.includes(String(d)));
  };

  const scored = [];
  const usageFallback = [];

  for (const tag of tags) {
    const plain = tag.get ? tag.get({ plain: true }) : tag;
    const id = String(plain.id);
    if (excludeTagIds.includes(id) || !passesRoleDomain(plain)) continue;

    usageFallback.push({
      tagId: id,
      usageCount: Number(plain.usageCount) || 0,
      verified: plain.qualityState === 'verified',
    });

    let vectorScore = null;
    if (sourceEmbedding.length) {
      const emb = normalizeEmbedding(plain.embedding);
      if (emb.length) {
        const sim = cosineSimilarity(sourceEmbedding, emb);
        if (sim >= 0) vectorScore = sim;
      }
    }

    const coScore = coMap.get(id) || 0;
    const vPart = vectorScore != null ? vectorScore : 0;
    let score = vPart * VECTOR_WEIGHT + coScore * COOCCUR_WEIGHT;
    if (plain.qualityState === 'verified') score += 0.03;
    if (Number(plain.usageCount) > 0) score += Math.min(0.05, Number(plain.usageCount) / 10000);

    scored.push({
      tagId: id,
      score,
      vectorScore: vectorScore != null ? vectorScore : undefined,
      coScore: coScore > 0 ? coScore : undefined,
    });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.vectorScore || 0) - (a.vectorScore || 0);
  });

  const seen = new Set();
  const pick = (row) => {
    if (seen.has(row.tagId) || seen.size >= MAX_SUGGESTIONS) return;
    seen.add(row.tagId);
    top.push(row);
  };

  const top = [];

  // 1) Strong vector + co-occurrence matches
  for (const row of scored) {
    if (seen.size >= MAX_SUGGESTIONS) break;
    const v = row.vectorScore ?? -1;
    const c = row.coScore ?? 0;
    if (v >= SELECTOR_VECTOR_PREFERRED || c > 0.12 || (v >= SELECTOR_VECTOR_MIN && row.score >= SELECTOR_VECTOR_MIN * VECTOR_WEIGHT)) {
      pick(row);
    }
  }

  // 2) Fill with best remaining vector scores (profile has embedding)
  if (seen.size < MAX_SUGGESTIONS && sourceEmbedding.length) {
    const byVector = [...scored]
      .filter((r) => r.vectorScore != null)
      .sort((a, b) => (b.vectorScore || 0) - (a.vectorScore || 0));
    for (const row of byVector) {
      if (seen.size >= MAX_SUGGESTIONS) break;
      if ((row.vectorScore || 0) < SELECTOR_VECTOR_MIN) continue;
      pick(row);
    }
    for (const row of byVector) {
      if (seen.size >= MAX_SUGGESTIONS) break;
      pick(row);
    }
  }

  // 3) Co-occurrence only
  if (seen.size < MAX_SUGGESTIONS) {
    for (const row of scored) {
      if (seen.size >= MAX_SUGGESTIONS) break;
      if ((row.coScore || 0) > 0) pick(row);
    }
  }

  // 4) Any remaining scored rows
  if (seen.size < MAX_SUGGESTIONS) {
    for (const row of scored) {
      if (seen.size >= MAX_SUGGESTIONS) break;
      pick(row);
    }
  }

  // 5) Catalog usage (tags missing embeddings)
  if (seen.size < MAX_SUGGESTIONS) {
    usageFallback.sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return b.usageCount - a.usageCount;
    });
    for (const row of usageFallback) {
      if (seen.size >= MAX_SUGGESTIONS) break;
      pick({ tagId: row.tagId, score: row.usageCount / 100000, vectorScore: undefined, coScore: undefined });
    }
  }

  return {
    tagIds: top.map((row) => row.tagId),
    items: top.slice(0, MAX_SUGGESTIONS),
    hasVector: sourceEmbedding.length > 0,
  };
};

module.exports = {
  suggestTagsForSelector,
  MAX_SUGGESTIONS,
};
