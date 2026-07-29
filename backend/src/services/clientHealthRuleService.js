const { Op } = require('sequelize');
const ClientHealthRule = require('../models/ClientHealthRule');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const ClientPipeline = require('../models/ClientPipeline');
const clientPipelineService = require('./clientPipelineService');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val.trim());
}

const ALLOWED_COLORS = new Set(['green', 'yellow', 'red', 'blue', 'purple', 'orange', 'gray']);
const ALLOWED_CONDITIONS = new Set([
  'days_since_contact',
  'active_placements',
  'open_opportunities',
  'no_future_activity',
]);
const ALLOWED_OPERATORS = new Set(['gt', 'lt', 'eq', 'is_true', 'is_false']);

/** Default pulse rules seeded when a scope has none. */
const DEFAULT_RULES = [
  { color: 'red', condition: 'days_since_contact', operator: 'gt', value: 30, enabled: true },
  { color: 'orange', condition: 'days_since_contact', operator: 'gt', value: 14, enabled: true },
  { color: 'orange', condition: 'no_future_activity', operator: 'is_true', value: 0, enabled: true },
  { color: 'green', condition: 'days_since_contact', operator: 'lt', value: 14, enabled: true },
];

function normalizeOrganizationId(raw) {
  if (raw == null || raw === '' || raw === 'null') return null;
  const id = String(raw).trim();
  if (!isUuid(id)) {
    const err = new Error('Invalid organizationId');
    err.status = 400;
    throw err;
  }
  return id;
}

function normalizePipelineId(raw) {
  if (raw == null || raw === '' || raw === 'null') return null;
  const id = String(raw).trim();
  if (!isUuid(id)) {
    const err = new Error('Invalid pipelineId');
    err.status = 400;
    throw err;
  }
  return id;
}

function ruleToDto(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    clientId: plain.clientId,
    organizationId: plain.organizationId || null,
    pipelineId: plain.pipelineId || null,
    color: plain.color,
    condition: plain.condition,
    operator: plain.operator,
    value: Number(plain.value) || 0,
    enabled: Boolean(plain.enabled),
    sortIndex: plain.sortIndex,
  };
}

function scopeWhere(clientId, organizationId, pipelineId) {
  const where = { clientId };
  if (organizationId) {
    where.organizationId = organizationId;
  } else {
    where.organizationId = { [Op.is]: null };
  }
  if (pipelineId) {
    where.pipelineId = pipelineId;
  } else {
    where.pipelineId = { [Op.is]: null };
  }
  return where;
}

async function assertOrgLinkedToClient(clientId, organizationId) {
  if (!organizationId) return;
  const link = await ClientOrganizationLink.findOne({
    where: { clientId, organizationId },
  });
  if (!link) {
    const err = new Error('Organization is not linked to this client');
    err.status = 400;
    throw err;
  }
}

async function assertPipelineBelongsToClient(clientId, pipelineId) {
  if (!pipelineId) {
    const err = new Error('pipelineId is required');
    err.status = 400;
    throw err;
  }
  const pipeline = await ClientPipeline.findOne({
    where: { id: pipelineId, clientId },
  });
  if (!pipeline) {
    const err = new Error('Pipeline not found for this client');
    err.status = 400;
    throw err;
  }
  return pipeline;
}

/**
 * Resolve which pipeline to use for pulse when caller omits pipelineId.
 * Prefer first seeded/sorted pipeline for the client.
 */
async function resolveDefaultPipelineId(clientId) {
  const pipelines = await clientPipelineService.listOrSeedByClientId(clientId);
  return pipelines[0]?.id || null;
}

