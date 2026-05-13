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
    const { candidateId, jobId, presetId } = req.body || {};
    if (!candidateId || !jobId) {
      return res.status(400).json({ message: 'candidateId and jobId are required' });
    }

    // Load config (preset overrides global if provided)
    let config = await svc.getConfig();
    if (presetId) {
      const preset = await svc.getPreset(presetId);
      if (preset?.config) config = preset.config;
    }

    // Load candidate
    const candidateRow = await Candidate.findByPk(candidateId);
    if (!candidateRow) return res.status(404).json({ message: 'Candidate not found' });
    const candidate = candidateRow.get({ plain: true });

    // Ensure candidate embedding
    let candidateEmb = normalizeEmbedding(candidate.embedding);
    if (!candidateEmb?.length) {
      try {
        const rebuilt = await embedCandidateAndSave(candidateId);
        candidateEmb  = normalizeEmbedding(rebuilt);
      } catch { /* keep empty */ }
    }
    candidate.embedding = candidateEmb;

    // Load job
    const jobRow = await Job.findByPk(jobId);
    if (!jobRow) return res.status(404).json({ message: 'Job not found' });
    const job = jobRow.get({ plain: true });

    // Job embedding (attempt)
    let jobEmb = [];
    try {
      const text = buildJobSonarQuery(job);
      if (text.trim()) jobEmb = await embedText(text.slice(0, 8000)) || [];
    } catch { /* keep empty */ }

    // Linked info
    const link = await JobCandidate.findOne({
      where: { candidateId, jobId },
      attributes: ['id', 'status', 'source'],
    });
    const linkedInfo = link ? {
      jcId:     String(link.id),
      jcStatus: link.status,
      source:   link.source,
      explicit: ['email', 'public_apply', 'referral', 'manual_screening'].includes(link.source),
    } : null;

    const result = await computeFullMatchScore(candidate, job, jobEmb, config, linkedInfo);

    res.json({
      candidateId,
      jobId,
      candidateName: candidate.fullName || candidate.firstName || candidateId,
      jobTitle:      job.title || jobId,
      ...result,
      config: {
        mainWeights:    config.mainWeights,
        tagWeights:     config.tagWeights,
        intentWeights:  config.intentWeights,
        geoRegions:     config.geoRegions,
      },
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
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  simulate,
};
