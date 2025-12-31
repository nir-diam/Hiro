const express = require('express');
const controller = require('../controllers/jobFieldController');

const router = express.Router();

router.get('/', controller.list);

router.post('/categories', controller.createCategory);
router.put('/categories/:id', controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);

router.post('/clusters', controller.createCluster);
router.put('/clusters/:id', controller.updateCluster);
router.delete('/clusters/:id', controller.deleteCluster);

router.post('/roles', controller.createRole);
router.put('/roles/:id', controller.updateRole);
router.delete('/roles/:id', controller.deleteRole);

router.post('/ai/suggest-clusters', controller.suggestClusters);
router.post('/ai/suggest-roles', controller.suggestRoles);

module.exports = router;

