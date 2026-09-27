const express = require('express');
const agentAuthController = require('../controllers/agentAuthController');

const router = express.Router();

router.post('/login', agentAuthController.login);

module.exports = router;
