const express = require('express');
const referenceInfoController = require('../controllers/referenceInfoController');
const { authMiddleware } = require('../middleware/permissionMiddleware');

const router = express.Router();

router.use(authMiddleware);

router.get('/', referenceInfoController.list);
router.post('/', referenceInfoController.create);
router.put('/:id', referenceInfoController.update);
router.delete('/:id', referenceInfoController.remove);

module.exports = router;
