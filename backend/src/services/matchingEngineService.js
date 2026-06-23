const { Op } = require('sequelize');
const MatchingEngineConfig = require('../models/MatchingEngineConfig');
const { invalidateAllMatchCaches } = require('./matchingCacheService');
const { DEFAULT_PENALTY_POLICIES } = require('./matchingPenaltyService');
const redisService = require('./redisService');
const { isRedisAvailable } = require('../config/redis');

const GLOBAL_KEY = 'global';

// ── In-process cache for global config — cleared when admin saves ──────────────
let _globalConfigCache = null;
let _globalConfigCacheAt = 0;
const GLOBAL_CONFIG_CACHE_MS = 30_000; // 30 s

// ── Redis cache TTLs ──────────────────────────────────────────────────────────
const ENGINE_CONFIG_CACHE_TTL = 300;   // 5 min — per-job resolved config
const engineConfigCacheKey = (jobId, tenantId) =>
  `engine-config:${jobId}:${tenantId || 'default'}`;

const DEFAULT_CONFIG = {
  mainWeights: { vector: 20, tags: 35, geo: 20, experience: 15, intent: 10 },
  intentWeights: { exact: 100, role: 80, cluster: 50, different: 0 },
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
  missingAgeScore:     6,
  isExperienceEnabled: true,
  /** Includes `availability` (job.availability vs candidates.availability) — see matchingPenaltyService. */
  penaltyPolicies:     DEFAULT_PENALTY_POLICIES,
};

// ── Global config ─────────────────────────────────────────────────────────────

/** Fill missing keys from DEFAULT_CONFIG (old JSON rows, partial presets). */
function normalizeEngineConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return mergeEngineConfig(DEFAULT_CONFIG, {});
  return mergeEngineConfig(DEFAULT_CONFIG, cfg);
}

async function getConfig() {
  const now = Date.now();
  if (_globalConfigCache && now - _globalConfigCacheAt < GLOBAL_CONFIG_CACHE_MS) {
    return _globalConfigCache;
  }
  let row = await MatchingEngineConfig.findOne({ where: { configKey: GLOBAL_KEY } });
  if (!row) {
    row = await MatchingEngineConfig.create({
      configKey: GLOBAL_KEY,
      type: 'global',
      config: DEFAULT_CONFIG,
    });
  }
  const cfg = normalizeEngineConfig(row.config);
  _globalConfigCache = cfg;
  _globalConfigCacheAt = now;
  return cfg;
}

async function updateConfig(incoming) {
  const [row, created] = await MatchingEngineConfig.findOrCreate({
    where: { configKey: GLOBAL_KEY },
    defaults: { type: 'global', config: DEFAULT_CONFIG },
  });
  const base = created ? DEFAULT_CONFIG : row.config;
  row.config = mergeEngineConfig(base, incoming || {});
  await row.save();
  // Bust in-process config cache
  _globalConfigCache = null;
  // All cached match scores are now stale — wipe every job:*:matches and candidate:*:opportunities
  invalidateAllMatchCaches().catch((e) =>
    console.warn('[matchingEngineService] Redis invalidation failed (non-fatal):', e.message),
  );
  return normalizeEngineConfig(row.config);
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
  // Preset config changed → all clients using this preset have stale scores
  invalidateAllMatchCaches().catch((e) =>
    console.warn('[matchingEngineService] Redis invalidation after updatePreset failed (non-fatal):', e.message),
  );
  return serializePreset(row);
}

async function deletePreset(id) {
  const deleted = await MatchingEngineConfig.destroy({
    where: { id, type: 'preset' },
  });
  if (deleted > 0) {
    // Clients that used this preset now fall back to global config → stale scores
    invalidateAllMatchCaches().catch((e) =>
      console.warn('[matchingEngineService] Redis invalidation after deletePreset failed (non-fatal):', e.message),
    );
  }
  return deleted > 0;
}

function serializePreset(row) {
  return {
    id:          row.id,
    configKey:   row.configKey,
    label:       row.label,
    description: row.description,
    clientIds:   row.clientIds || [],
    config:      normalizeEngineConfig(row.config),
    createdAt:   row.createdAt,
  };
}

/** Map legacy `category` → `cluster` so admin sliders match scoring. */
function normalizeIntentWeightsMap(iw) {
  if (!iw || typeof iw !== 'object' || Array.isArray(iw)) return iw;
  const out = { ...iw };
  if (out.cluster == null && out.category != null) {
    out.cluster = out.category;
  }
  delete out.category;
  return out;
}

