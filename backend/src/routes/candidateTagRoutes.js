const express = require('express');
const router = express.Router();
const candidateTagController = require('../controllers/candidateTagController');

router.get('/', candidateTagController.listForCandidate);
router.get('/:candidateId', candidateTagController.listForCandidate);
router.post('/', candidateTagController.create);
router.post('/bulk-create', candidateTagController.bulkCreate);
router.post('/bulk-update', candidateTagController.bulkUpdate);
router.get('/tag/:tagId', candidateTagController.listByTag);
router.post('/counts', candidateTagController.countByTags);
router.put('/:id', candidateTagController.update);
router.delete('/:id', candidateTagController.remove);

module.exports = router;

