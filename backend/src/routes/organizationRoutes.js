const express = require('express');
const organizationController = require('../controllers/organizationController');
const organizationTmpRoutes = require('./organizationTmpRoutes');
const organizationAiDecisionController = require('../controllers/organizationAiDecisionController');
const organizationProfileUpdateController = require('../controllers/organizationProfileUpdateController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = authMiddleware.optionalAuth;
const {
  optionalAttachDbUser,
  attachDbUser,
  requirePagePermission,
} = require('../middleware/permissionMiddleware');

const router = express.Router();
const orgWrite = [optionalAuth, optionalAttachDbUser];

router.get('/', organizationController.list);
router.post('/query', organizationController.listQuery);
router.use('/tmp', organizationTmpRoutes);
router.get('/rebuild-embeddings', organizationController.rebuildEmbeddings);
router.post('/logo/upload-url', organizationController.createLogoUploadUrl);
router.post('/enrich', optionalAuth, optionalAttachDbUser, organizationController.enrich);

// AI decision review endpoints
router.get('/ai-decisions/stats', organizationAiDecisionController.stats);
router.get('/ai-decisions', organizationAiDecisionController.list);
router.put('/ai-decisions/bulk-resolve', organizationAiDecisionController.bulkResolve);
router.put('/ai-decisions/:id/resolve', organizationAiDecisionController.resolve);
router.patch('/ai-decisions/:id/approve', organizationAiDecisionController.approve);
router.patch('/ai-decisions/:id/comments', organizationAiDecisionController.updateComments);
router.patch('/ai-decisions/:id/fields', organizationAiDecisionController.updateDecisionFields);

const adminOrgReview = [authMiddleware, attachDbUser, requirePagePermission('page:admin')];
router.get('/profile-updates/pending-count', ...adminOrgReview, organizationProfileUpdateController.countPending);
router.get('/profile-updates', ...adminOrgReview, organizationProfileUpdateController.list);
router.post('/profile-updates/:id/approve', ...adminOrgReview, organizationProfileUpdateController.approve);
router.post('/profile-updates/:id/reject', ...adminOrgReview, organizationProfileUpdateController.reject);

router.post('/merge', ...orgWrite, organizationController.mergeOrganizations);

router.get('/:id/history', organizationController.getHistory);
router.get('/:id/profile', optionalAuth, organizationController.getProfile);
router.get('/:id/primary-client', organizationController.getPrimaryClient);
router.get('/:id/insights', organizationController.getInsights);
router.get('/:id/candidates', organizationController.listCandidates);
router.get('/:id/jobs', organizationController.listJobs);
router.get('/:id/contacts', organizationController.listContacts);
router.post('/:id/contacts', ...orgWrite, organizationController.createContact);
router.put('/:id/contacts/:contactId', ...orgWrite, organizationController.updateContact);
router.delete('/:id/contacts/:contactId', ...orgWrite, organizationController.removeContact);
router.get('/:id', organizationController.get);
router.post('/:id/rebuild-embedding', organizationController.rebuildEmbedding);
router.post('/', ...orgWrite, organizationController.create);
router.put('/:id', ...orgWrite, organizationController.update);
router.delete('/:id', ...orgWrite, organizationController.remove);

module.exports = router;

