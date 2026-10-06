const Tag = require('../models/Tag');
const tagService = require('./tagService');
const agentEntityAuditService = require('./agentEntityAuditService');
const { isTagProtectedRow } = require('../utils/tagProtection');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const clampPagination = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  return { page, limit };
};

const parseCommaList = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const pickDateRange = (query = {}) => ({
  from: String(query.dateFrom || query.fromDate || query.from || '').trim(),
  to: String(query.dateTo || query.toDate || query.to || '').trim(),
  date: String(query.date || '').trim(),
});

const toPublicTagDto = (tag) => {
  const payload = tag?.toJSON ? tag.toJSON() : { ...tag };
  delete payload.embedding;
  if (!payload.createdAt && payload.created_at) payload.createdAt = payload.created_at;
  if (!payload.updatedAt && payload.updated_at) payload.updatedAt = payload.updated_at;
  return payload;
};

const parseTagListQuery = (query = {}) => {
  const { page, limit } = clampPagination(query);
  const dates = pickDateRange(query);
  const search = String(query.search || query.q || '').trim();
  const type = String(query.type || '').trim();
  const types = type ? [type] : parseCommaList(query.types);

  const useActivityRange = Boolean(dates.from || dates.to || dates.date);

  return {
    page,
    limit,
    searchTerm: search,
    types,
    statuses: parseCommaList(query.statuses),
    sources: parseCommaList(query.sources || query.source),
    createdFrom: useActivityRange ? undefined : dates.from || undefined,
    createdTo: useActivityRange ? undefined : dates.to || undefined,
    activityDate: dates.date || undefined,
    activityFrom: useActivityRange ? (dates.from || dates.date || undefined) : undefined,
    activityTo: useActivityRange ? (dates.to || dates.date || undefined) : undefined,
    sort: query.sort || 'tagKey',
    direction: query.direction || 'asc',
  };
};

const listTags = async (query = {}) => {
  const filterId = String(query.id || '').trim();
  if (filterId) {
    const tag = await getTag(filterId);
    return { data: [tag], total: 1, page: 1, limit: 1, totalPages: 1 };
  }

  const options = parseTagListQuery(query);
  const { rows, total, page, limit } = await tagService.list(options);
  const safeLimit = limit || options.limit;
  return {
    data: rows.map(toPublicTagDto),
    total,
    page,
    limit: safeLimit,
    totalPages: safeLimit ? Math.max(1, Math.ceil(total / safeLimit)) : 1,
  };
};

const getTag = async (id) => {
  const safeId = assertUuid(id, 'tagId');
  const tag = await tagService.getById(safeId);
  return toPublicTagDto(tag);
};

const assertUuid = (id, label = 'id') => {
  const s = String(id || '').trim();
  if (!UUID_RE.test(s)) {
    const err = new Error(`Invalid ${label}`);
    err.status = 400;
    throw err;
  }
  return s;
};

const normalizeMerges = (body = {}) => {
  const merges = Array.isArray(body?.merges) ? body.merges : [];
  if (!merges.length) {
    const err = new Error('No merges provided');
    err.status = 400;
    throw err;
  }
  return merges.map((entry, index) => {
    const sourceTagId = assertUuid(entry?.sourceTagId, `merges[${index}].sourceTagId`);
    const targetTagId = assertUuid(entry?.targetTagId, `merges[${index}].targetTagId`);
    if (sourceTagId === targetTagId) {
      const err = new Error(`merges[${index}]: source and target must differ`);
      err.status = 400;
      throw err;
    }
    return {
      sourceTagId,
      targetTagId,
      aliasPriority: Number(entry?.aliasPriority) || 4,
    };
  });
};

