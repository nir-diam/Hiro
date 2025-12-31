const express = require('express');
const chatController = require('../controllers/chatController');

const router = express.Router();

router.post('/', chatController.sendMessage);
router.get('/:chatId', chatController.history);
router.get('/user/:userId/latest', chatController.latestByUser);

module.exports = router;

