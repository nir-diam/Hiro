const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/verify-login-code', authController.verifyLoginCode);
router.post('/resend-login-code', authController.resendLoginCode);
router.post('/google', authController.loginWithGoogle);
router.post('/signup', authController.signup);
router.get('/me', authMiddleware, authController.me);

module.exports = router;

