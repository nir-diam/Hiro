const express = require('express');
const promptController = require('../controllers/promptController');

const router = express.Router();

router.get('/', promptController.list);
router.post('/', promptController.create);
router.put('/:id', promptController.update);
router.delete('/:id', promptController.remove);
router.post('/reset', promptController.reset);
router.get('/history', promptController.history);

module.exports = router;

