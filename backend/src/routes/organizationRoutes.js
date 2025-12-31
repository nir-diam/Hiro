const express = require('express');
const organizationController = require('../controllers/organizationController');

const router = express.Router();

router.get('/', organizationController.list);
router.get('/:id', organizationController.get);
router.post('/', organizationController.create);
router.put('/:id', organizationController.update);
router.delete('/:id', organizationController.remove);

module.exports = router;

