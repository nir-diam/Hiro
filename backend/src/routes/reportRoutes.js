const express = require('express');
const recruitmentSourcesReportController = require('../controllers/recruitmentSourcesReportController');
const biDashboardReportController = require('../controllers/biDashboardReportController');
const { authMiddleware, attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get(
  '/recruitment-sources',
  authMiddleware,
  attachDbUser,
  recruitmentSourcesReportController.getRecruitmentSourcesReport,
);

router.get(
  '/bi-dashboard',
  authMiddleware,
  attachDbUser,
  biDashboardReportController.getBiDashboard,
);

module.exports = router;
