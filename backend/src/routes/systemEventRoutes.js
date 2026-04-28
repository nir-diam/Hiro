const express = require('express');
const systemEventController = require('../controllers/systemEventController');
const { authMiddleware } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', systemEventController.list);
router.post('/', systemEventController.create);
router.put('/:id', systemEventController.update);
router.delete('/:id', systemEventController.remove);

module.exports = router;
