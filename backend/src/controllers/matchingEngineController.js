const svc = require('../services/matchingEngineService');

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

module.exports = { getConfig, updateConfig, listPresets, getPreset, createPreset, updatePreset, deletePreset };
