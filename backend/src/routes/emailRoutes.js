const express = require('express');
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/authMiddleware');

const REQUIRED_HANDLERS = [
  'upload',
  'getByCandidates',
  'getByCandidate',
  'downloadEmailUploadResume',
  'patchEmailUploadNotes',
  'getNotificationMessages',
  'downloadNotificationMessageAttachment',
  'updateNotificationMessageAssignee',
  'updateNotificationMessageStatus',
  'send',
  'sendScreeningCv',
  'listScreeningCvReferrals',
  'getScreeningCvReferralById',
  'patchScreeningCvReferral',
];

for (const name of REQUIRED_HANDLERS) {
  if (typeof emailController[name] !== 'function') {
    throw new Error(
      `emailRoutes: emailController.${name} is missing. Deploy the full backend/src/controllers/emailController.js.`,
    );
  }
}

const router = express.Router();

router.post('/email-upload', emailController.upload);
router.get('/by-candidates', emailController.getByCandidates);
router.get('/candidate/:candidateId', emailController.getByCandidate);

// Static paths before /:id — otherwise Express may bind the wrong handler at registration time.
router.get('/messages', authMiddleware, emailController.getNotificationMessages);
router.get(
  '/messages/:id/attachments/:index',
  authMiddleware,
  emailController.downloadNotificationMessageAttachment,
);
router.patch('/messages/:id/assign', authMiddleware, emailController.updateNotificationMessageAssignee);
router.patch('/messages/:id/status', authMiddleware, emailController.updateNotificationMessageStatus);
router.post('/send', authMiddleware, emailController.send);
router.post('/send-screening-cv', authMiddleware, emailController.sendScreeningCv);
router.get('/screening-cv-referrals', authMiddleware, emailController.listScreeningCvReferrals);
router.get('/screening-cv-referrals/:id', authMiddleware, emailController.getScreeningCvReferralById);
router.patch('/screening-cv-referrals/:id', authMiddleware, emailController.patchScreeningCvReferral);

router.get('/:id/resume', emailController.downloadEmailUploadResume);
router.patch('/:id/notes', emailController.patchEmailUploadNotes);

module.exports = router;
