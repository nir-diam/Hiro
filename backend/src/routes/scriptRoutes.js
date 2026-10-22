const express = require('express');
const scriptController = require('../controllers/scriptController');

const router = express.Router();

/** No auth — local/dev backfill only. */
router.get('/backfill-email-legacy-jobs/test', scriptController.backfillEmailLegacyJobsTestCandidate);
router.get('/backfill-email-legacy-jobs', scriptController.backfillEmailLegacyJobsSinceOct8);

module.exports = router;
