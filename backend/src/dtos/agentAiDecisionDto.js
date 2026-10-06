const MAX_AGENT_TEXT_LENGTH = 10000;

const AGENT_PATCH_FIELDS = Object.freeze(['agentNotes', 'agentVerdict']);

const TAG_PUBLIC_FIELDS = Object.freeze([
  'id',
  'originalTerm',
  'detectedType',
  'contextSample',
  'aiDecision',
  'aiSuggestedTarget',
  'aiReasoning',
  'hesitationLevel',
  'dilemmaReasoning',
  'reviewStatus',
  'manualApprovalStatus',
  'agentNotes',
  'agentVerdict',
  'createdAt',
  'updatedAt',
]);

const ORG_PUBLIC_FIELDS = Object.freeze([
  'id',
  'originalTerm',
  'organizationId',
  'aiDecision',
  'aiSuggestedTarget',
  'aiReasoning',
  'hesitationLevel',
  'dilemmaReasoning',
  'similarEntities',
  'reviewStatus',
  'manualApprovalStatus',
  'agentNotes',
  'agentVerdict',
  'context',
  'createdAt',
  'updatedAt',
]);

const normalizeOptionalText = (value) => {
  if (value == null || value === '') return null;
  const s = String(value);
  if (s.length > MAX_AGENT_TEXT_LENGTH) {
    const err = new Error(`Text exceeds ${MAX_AGENT_TEXT_LENGTH} characters`);
    err.status = 400;
    throw err;
  }
  return s;
};

const pickPublicFields = (row, allowedFields) => {
  const plain = row?.get ? row.get({ plain: true }) : { ...(row || {}) };
  const out = {};
  for (const key of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(plain, key)) {
      out[key] = plain[key];
    }
  }
  if (out.similarEntities && !Array.isArray(out.similarEntities)) {
    out.similarEntities = [];
  }
  return out;
};

/** DB columns loaded for agent tag decision reads (includes retrieval snapshot). */
const TAG_AGENT_READ_FIELDS = Object.freeze([
  ...TAG_PUBLIC_FIELDS,
  'candidateTagsSnapshot',
]);

/**
 * Normalize pgvector hybrid snapshot for agent retrieval diagnostics.
 * @returns {{ k: number, candidates: Array<{ rank: number, tagId: string|null, tagKey: string|null, name: string|null, source: string|null, similarityScore: number|null }> }}
 */
const toCandidateRetrievalDto = (snapshot) => {
  const arr = Array.isArray(snapshot) ? snapshot : [];
  const candidates = arr.map((item, index) => {
    const source = item?.source != null ? String(item.source) : null;
    const rawScore = item?.score;
    const similarityScore =
      source === 'vector' && Number.isFinite(Number(rawScore)) ? Number(rawScore) : null;
    return {
      rank: index + 1,
      tagId: item?.tagId != null ? String(item.tagId) : null,
      tagKey: item?.tagKey != null ? String(item.tagKey) : null,
      name: item?.name != null ? String(item.name) : null,
      source,
      similarityScore,
    };
  });
  return { k: candidates.length, candidates };
};

const toPublicTagAiDecisionDto = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : { ...(row || {}) };
  const base = pickPublicFields(row, TAG_PUBLIC_FIELDS);
  const retrieval = toCandidateRetrievalDto(plain.candidateTagsSnapshot);
  return {
    ...base,
    candidateCount: retrieval.k,
    candidateTagsSnapshot: retrieval.candidates,
    retrieval,
  };
};

const toTagAiDecisionCandidatesDto = (row) => {
  const plain = row?.get ? row.get({ plain: true }) : { ...(row || {}) };
  const retrieval = toCandidateRetrievalDto(plain.candidateTagsSnapshot);
  return {
    decisionId: plain.id,
    originalTerm: plain.originalTerm ?? null,
    candidateCount: retrieval.k,
    ...retrieval,
  };
};

const toPublicOrganizationAiDecisionDto = (row) => pickPublicFields(row, ORG_PUBLIC_FIELDS);

/**
 * Accept only agentNotes / agentVerdict. Rejects any other body keys.
 */
