const express = require('express');
const jobController = require('../controllers/jobController');
const { authMiddleware, attachDbUser } = require('../middleware/permissionMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', jobController.list);
router.get('/for-compose', authMiddleware, attachDbUser, jobController.listForCompose);
router.get('/:id/candidates', optionalAuth, jobController.getCandidates);
router.get('/:id', jobController.get);
router.post('/', jobController.create);
router.post('/ai/analyze', jobController.analyzeDescription);
router.put('/:id', jobController.update);
router.delete('/:id', jobController.remove);

module.exports = router;

