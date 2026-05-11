const { Op } = require('sequelize');
const MatchingEngineConfig = require('../models/MatchingEngineConfig');

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

module.exports = { getConfig, updateConfig, listPresets, getPreset, createPreset, updatePreset, deletePreset };
