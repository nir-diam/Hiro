const express = require('express');
const promptController = require('../controllers/promptController');
const { authMiddleware, requirePagePermission } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware, requirePagePermission('page:admin'));

router.get('/', promptController.list);
router.post('/', promptController.create);
router.put('/:id', promptController.update);
router.delete('/:id', promptController.remove);
router.post('/reset', promptController.reset);
router.get('/history', promptController.history);

module.exports = router;