const mergeTags = async (body, req) => {
  const merges = normalizeMerges(body);
  const auditSnapshots = [];

  for (const entry of merges) {
    const sourceTag = await Tag.findByPk(entry.sourceTagId);
    const targetTag = await Tag.findByPk(entry.targetTagId);
    if (!sourceTag || !targetTag) {
      const err = new Error('Source or target tag not found');
      err.status = 404;
      throw err;
    }
    if (isTagProtectedRow(sourceTag)) {
      const err = new Error('לא ניתן לעדכן את התגית כל עוד היא נמצאת בתגיות מוגנות');
      err.status = 403;
      err.code = 'TAG_PROTECTED';
      err.skipped = [{ sourceTagId: entry.sourceTagId, reason: 'TAG_PROTECTED' }];
      throw err;
    }
    auditSnapshots.push({
      entry,
      sourceTag,
      targetBefore: targetTag,
    });
  }

  const result = await tagService.mergeCatalogTags(merges);

  for (const snapshot of auditSnapshots) {
    const targetAfter = await Tag.findByPk(snapshot.entry.targetTagId);
    const sourceName =
      snapshot.sourceTag.displayNameHe
      || snapshot.sourceTag.displayNameEn
      || snapshot.sourceTag.tagKey
      || snapshot.entry.sourceTagId;
    const targetName =
      targetAfter?.displayNameHe
      || targetAfter?.displayNameEn
      || targetAfter?.tagKey
      || snapshot.entry.targetTagId;

    await agentEntityAuditService.recordAgentEntityAudit(req, {
      action: 'update',
      entityType: 'Tag',
      entityId: snapshot.entry.targetTagId,
      entityName: targetName,
      description: `Agent merge: "${sourceName}" → "${targetName}"`,
      before: snapshot.targetBefore,
      after: targetAfter,
      trackedFields: ['aliases', 'synonyms', 'usageCount', 'lastUsedAt'],
      metadata: {
        operation: 'merge',
        sourceTagId: snapshot.entry.sourceTagId,
        sourceTagName: sourceName,
        mergeResult: result?.results?.find(
          (row) =>
            row.sourceTagId === snapshot.entry.sourceTagId
            && row.targetTagId === snapshot.entry.targetTagId,
        ),
      },
    });
  }

  return result;
};

const TAG_EXECUTE_OPERATIONS = new Set(['add_synonyms', 'remove_synonyms', 'update_status']);

const TAG_EXECUTE_STATUSES = new Set(['active', 'draft']);
const TAG_EXECUTE_QUALITY_STATES = new Set(['verified', 'needs_review']);

const pickTagEnrichSnapshot = (tag) => {
  const dto = toPublicTagDto(tag);
  return {
    tagKey: dto.tagKey ?? null,
    category: dto.category ?? null,
    synonyms: Array.isArray(dto.synonyms) ? dto.synonyms : [],
  };
};

const buildEnrichApplyPayload = (suggestion) => ({
  tagKey: suggestion.tagKey,
  displayNameHe: suggestion.displayNameHe,
  displayNameEn: suggestion.displayNameEn,
  category: suggestion.category,
  type: suggestion.type,
  descriptionHe: suggestion.descriptionHe || '',
  domains: suggestion.domains || [],
  synonyms: suggestion.synonyms || [],
  status: 'draft',
  qualityState: 'needs_review',
  source: 'ai',
});

/**
 * Deep enrichment for a single catalog tag — same AI path as AdminTagsView bulk enrich,
 * with full tag context (not bare names). Persists like "apply suggestions" in the UI.
 */
const enrichTag = async (tagId, req) => {
  const safeId = assertUuid(tagId, 'tagId');
  const beforeRow = await Tag.findByPk(safeId);
  if (!beforeRow) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }
  if (isTagProtectedRow(beforeRow)) {
    const err = new Error('לא ניתן לעדכן את התגית כל עוד היא נמצאת בתגיות מוגנות');
    err.status = 403;
    err.code = 'TAG_PROTECTED';
    throw err;
  }

  const before = pickTagEnrichSnapshot(beforeRow);
  const tagContext = toPublicTagDto(beforeRow);
  const suggestions = await tagService.enrichSuggestions([tagContext]);
  const suggestion =
    suggestions.find((row) => String(row?.id || '') === safeId) || suggestions[0];
  if (!suggestion) {
    const err = new Error('AI enrichment returned no suggestion');
    err.status = 502;
    throw err;
  }

  const mergedSuggestion = { ...suggestion, id: safeId };
  const applyPayload = buildEnrichApplyPayload(mergedSuggestion);

  const afterRow = await tagService.update(safeId, applyPayload, {
    actingUser: req?.agent?.username || 'agent',
    updatedBy: req?.agent?.username || 'agent',
  });

  const after = pickTagEnrichSnapshot(afterRow);
  const tagName =
    afterRow.displayNameHe || afterRow.displayNameEn || afterRow.tagKey || safeId;

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Tag',
    entityId: safeId,
    entityName: tagName,
    description: `Agent deep enrichment for "${tagName}"`,
    before: beforeRow,
    after: afterRow,
    trackedFields: [
      'tagKey',
      'category',
      'synonyms',
      'type',
      'displayNameHe',
      'displayNameEn',
      'descriptionHe',
      'domains',
      'status',
      'qualityState',
      'source',
    ],
    metadata: {
      operation: 'enrich',
      before,
      after,
      tagKeyChanged: before.tagKey !== after.tagKey,
      categoryChanged: before.category !== after.category,
    },
  });

  return {
    tagId: safeId,
    enriched: true,
    before,
    after,
    data: toPublicTagDto(afterRow),
  };
};

