const express = require('express');
const appLogController = require('../controllers/appLogController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:admin'));

router.get('/', appLogController.list);
router.get('/stats', appLogController.stats);
router.get('/sources', appLogController.listSources);
router.get('/:id', appLogController.getOne);
router.post('/', appLogController.create);
router.delete('/:id', appLogController.remove);

module.exports = router;
