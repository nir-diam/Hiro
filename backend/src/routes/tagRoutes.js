const express = require('express');
const tagController = require('../controllers/tagController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = authMiddleware.optionalAuth;
const { optionalAttachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();
const tagWrite = [optionalAuth, optionalAttachDbUser];

router.get('/', tagController.list);
router.get('/pending', tagController.listPending);
router.post('/pending/resolve', tagController.resolvePending);
router.get('/corrections/agent-settings', tagController.getCorrectionAgentSettings);
router.put('/corrections/agent-settings', tagController.putCorrectionAgentSettings);
router.get('/ai-decisions', tagController.listAiDecisions);
router.get('/ai-decisions/:decisionId/occurrences', tagController.getAiDecisionOccurrences);
router.post('/ai-decisions/resolve', ...tagWrite, tagController.resolveAiDecisions);
router.patch('/ai-decisions/:id/approve', ...tagWrite, tagController.approveAiDecision);
router.patch('/ai-decisions/:id/comments', ...tagWrite, tagController.updateAiDecisionComments);
router.patch('/ai-decisions/:id/fields', ...tagWrite, tagController.updateAiDecisionFields);
router.post('/ai-decisions/backfill', tagController.backfillAiDecisions);
router.post('/ai-decisions/backfill-auto-merge', tagController.backfillAutoMerge);

router.post('/merge', ...tagWrite, tagController.mergeTags);


router.post('/blacklist', ...tagWrite, tagController.blacklistTags);
router.get('/rebuild-embeddings', tagController.rebuildEmbeddings);
router.get('/:id', tagController.get);
router.post('/:id/rebuild-embedding', tagController.rebuildEmbedding);
router.get('/:id/candidates', tagController.listTagCandidates);
router.get('/:id/jobs', tagController.listTagJobs);
router.get('/:id/history', tagController.getHistory);
router.post('/', ...tagWrite, tagController.create);
router.put('/:id', ...tagWrite, tagController.update);
router.delete('/:id', ...tagWrite, tagController.remove);
router.post('/ai/enrich', tagController.enrich);

module.exports = router;