async function listByScope(clientId, organizationId = null, pipelineId = null) {
  const rows = await ClientHealthRule.findAll({
    where: scopeWhere(clientId, organizationId, pipelineId),
    order: [
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  return rows.map(ruleToDto);
}

async function seedDefaults(clientId, organizationId, pipelineId, transaction) {
  const created = [];
  for (let i = 0; i < DEFAULT_RULES.length; i += 1) {
    const def = DEFAULT_RULES[i];
    const row = await ClientHealthRule.create(
      {
        clientId,
        organizationId: organizationId || null,
        pipelineId: pipelineId || null,
        color: def.color,
        condition: def.condition,
        operator: def.operator,
        value: def.value,
        enabled: def.enabled,
        sortIndex: i,
      },
      { transaction },
    );
    created.push(ruleToDto(row));
  }
  return created;
}

/**
 * List rules for client + org + pipeline. Seeds defaults when empty.
 * Legacy rows (pipeline_id NULL) are migrated onto the requested pipeline once.
 */
async function listOrSeedByScope(clientId, organizationIdRaw = null, pipelineIdRaw = null) {
  const organizationId = normalizeOrganizationId(organizationIdRaw);
  let pipelineId = normalizePipelineId(pipelineIdRaw);
  await assertOrgLinkedToClient(clientId, organizationId);

  if (!pipelineId) {
    pipelineId = await resolveDefaultPipelineId(clientId);
  }
  if (!pipelineId) {
    const err = new Error('No pipelines defined for this client');
    err.status = 400;
    throw err;
  }
  await assertPipelineBelongsToClient(clientId, pipelineId);

  const existing = await listByScope(clientId, organizationId, pipelineId);
  if (existing.length > 0) return existing;

  const { sequelize } = require('../config/db');
  return sequelize.transaction(async (transaction) => {
    const again = await ClientHealthRule.findAll({
      where: scopeWhere(clientId, organizationId, pipelineId),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (again.length > 0) return again.map(ruleToDto);

    // One-time migrate legacy rules (no pipeline) onto this pipeline.
    const legacy = await ClientHealthRule.findAll({
      where: scopeWhere(clientId, organizationId, null),
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (legacy.length > 0) {
      await ClientHealthRule.update(
        { pipelineId },
        {
          where: scopeWhere(clientId, organizationId, null),
          transaction,
        },
      );
      const migrated = await ClientHealthRule.findAll({
        where: scopeWhere(clientId, organizationId, pipelineId),
        order: [
          ['sortIndex', 'ASC'],
          ['createdAt', 'ASC'],
        ],
        transaction,
      });
      return migrated.map(ruleToDto);
    }

    return seedDefaults(clientId, organizationId, pipelineId, transaction);
  });
}

function sanitizeIncomingRule(raw, sortIndex) {
  const color = String(raw.color || 'gray');
  const condition = String(raw.condition || '');
  let operator = String(raw.operator || 'gt');
  const value = Math.max(0, parseInt(raw.value, 10) || 0);
  const enabled = raw.enabled !== false && raw.enabled !== 'false';

  if (!ALLOWED_COLORS.has(color)) {
    const err = new Error(`Invalid color: ${color}`);
    err.status = 400;
    throw err;
  }
  if (!ALLOWED_CONDITIONS.has(condition)) {
    const err = new Error(`Invalid condition: ${condition}`);
    err.status = 400;
    throw err;
  }
  if (condition === 'no_future_activity') {
    operator = 'is_true';
  }
  if (!ALLOWED_OPERATORS.has(operator)) {
    const err = new Error(`Invalid operator: ${operator}`);
    err.status = 400;
    throw err;
  }

  const out = {
    color,
    condition,
    operator,
    value,
    enabled,
    sortIndex,
  };
  if (raw.id && isUuid(String(raw.id))) {
    out.id = String(raw.id).trim();
  }
  return out;
}

/**
 * Replace all rules for a client (+ optional org) + pipeline scope.
 */
async function syncHealthRules(clientId, organizationIdRaw, incomingRules, pipelineIdRaw = null) {
  const organizationId = normalizeOrganizationId(organizationIdRaw);
  const pipelineId = normalizePipelineId(pipelineIdRaw);
  await assertOrgLinkedToClient(clientId, organizationId);
  await assertPipelineBelongsToClient(clientId, pipelineId);

  if (!Array.isArray(incomingRules)) {
    const err = new Error('rules must be an array');
    err.status = 400;
    throw err;
  }

  const sanitized = incomingRules.map((r, i) => sanitizeIncomingRule(r || {}, i));

  const { sequelize } = require('../config/db');
  return sequelize.transaction(async (transaction) => {
    await ClientHealthRule.destroy({
      where: scopeWhere(clientId, organizationId, pipelineId),
      transaction,
    });

    const created = [];
    for (const rule of sanitized) {
      const row = await ClientHealthRule.create(
        {
          ...(rule.id ? { id: rule.id } : {}),
          clientId,
          organizationId: organizationId || null,
          pipelineId,
          color: rule.color,
          condition: rule.condition,
          operator: rule.operator,
          value: rule.value,
          enabled: rule.enabled,
          sortIndex: rule.sortIndex,
        },
        { transaction },
      );
      created.push(ruleToDto(row));
    }
    return created;
  });
}

module.exports = {
  listOrSeedByScope,
  syncHealthRules,
  resolveDefaultPipelineId,
  DEFAULT_RULES,
};
