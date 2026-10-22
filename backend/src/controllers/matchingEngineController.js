const svc        = require('../services/matchingEngineService');

/**
 * Handlers for `/api/admin/matching-engine/*` and `listPresetsForClient` (`/api/clients/:id/matching-engine-configs`).
 * They only read/write `matching_engine_configs` (simulate also loads jobs/candidates).
 * They never read or write `client_usage_settings` — tenant preset choice is `PUT /api/clients/:id/usage-settings`.
 */

const assertCanAccessClient = (req, targetClientId) => {
  const u = req.dbUser;
  if (!u) return false;
  if (u.role === 'super_admin' || u.role === 'admin') return true;
  if (!u.clientId) return false;
  return String(u.clientId) === String(targetClientId);
};
const Candidate  = require('../models/Candidate');
const Job        = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const { normalizeEmbedding, embedCandidateAndSave } = require('../services/vectorSearchService');
const { embedText }          = require('../services/embeddingService');
const { buildJobSonarQuery } = require('../services/jobSonarService');
const { computeFullMatchScore } = require('../services/matchingScoreService');

// ── Global config ─────────────────────────────────────────────────────────────

async function getConfig(req, res) {
  try {
    res.json(await svc.getConfig());
  } catch (err) {
    console.error('[MatchingEngine] getConfig:', err);
    res.status(500).json({ message: 'Failed to load config' });
  }
}

async function updateConfig(req, res) {
  try {
    res.json(await svc.updateConfig(req.body));
  } catch (err) {
    console.error('[MatchingEngine] updateConfig:', err);
    res.status(500).json({ message: 'Failed to save config' });
  }
}

// ── Presets ───────────────────────────────────────────────────────────────────

async function listPresets(req, res) {
  try {
    res.json(await svc.listPresets());
  } catch (err) {
    console.error('[MatchingEngine] listPresets:', err);
    res.status(500).json({ message: 'Failed to list presets' });
  }
}

