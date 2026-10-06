const { Op } = require('sequelize');
const TagAiDecision = require('../models/TagAiDecision');
const OrganizationAiDecision = require('../models/OrganizationAiDecision');
const OrganizationTmp = require('../models/OrganizationTmp');
const aiDecisionAuditService = require('./aiDecisionAuditService');
const tagAiDecisionResolveService = require('./tagAiDecisionResolveService');
const tagCorrectionAgentService = require('./tagCorrectionAgentService');
const organizationAiDecisionController = require('../controllers/organizationAiDecisionController');
const organizationService = require('./organizationService');
const {
  TAG_PUBLIC_FIELDS,
  TAG_AGENT_READ_FIELDS,
  ORG_PUBLIC_FIELDS,
  toPublicTagAiDecisionDto,
  toTagAiDecisionCandidatesDto,
  toPublicOrganizationAiDecisionDto,
  toStagingCompanyFieldGroupsDto,
  parseAgentPatchDto,
  parseExpectedUpdatedAt,
  toAgentPatchResponseDto,
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
  return { page, limit, offset: (page - 1) * limit };
};

const parseBoolQuery = (raw) => {
  if (raw == null || raw === '') return null;
  const s = String(raw).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return null;
};

const applyDateRangeFilter = (where, query = {}) => {
  const dateFrom = String(query.dateFrom || '').trim();
  const dateTo = String(query.dateTo || '').trim();
  const date = String(query.date || '').trim();

  if (dateFrom || dateTo) {
    const cond = {};
    if (dateFrom) cond[Op.gte] = new Date(`${dateFrom}T00:00:00.000Z`);
    if (dateTo) cond[Op.lte] = new Date(`${dateTo}T23:59:59.999Z`);
    where.createdAt = cond;
    return;
  }

  if (date) {
    where.createdAt = {
      [Op.gte]: new Date(`${date}T00:00:00.000Z`),
      [Op.lt]: new Date(`${date}T23:59:59.999Z`),
    };
  }
};

const buildSharedListFilters = (query = {}) => {
  const parts = [];

  if (query.reviewStatus && query.reviewStatus !== 'all') {
    parts.push({ reviewStatus: String(query.reviewStatus).trim() });
  }
  if (query.manualApprovalStatus && query.manualApprovalStatus !== 'all') {
    parts.push({ manualApprovalStatus: String(query.manualApprovalStatus).trim() });
  }
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    parts.push({ manualApprovalStatus: String(query.approvalStatus).trim() });
  }
  if (query.decision && query.decision !== 'all') {
    parts.push({ aiDecision: String(query.decision).trim() });
  }

  const agentVerdict = String(query.agentVerdict || '').trim();
  if (agentVerdict) {
    parts.push({ agentVerdict: { [Op.iLike]: `%${agentVerdict}%` } });
  }

  const hasAgentVerdict = parseBoolQuery(query.hasAgentVerdict);
  if (hasAgentVerdict === true) {
    parts.push({
      agentVerdict: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
    });
  } else if (hasAgentVerdict === false) {
    parts.push({ [Op.or]: [{ agentVerdict: null }, { agentVerdict: '' }] });
  }

  const datePart = {};
  applyDateRangeFilter(datePart, query);
  if (Object.keys(datePart).length) {
    parts.push(datePart);
  }

  return parts;
};

const mergeWhere = (parts = []) => (parts.length ? { [Op.and]: parts } : {});

const enrichOrganizationDecisionDto = async (row) => {
  const dto = toPublicOrganizationAiDecisionDto(row);
  if (!dto.organizationId && dto.originalTerm) {
    dto.organizationId = await organizationService.resolveOrganizationIdForTerm(dto.originalTerm);
  }
  return dto;
};

const invokeControllerJson = async (handler, req) => {
  let statusCode = 200;
  let payload;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  await handler(req, res);
  if (statusCode >= 400) {
    const err = new Error(payload?.message || 'Request failed');
    err.status = statusCode;
    throw err;
  }
  return payload;
};

const listTagAiDecisions = async (query = {}) => {
  const { page, limit, offset } = clampPagination(query);
  const parts = buildSharedListFilters(query);

  const search = String(query.search || '').trim();
  if (search.length > 2) {
    parts.push({ originalTerm: { [Op.iLike]: `%${search}%` } });
  }
  if (query.type && query.type !== 'all') {
    const dbTypes = query.type === 'education' ? ['degree', 'education'] : [String(query.type).trim()];
    parts.push({ detectedType: { [Op.in]: dbTypes } });
  }

  const where = mergeWhere(parts);

  const { rows, count } = await TagAiDecision.findAndCountAll({
    where,
    attributes: TAG_AGENT_READ_FIELDS,
    order: [['createdAt', query.sortOrder === 'asc' ? 'ASC' : 'DESC']],
    limit,
    offset,
  });

  return {
    data: rows.map(toPublicTagAiDecisionDto),
    total: count,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(count / limit)),
  };
};

const getTagAiDecision = async (id) => {
  const safeId = assertUuid(id);
  const row = await TagAiDecision.findByPk(safeId, { attributes: TAG_AGENT_READ_FIELDS });
  if (!row) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }
  return toPublicTagAiDecisionDto(row);
};

const getTagAiDecisionCandidates = async (id) => {
  const safeId = assertUuid(id);
  const row = await TagAiDecision.findByPk(safeId, {
    attributes: ['id', 'originalTerm', 'candidateTagsSnapshot'],
  });
  if (!row) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }
  return toTagAiDecisionCandidatesDto(row);
};

