const express = require('express');
const candidateController = require('../controllers/candidateController');
const candidateDocumentController = require('../controllers/candidateDocumentController');
const candidateEventController = require('../controllers/candidateEventController');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/screening-rejections', authMiddleware, candidateController.listScreeningRejections);
router.get('/linked-jobs/:jobCandidateId/process-journal', authMiddleware, attachDbUser, candidateController.getJobLinkProcessJournal);
router.patch('/linked-jobs/:jobCandidateId/process-journal/:entryId', authMiddleware, attachDbUser, candidateController.patchJobLinkProcessJournalEntry);
router.patch('/linked-jobs/:jobCandidateId/status', authMiddleware, attachDbUser, candidateController.patchJobLinkStatus);

router.get('/', optionalAuth, candidateController.list);
router.get('/by-worked-at-company', candidateController.listByWorkedAtCompany);
router.get('/by-user/:userId', candidateController.getByUser);
// Place specific routes BEFORE the generic '/:id' to avoid param capture
router.get('/rebuild-embeddings', candidateController.rebuildAllEmbeddings);
router.post('/search/free', candidateController.freeSearch);
router.post('/search/list', optionalAuth, candidateController.listPost);
router.post('/match-scores/batch', optionalAuth, candidateController.batchMatchScores);
router.post('/ai', candidateController.createFromAi);

router.post('/:id/generate-experience-summary', candidateController.generateExperienceSummary);
router.post('/:id/generate-internal-opinion', candidateController.generateInternalOpinion);
router.get('/:id/relevant-jobs', candidateController.getRelevantJobs);
router.post('/:id/job-matches', authMiddleware, candidateController.getJobMatches);
router.get('/:id/job-match-ignores', authMiddleware, candidateController.listJobMatchIgnores);
router.delete('/:id/job-match-ignores/:jobId', authMiddleware, candidateController.clearJobMatchIgnore);
router.post('/:id/jobs/:jobId/deep-insight', authMiddleware, candidateController.getJobDeepInsight);
router.get('/:id/screening-pool', authMiddleware, candidateController.getScreeningPoolForCandidate);
router.get('/:id/screening-precheck', authMiddleware, candidateController.getScreeningPrecheck);
router.get('/:id/related-candidates', candidateController.listRelatedCandidates);
router.get('/:id/profile-versions', candidateController.listProfileVersions);
router.get('/:id/linked-jobs', candidateController.listLinkedJobs);
router.post('/:id/linked-jobs', authMiddleware, candidateController.linkCandidateToJob);
router.post('/:id/field-interest', authMiddleware, candidateController.addFieldInterest);
router.get('/:id/screening-data', candidateController.getScreeningData);
router.put('/:id/screening-data', candidateController.saveScreeningData);
router.patch('/:id/pipeline-stage', authMiddleware, candidateController.patchPipelineStage);
router.patch('/:id/parsed-text', authMiddleware, candidateController.saveParsedText);
router.delete(
  '/:id/parsed-text/history/:index',
  authMiddleware,
  candidateController.deleteParsedTextHistoryVersion,
);
router.post(
  '/:id/approve-data-corrections',
  authMiddleware,
  attachDbUser,
  candidateController.approveDataCorrections,
);
router.post(
  '/:id/share-with-candidate',
  authMiddleware,
  attachDbUser,
  candidateController.shareProfileWithCandidate,
);
router.post('/:id/approve-profile', candidateController.approveProfileByCandidate);

router.get('/:id/documents', candidateDocumentController.list);
router.post('/:id/documents/upload-url', candidateDocumentController.createUploadUrl);
router.post('/:id/documents/attach', candidateDocumentController.attach);
router.put('/:id/documents/:docId', candidateDocumentController.update);
router.delete('/:id/documents/:docId', candidateDocumentController.remove);

router.get('/:id/events', authMiddleware, attachDbUser, candidateEventController.list);
router.post('/:id/events', authMiddleware, attachDbUser, candidateEventController.create);
router.put('/:id/events/:eventId', authMiddleware, attachDbUser, candidateEventController.update);
router.delete('/:id/events/:eventId', authMiddleware, attachDbUser, candidateEventController.remove);

router.patch('/:id/work-experience/:index/organization', candidateController.patchWorkExperienceOrganization);

router.get('/:id', candidateController.get);
router.post('/', candidateController.create);
router.put('/:id', candidateController.update);
router.delete('/:id', candidateController.remove);

router.post('/:id/upload-url', candidateController.createUploadUrl);
router.post('/:id/media', candidateController.attachMedia);
router.post('/:id/rebuild-embedding', candidateController.rebuildEmbedding);
router.post('/search/semantic', candidateController.semanticSearch);
router.post('/semantic-search', candidateController.semanticSearch);

module.exports = router;


