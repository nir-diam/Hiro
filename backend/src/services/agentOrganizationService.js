const Organization = require('../models/Organization');
const OrganizationLocation = require('../models/OrganizationLocation');
const OrganizationTmp = require('../models/OrganizationTmp');
const OrganizationAiDecision = require('../models/OrganizationAiDecision');
const organizationService = require('./organizationService');
const cityService = require('./cityService');
const { enrichOrganizationById } = require('./organizationEnrichmentService');
const agentEntityAuditService = require('./agentEntityAuditService');
const { parseAgentOrganizationFields } = require('../utils/agentOrganizationFields');
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
  const registrationNumber = String(query.registrationNumber || '').trim();
  const dataConfidence = String(query.dataConfidence || '').trim();
  const activityStatus = String(query.activityStatus || '').trim();

  return {
    page,
    limit,
    search,
    mainField,
    location,
    registrationNumber,
    dataConfidence,
    activityStatus,
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

const ORG_EXECUTE_OPERATIONS = new Set([
  'add_aliases',
  'remove_aliases',
  'update_fields',
  'add_additional_location',
  'update_additional_location',
  'remove_additional_location',
]);

const resolveCityForOrgField = async (locationStr) => {
  if (locationStr == null || locationStr === '') return null;
  const resolved = await cityService.resolveCityExact(String(locationStr).trim());
  if (!resolved) {
    const err = new Error(`Unknown city: ${locationStr}. Use a city from the cities catalog.`);
    err.status = 400;
    err.code = 'INVALID_CITY';
    throw err;
  }
  return resolved;
};

const assertNoDuplicateOnCreate = async (fields) => {
  const reg = fields.registrationNumber;
  if (reg) {
    const byReg = await organizationService.findByRegistrationNumber(reg);
    if (byReg) {
      const err = new Error('Organization with this registration number already exists');
      err.status = 409;
      err.code = 'DUPLICATE_ORGANIZATION';
      err.existingOrganization = await organizationService.getByIdForApi(byReg.id);
      throw err;
    }
  }
  const name = fields.name;
  if (name) {
    const byName = await organizationService.findByNormalizedName(name);
    if (byName) {
      const err = new Error('Organization with this normalized name already exists');
      err.status = 409;
      err.code = 'DUPLICATE_ORGANIZATION';
      err.existingOrganization = await organizationService.getByIdForApi(byName.id);
      throw err;
    }
  }
};

const createOrganization = async (body, req) => {
  const { patch, additionalLocations } = parseAgentOrganizationFields(body?.fields || body);
  if (!patch.name || !String(patch.name).trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  if (patch.location) {
    patch.location = await resolveCityForOrgField(patch.location);
  }

  await assertNoDuplicateOnCreate(patch);

  const payload = { ...patch };
  if (additionalLocations !== undefined) {
    payload.additionalLocations = additionalLocations;
  }

  const org = await organizationService.create(payload, {
    actingUser: req?.agent?.name || 'Agent',
  });
  const data = await organizationService.getByIdForApi(org.id, { skipCache: true });

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'create',
    entityType: 'Organization',
    entityId: org.id,
    entityName: org.name,
    description: `Agent created organization "${org.name}"`,
    before: null,
    after: org,
    trackedFields: Object.keys(patch),
    metadata: { operation: 'create_organization' },
  });

  return { organizationId: org.id, data };
};

const listOrganizationDuplicates = async (query = {}) => {
  const groups = await organizationService.findDuplicateGroups({ limit: query.limit });
  return { data: groups, total: groups.length };
};

const updateOrganizationFields = async (orgId, body, req, before) => {
  assertOptimisticLock(before, body?.expectedUpdatedAt ?? body?.updatedAt);

  const rawFields = body?.fields;
  const { patch, additionalLocations } = parseAgentOrganizationFields(rawFields);

  if (Object.prototype.hasOwnProperty.call(rawFields || {}, 'location') && patch.location) {
    patch.location = await resolveCityForOrgField(patch.location);
  }

  const updatePayload = { ...patch };
  if (additionalLocations !== undefined) {
    updatePayload.additionalLocations = additionalLocations;
  }

  const updated = await organizationService.update(orgId, updatePayload, {
    actingUser: req?.agent?.name || 'Agent',
  });
  const updatedFields = Object.keys(patch);
  if (additionalLocations !== undefined) updatedFields.push('additionalLocations');

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: orgId,
    entityName: updated.name || before.name,
    description: `Agent updated ${updatedFields.length} field(s) on "${updated.name || before.name}"`,
    before,
    after: updated,
    trackedFields: updatedFields,
    metadata: { operation: 'update_fields', updatedFields },
  });

  return {
    operation: 'update_fields',
    updatedFields,
    data: await organizationService.getByIdForApi(orgId, { skipCache: true }),
  };
};

