const { Op } = require('sequelize');
const MatchingEngineConfig = require('../models/MatchingEngineConfig');

/**
 * Preset CRUD + global row (`getConfig` / `updateConfig` / `createPreset` / …) only touch `matching_engine_configs`.
 * They do not read or write `client_usage_settings`.
 *
 * The only link to `client_usage_settings` here is a **read** in `findMatchingPresetRowForJob` (used by
 * `resolveEngineConfigForJob` at scoring time) for `matching_engine_preset_id` — not invoked by admin save routes.
 */

const GLOBAL_KEY = 'global';

const DEFAULT_CONFIG = {
  mainWeights: { vector: 20, tags: 35, geo: 20, experience: 15, intent: 10 },
  intentWeights: { exact: 100, role: 80, cluster: 50, category: 20, different: 0 },
  tagWeights: {
    role: 100, seniority: 80, skill: 70, tool: 60,
    industry: 50, education: 40, language: 30, soft_skill: 20, certification: 20,
  },
  sourceWeights: { recruiter: 100, candidate: 70, ai: 50 },
  geoRegions: {
    center:    { grace: 15, penaltyPerKm: 2   },
    shfela:    { grace: 20, penaltyPerKm: 1.5 },
    jerusalem: { grace: 20, penaltyPerKm: 1.5 },
    north:     { grace: 30, penaltyPerKm: 1   },
    south:     { grace: 30, penaltyPerKm: 1   },
  },
  missingGeoScore:     50,
  missingSalaryScore:  0,
  salaryDiffThreshold: 10,
  salaryPenalty:       5,
  ageGapPenalty:       2,
  isExperienceEnabled: true,
};

// ── Global config ─────────────────────────────────────────────────────────────

async function getConfig() {
  let row = await MatchingEngineConfig.findOne({ where: { configKey: GLOBAL_KEY } });
  if (!row) {
    row = await MatchingEngineConfig.create({
      configKey: GLOBAL_KEY,
      type: 'global',
      config: DEFAULT_CONFIG,
    });
  }
  return row.config;
}

async function updateConfig(incoming) {
  const [row, created] = await MatchingEngineConfig.findOrCreate({
    where: { configKey: GLOBAL_KEY },
    defaults: { type: 'global', config: DEFAULT_CONFIG },
  });
  row.config = { ...(created ? DEFAULT_CONFIG : row.config), ...incoming };
  await row.save();
  return row.config;
}

// ── Presets ───────────────────────────────────────────────────────────────────

async function listPresets() {
  const rows = await MatchingEngineConfig.findAll({
    where: { type: 'preset' },
    order: [['created_at', 'ASC']],
  });
  return rows.map(serializePreset);
}

/** Presets whose `clientIds` lists this client UUID (string match). */
async function listPresetsForClientId(clientId) {
  const cid = String(clientId || '').trim();
  if (!cid) return [];
  const rows = await MatchingEngineConfig.findAll({
    where: { type: 'preset' },
    order: [['created_at', 'ASC']],
  });
  return rows
    .filter((row) => {
      const ids = Array.isArray(row.clientIds) ? row.clientIds.map(String) : [];
      return ids.includes(cid);
    })
    .map(serializePreset);
}

async function getPreset(id) {
  const row = await MatchingEngineConfig.findOne({
    where: { id, type: 'preset' },
  });
  if (!row) return null;
  return serializePreset(row);
}

async function createPreset({ label, description, clientIds = [], config }) {
  const configKey = `preset_${Date.now()}`;
  const row = await MatchingEngineConfig.create({
    configKey,
    type: 'preset',
    label: label || configKey,
    description: description || '',
    clientIds,
    config: config || {},
  });
  return serializePreset(row);
}

async function updatePreset(id, { label, description, clientIds, config } = {}) {
  const row = await MatchingEngineConfig.findOne({ where: { id, type: 'preset' } });
  if (!row) return null;
  if (label       !== undefined) row.label       = label;
  if (description !== undefined) row.description = description;
  if (clientIds   !== undefined) row.clientIds   = clientIds;
  if (config      !== undefined) row.config      = config;
  await row.save();
  return serializePreset(row);
}

