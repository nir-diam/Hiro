const Organization = require('../models/Organization');
const OrganizationTmp = require('../models/OrganizationTmp');
const OrganizationAiDecision = require('../models/OrganizationAiDecision');
const organizationService = require('./organizationService');
const { enrichOrganizationById } = require('./organizationEnrichmentService');
const agentEntityAuditService = require('./agentEntityAuditService');
const {
  parseStagingCompanyPatchDto,
  STAGING_WRITABLE_FIELDS,
  toStagingCompanyFieldGroupsDto,
} = require('../dtos/agentAiDecisionDto');
const { assertOptimisticLock } = require('../utils/agentOptimisticLock');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (id, label = 'id') => {
  const s = String(id || '').trim();
  if (!UUID_RE.test(s)) {
    const err = new Error(`Invalid ${label}`);
    err.status = 400;
    throw err;
  }
  return s;
};

const clampPagination = (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  return { page, limit };
};

const pickDateRange = (query = {}) => ({
  from: String(query.dateFrom || query.fromDate || query.from || '').trim(),
  to: String(query.dateTo || query.toDate || query.to || '').trim(),
  date: String(query.date || '').trim(),
});

const parseOrganizationListQuery = (query = {}) => {
  const { page, limit } = clampPagination(query);
  const dates = pickDateRange(query);
  const search = String(query.search || query.q || '').trim();
  const mainField = String(query.mainField || '').trim();
  const location = String(query.location || '').trim();

  return {
    page,
    limit,
    search,
    mainField,
    location,
    includeMerged: String(query.includeMerged || '').toLowerCase() === 'true',
    activityDate: dates.date || undefined,
    activityFrom: dates.from || undefined,
    activityTo: dates.to || undefined,
  };
};

const listOrganizations = async (query = {}) => {
  const filterId = String(query.id || '').trim();
  if (filterId) {
    const org = await getOrganization(filterId);
    return { data: [org], total: 1, page: 1, limit: 1, totalPages: 1 };
  }

  const options = parseOrganizationListQuery(query);
  const { data, total, page, limit } = await organizationService.list(options);
  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

const getOrganization = async (id) => {
  const safeId = assertUuid(id, 'organizationId');
  try {
    return await organizationService.getByIdForApi(safeId);
  } catch (err) {
    if (!err.status) err.status = 404;
    throw err;
  }
};

const enrichOrganization = async (orgId, req) => {
  const safeId = assertUuid(orgId, 'organizationId');
  const before = await Organization.findByPk(safeId);
  if (!before) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  const updates = await enrichOrganizationById(safeId);
  const after = await Organization.findByPk(safeId);

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: safeId,
    entityName: after?.name || before.name,
    description: `Agent enrichment for "${after?.name || before.name}"`,
    before,
    after,
    trackedFields: updates ? Object.keys(updates) : STAGING_WRITABLE_FIELDS,
    metadata: { operation: 'enrich', enrichedFields: updates ? Object.keys(updates) : [] },
  });

  return {
    organizationId: safeId,
    enriched: Boolean(updates && Object.keys(updates).length),
    updatedFields: updates ? Object.keys(updates) : [],
    organization: after?.get ? after.get({ plain: true }) : after,
  };
};

const mergeOrganizations = async (body, req) => {
  const sourceId = assertUuid(body?.sourceId || body?.sourceOrganizationId, 'sourceId');
  const targetId = assertUuid(body?.targetId || body?.targetOrganizationId, 'targetId');
  if (sourceId === targetId) {
    const err = new Error('source and target must differ');
    err.status = 400;
    throw err;
  }

  const targetBefore = await Organization.findByPk(targetId);
  const sourceBefore = await Organization.findByPk(sourceId);
  if (!targetBefore || !sourceBefore) {
    const err = new Error('Source or target organization not found');
    err.status = 404;
    throw err;
  }

  const result = await organizationService.mergeOrganizations(
    { targetId, sourceIds: [sourceId] },
    { actor: req?.agent?.name || 'Agent' },
  );

  const targetAfter = await Organization.findByPk(targetId);

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: targetId,
    entityName: targetAfter?.name || targetBefore.name,
    description: `Agent merge: "${sourceBefore.name}" → "${targetAfter?.name || targetBefore.name}"`,
    before: targetBefore,
    after: targetAfter,
    trackedFields: ['aliases', 'name'],
    metadata: {
      operation: 'merge',
      sourceOrganizationId: sourceId,
      sourceOrganizationName: sourceBefore.name,
      mergeResult: result,
    },
  });

  return {
    targetOrganizationId: targetId,
    sourceOrganizationId: sourceId,
    result,
    organization: targetAfter?.get ? targetAfter.get({ plain: true }) : targetAfter,
  };
};

