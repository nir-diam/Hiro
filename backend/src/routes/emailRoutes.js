const express = require('express');
const emailController = require('../controllers/emailController');

const router = express.Router();

router.post('/email-upload', emailController.upload);
router.get('/candidate/:candidateId', emailController.getByCandidate);
router.get('/messages', emailController.getNotificationMessages);
router.patch('/messages/:id/status', emailController.updateNotificationMessageStatus);
router.post('/send', emailController.send);

module.exports = router;