async function deletePreset(id) {
  const deleted = await MatchingEngineConfig.destroy({
    where: { id, type: 'preset' },
  });
  return deleted > 0;
}

function serializePreset(row) {
  return {
    id:          row.id,
    configKey:   row.configKey,
    label:       row.label,
    description: row.description,
    clientIds:   row.clientIds || [],
    config:      row.config,
    createdAt:   row.createdAt,
  };
}

/** Deep-enough merge for preset overrides on top of global engine config */
function mergeEngineConfig(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = {
    ...base,
    ...patch,
    mainWeights: { ...(base.mainWeights || {}), ...(patch.mainWeights || {}) },
    intentWeights: { ...(base.intentWeights || {}), ...(patch.intentWeights || {}) },
    sourceWeights: { ...(base.sourceWeights || {}), ...(patch.sourceWeights || {}) },
    geoRegions: { ...(base.geoRegions || {}), ...(patch.geoRegions || {}) },
  };
  if (patch.tagWeights !== undefined) {
    out.tagWeights = Array.isArray(patch.tagWeights)
      ? patch.tagWeights
      : { ...(typeof base.tagWeights === 'object' && base.tagWeights && !Array.isArray(base.tagWeights) ? base.tagWeights : {}), ...patch.tagWeights };
  }
  return out;
}

/**
 * Matching preset whose clientIds contains this job's client UUID (resolved from Job.client name).
 * Jobs only store client display name today — we match Client.name / displayName case-insensitively.
 *
 * Reads `client_usage_settings.matching_engine_preset_id` when set (tenant choice from Company Settings).
 * Does not write to that table.
 */
async function findMatchingPresetRowForJob(jobPlain) {
  const name = String(jobPlain?.client || '').trim();
  if (!name) return null;

  const Client = require('../models/Client');
  const ClientUsageSetting = require('../models/ClientUsageSetting');
  const client = await Client.findOne({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: name } },
        { displayName: { [Op.iLike]: name } },
      ],
    },
  });
  if (!client?.id) return null;

  const cid = String(client.id);

  try {
    const usage = await ClientUsageSetting.findByPk(cid, { attributes: ['matchingEnginePresetId'] });
    const pid = usage?.matchingEnginePresetId;
    if (pid != null && Number.isFinite(Number(pid))) {
      const chosen = await MatchingEngineConfig.findOne({
        where: { id: Number(pid), type: 'preset' },
      });
      if (chosen) {
        const ids = Array.isArray(chosen.clientIds) ? chosen.clientIds.map(String) : [];
        if (ids.includes(cid)) return chosen;
      }
    }
  } catch (e) {
    console.warn('[matchingEngineService] client usage preset lookup', e.message || e);
  }

  const presets = await MatchingEngineConfig.findAll({
    where: { type: 'preset' },
    order: [['id', 'ASC']],
  });

  for (const p of presets) {
    const ids = Array.isArray(p.clientIds) ? p.clientIds.map(String) : [];
    if (ids.includes(cid)) return p;
  }
  return null;
}

/** Global row + optional preset override when job client UUID is listed on a preset */
async function resolveEngineConfigForJob(jobPlain) {
  const globalCfg = await getConfig();
  try {
    const presetRow = await findMatchingPresetRowForJob(jobPlain);
    if (presetRow?.config && typeof presetRow.config === 'object' && Object.keys(presetRow.config).length) {
      return mergeEngineConfig(globalCfg, presetRow.config);
    }
  } catch (e) {
    console.warn('[matchingEngineService] resolveEngineConfigForJob', e.message || e);
  }
  return globalCfg;
}

module.exports = {
  getConfig,
  updateConfig,
  listPresets,
  listPresetsForClientId,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  resolveEngineConfigForJob,
};
