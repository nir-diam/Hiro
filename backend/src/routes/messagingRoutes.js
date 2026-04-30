const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');
const messagingController = require('../controllers/messagingController');

const router = express.Router();

router.post('/log-whatsapp-open', authMiddleware, attachDbUser, messagingController.logWhatsappOpen);

module.exports = router;
