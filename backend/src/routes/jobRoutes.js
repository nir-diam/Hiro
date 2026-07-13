const express = require('express');
const jobController = require('../controllers/jobController');
const jobEventController = require('../controllers/jobEventController');
const { authMiddleware, attachDbUser, optionalAttachDbUser } = require('../middleware/permissionMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', jobController.list);
router.get('/for-picker', jobController.listForPicker);
router.get('/for-compose', authMiddleware, attachDbUser, jobController.listForCompose);
router.post('/log-smart-import-open', authMiddleware, attachDbUser, jobController.logSmartImportModalOpen);
router.get('/:id/referral-client-contacts', authMiddleware, jobController.getReferralClientContacts);
router.get('/:id/candidates', optionalAuth, jobController.getCandidates);
router.get('/:id/screening-pool', authMiddleware, attachDbUser, jobController.getScreeningPoolForJob);
router.post('/:id/sonar-scan', authMiddleware, attachDbUser, jobController.postJobSonarScan);
router.get('/:id/events', authMiddleware, attachDbUser, jobEventController.list);
router.post('/:id/events', authMiddleware, attachDbUser, jobEventController.create);
router.put('/:id/events/:eventId', authMiddleware, attachDbUser, jobEventController.update);
router.delete('/:id/events/:eventId', authMiddleware, attachDbUser, jobEventController.remove);
router.get('/:id', jobController.get);
router.post('/', optionalAuth, optionalAttachDbUser, jobController.create);
router.post('/ai/analyze', jobController.analyzeDescription);
router.put('/:id', jobController.update);
router.delete('/:id', jobController.remove);

module.exports = router;

