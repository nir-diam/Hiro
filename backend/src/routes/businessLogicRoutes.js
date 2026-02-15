const express = require('express');
const businessLogicController = require('../controllers/businessLogicController');

const router = express.Router();

router.get('/', businessLogicController.listLogicRules);
router.post('/', businessLogicController.createLogicRule);
router.put('/:id', businessLogicController.updateLogicRule);
router.delete('/:id', businessLogicController.deleteLogicRule);

module.exports = router;

