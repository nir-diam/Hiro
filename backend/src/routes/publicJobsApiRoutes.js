const express = require('express');
const { publicSiteKeyMiddleware } = require('../middleware/publicSiteKeyMiddleware');
const publicJobsApiController = require('../controllers/publicJobsApiController');

const router = express.Router();

router.use(publicSiteKeyMiddleware);

router.get('/health', publicJobsApiController.health);
router.get('/jobs', publicJobsApiController.listJobs);
router.get('/jobs/:id/similar', publicJobsApiController.listSimilarJobs);
router.post('/jobs/:id/applications', publicJobsApiController.submitApplication);
router.post('/jobs/:id/view', publicJobsApiController.recordView);
router.get('/jobs/:slugOrId', publicJobsApiController.getJob);
router.get('/taxonomy', publicJobsApiController.getTaxonomy);
router.get('/companies/:slug', publicJobsApiController.getCompany);
router.get('/sitemap/jobs', publicJobsApiController.getSitemapJobs);

module.exports = router;
