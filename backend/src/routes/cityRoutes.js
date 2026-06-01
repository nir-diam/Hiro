const express = require('express');
const cityController = require('../controllers/cityController');

const router = express.Router();

router.get('/resolve', cityController.resolveExact);
router.get('/radius', cityController.listWithinRadius);
router.get('/', cityController.list);

module.exports = router;
