const express = require('express');
const homeDashboardController = require('../controllers/homeDashboardController');
const { authMiddleware, attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', authMiddleware, attachDbUser, homeDashboardController.getHomeDashboard);

module.exports = router;
