const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const inforuController = require('../controllers/inforuController');

const router = express.Router();

/** Public webhooks — secured via optional INFORU_WEBHOOK_SECRET header/query. */
router.post('/webhooks/mo', inforuController.inboundMoWebhook);
router.post('/webhooks/dlr', inforuController.deliveryWebhook);

/** Health / config probe (no auth — safe fields only). */
router.get('/status', inforuController.status);

/** Authenticated RSVP API (not wired to UI yet). */
router.post('/rsvp/send', authMiddleware, attachDbUser, inforuController.sendRsvp);
router.get('/rsvp/requests/:id', authMiddleware, attachDbUser, inforuController.getRsvpRequest);
router.get('/rsvp/candidates/:candidateId', authMiddleware, attachDbUser, inforuController.listCandidateRsvp);
router.post('/rsvp/parse-preview', authMiddleware, attachDbUser, inforuController.parsePreview);

module.exports = router;
