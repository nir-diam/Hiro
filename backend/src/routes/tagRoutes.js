const express = require('express');
const tagController = require('../controllers/tagController');

const router = express.Router();

router.get('/', tagController.list);
router.get('/pending', tagController.listPending);
router.post('/pending/resolve', tagController.resolvePending);
router.get('/rebuild-embeddings', tagController.rebuildEmbeddings);
router.get('/:id', tagController.get);
router.post('/:id/rebuild-embedding', tagController.rebuildEmbedding);
router.get('/:id/candidates', tagController.listTagCandidates);
router.get('/:id/history', tagController.getHistory);
router.post('/', tagController.create);
router.put('/:id', tagController.update);
router.delete('/:id', tagController.remove);
router.post('/ai/enrich', tagController.enrich);

module.exports = router;

