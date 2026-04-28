const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const { authMiddleware } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', auditLogController.list);
router.get('/stats', auditLogController.stats);
router.get('/by-entity/:type/:entityId', auditLogController.listByEntity);
router.get('/:id', auditLogController.getOne);
router.post('/', auditLogController.create);
router.delete('/:id', auditLogController.remove);

module.exports = router;
