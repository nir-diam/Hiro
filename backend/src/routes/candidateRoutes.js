const express = require('express');
const candidateController = require('../controllers/candidateController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/screening-rejections', authMiddleware, candidateController.listScreeningRejections);
router.patch('/linked-jobs/:jobCandidateId/status', authMiddleware, candidateController.patchJobLinkStatus);

router.get('/', candidateController.list);
router.get('/by-worked-at-company', candidateController.listByWorkedAtCompany);
router.get('/by-user/:userId', candidateController.getByUser);
// Place specific routes BEFORE the generic '/:id' to avoid param capture
router.get('/rebuild-embeddings', candidateController.rebuildAllEmbeddings);
router.post('/search/free', candidateController.freeSearch);
router.post('/ai', candidateController.createFromAi);

router.post('/:id/generate-experience-summary', candidateController.generateExperienceSummary);
router.post('/:id/generate-internal-opinion', candidateController.generateInternalOpinion);
router.get('/:id/relevant-jobs', candidateController.getRelevantJobs);
router.get('/:id/linked-jobs', candidateController.listLinkedJobs);
router.get('/:id/screening-data', candidateController.getScreeningData);
router.put('/:id/screening-data', candidateController.saveScreeningData);

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