/** Deep-enough merge for preset overrides on top of global engine config */
function mergeEngineConfig(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = {
    ...base,
    ...patch,
    mainWeights: { ...(base.mainWeights || {}), ...(patch.mainWeights || {}) },
    intentWeights: normalizeIntentWeightsMap({
      ...(base.intentWeights || {}),
      ...(patch.intentWeights || {}),
    }),
    tagWeights: {
      ...(typeof base.tagWeights === 'object' && base.tagWeights && !Array.isArray(base.tagWeights)
        ? base.tagWeights
        : {}),
      ...(patch.tagWeights && typeof patch.tagWeights === 'object' && !Array.isArray(patch.tagWeights)
        ? patch.tagWeights
        : {}),
    },
    sourceWeights: { ...(base.sourceWeights || {}), ...(patch.sourceWeights || {}) },
    geoRegions: { ...(base.geoRegions || {}), ...(patch.geoRegions || {}) },
    penaltyPolicies: {
      ...(base.penaltyPolicies || DEFAULT_PENALTY_POLICIES),
      ...(patch.penaltyPolicies || {}),
    },
  };
  for (const key of Object.keys(DEFAULT_PENALTY_POLICIES)) {
    out.penaltyPolicies[key] = {
      ...(base.penaltyPolicies?.[key] || DEFAULT_PENALTY_POLICIES[key]),
      ...(patch.penaltyPolicies?.[key] || {}),
    };
  }
  if (Array.isArray(patch.tagWeights)) {
    out.tagWeights = patch.tagWeights;
  }
  return out;
}

/**
 * Preset for a tenant client UUID.
 * When `client_usage_settings.matching_engine_preset_id` is set, that preset wins (Company Settings).
 * Otherwise legacy: first preset whose `clientIds` includes this client (lowest id).
 */
async function findPresetRowForClientId(clientId) {
  const cid = String(clientId || '').trim();
  if (!cid) return null;

  const ClientUsageSetting = require('../models/ClientUsageSetting');
  let usagePresetId = null;
  try {
    const usage = await ClientUsageSetting.findByPk(cid, { attributes: ['matchingEnginePresetId'] });
    if (usage?.matchingEnginePresetId != null && Number.isFinite(Number(usage.matchingEnginePresetId))) {
      usagePresetId = Number(usage.matchingEnginePresetId);
    }
  } catch (e) {
    console.warn('[matchingEngineService] client usage preset lookup', e.message || e);
  }

  if (usagePresetId != null) {
    const chosen = await MatchingEngineConfig.findOne({
      where: { id: usagePresetId, type: 'preset' },
    });
    if (chosen) {
      const ids = Array.isArray(chosen.clientIds) ? chosen.clientIds.map(String) : [];
      if (!ids.includes(cid)) {
        console.warn(
          `[matchingEngineService] matchingEnginePresetId=${usagePresetId} is not in preset clientIds for ${cid}; using preset anyway (explicit Company Settings choice)`,
        );
      }
      return chosen;
    }
    console.warn(
      `[matchingEngineService] matchingEnginePresetId=${usagePresetId} not found; using global config`,
    );
    return null;
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

/**
 * Resolve client UUID from job.client label (name / displayName).
 */
async function resolveClientIdFromJobLabel(jobPlain) {
  const name = String(jobPlain?.client || '').trim();
  if (!name) return null;
  const Client = require('../models/Client');
  const client = await Client.findOne({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: name } },
        { displayName: { [Op.iLike]: name } },
      ],
    },
  });
  return client?.id ? String(client.id) : null;
}

/**
 * Matching preset for scoring.
 * Logged-in tenant (`tenantClientId`) wins — Company Settings preset applies to their list/scores.
 * Otherwise resolve from job.client label.
 */
async function findMatchingPresetRowForJob(jobPlain, options = {}) {
  const tenantCid = options.tenantClientId ? String(options.tenantClientId).trim() : '';
  if (tenantCid) {
    return findPresetRowForClientId(tenantCid);
  }
  const jobCidOpt = options.jobClientId ? String(options.jobClientId).trim() : '';
  const jobCid = jobCidOpt || (await resolveClientIdFromJobLabel(jobPlain));
  if (!jobCid) return null;
  return findPresetRowForClientId(jobCid);
}

/**
 * Effective mainWeights for S_core.
 * Vector-only collapse to defaults applies only to global config — presets may intentionally use vector=100.
 */
