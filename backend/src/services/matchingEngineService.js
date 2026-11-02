const { Op } = require('sequelize');
const MatchingEngineConfig = require('../models/MatchingEngineConfig');
const { invalidateAllMatchCaches } = require('./matchingCacheService');
const { DEFAULT_PENALTY_POLICIES } = require('./matchingPenaltyService');
const redisService = require('./redisService');
const readThrough = require('./readThroughCacheService');
const { isRedisAvailable, isReadThroughEnabled } = require('../config/redis');
const { recordHit, recordMiss, recordBypass } = require('../utils/appCacheContext');

const GLOBAL_CONFIG_REDIS_KEY = 'matching-engine:global-config';

const GLOBAL_KEY = 'global';

// ── In-process cache for global config — cleared when admin saves ──────────────
let _globalConfigCache = null;
let _globalConfigCacheAt = 0;
const GLOBAL_CONFIG_CACHE_MS = 30_000; // 30 s

// ── Redis cache TTLs ──────────────────────────────────────────────────────────
const ENGINE_CONFIG_CACHE_TTL = 300;   // 5 min — per-job resolved config
const engineConfigCacheKey = (jobId, tenantId, ignoreJobPreset = false) =>
  `engine-config:${jobId}:${tenantId || 'default'}${ignoreJobPreset ? ':company' : ''}`;

/** Drop resolved per-job configs (all jobs, or one job) after a template/assignment change. */
async function invalidateEngineConfigCache(jobId = null) {
  if (!isRedisAvailable()) return;
  try {
    const pattern = jobId ? `engine-config:${jobId}:*` : 'engine-config:*';
    const keys = await redisService.keys(pattern);
    if (Array.isArray(keys) && keys.length) await redisService.del(...keys);
  } catch (e) {
    console.warn('[matchingEngineService] engine-config cache invalidation failed (non-fatal):', e.message);
  }
}

