const express = require('express');
const candidateApplicationController = require('../controllers/candidateApplicationController');

const router = express.Router();

router.get('/', candidateApplicationController.list);
router.post('/', candidateApplicationController.create);
router.put('/:id', candidateApplicationController.update);
router.delete('/:id', candidateApplicationController.remove);

module.exports = router;

