const express = require('express');
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/email-upload', emailController.upload);
router.get('/candidate/:candidateId', emailController.getByCandidate);
router.get('/messages', authMiddleware, emailController.getNotificationMessages);
router.patch('/messages/:id/assign', authMiddleware, emailController.updateNotificationMessageAssignee);
router.patch('/messages/:id/status', authMiddleware, emailController.updateNotificationMessageStatus);
router.post('/send', authMiddleware, emailController.send);

module.exports = router;