/** Client-scoped: presets in `matching_engine_configs` that list this client in `client_ids`. */
async function listPresetsForClient(req, res) {
  try {
    const { id } = req.params;
    if (!assertCanAccessClient(req, id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const presets = await svc.listPresetsForClientId(id);
    res.json(presets);
  } catch (err) {
    console.error('[MatchingEngine] listPresetsForClient:', err);
    res.status(500).json({ message: 'Failed to list matching engine configs' });
  }
}

async function getPreset(req, res) {
  try {
    const preset = await svc.getPreset(req.params.id);
    if (!preset) return res.status(404).json({ message: 'Preset not found' });
    res.json(preset);
  } catch (err) {
    console.error('[MatchingEngine] getPreset:', err);
    res.status(500).json({ message: 'Failed to get preset' });
  }
}

async function createPreset(req, res) {
  try {
    const { label, description, clientIds, config } = req.body;
    const preset = await svc.createPreset({ label, description, clientIds, config });
    res.status(201).json(preset);
  } catch (err) {
    console.error('[MatchingEngine] createPreset:', err);
    res.status(500).json({ message: 'Failed to create preset' });
  }
}

async function updatePreset(req, res) {
  try {
    const updated = await svc.updatePreset(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: 'Preset not found' });
    res.json(updated);
  } catch (err) {
    console.error('[MatchingEngine] updatePreset:', err);
    res.status(500).json({ message: 'Failed to update preset' });
  }
}

/** Tenant-safe: create a preset linked only to this client. */
async function createPresetForClient(req, res) {
  try {
    const clientId = String(req.params.id || '').trim();
    if (!assertCanAccessClient(req, clientId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { label, description, config } = req.body || {};
    const name = String(label || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'label is required' });
    }
    const preset = await svc.createPreset({
      label: name,
      description: description || '',
      clientIds: [clientId],
      config: config && typeof config === 'object' ? config : {},
    });
    res.status(201).json(preset);
  } catch (err) {
    console.error('[MatchingEngine] createPresetForClient:', err);
    res.status(500).json({ message: 'Failed to create matching engine config' });
  }
}

/** Tenant-safe: update preset config only when preset is linked to this client. */
async function updatePresetForClient(req, res) {
  try {
    const clientId = String(req.params.id || '').trim();
    const presetId = req.params.presetId;
    if (!assertCanAccessClient(req, clientId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const preset = await svc.getPreset(presetId);
    if (!preset) return res.status(404).json({ message: 'Preset not found' });
    const linked = Array.isArray(preset.clientIds) ? preset.clientIds.map(String) : [];
    if (!linked.includes(clientId)) {
      return res.status(403).json({ message: 'Preset is not assigned to this client' });
    }
    const { config, label, description } = req.body || {};
    const patch = {};
    if (config !== undefined) patch.config = config;
    if (label !== undefined) patch.label = label;
    if (description !== undefined) patch.description = description;
    if (!Object.keys(patch).length) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }
    const updated = await svc.updatePreset(presetId, patch);
    if (!updated) return res.status(404).json({ message: 'Preset not found' });
    res.json(updated);
  } catch (err) {
    console.error('[MatchingEngine] updatePresetForClient:', err);
    res.status(500).json({ message: 'Failed to update matching engine config' });
  }
}

async function deletePreset(req, res) {
  try {
    const ok = await svc.deletePreset(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Preset not found' });
    res.status(204).end();
  } catch (err) {
    console.error('[MatchingEngine] deletePreset:', err);
    res.status(500).json({ message: 'Failed to delete preset' });
  }
}

// ── Simulate ──────────────────────────────────────────────────────────────────

async function simulate(req, res) {
  try {
    const {
      candidateId,
      jobId,
      presetId,
      config: configOverride,
      candidateOverrides,
      jobOverrides,
    } = req.body || {};
    if (!candidateId || !jobId) {
      return res.status(400).json({ message: 'candidateId and jobId are required' });
    }

    // Config for simulation:
    // - When the panel sends `config`, it is the full live form (sliders) — merge onto global defaults.
    //   Do not also merge `presetId` (preset is already reflected in the panel when selected).
    // - Otherwise: global + optional preset.
    let config;
    if (configOverride && typeof configOverride === 'object') {
      config = svc.mergeEngineConfig(await svc.getConfig(), configOverride);
    } else {
      config = await svc.getConfig();
      if (presetId) {
        const preset = await svc.getPreset(presetId);
        if (preset?.config) config = svc.mergeEngineConfig(config, preset.config);
      }
    }

    const candidateService = require('../services/candidateService');
    const candidateRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
    if (!candidateRow) return res.status(404).json({ message: 'Candidate not found' });
    let candidate = candidateService.toPlainCandidateForMatchScore(candidateRow);
    if (candidateOverrides && typeof candidateOverrides === 'object') {
      candidate = { ...candidate, ...candidateOverrides };
    }

    // Ensure candidate embedding
    let candidateEmb = normalizeEmbedding(candidate.embedding);
    if (!candidateEmb?.length) {
      try {
        const rebuilt = await embedCandidateAndSave(candidateId);
        candidateEmb  = normalizeEmbedding(rebuilt);
      } catch { /* keep empty */ }
    }
    candidate.embedding = candidateEmb;

    // Load job (skills from system_tags — same as Sonar / candidate job-matches)
    const jobService = require('../services/jobService');
    let jobRow;
    try {
      jobRow = await jobService.getById(jobId);
    } catch (e) {
      if (e.status === 404) return res.status(404).json({ message: 'Job not found' });
      throw e;
    }
    let job = jobService.toPlainJobForMatchScore(jobRow);
    if (!Array.isArray(job.skills) || !job.skills.length) {
      await jobService.hydrateJobSkills(jobRow);
      job = jobService.toPlainJobForMatchScore(jobRow);
    }
    if (jobOverrides && typeof jobOverrides === 'object') {
      job = { ...job, ...jobOverrides };
    }

    // Job embedding (attempt)
    let jobEmb = [];
    try {
      const text = buildJobSonarQuery(job);
      if (text.trim()) jobEmb = await embedText(text.slice(0, 8000)) || [];
    } catch { /* keep empty */ }

    const {
      computeMatchPackage,
      buildIntentOptionsByCandidateIds,
      buildLinkedInfoFromJobCandidate,
    } = require('../services/matchingScoreService');

    const link = await JobCandidate.findOne({
      where: { candidateId, jobId },
      attributes: ['id', 'status', 'source'],
    });
    const linkedInfo = link
      ? buildLinkedInfoFromJobCandidate(link.get ? link.get({ plain: true }) : link)
      : null;
    const intentByCandidate = await buildIntentOptionsByCandidateIds([candidateId]);
    const intentOpts = intentByCandidate.get(String(candidateId)) || {};

    const { normalizePenaltyPolicies } = require('../services/matchingPenaltyService');
    const result = await computeMatchPackage(
      candidate,
      job,
      jobEmb,
      config,
      linkedInfo,
      intentOpts,
    );
    const penaltyPoliciesUsed = normalizePenaltyPolicies(config.penaltyPolicies);

    res.json({
      candidateId,
      jobId,
      matchScore: result.matchScore,
      finalScore: result.matchScore,
      scoreBreakdown: result.scoreBreakdown,
      breakdown: result.scoreBreakdown,
      parameterMatches: result.parameterMatches,
      candidateName: candidate.fullName || candidate.firstName || candidateId,
      jobTitle: job.title || jobId,
      config,
      penaltyPoliciesUsed,
    });
  } catch (err) {
    console.error('[MatchingEngine] simulate:', err);
    res.status(500).json({ message: 'Simulation failed', error: err.message });
  }
}

module.exports = {
  getConfig,
  updateConfig,
  listPresets,
  listPresetsForClient,
  createPresetForClient,
  updatePresetForClient,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  simulate,
};
