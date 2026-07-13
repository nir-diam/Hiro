const express = require('express');
const organizationController = require('../controllers/organizationController');
const organizationTmpRoutes = require('./organizationTmpRoutes');
const organizationAiDecisionController = require('../controllers/organizationAiDecisionController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = authMiddleware.optionalAuth;
const { optionalAttachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();
const orgWrite = [optionalAuth, optionalAttachDbUser];

router.get('/', organizationController.list);
router.use('/tmp', organizationTmpRoutes);
router.get('/rebuild-embeddings', organizationController.rebuildEmbeddings);
router.post('/logo/upload-url', organizationController.createLogoUploadUrl);
router.post('/enrich', organizationController.enrich);

// AI decision review endpoints
router.get('/ai-decisions/stats', organizationAiDecisionController.stats);
router.get('/ai-decisions', organizationAiDecisionController.list);
router.put('/ai-decisions/bulk-resolve', organizationAiDecisionController.bulkResolve);
router.put('/ai-decisions/:id/resolve', organizationAiDecisionController.resolve);

router.get('/:id/history', organizationController.getHistory);
router.get('/:id', organizationController.get);
router.get('/:id/candidates', organizationController.listCandidates);
router.post('/:id/rebuild-embedding', organizationController.rebuildEmbedding);
router.post('/', ...orgWrite, organizationController.create);
router.put('/:id', ...orgWrite, organizationController.update);
router.delete('/:id', ...orgWrite, organizationController.remove);

module.exports = router;

