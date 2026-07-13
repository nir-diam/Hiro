const express = require('express');
const jobPublicationController = require('../controllers/jobPublicationController');
const { authMiddleware, attachDbUser } = require('../middleware/permissionMiddleware');

const publicRouter = express.Router();
publicRouter.get('/board/branding', jobPublicationController.getPublicBoardBranding);
publicRouter.get('/board', jobPublicationController.listPublicBoard);
publicRouter.get('/share/:clientHint/board', jobPublicationController.getBoardSharePreview);
publicRouter.get('/share/board', jobPublicationController.getBoardSharePreview);
publicRouter.get('/share/:clientHint/:slug', jobPublicationController.getSharePreview);
publicRouter.get('/share/:slug', jobPublicationController.getSharePreview);
publicRouter.get('/:slug/landing', jobPublicationController.getPublicLanding);
publicRouter.post('/:slug/visit', jobPublicationController.recordVisit);
publicRouter.post('/:slug/apply', jobPublicationController.submitApplication);

const publishingRouter = express.Router();
publishingRouter.use(authMiddleware, attachDbUser);
publishingRouter.get('/links', jobPublicationController.listLinks);
publishingRouter.get('/candidates', jobPublicationController.listCandidates);
publishingRouter.get('/stats', jobPublicationController.getStats);
publishingRouter.get('/theme', jobPublicationController.getTheme);
publishingRouter.put('/theme', jobPublicationController.updateTheme);
publishingRouter.get('/posthog-analytics', jobPublicationController.getPosthogAnalytics);
publishingRouter.put('/posthog-analytics', jobPublicationController.updatePosthogAnalytics);
publishingRouter.get('/landing-contact', jobPublicationController.getLandingContact);
publishingRouter.put('/landing-contact', jobPublicationController.updateLandingContact);
publishingRouter.get('/hero-gallery', jobPublicationController.getHeroGallery);
publishingRouter.get('/company-images', jobPublicationController.listCompanyCreatedImages);
publishingRouter.post('/hero-gallery', jobPublicationController.addHeroGalleryImage);
publishingRouter.delete('/hero-gallery/:imageId', jobPublicationController.removeHeroGalleryImage);

const jobPublicationRouter = express.Router();
jobPublicationRouter.use(authMiddleware, attachDbUser);
jobPublicationRouter.get('/:id/publication', jobPublicationController.getPublication);
jobPublicationRouter.put('/:id/publication', jobPublicationController.updatePublication);
jobPublicationRouter.post('/:id/publication/generate-hero-image', jobPublicationController.generateHeroImage);
jobPublicationRouter.get('/:id/publication/company-images', jobPublicationController.listJobCompanyImages);
jobPublicationRouter.get('/:id/publication/candidates', jobPublicationController.listJobCandidates);

module.exports = {
  publicRouter,
  publishingRouter,
  jobPublicationRouter,
};
