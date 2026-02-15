const Tag = require('../models/Tag');
const { embedText } = require('./embeddingService');

const sanitizeEmbedding = (emb) => {
  if (emb === null || emb === undefined) return undefined;
  if (Array.isArray(emb)) return emb;
  if (typeof emb === 'string') {
    const cleaned = emb.trim().replace(/^\(|\)$/g, '');
    const parsedNumbers = cleaned
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((n) => Number.isFinite(n));
    return parsedNumbers.length ? parsedNumbers : undefined;
  }
  if (emb?.data) {
    const arr = Array.from(emb.data).map((n) => Number(n)).filter((n) => Number.isFinite(n));
    return arr.length ? arr : undefined;
  }
  return undefined;
};

const buildEmbeddingText = (tag) => {
  const segments = [];
  if (tag.displayNameHe) segments.push(tag.displayNameHe);
  if (tag.displayNameEn) segments.push(tag.displayNameEn);
  if (Array.isArray(tag.aliases)) segments.push(...tag.aliases.filter(Boolean));
  if (Array.isArray(tag.synonyms)) {
    segments.push(
      ...tag.synonyms
        .map((syn) => {
          if (!syn) return null;
          if (typeof syn === 'string') return syn;
          return syn.phrase || null;
        })
        .filter(Boolean),
    );
  }
  return segments.map((value) => (value || '').trim()).filter(Boolean).join(' ');
};

const updateEmbeddingForTag = async (tagId) => {
  if (!tagId) return;
  const tag = await Tag.findByPk(tagId);
  if (!tag) return;
  const text = buildEmbeddingText(tag);
  if (!text) return;
  let embedding = [];
  try {
    embedding = await embedText(text);
  } catch (err) {
    console.error('[tagEmbeddingService] embedText failed', err?.message || err);
    return;
  }
  const sanitized = sanitizeEmbedding(embedding);
  if (!sanitized || !sanitized.length) return;
  await tag.update({ embedding: sanitized }, { silent: true });
  return sanitized;
};

const scheduleTagEmbedding = (tag) => {
  if (!tag || !tag.id) return;
  setImmediate(() => {
    updateEmbeddingForTag(tag.id).catch((err) => {
      console.error('[tagEmbeddingService] scheduled embedding failed', err?.message || err);
    });
  });
};

const rebuildAllEmbeddings = async () => {
  const tags = await Tag.findAll();
  for (const tag of tags) {
    await updateEmbeddingForTag(tag.id);
  }
};

const rebuildTagEmbedding = async (tagId) => {
  await updateEmbeddingForTag(tagId);
};

module.exports = {
  scheduleTagEmbedding,
  rebuildAllEmbeddings,
  rebuildTagEmbedding,
};

