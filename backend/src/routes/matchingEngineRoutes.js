const express = require('express');
const ctrl = require('../controllers/matchingEngineController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:admin'));

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