const patchTagAiDecision = async (id, body, req = null) => {
  const safeId = assertUuid(id);
  const patch = parseAgentPatchDto(body);
  const expectedUpdatedAt = parseExpectedUpdatedAt(body?.expectedUpdatedAt ?? body?.updatedAt);

  const decision = await TagAiDecision.findByPk(safeId);
  if (!decision) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }

  assertOptimisticLock(decision, expectedUpdatedAt);

  const before = decision.get({ plain: true });
  await decision.update(patch);
  await decision.reload();
  await aiDecisionAuditService.recordTagDecisionAudit(req, before, decision, { actor: 'agent' });

  return {
    ...toAgentPatchResponseDto(decision.get({ plain: true })),
    updatedAt: decision.updatedAt,
  };
};

const listOrganizationAiDecisions = async (query = {}) => {
  const { page, limit, offset } = clampPagination(query);
  const parts = buildSharedListFilters(query);

  const search = String(query.search || '').trim();
  if (search.length > 2) {
    parts.push({
      [Op.or]: [
        { originalTerm: { [Op.iLike]: `%${search}%` } },
        { aiSuggestedTarget: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  const where = mergeWhere(parts);

  const { rows, count } = await OrganizationAiDecision.findAndCountAll({
    where,
    attributes: ORG_PUBLIC_FIELDS,
    order: [['createdAt', query.sortOrder === 'asc' ? 'ASC' : 'DESC']],
    limit,
    offset,
  });

  const data = await Promise.all(rows.map(enrichOrganizationDecisionDto));
  return {
    data,
    total: count,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(count / limit)),
  };
};

const getOrganizationAiDecision = async (id) => {
  const safeId = assertUuid(id);
  const row = await OrganizationAiDecision.findByPk(safeId, {
    attributes: [...ORG_PUBLIC_FIELDS, 'organizationTmpId'],
    include: [
      {
        model: OrganizationTmp,
        as: 'organizationTmp',
        required: false,
      },
    ],
  });
  if (!row) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }
  const base = await enrichOrganizationDecisionDto(row);
  return {
    ...base,
    stagingCompany: toStagingCompanyFieldGroupsDto(row.organizationTmp || null),
  };
};

const patchOrganizationAiDecision = async (id, body, req = null) => {
  const safeId = assertUuid(id);
  const patch = parseAgentPatchDto(body);
  const expectedUpdatedAt = parseExpectedUpdatedAt(body?.expectedUpdatedAt ?? body?.updatedAt);

  const decision = await OrganizationAiDecision.findByPk(safeId);
  if (!decision) {
    const err = new Error('Decision not found');
    err.status = 404;
    throw err;
  }

  assertOptimisticLock(decision, expectedUpdatedAt);

  const before = decision.get({ plain: true });
  await decision.update(patch);
  await decision.reload();
  await aiDecisionAuditService.recordOrgDecisionAudit(req, before, decision, { actor: 'agent' });

  return {
    ...toAgentPatchResponseDto(decision.get({ plain: true })),
    updatedAt: decision.updatedAt,
  };
};

const EXECUTE_OPERATIONS = new Set(['resolve', 'approve', 'comments', 'fields']);

const parseExecuteOperation = (body) => {
  const operation = String(body?.operation || '').trim();
  if (!EXECUTE_OPERATIONS.has(operation)) {
    const err = new Error(`Invalid operation. Allowed: ${[...EXECUTE_OPERATIONS].join(', ')}`);
    err.status = 400;
    throw err;
  }
  return operation;
};

const executeTagAiDecision = async (id, body, req = null) => {
  const safeId = assertUuid(id);
  const operation = parseExecuteOperation(body);

  if (operation === 'resolve') {
    const action = String(body?.action || '').trim();
    if (!action) {
      const err = new Error('action is required for resolve');
      err.status = 400;
      throw err;
    }
    const { resolvePendingTags } = require('../controllers/tagController');
    return tagAiDecisionResolveService.applyReviewerActions(
      {
        decisionIds: [safeId],
        action,
        targetTagId: body?.targetTagId,
        aliasPriority: body?.aliasPriority,
        req,
      },
      resolvePendingTags,
    );
  }

  if (operation === 'approve') {
    return tagCorrectionAgentService.setApprovalStatus(safeId, body?.status || 'approved', req);
  }

  if (operation === 'comments') {
    return tagCorrectionAgentService.setComments(safeId, body?.comments, req);
  }

  const fields = {};
  for (const key of ['comments', 'agentNotes', 'agentVerdict']) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
      fields[key] = body[key];
    }
  }
  return tagCorrectionAgentService.setDecisionFields(safeId, fields, req);
};

const executeOrganizationAiDecision = async (id, body, req = null) => {
  const safeId = assertUuid(id);
  const operation = parseExecuteOperation(body);
  const controllerReq = {
    ...req,
    params: { ...(req?.params || {}), id: safeId },
    body: { ...(body || {}) },
  };

  if (operation === 'resolve') {
    return invokeControllerJson(organizationAiDecisionController.resolve, controllerReq);
  }
  if (operation === 'approve') {
    return invokeControllerJson(organizationAiDecisionController.approve, controllerReq);
  }
  if (operation === 'comments') {
    return invokeControllerJson(organizationAiDecisionController.updateComments, controllerReq);
  }

  const fields = {};
  for (const key of ['comments', 'agentNotes', 'agentVerdict']) {
    if (Object.prototype.hasOwnProperty.call(body || {}, key)) {
      fields[key] = body[key];
    }
  }
  controllerReq.body = fields;
  return invokeControllerJson(organizationAiDecisionController.updateDecisionFields, controllerReq);
};

module.exports = {
  listTagAiDecisions,
  getTagAiDecision,
  getTagAiDecisionCandidates,
  patchTagAiDecision,
  executeTagAiDecision,
  listOrganizationAiDecisions,
  getOrganizationAiDecision,
  patchOrganizationAiDecision,
  executeOrganizationAiDecision,
};