function resolveMainWeights(mainWeights, options = {}) {
  const def = DEFAULT_CONFIG.mainWeights;
  if (!mainWeights || typeof mainWeights !== 'object') return { ...def };
  const vW = Number(mainWeights.vector) || 0;
  const tW = Number(mainWeights.tags) || 0;
  const gW = Number(mainWeights.geo) || 0;
  const eW = Number(mainWeights.experience) || 0;
  const iW = Number(mainWeights.intent) || 0;
  const total = vW + tW + gW + eW + iW;
  if (total <= 0) return { ...def };
  const others = tW + gW + eW + iW;
  if (!options.allowVectorOnly && vW >= 99 && others <= 0) {
    console.warn(
      '[matchingEngine] mainWeights are vector-only (100/0/0/0/0); using default balanced weights for scoring',
    );
    return { ...def };
  }
  return { vector: vW, tags: tW, geo: gW, experience: eW, intent: iW };
}

/**
 * Global row + optional preset override + per-job Redis weight sliders.
 * Priority (highest wins):
 *   job-specific Redis weights  >  client preset  >  global config
 */
async function resolveEngineConfigForJob(jobPlain, options = {}) {
  const jobId = jobPlain?.id != null ? String(jobPlain.id) : '';
  const tenantId = options.tenantClientId ? String(options.tenantClientId).trim() : '';

  // Redis cache — the resolved config rarely changes between requests
  if (jobId && isRedisAvailable()) {
    const cacheKey = engineConfigCacheKey(jobId, tenantId);
    const cached = await redisService.get(cacheKey);
    if (cached && typeof cached === 'object' && cached.mainWeights) return cached;
  }

  const globalCfg = normalizeEngineConfig(await getConfig());
  let merged = globalCfg;
  let presetRow = null;
  try {
    presetRow = await findMatchingPresetRowForJob(jobPlain, options);
    if (presetRow?.config && typeof presetRow.config === 'object' && Object.keys(presetRow.config).length) {
      merged = mergeEngineConfig(globalCfg, presetRow.config);
    }
  } catch (e) {
    console.warn('[matchingEngineService] resolveEngineConfigForJob', e.message || e);
  }

  // Merge per-job Redis weight sliders on top (highest priority)
  if (jobId) {
    try {
      const { getJobWeights } = require('./matchingCacheService');
      const jobWeights = await getJobWeights(jobId);
      if (jobWeights && typeof jobWeights === 'object' && Object.keys(jobWeights).length) {
        const weightPatch = {};
        if (jobWeights.semantic   != null) weightPatch.vector     = jobWeights.semantic;
        if (jobWeights.vector     != null) weightPatch.vector     = jobWeights.vector;
        if (jobWeights.geo        != null) weightPatch.geo        = jobWeights.geo;
        if (jobWeights.skills     != null) weightPatch.tags       = jobWeights.skills;
        if (jobWeights.tags       != null) weightPatch.tags       = jobWeights.tags;
        if (jobWeights.experience != null) weightPatch.experience = jobWeights.experience;
        if (jobWeights.intent     != null) weightPatch.intent     = jobWeights.intent;
        if (Object.keys(weightPatch).length) {
          merged = mergeEngineConfig(merged, { mainWeights: weightPatch });
        }
        if (jobWeights.salaryPenalty != null) merged.salaryPenalty = jobWeights.salaryPenalty;
      }
    } catch (e) {
      console.warn('[matchingEngineService] per-job Redis weights load failed (non-fatal):', e.message);
    }
  }

  merged.mainWeights = resolveMainWeights(merged.mainWeights, {
    allowVectorOnly: Boolean(presetRow?.id),
  });

  // Store in Redis for subsequent requests
  if (jobId && isRedisAvailable()) {
    redisService.set(engineConfigCacheKey(jobId, tenantId), merged, {
      ttlSeconds: ENGINE_CONFIG_CACHE_TTL,
    }).catch(() => {});
  }

  return merged;
}

module.exports = {
  DEFAULT_CONFIG,
  getConfig,
  updateConfig,
  listPresets,
  listPresetsForClientId,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  resolveEngineConfigForJob,
  findMatchingPresetRowForJob,
  findPresetRowForClientId,
  resolveClientIdFromJobLabel,
  resolveMainWeights,
  mergeEngineConfig,
  normalizeEngineConfig,
  DEFAULT_CONFIG,
};
