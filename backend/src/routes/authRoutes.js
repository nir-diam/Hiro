const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', authController.login);
router.post('/google', authController.loginWithGoogle);
router.post('/signup', authController.signup);

module.exports = router;

