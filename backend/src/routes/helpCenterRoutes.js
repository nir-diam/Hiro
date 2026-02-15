const express = require('express');
const helpCenterController = require('../controllers/helpCenterController');

const router = express.Router();

router.get('/articles', helpCenterController.listArticles);
router.post('/articles', helpCenterController.createArticle);
router.put('/articles/:id', helpCenterController.updateArticle);
router.delete('/articles/:id', helpCenterController.deleteArticle);

module.exports = router;

