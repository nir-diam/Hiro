const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const publicSiteAdminController = require('../controllers/publicSiteAdminController');

const router = express.Router();

router.use(authMiddleware, attachDbUser);
router.get('/options', publicSiteAdminController.options);
router.use(publicSiteAdminController.requirePlatformAdmin);
router.get('/', publicSiteAdminController.list);
router.post('/', publicSiteAdminController.create);
router.patch('/:id', publicSiteAdminController.update);
router.post('/:id/keys', publicSiteAdminController.createKey);
router.post('/:id/keys/:keyId/revoke', publicSiteAdminController.revokeKey);
router.post('/:id/webhook-secret', publicSiteAdminController.rotateWebhookSecret);
router.get('/:id/deliveries', publicSiteAdminController.deliveries);

module.exports = router;
