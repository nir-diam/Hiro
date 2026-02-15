const express = require('express');
const organizationController = require('../controllers/organizationController');
const organizationTmpRoutes = require('./organizationTmpRoutes');

const router = express.Router();

router.get('/', organizationController.list);
router.use('/tmp', organizationTmpRoutes);
router.get('/:id', organizationController.get);
router.post('/', organizationController.create);
router.post('/enrich', organizationController.enrich);
router.put('/:id', organizationController.update);
router.delete('/:id', organizationController.remove);

module.exports = router;