const DEFAULT_CONFIG = {
  /** Distance is not a weighted layer — it is the `geoRegions` distance penalty. */
  mainWeights: { vector: 25, tags: 45, geo: 0, experience: 18, intent: 12 },
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
  /** Points off the final score when the candidate has no resolvable address. */
  missingGeoPenalty:   10,
  /** Max points subtracted for a known commute beyond grace (avoids 100−geoScore knockouts). */
  maxGeoPenalty:       30,
  missingSalaryScore:  0,
  salaryDiffThreshold: 10,
  salaryPenalty:       5,
  ageGapPenalty:       2,
  /** Max points off for age outside job range (preference, not a full knockout). */
  maxAgeGapPenalty:    25,
  missingAgeScore:     6,
  /** Points off per missing year of required role-tag ניסיון. */
  roleExperiencePenalty: 2,
  /** Points off per year that matching role experience sits outside the tag's אחורה window. */
  roleLookbackPenalty:   2,
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

async function loadGlobalConfigFromDb() {
  let row = await MatchingEngineConfig.findOne({ where: { configKey: GLOBAL_KEY } });
  if (!row) {
    row = await MatchingEngineConfig.create({
      configKey: GLOBAL_KEY,
      type: 'global',
      config: DEFAULT_CONFIG,
    });
  }
  return normalizeEngineConfig(row.config);
}

async function getConfig() {
  const now = Date.now();
  if (_globalConfigCache && now - _globalConfigCacheAt < GLOBAL_CONFIG_CACHE_MS) {
    return _globalConfigCache;
  }
  let cfg;
  if (isReadThroughEnabled()) {
    cfg = await readThrough.getOrLoad(
      GLOBAL_CONFIG_REDIS_KEY,
      loadGlobalConfigFromDb,
      { ttlSeconds: ENGINE_CONFIG_CACHE_TTL, scope: 'matching-engine:global' },
    );
  } else {
    cfg = await loadGlobalConfigFromDb();
  }
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
  readThrough.invalidate(GLOBAL_CONFIG_REDIS_KEY).catch(() => {});
  invalidateEngineConfigCache();
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
  invalidateEngineConfigCache();
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
    invalidateEngineConfigCache();
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
  const { getClientIdForJobClientLabel } = require('./clientUsageSettingService');
  return getClientIdForJobClientLabel(name);
}

/**
 * Company preset for scoring, with where it came from:
 *   'company' — logged-in tenant's Company Settings
 *   'owner'   — tenant that owns the job (jobs.client_id)
 *   'client_label' — legacy: client resolved from the job.client text
 * `job.client` is usually the end customer, not the tenant, so it is the last resort.
 */
async function findMatchingPresetForJob(jobPlain, options = {}) {
  const tried = new Set();
  const attempt = async (cid, source) => {
    const id = cid ? String(cid).trim() : '';
    if (!id || tried.has(id)) return null;
    tried.add(id);
    const row = await findPresetRowForClientId(id);
    return row ? { row, source } : null;
  };

  const found =
    (await attempt(options.tenantClientId, 'company'))
    || (await attempt(options.jobClientId || jobPlain?.clientId || jobPlain?.client_id, 'owner'))
    || (await attempt(await resolveClientIdFromJobLabel(jobPlain), 'client_label'));
  return found || null;
}

async function findMatchingPresetRowForJob(jobPlain, options = {}) {
  const found = await findMatchingPresetForJob(jobPlain, options);
  return found ? found.row : null;
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
  const eW = Number(mainWeights.experience) || 0;
  const iW = Number(mainWeights.intent) || 0;
  const total = vW + tW + eW + iW;
  if (total <= 0) return { ...def };
  const others = tW + eW + iW;
  if (!options.allowVectorOnly && vW >= 99 && others <= 0) {
    console.warn(
      '[matchingEngine] mainWeights are vector-only (100/0/0/0); using default balanced weights for scoring',
    );
    return { ...def };
  }
  return { vector: vW, tags: tW, geo: 0, experience: eW, intent: iW };
}

/**
 * Global row + optional preset override + per-job Redis weight sliders.
 * Priority (highest wins):
 *   job-specific Redis weights  >  job preset  >  company preset  >  global config
 * `options.ignoreJobPreset` — candidate→jobs matching always uses the company preset.
 * Result carries `preset: { id, label, source }` (source: job | company | owner | client_label | global).
 */
async function resolveEngineConfigForJob(jobPlain, options = {}) {
  const jobId = jobPlain?.id != null ? String(jobPlain.id) : '';
  const tenantId = options.tenantClientId ? String(options.tenantClientId).trim() : '';
  const ignoreJobPreset = options.ignoreJobPreset === true;

  // Redis cache — the resolved config rarely changes between requests
  if (jobId && isRedisAvailable() && isReadThroughEnabled()) {
    const cacheKey = engineConfigCacheKey(jobId, tenantId, ignoreJobPreset);
    const cached = await redisService.get(cacheKey);
    if (cached && typeof cached === 'object' && cached.mainWeights) {
      recordHit('engine-config');
      return normalizeEngineConfig(cached);
    }
    recordMiss('engine-config');
  } else if (jobId && !isReadThroughEnabled()) {
    recordBypass('engine-config');
  }

  const globalCfg = normalizeEngineConfig(await getConfig());
  let merged = globalCfg;
  let presetRow = null;
  let presetSource = 'global';
  try {
    const jobPresetRaw = ignoreJobPreset ? null : jobPlain?.matchingEnginePresetId;
    const jobPresetId =
      jobPresetRaw != null && jobPresetRaw !== '' && Number.isFinite(Number(jobPresetRaw))
        ? Number(jobPresetRaw)
        : null;
    if (jobPresetId != null) {
      presetRow = await MatchingEngineConfig.findOne({
        where: { id: jobPresetId, type: 'preset' },
      });
      if (presetRow) {
        presetSource = 'job';
      } else {
        console.warn(
          `[matchingEngineService] job matchingEnginePresetId=${jobPresetId} not found; falling back to client preset`,
        );
      }
    }
    if (!presetRow) {
      const found = await findMatchingPresetForJob(jobPlain, options);
      if (found) {
        presetRow = found.row;
        presetSource = found.source;
      }
    }
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
  merged = {
    ...merged,
    preset: presetRow
      ? { id: Number(presetRow.id), label: presetRow.label || null, source: presetSource }
      : { id: null, label: null, source: 'global' },
  };

  // Store in Redis for subsequent requests
  if (jobId && isRedisAvailable()) {
    redisService.set(engineConfigCacheKey(jobId, tenantId, ignoreJobPreset), merged, {
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
  invalidateEngineConfigCache,
  findPresetRowForClientId,
  resolveClientIdFromJobLabel,
  resolveMainWeights,
  mergeEngineConfig,
  normalizeEngineConfig,
  DEFAULT_CONFIG,
};
