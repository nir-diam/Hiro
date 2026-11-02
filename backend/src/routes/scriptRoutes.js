const express = require('express');
const scriptController = require('../controllers/scriptController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:admin'));

router.get('/backfill-email-legacy-jobs/test', scriptController.backfillEmailLegacyJobsTestCandidate);
router.get('/backfill-email-legacy-jobs', scriptController.backfillEmailLegacyJobsSinceOct8);

module.exports = router;