const parseAgentPatchDto = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object');
    err.status = 400;
    throw err;
  }

  const META_FIELDS = ['expectedUpdatedAt', 'updatedAt'];
  const keys = Object.keys(body).filter((k) => !META_FIELDS.includes(k));
  const unknown = keys.filter((k) => !AGENT_PATCH_FIELDS.includes(k));
  if (unknown.length) {
    const err = new Error(`Forbidden fields: ${unknown.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'agentNotes')) {
    patch.agentNotes = normalizeOptionalText(body.agentNotes);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'agentVerdict')) {
    patch.agentVerdict = normalizeOptionalText(body.agentVerdict);
  }

  if (!Object.keys(patch).length) {
    const err = new Error('At least one of agentNotes or agentVerdict is required');
    err.status = 400;
    throw err;
  }

  return patch;
};

const toAgentPatchResponseDto = (row) => ({
  id: row.id,
  agentNotes: row.agentNotes ?? null,
  agentVerdict: row.agentVerdict ?? null,
});

const STAGING_WRITABLE_FIELDS = Object.freeze([
  'name',
  'nameEn',
  'legalName',
  'aliases',
  'isCompany',
  'mainField',
  'subField',
  'secondaryField',
  'businessModel',
  'productType',
  'type',
  'classification',
  'relation',
  'structure',
  'parentCompany',
  'subsidiaries',
  'employeeCount',
  'growthIndicator',
  'foundedYear',
  'dataConfidence',
  'lastVerified',
  'candidateCount',
  'location',
  'hqCountry',
  'website',
  'linkedinUrl',
  'techTags',
  'tags',
  'description',
]);

const STAGING_FIELD_GROUPS = Object.freeze({
  identity: ['name', 'nameEn', 'legalName', 'aliases', 'website', 'linkedinUrl'],
  business: [
    'mainField',
    'subField',
    'secondaryField',
    'businessModel',
    'productType',
    'type',
    'classification',
    'relation',
  ],
  organizationalStructure: ['structure', 'parentCompany', 'subsidiaries'],
  scaleAndGrowth: [
    'employeeCount',
    'growthIndicator',
    'foundedYear',
    'dataConfidence',
    'lastVerified',
    'candidateCount',
  ],
  addresses: ['location', 'hqCountry'],
  technologyAndTagging: ['techTags', 'tags', 'description'],
});

const pickStagingFields = (row, keys) => {
  const plain = row?.get ? row.get({ plain: true }) : { ...(row || {}) };
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(plain, key)) {
      out[key] = plain[key];
    }
  }
  return out;
};

const toStagingCompanyFieldGroupsDto = (row) => {
  if (!row) return null;
  const plain = row?.get ? row.get({ plain: true }) : { ...(row || {}) };
  return {
    id: plain.id,
    name: plain.name ?? null,
    nameEn: plain.nameEn ?? null,
    legalName: plain.legalName ?? null,
    aliases: Array.isArray(plain.aliases) ? plain.aliases : [],
    isCompany: plain.isCompany ?? null,
    updatedAt: plain.updatedAt ?? null,
    fieldGroups: {
      identity: pickStagingFields(plain, STAGING_FIELD_GROUPS.identity),
      business: pickStagingFields(plain, STAGING_FIELD_GROUPS.business),
      organizationalStructure: pickStagingFields(plain, STAGING_FIELD_GROUPS.organizationalStructure),
      scaleAndGrowth: pickStagingFields(plain, STAGING_FIELD_GROUPS.scaleAndGrowth),
      addresses: {
        ...pickStagingFields(plain, STAGING_FIELD_GROUPS.addresses),
        additionalLocations: Array.isArray(plain.additionalLocations) ? plain.additionalLocations : [],
      },
      technologyAndTagging: pickStagingFields(plain, STAGING_FIELD_GROUPS.technologyAndTagging),
    },
  };
};

const parseExpectedUpdatedAt = (value) => {
  if (value == null || value === '') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error('Invalid expectedUpdatedAt');
    err.status = 400;
    throw err;
  }
  return d.toISOString();
};

const parseStagingCompanyPatchDto = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    const err = new Error('Request body must be a JSON object');
    err.status = 400;
    throw err;
  }

  const reserved = new Set(['expectedUpdatedAt', 'updatedAt']);
  const keys = Object.keys(body).filter((k) => !reserved.has(k));
  const unknown = keys.filter((k) => !STAGING_WRITABLE_FIELDS.includes(k));
  if (unknown.length) {
    const err = new Error(`Forbidden staging fields: ${unknown.join(', ')}`);
    err.status = 400;
    throw err;
  }
  if (!keys.length) {
    const err = new Error('At least one staging company field is required');
    err.status = 400;
    throw err;
  }

  const patch = {};
  for (const key of keys) {
    const val = body[key];
    if (val == null) {
      patch[key] = null;
      continue;
    }
    if (['aliases', 'subsidiaries', 'techTags', 'tags'].includes(key)) {
      patch[key] = Array.isArray(val) ? val.map((v) => String(v).trim()).filter(Boolean) : [];
      continue;
    }
    if (key === 'isCompany') {
      patch[key] = Boolean(val);
      continue;
    }
    if (key === 'candidateCount') {
      patch[key] = Number(val);
      continue;
    }
    patch[key] = String(val);
  }
  return patch;
};

const toPublicOrganizationAiDecisionDetailDto = (row, stagingRow = null) => ({
  ...toPublicOrganizationAiDecisionDto(row),
  stagingCompany: toStagingCompanyFieldGroupsDto(stagingRow),
});

module.exports = {
  AGENT_PATCH_FIELDS,
  TAG_PUBLIC_FIELDS,
  TAG_AGENT_READ_FIELDS,
  ORG_PUBLIC_FIELDS,
  toCandidateRetrievalDto,
  toTagAiDecisionCandidatesDto,
  STAGING_FIELD_GROUPS,
  STAGING_WRITABLE_FIELDS,
  MAX_AGENT_TEXT_LENGTH,
  toPublicTagAiDecisionDto,
  toPublicOrganizationAiDecisionDto,
  toPublicOrganizationAiDecisionDetailDto,
  toStagingCompanyFieldGroupsDto,
  parseAgentPatchDto,
  parseStagingCompanyPatchDto,
  parseExpectedUpdatedAt,
  toAgentPatchResponseDto,
};
