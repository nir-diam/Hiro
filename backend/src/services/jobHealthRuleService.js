const { Op } = require('sequelize');
const JobHealthRule = require('../models/JobHealthRule');
const JobHealthSetting = require('../models/JobHealthSetting');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(val) {
  return typeof val === 'string' && UUID_RE.test(val.trim());
}

const PROFILE_IDS = ['standard', 'high_volume', 'executive'];
const ALLOWED_COLORS = new Set(['green', 'yellow', 'red', 'blue', 'purple', 'orange', 'gray']);
const ALLOWED_CONDITIONS = new Set([
  'candidates_total',
  'candidates_at_stage',
  'time_in_stage',
  'days_since_contact',
  'disqualification_rate',
  'days_open',
]);
const ALLOWED_OPERATORS = new Set(['gt', 'lt', 'eq', 'between']);

const DEFAULT_PROFILES = {
  standard: [
    { color: 'red', condition: 'time_in_stage', stage: 'הועבר למנהל', operator: 'gt', value: 4, enabled: true },
    { color: 'orange', condition: 'days_since_contact', operator: 'gt', value: 7, enabled: true },
    { color: 'yellow', condition: 'candidates_total', operator: 'lt', value: 5, enabled: true },
  ],
  high_volume: [
    { color: 'red', condition: 'candidates_at_stage', stage: 'חדש', operator: 'gt', value: 50, enabled: true },
    { color: 'red', condition: 'time_in_stage', stage: 'חדש', operator: 'gt', value: 2, enabled: true },
    { color: 'orange', condition: 'candidates_total', operator: 'lt', value: 20, enabled: true },
  ],
  executive: [
    { color: 'red', condition: 'days_since_contact', operator: 'gt', value: 3, enabled: true },
    { color: 'orange', condition: 'days_open', operator: 'gt', value: 60, enabled: true },
  ],
};

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

function scopeWhere(clientId, organizationId) {
  if (organizationId) return { clientId, organizationId };
  return { clientId, organizationId: { [Op.is]: null } };
}

async function assertOrgLinkedToClient(clientId, organizationId) {
  if (!organizationId) return;
  const link = await ClientOrganizationLink.findOne({ where: { clientId, organizationId } });
  if (!link) {
    const err = new Error('Organization is not linked to this client');
    err.status = 400;
    throw err;
  }
}

function ruleToDto(row) {
  const plain = row.toJSON ? row.toJSON() : row;
  return {
    id: plain.id,
    clientId: plain.clientId,
    organizationId: plain.organizationId || null,
    profileId: plain.profileId,
    color: plain.color,
    condition: plain.condition,
    operator: plain.operator,
    value: Number(plain.value) || 0,
    maxValue: plain.maxValue != null ? Number(plain.maxValue) : undefined,
    stage: plain.stage || undefined,
    enabled: Boolean(plain.enabled),
    sortIndex: plain.sortIndex,
  };
}

function emptyProfiles() {
  return { standard: [], high_volume: [], executive: [] };
}

async function getIsActive(clientId, organizationId) {
  const row = await JobHealthSetting.findOne({ where: scopeWhere(clientId, organizationId) });
  return row ? Boolean(row.isActive) : true;
}

async function setIsActive(clientId, organizationId, isActive, transaction) {
  const where = scopeWhere(clientId, organizationId);
  const existing = await JobHealthSetting.findOne({ where, transaction });
  if (existing) {
    await existing.update({ isActive: Boolean(isActive) }, { transaction });
    return;
  }
  await JobHealthSetting.create(
    {
      clientId,
      organizationId: organizationId || null,
      isActive: Boolean(isActive),
    },
    { transaction },
  );
}

