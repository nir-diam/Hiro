const express = require('express');
const recruitmentSourceController = require('../controllers/recruitmentSourceController');
const { authMiddleware, attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/options', authMiddleware, attachDbUser, recruitmentSourceController.listOptions);

module.exports = router;
