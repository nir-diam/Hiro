const express = require('express');
const ctrl = require('../controllers/matchingEngineController');

const router = express.Router();

// Global config
router.get('/config',  ctrl.getConfig);
router.put('/config',  ctrl.updateConfig);

// Presets
router.get('/presets',        ctrl.listPresets);
router.post('/presets',       ctrl.createPreset);
router.get('/presets/:id',    ctrl.getPreset);
router.put('/presets/:id',    ctrl.updatePreset);
router.delete('/presets/:id', ctrl.deletePreset);

// Simulation
router.post('/simulate', ctrl.simulate);

module.exports = router;