async function listProfiles(clientId, organizationId) {
  const rows = await JobHealthRule.findAll({
    where: scopeWhere(clientId, organizationId),
    order: [
      ['profileId', 'ASC'],
      ['sortIndex', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });
  const profiles = emptyProfiles();
  for (const row of rows) {
    const dto = ruleToDto(row);
    if (profiles[dto.profileId]) profiles[dto.profileId].push(dto);
  }
  return profiles;
}

/** Returns profiles if any rules exist for scope; otherwise null (no seed). */
async function listProfilesOnly(clientId, organizationId = null) {
  const profiles = await listProfiles(clientId, organizationId);
  const hasAny = PROFILE_IDS.some((p) => (profiles[p] || []).length > 0);
  return hasAny ? profiles : null;
}

async function seedDefaults(clientId, organizationId, transaction) {
  const profiles = emptyProfiles();
  for (const profileId of PROFILE_IDS) {
    const defs = DEFAULT_PROFILES[profileId] || [];
    for (let i = 0; i < defs.length; i += 1) {
      const def = defs[i];
      const row = await JobHealthRule.create(
        {
          clientId,
          organizationId: organizationId || null,
          profileId,
          color: def.color,
          condition: def.condition,
          operator: def.operator,
          value: def.value,
          maxValue: def.maxValue ?? null,
          stage: def.stage || null,
          enabled: def.enabled !== false,
          sortIndex: i,
        },
        { transaction },
      );
      profiles[profileId].push(ruleToDto(row));
    }
  }
  await setIsActive(clientId, organizationId, true, transaction);
  return profiles;
}

async function listOrSeedByScope(clientId, organizationIdRaw = null) {
  const organizationId = normalizeOrganizationId(organizationIdRaw);
  await assertOrgLinkedToClient(clientId, organizationId);

  const existing = await listProfiles(clientId, organizationId);
  const hasAny = PROFILE_IDS.some((p) => (existing[p] || []).length > 0);
  if (hasAny) {
    const isSystemActive = await getIsActive(clientId, organizationId);
    return { isSystemActive, profiles: existing };
  }

  const { sequelize } = require('../config/db');
  const profiles = await sequelize.transaction(async (transaction) => {
    const again = await JobHealthRule.findAll({
      where: scopeWhere(clientId, organizationId),
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (again.length > 0) return listProfiles(clientId, organizationId);
    return seedDefaults(clientId, organizationId, transaction);
  });
  return { isSystemActive: true, profiles };
}

function sanitizeRule(raw, profileId, sortIndex) {
  const color = String(raw.color || 'gray');
  const condition = String(raw.condition || '');
  const operator = String(raw.operator || 'gt');
  const value = Math.max(0, parseInt(raw.value, 10) || 0);
  const maxValue = raw.maxValue != null ? Math.max(0, parseInt(raw.maxValue, 10) || 0) : null;
  const stage = raw.stage ? String(raw.stage).trim() : null;
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
  if (!ALLOWED_OPERATORS.has(operator)) {
    const err = new Error(`Invalid operator: ${operator}`);
    err.status = 400;
    throw err;
  }

  const out = {
    profileId,
    color,
    condition,
    operator,
    value,
    maxValue,
    stage,
    enabled,
    sortIndex,
  };
  if (raw.id && isUuid(String(raw.id))) out.id = String(raw.id).trim();
  return out;
}

async function syncJobHealth(clientId, organizationIdRaw, payload) {
  const organizationId = normalizeOrganizationId(organizationIdRaw);
  await assertOrgLinkedToClient(clientId, organizationId);

  const incomingProfiles = payload?.profiles || {};
  const isSystemActive = payload?.isSystemActive !== false && payload?.isSystemActive !== 'false';

  const sanitized = [];
  for (const profileId of PROFILE_IDS) {
    const list = Array.isArray(incomingProfiles[profileId]) ? incomingProfiles[profileId] : [];
    list.forEach((r, i) => sanitized.push(sanitizeRule(r || {}, profileId, i)));
  }

  const { sequelize } = require('../config/db');
  return sequelize.transaction(async (transaction) => {
    await JobHealthRule.destroy({
      where: scopeWhere(clientId, organizationId),
      transaction,
    });
    await setIsActive(clientId, organizationId, isSystemActive, transaction);

    const profiles = emptyProfiles();
    for (const rule of sanitized) {
      const row = await JobHealthRule.create(
        {
          ...(rule.id ? { id: rule.id } : {}),
          clientId,
          organizationId: organizationId || null,
          profileId: rule.profileId,
          color: rule.color,
          condition: rule.condition,
          operator: rule.operator,
          value: rule.value,
          maxValue: rule.maxValue,
          stage: rule.stage,
          enabled: rule.enabled,
          sortIndex: rule.sortIndex,
        },
        { transaction },
      );
      profiles[rule.profileId].push(ruleToDto(row));
    }
    return { isSystemActive, profiles };
  });
}

module.exports = {
  PROFILE_IDS,
  listOrSeedByScope,
  listProfilesOnly,
  syncJobHealth,
  getIsActive,
  DEFAULT_PROFILES,
};
