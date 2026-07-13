const express = require('express');
const organizationController = require('../controllers/organizationController');

const router = express.Router();

router.get('/global-lookup', organizationController.globalLookup);

module.exports = router;
