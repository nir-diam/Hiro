const express = require('express');
const eventTypeController = require('../controllers/eventTypeController');
const { authMiddleware } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', eventTypeController.list);
router.post('/', eventTypeController.create);
router.put('/:id', eventTypeController.update);
router.delete('/:id', eventTypeController.remove);

module.exports = router;
