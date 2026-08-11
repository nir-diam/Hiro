const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const pipelineOutcomeController = require('../controllers/pipelineOutcomeController');

const router = express.Router();

router.post('/execute', authMiddleware, attachDbUser, pipelineOutcomeController.execute);

module.exports = router;