const executeTag = async (tagId, body, req) => {
  const safeId = assertUuid(tagId, 'tagId');
  const operation = String(body?.operation || '').trim();
  if (!TAG_EXECUTE_OPERATIONS.has(operation)) {
    const err = new Error(`Invalid operation. Allowed: ${[...TAG_EXECUTE_OPERATIONS].join(', ')}`);
    err.status = 400;
    throw err;
  }

  const before = await Tag.findByPk(safeId);
  if (!before) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }

  if (operation === 'add_synonyms') {
    const synonyms = body?.synonyms;
    if (!Array.isArray(synonyms) || !synonyms.length) {
      const err = new Error('synonyms array is required');
      err.status = 400;
      throw err;
    }

    const result = await tagService.addSynonyms(safeId, synonyms, {
      actingUser: req?.agent?.username || 'agent',
    });
    const after = result.tag;
    const tagName =
      after.displayNameHe || after.displayNameEn || after.tagKey || safeId;

    if (result.updated) {
      await agentEntityAuditService.recordAgentEntityAudit(req, {
        action: 'update',
        entityType: 'Tag',
        entityId: safeId,
        entityName: tagName,
        description: `Agent added ${result.added.length} synonym(s) to "${tagName}"`,
        before,
        after,
        trackedFields: ['synonyms', 'source'],
        metadata: {
          operation: 'add_synonyms',
          addedSynonyms: result.added.map((syn) => ({
            id: syn.id,
            phrase: syn.phrase,
            language: syn.language,
            type: syn.type,
            priority: syn.priority,
          })),
          skippedDuplicates: result.skippedDuplicates,
        },
      });
    }

    return {
      operation: 'add_synonyms',
      addedSynonyms: result.added.map((syn) => ({
        id: syn.id,
        phrase: syn.phrase,
        language: syn.language,
        type: syn.type,
        priority: syn.priority,
      })),
      skippedDuplicates: result.skippedDuplicates,
      data: toPublicTagDto(after),
    };
  }

  if (operation === 'update_status') {
    const updates = {};
    if (body?.status != null) {
      const status = String(body.status).trim();
      if (!TAG_EXECUTE_STATUSES.has(status)) {
        const err = new Error(`Invalid status. Allowed: ${[...TAG_EXECUTE_STATUSES].join(', ')}`);
        err.status = 400;
        throw err;
      }
      updates.status = status;
    }
    if (body?.qualityState != null) {
      const qualityState = String(body.qualityState).trim();
      if (!TAG_EXECUTE_QUALITY_STATES.has(qualityState)) {
        const err = new Error(
          `Invalid qualityState. Allowed: ${[...TAG_EXECUTE_QUALITY_STATES].join(', ')}`,
        );
        err.status = 400;
        throw err;
      }
      updates.qualityState = qualityState;
    }
    if (!Object.keys(updates).length) {
      const err = new Error('At least one of status or qualityState is required');
      err.status = 400;
      throw err;
    }

    const after = await tagService.update(safeId, updates, {
      actingUser: req?.agent?.username || 'agent',
      updatedBy: req?.agent?.username || 'agent',
    });
    const tagName =
      after.displayNameHe || after.displayNameEn || after.tagKey || safeId;

    await agentEntityAuditService.recordAgentEntityAudit(req, {
      action: 'update',
      entityType: 'Tag',
      entityId: safeId,
      entityName: tagName,
      description: `Agent updated status/quality for "${tagName}"`,
      before,
      after,
      trackedFields: ['status', 'qualityState'],
      metadata: {
        operation: 'update_status',
        ...updates,
      },
    });

    return {
      operation: 'update_status',
      ...updates,
      data: toPublicTagDto(after),
    };
  }

  if (operation === 'remove_synonyms') {
    const synonymIds = body?.synonymIds;
    if (!Array.isArray(synonymIds) || !synonymIds.length) {
      const err = new Error('synonymIds array is required');
      err.status = 400;
      throw err;
    }

    const after = await tagService.removeSynonymsByIds(safeId, synonymIds, {
      actingUser: req?.agent?.username || 'agent',
    });

    const tagName =
      after.displayNameHe || after.displayNameEn || after.tagKey || safeId;

    await agentEntityAuditService.recordAgentEntityAudit(req, {
      action: 'update',
      entityType: 'Tag',
      entityId: safeId,
      entityName: tagName,
      description: `Agent removed ${synonymIds.length} synonym(s) from "${tagName}"`,
      before,
      after,
      trackedFields: ['synonyms', 'source'],
      metadata: {
        operation: 'remove_synonyms',
        removedSynonymIds: synonymIds,
      },
    });

    return {
      operation: 'remove_synonyms',
      removedSynonymIds: synonymIds,
      data: toPublicTagDto(after),
    };
  }

  const err = new Error('Unsupported operation');
  err.status = 400;
  throw err;
};

module.exports = {
  listTags,
  getTag,
  mergeTags,
  enrichTag,
  executeTag,
};
