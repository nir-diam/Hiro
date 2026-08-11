const express = require('express');
const authController = require('../controllers/authController');
const userPreferencesController = require('../controllers/userPreferencesController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/verify-login-code', authController.verifyLoginCode);
router.post('/resend-login-code', authController.resendLoginCode);
router.post('/google', authController.loginWithGoogle);
router.post('/signup', authController.signup);
router.post('/forgot-password', authController.forgotPassword);
router.get('/activation/:guid', authController.getActivationCheck);
router.post('/activation/:guid', authController.postActivationComplete);
router.get('/candidate-portal/magic/check', authController.getCandidatePortalMagicCheck);
router.post('/candidate-portal/magic/setup', authController.postCandidatePortalMagicSetup);
router.get('/candidate-portal/magic', authController.redeemCandidatePortalMagic);
router.post('/candidate-portal/magic', authController.redeemCandidatePortalMagic);
router.get('/me', authMiddleware, authController.me);
router.get('/me/preferences', authMiddleware, userPreferencesController.getMine);
router.patch('/me/preferences', authMiddleware, userPreferencesController.patchMine);

module.exports = router;

