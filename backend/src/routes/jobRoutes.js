const express = require('express');
const jobController = require('../controllers/jobController');
const jobEventController = require('../controllers/jobEventController');
const { authMiddleware, attachDbUser, optionalAttachDbUser } = require('../middleware/permissionMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', jobController.list);
router.get('/for-picker', jobController.listForPicker);
router.get('/for-compose', authMiddleware, attachDbUser, jobController.listForCompose);
router.get('/board-publications', authMiddleware, attachDbUser, jobController.listBoardPublications);
router.post('/log-smart-import-open', authMiddleware, attachDbUser, jobController.logSmartImportModalOpen);
router.get('/:id/referral-client-contacts', authMiddleware, jobController.getReferralClientContacts);
router.get('/:id/candidates', optionalAuth, jobController.getCandidates);
router.get('/:id/screening-pool', authMiddleware, attachDbUser, jobController.getScreeningPoolForJob);
router.post('/:id/sonar-scan', authMiddleware, attachDbUser, jobController.postJobSonarScan);
router.get('/:id/sonar-ignores', authMiddleware, attachDbUser, jobController.listSonarIgnores);
router.delete('/:id/sonar-ignores/:candidateId', authMiddleware, attachDbUser, jobController.clearSonarIgnore);
router.get('/:id/events', authMiddleware, attachDbUser, jobEventController.list);
router.post('/:id/events', authMiddleware, attachDbUser, jobEventController.create);
router.put('/:id/events/:eventId', authMiddleware, attachDbUser, jobEventController.update);
router.delete('/:id/events/:eventId', authMiddleware, attachDbUser, jobEventController.remove);
router.patch('/:id/board-sources', authMiddleware, attachDbUser, jobController.patchBoardSources);
router.get('/:id', jobController.get);
router.post('/', optionalAuth, optionalAttachDbUser, jobController.create);
router.post('/ai/analyze', jobController.analyzeDescription);
router.put('/:id', jobController.update);
router.delete('/:id', jobController.remove);

module.exports = router;

