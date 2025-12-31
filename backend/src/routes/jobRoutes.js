const express = require('express');
const jobController = require('../controllers/jobController');

const router = express.Router();

router.get('/', jobController.list);
router.get('/:id', jobController.get);
router.post('/', jobController.create);
router.put('/:id', jobController.update);
router.delete('/:id', jobController.remove);

module.exports = router;

