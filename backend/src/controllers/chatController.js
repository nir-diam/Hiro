const chatService = require('../services/chatService');

const sendMessage = async (req, res) => {
  const { chatId, userId, message, tagsText } = req.body;
  try {
    const result = await chatService.chat({ chatId, userId, message, tagsText });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Chat failed' });
  }
};

const history = async (req, res) => {
  try {
    const messages = await chatService.fetchHistory(req.params.chatId);
    res.json({ chatId: req.params.chatId, messages });
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const latestByUser = async (req, res) => {
  try {
    const data = await chatService.fetchLatestByUser(req.params.userId);
    if (!data) {
      return res.status(404).json({ message: 'No conversation found' });
    }
    res.json(data);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to load conversation' });
  }
};

module.exports = { sendMessage, history, latestByUser };

