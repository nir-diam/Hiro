const candidateService = require('./candidateService');
const { embedText } = require('./embeddingService');

const buildSearchDocument = (candidate, extraText = '') => {
  if (!candidate) return '';
  const tags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const soft = candidate.skills?.soft || [];
  const tech = candidate.skills?.technical || [];
  const exp = Array.isArray(candidate.workExperience) ? candidate.workExperience : [];
  const languages = Array.isArray(candidate.languages) ? candidate.languages : [];
  const industries = [
    candidate.industry || '',
    candidate.field || '',
    ...(Array.isArray(candidate.internalTags) ? candidate.internalTags : []),
  ].filter(Boolean);

  const expText = exp
    .map((e) => {
      const title = e?.title || '';
      const company = e?.company || '';
      return [title, company].filter(Boolean).join(' at ');
    })
    .filter(Boolean)
    .join(', ');

  const langText = languages.map((l) => l?.name || l).filter(Boolean).join(', ');
  const techText = tech.map((t) => t?.name || t).filter(Boolean).join(', ');
  const skillsText = [
    ...tags,
    ...tech.map((t) => (t?.name ? t.name : t)),
    ...soft,
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `Job Title: ${candidate.title || ''}.`,
    `Summary: ${candidate.professionalSummary || ''}.`,
    `Skills: ${skillsText}.`,
    `Experience: ${expText}.`,
    `Industries: ${industries.join(', ')}.`,
    `Seniority: ${candidate.matchAnalysis?.seniority || ''}.`,
    `Languages: ${langText}.`,
    extraText || '',
  ].join('\n');
};

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
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

const embedCandidateAndSave = async (candidateId, extraText = '') => {
  const candidate = await candidateService.getById(candidateId);
  const doc = buildSearchDocument(candidate, extraText);
  console.log('[embed] candidate', candidateId, 'docSnippet:', doc.slice(0, 400));
  const embedding = await embedText(doc);
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    console.warn('[embed] skip update due to empty embedding', candidateId);
    return [];
  }
  const updatePayload = { embedding };
  if (extraText && extraText.trim()) {
    // persist a truncated version to allow keyword match later
    updatePayload.searchText = extraText.slice(0, 50000);
  }
  await candidateService.update(candidateId, updatePayload);
  return embedding;
};

const collectTerms = (candidate) => {
  const base = buildSearchDocument(candidate);
  const extra = candidate.searchText || '';
  return `${base}\n${extra}`.toLowerCase();
};

const hasKeywordMatch = (queryWords, termsText) => {
  if (!queryWords.length) return true;
  if (!termsText) return false;
  return queryWords.some((w) => termsText.includes(w));
};

const normalizeEmbedding = (emb) => {
  if (!emb) return [];
  if (Array.isArray(emb)) return emb;
  // pgvector via Sequelize can come back as string "(...)" or "[...]" or object with "data"
  if (typeof emb === 'string') {
    const trimmed = emb.trim();
    const clean = trimmed.startsWith('(') || trimmed.startsWith('[')
      ? trimmed.slice(1, -1)
      : trimmed;
    return clean
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
  }
  if (emb?.data) {
    return Array.from(emb.data).map((v) => Number(v)).filter((n) => Number.isFinite(n));
  }
  return [];
};

const searchCandidates = async ({ query, filters = {}, limit = 20 }) => {
  console.log('[vectorSearch] start', { query, filters, limit });
  const qEmbedding = await embedText(query || '');
  console.log('[vectorSearch] query embedding length', qEmbedding.length);
  if (!qEmbedding.length) return [];

  // Basic filter: fetch all then filter in-memory (keeps code simple without pgvector)
  const all = await candidateService.list();
  const filtered = all.filter((c) => {
    if (filters.status && c.status !== filters.status) return false;
    if (filters.city && !(c.address || '').toLowerCase().includes(filters.city.toLowerCase())) return false;
    if (filters.salaryMax && c.salaryMax && Number(c.salaryMax) > Number(filters.salaryMax)) return false;
    return true;
  });

  console.log('[vectorSearch] filtered count', filtered.length);

  // Cap max returned for sanity
  const maxLimit = Math.min(limit || 20, 20);
  const queryWords = (query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const scored = [];
  for (const candidate of filtered) {
    let emb = normalizeEmbedding(candidate.embedding);
    if (!emb.length || emb.length !== qEmbedding.length) {
      try {
        const rebuilt = await embedCandidateAndSave(candidate.id);
        emb = normalizeEmbedding(rebuilt);
      } catch (err) {
        console.error('[vectorSearch] rebuild candidate embedding failed', candidate.id, err.message || err);
        continue;
      }
    }

    if (!emb.length || emb.length !== qEmbedding.length) continue;

    const terms = collectTerms(candidate);
    if (!hasKeywordMatch(queryWords, terms)) continue;

    const score = cosineSimilarity(qEmbedding, emb);
    if (score < 0.30) continue;

    scored.push({
      candidate,
      score,
      embLen: emb.length,
      terms,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  console.log('[vectorSearch] scored count', scored.length, 'top1 score', scored[0]?.score);

  return scored.slice(0, maxLimit).map((s) => ({
    ...s.candidate.toJSON ? s.candidate.toJSON() : s.candidate,
    similarity: s.score,
  }));
};

module.exports = {
  buildSearchDocument,
  embedCandidateAndSave,
  searchCandidates,
};


