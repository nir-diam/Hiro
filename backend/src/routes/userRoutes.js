const express = require('express');
const userController = require('../controllers/userController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:settings'));

router.get('/', userController.list);
router.post('/', userController.create);
router.get('/:id', userController.getById);
router.put('/:id', userController.update);

module.exports = router;