const addAdditionalLocation = async (orgId, body, req, before) => {
  assertOptimisticLock(before, body?.expectedUpdatedAt ?? body?.updatedAt);
  const description = String(body?.description || '').trim();
  const location = String(body?.location || '').trim();
  const address = body?.address != null ? String(body.address).trim() : null;
  if (!description && !location) {
    const err = new Error('description or location is required');
    err.status = 400;
    throw err;
  }
  const resolvedCity = location ? await resolveCityForOrgField(location) : '';

  const row = await OrganizationLocation.create({
    organizationId: orgId,
    description,
    location: resolvedCity,
    address: address || null,
    sortIndex: Number(body?.sortIndex) || 0,
  });

  const after = await Organization.findByPk(orgId, {
    include: [{ model: OrganizationLocation, as: 'additionalLocations' }],
  });

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: orgId,
    entityName: before.name,
    description: `Agent added additional location to "${before.name}"`,
    before,
    after,
    trackedFields: ['additionalLocations'],
    metadata: { operation: 'add_additional_location', locationId: row.id },
  });

  return {
    operation: 'add_additional_location',
    locationId: row.id,
    data: await organizationService.getByIdForApi(orgId, { skipCache: true }),
  };
};

const updateAdditionalLocation = async (orgId, body, req, before) => {
  assertOptimisticLock(before, body?.expectedUpdatedAt ?? body?.updatedAt);
  const locationId = assertUuid(body?.locationId, 'locationId');
  const row = await OrganizationLocation.findOne({ where: { id: locationId, organizationId: orgId } });
  if (!row) {
    const err = new Error('Additional location not found');
    err.status = 404;
    err.code = 'LOCATION_NOT_FOUND';
    throw err;
  }

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(body, 'description')) {
    updates.description = String(body.description || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, 'location')) {
    updates.location = body.location == null ? '' : await resolveCityForOrgField(body.location);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'address')) {
    updates.address = body.address == null ? null : String(body.address).trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'sortIndex')) {
    updates.sortIndex = Number(body.sortIndex) || 0;
  }

  await row.update(updates);
  organizationService.invalidateOrgApiCache(orgId);

  const after = await Organization.findByPk(orgId, {
    include: [{ model: OrganizationLocation, as: 'additionalLocations' }],
  });

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: orgId,
    entityName: before.name,
    description: `Agent updated additional location on "${before.name}"`,
    before,
    after,
    trackedFields: ['additionalLocations'],
    metadata: { operation: 'update_additional_location', locationId },
  });

  return {
    operation: 'update_additional_location',
    locationId,
    data: await organizationService.getByIdForApi(orgId, { skipCache: true }),
  };
};

const removeAdditionalLocation = async (orgId, body, req, before) => {
  assertOptimisticLock(before, body?.expectedUpdatedAt ?? body?.updatedAt);
  const locationId = assertUuid(body?.locationId, 'locationId');
  const deleted = await OrganizationLocation.destroy({ where: { id: locationId, organizationId: orgId } });
  if (!deleted) {
    const err = new Error('Additional location not found');
    err.status = 404;
    err.code = 'LOCATION_NOT_FOUND';
    throw err;
  }

  organizationService.invalidateOrgApiCache(orgId);
  const after = await Organization.findByPk(orgId, {
    include: [{ model: OrganizationLocation, as: 'additionalLocations' }],
  });

  await agentEntityAuditService.recordAgentEntityAudit(req, {
    action: 'update',
    entityType: 'Organization',
    entityId: orgId,
    entityName: before.name,
    description: `Agent removed additional location from "${before.name}"`,
    before,
    after,
    trackedFields: ['additionalLocations'],
    metadata: { operation: 'remove_additional_location', locationId },
  });

  return {
    operation: 'remove_additional_location',
    locationId,
    data: await organizationService.getByIdForApi(orgId, { skipCache: true }),
  };
};

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

  if (operation === 'update_fields') {
    return updateOrganizationFields(safeId, body, req, before);
  }

  if (operation === 'add_additional_location') {
    return addAdditionalLocation(safeId, body, req, before);
  }

  if (operation === 'update_additional_location') {
    return updateAdditionalLocation(safeId, body, req, before);
  }

  if (operation === 'remove_additional_location') {
    return removeAdditionalLocation(safeId, body, req, before);
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
  listOrganizationDuplicates,
  getOrganization,
  createOrganization,
  enrichOrganization,
  mergeOrganizations,
  executeOrganization,
  patchStagingCompanyForDecision,
};
