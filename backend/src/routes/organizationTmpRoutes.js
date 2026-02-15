const express = require('express');
const organizationTmpController = require('../controllers/organizationTmpController');

const router = express.Router();

router.get('/', organizationTmpController.list);
router.post('/resolve', organizationTmpController.resolve);
router.get('/history', organizationTmpController.listHistory);

module.exports = router;

