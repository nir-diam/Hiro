const express = require('express');
const router = express.Router();
const candidateTagController = require('../controllers/candidateTagController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalAuth = authMiddleware.optionalAuth;
const { optionalAttachDbUser } = require('../middleware/permissionMiddleware');

const write = [optionalAuth, optionalAttachDbUser];

router.get('/', candidateTagController.listForCandidate);
// Search candidate-tags by tag name ?name=xxxx
router.get('/by-name', candidateTagController.listByTagName);
router.get('/:candidateId', candidateTagController.listForCandidate);
router.post('/', candidateTagController.create);
router.post('/bulk-create', candidateTagController.bulkCreate);
router.post('/bulk-update', ...write, candidateTagController.bulkUpdate);
router.get('/tag/:tagId', candidateTagController.listByTag);
router.post('/counts', candidateTagController.countByTags);
router.put('/:id', candidateTagController.update);
router.delete('/:id', candidateTagController.remove);

module.exports = router;

