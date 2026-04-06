const express = require('express');
const businessLogicController = require('../controllers/businessLogicController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:admin'));

router.get('/', businessLogicController.listLogicRules);
router.post('/', businessLogicController.createLogicRule);
router.put('/:id', businessLogicController.updateLogicRule);
router.delete('/:id', businessLogicController.deleteLogicRule);

module.exports = router;

