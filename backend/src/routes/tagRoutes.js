const express = require('express');
const tagController = require('../controllers/tagController');

const router = express.Router();

router.get('/', tagController.list);
router.get('/:id', tagController.get);
router.post('/', tagController.create);
router.put('/:id', tagController.update);
router.delete('/:id', tagController.remove);
router.post('/ai/enrich', tagController.enrich);

module.exports = router;