const patchStagingCompanyForDecision = async (decisionId, body, req) => {
  const safeDecisionId = assertUuid(decisionId, 'decisionId');
  const patch = parseStagingCompanyPatchDto(body);
  const expectedUpdatedAt = body?.expectedUpdatedAt ?? body?.updatedAt;

  const decision = await OrganizationAiDecision.findByPk(safeDecisionId);
  if (!decision) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }

  assertOptimisticLock(decision, expectedUpdatedAt);

  const tmpId = decision.organizationTmpId;
  if (!tmpId) {
    const err = new Error('Decision has no linked staging company');
    err.status = 404;
    throw err;
  }

  const staging = await OrganizationTmp.findByPk(tmpId);
  if (!staging) {
    const err = new Error('Staging company not found');
    err.status = 404;
    throw err;
  }

  const before = staging.get({ plain: true });
  await staging.update(patch);
  await staging.reload();

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'OrganizationTmp',
    entityId: tmpId,
    entityName: staging.name,
    description: `Agent updated staging company for decision "${decision.originalTerm}"`,
    before,
    after: staging,
    trackedFields: Object.keys(patch),
    metadata: {
      operation: 'patch_staging_company',
      organizationAiDecisionId: safeDecisionId,
    },
  });

  return {
    decisionId: safeDecisionId,
    updatedAt: decision.updatedAt,
    stagingCompany: toStagingCompanyFieldGroupsDto(staging),
  };
};

const ORG_EXECUTE_OPERATIONS = new Set(['add_aliases', 'remove_aliases']);

const executeOrganization = async (orgId, body, req) => {
  const safeId = assertUuid(orgId, 'organizationId');
  const operation = String(body?.operation || '').trim();
  if (!ORG_EXECUTE_OPERATIONS.has(operation)) {
    const err = new Error(`Invalid operation. Allowed: ${[...ORG_EXECUTE_OPERATIONS].join(', ')}`);
    err.status = 400;
    throw err;
  }

  const before = await Organization.findByPk(safeId);
  if (!before) {
    const err = new Error('Organization not found');
    err.status = 404;
    throw err;
  }

  if (operation === 'add_aliases') {
    const aliases = body?.aliases;
    if (!Array.isArray(aliases) || !aliases.length) {
      const err = new Error('aliases array is required');
      err.status = 400;
      throw err;
    }

    const result = await organizationService.addAliases(safeId, aliases);
    const after = result.organization;

    if (result.updated) {
      await agentEntityAuditService.recordAgentEntityAudit(req, {
        action: 'update',
        entityType: 'Organization',
        entityId: safeId,
        entityName: after.name || before.name,
        description: `Agent added ${result.added.length} alias(es) to "${after.name || before.name}"`,
        before,
        after,
        trackedFields: ['aliases'],
        metadata: {
          operation: 'add_aliases',
          addedAliases: result.added,
          skippedDuplicates: result.skippedDuplicates,
        },
      });
    }

    return {
      operation: 'add_aliases',
      addedAliases: result.added,
      skippedDuplicates: result.skippedDuplicates,
      aliases: result.aliases,
      data: await organizationService.getByIdForApi(safeId),
    };
  }

  if (operation === 'remove_aliases') {
    const aliases = body?.aliases;
    if (!Array.isArray(aliases) || !aliases.length) {
      const err = new Error('aliases array is required');
      err.status = 400;
      throw err;
    }

    const after = await organizationService.removeAliases(safeId, aliases);

    await agentEntityAuditService.recordAgentEntityAudit(req, {
      action: 'update',
      entityType: 'Organization',
      entityId: safeId,
      entityName: after.name || before.name,
      description: `Agent removed ${aliases.length} alias(es) from "${after.name || before.name}"`,
      before,
      after,
      trackedFields: ['aliases'],
      metadata: {
        operation: 'remove_aliases',
        removedAliases: aliases,
      },
    });

    return {
      operation: 'remove_aliases',
      removedAliases: aliases,
      data: await organizationService.getByIdForApi(safeId),
    };
  }

  const err = new Error('Unsupported operation');
  err.status = 400;
  throw err;
};

module.exports = {
  listOrganizations,
  getOrganization,
  enrichOrganization,
  mergeOrganizations,
  executeOrganization,
  patchStagingCompanyForDecision,
};
