const Organization = require('../models/Organization');
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

const pushSegment = (segments, val) => {
  if (Array.isArray(val)) segments.push(...val.map((x) => String(x || '').trim()).filter(Boolean));
  else if (val) segments.push(String(val).trim());
};

const buildEmbeddingText = (org) => {
  const plain = org?.toJSON ? org.toJSON() : org || {};
  const segments = [
    plain.name,
    plain.nameEn,
    plain.legalName,
    plain.description,
    plain.mainField,
    plain.secondaryField,
    plain.type,
    plain.classification,
    plain.location,
    plain.hqCountry,
    plain.growthIndicator,
    plain.structure,
    plain.parentCompany,
  ];
  pushSegment(segments, plain.subField);
  pushSegment(segments, plain.businessModel);
  pushSegment(segments, plain.productType);
  if (Array.isArray(plain.aliases)) segments.push(...plain.aliases.filter(Boolean));
  if (Array.isArray(plain.tags)) segments.push(...plain.tags.filter(Boolean));
  if (Array.isArray(plain.techTags)) segments.push(...plain.techTags.filter(Boolean));
  if (Array.isArray(plain.subsidiaries)) segments.push(...plain.subsidiaries.filter(Boolean));
  return segments.map((value) => String(value || '').trim()).filter(Boolean).join(' ');
};

const updateEmbeddingForOrganization = async (organizationId) => {
  if (!organizationId) return null;
  const org = await Organization.findByPk(organizationId);
  if (!org) return null;

  const text = buildEmbeddingText(org);
  if (!text) return null;

  let embedding = [];
  try {
    embedding = await embedText(text);
  } catch (err) {
    console.error('[organizationEmbeddingService] embedText failed', organizationId, err?.message || err);
    throw err;
  }

  const sanitized = sanitizeEmbedding(embedding);
  if (!sanitized || !sanitized.length) return null;

  await org.update({ embedding: sanitized }, { silent: true });
  return sanitized;
};

const scheduleOrganizationEmbedding = (org) => {
  if (!org?.id) return;
  setImmediate(() => {
    updateEmbeddingForOrganization(org.id).catch((err) => {
      console.error('[organizationEmbeddingService] scheduled embedding failed', org.id, err?.message || err);
    });
  });
};

const rebuildAllEmbeddings = async ({ onlyMissing = false } = {}) => {
  const orgs = await Organization.findAll({
    attributes: ['id', 'embedding'],
    raw: true,
  });

  let success = 0;
  let fail = 0;
  let skipped = 0;

  for (const row of orgs) {
    if (onlyMissing && row.embedding) {
      skipped++;
      continue;
    }
    try {
      const result = await updateEmbeddingForOrganization(row.id);
      if (result) success++;
      else skipped++;
    } catch {
      fail++;
    }
  }

  return { success, fail, skipped, total: orgs.length };
};

const rebuildOrganizationEmbedding = async (organizationId) => {
  return updateEmbeddingForOrganization(organizationId);
};

module.exports = {
  buildEmbeddingText,
  updateEmbeddingForOrganization,
  scheduleOrganizationEmbedding,
  rebuildAllEmbeddings,
  rebuildOrganizationEmbedding,
};
