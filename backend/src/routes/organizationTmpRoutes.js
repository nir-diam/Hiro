const express = require('express');
const organizationTmpController = require('../controllers/organizationTmpController');
const authMiddleware = require('../middleware/authMiddleware');
const { attachDbUser } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.get('/', organizationTmpController.list);
router.post('/resolve', organizationTmpController.resolve);
router.get('/history', organizationTmpController.listHistory);
router.get('/:id/profile', authMiddleware, attachDbUser, organizationTmpController.getProfile);
router.patch('/:id', authMiddleware, attachDbUser, organizationTmpController.updateById);
router.get('/:id', authMiddleware, attachDbUser, organizationTmpController.getById);

module.exports = router;

