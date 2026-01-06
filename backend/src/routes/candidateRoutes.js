const express = require('express');
const candidateController = require('../controllers/candidateController');

const router = express.Router();

router.get('/', candidateController.list);
router.get('/by-user/:userId', candidateController.getByUser);
// Place specific routes BEFORE the generic '/:id' to avoid param capture
router.get('/rebuild-embeddings', candidateController.rebuildAllEmbeddings);
router.get('/:id', candidateController.get);
router.post('/', candidateController.create);
router.put('/:id', candidateController.update);
router.delete('/:id', candidateController.remove);

router.post('/:id/upload-url', candidateController.createUploadUrl);
router.post('/:id/media', candidateController.attachMedia);
router.post('/:id/rebuild-embedding', candidateController.rebuildEmbedding);
router.post('/search/semantic', candidateController.semanticSearch);

module.exports = router;


