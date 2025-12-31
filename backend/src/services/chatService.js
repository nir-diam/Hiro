const path = require('path');
const dotenv = require('dotenv');
// Ensure env is loaded even if server missed it (e.g., different cwd)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const Chat = require('../models/Chat');
const ChatMessage = require('../models/ChatMessage');
const { sendChat } = require('./geminiService');

const SYSTEM_TEMPLATE = (tagsText = '') => (
  `You are a taxonomy expert assistant for a recruitment system.
You have access to the current list of tags: ${tagsText || 'N/A'}.
Help the user organize, deduplicate, or suggest new tags. Answer in Hebrew.`
);

const getOrCreateChat = async ({ chatId, userId, title }) => {
  if (chatId) {
    const chat = await Chat.findByPk(chatId);
    if (chat) return chat;
  }
  return Chat.create({ userId, title: title || 'Taxonomy Chat' });
};

const fetchHistory = async (chatId, limit = 30) => {
  const rows = await ChatMessage.findAll({
    where: { chatId },
    order: [['createdAt', 'ASC']],
    limit,
  });
  return rows.map((m) => ({ role: m.role, text: m.text }));
};

const fetchLatestByUser = async (userId) => {
  const chat = await Chat.findOne({
    where: { userId },
    order: [['createdAt', 'DESC']],
  });
  if (!chat) return null;
  const messages = await fetchHistory(chat.id);
  return { chatId: chat.id, messages };
};

const appendMessage = async (chatId, role, text) => {
  await ChatMessage.create({ chatId, role, text });
};

const chat = async ({ chatId, userId, message, tagsText }) => {
  if (!message) {
    const err = new Error('Message is required');
    err.status = 400;
    throw err;
  }
  const chatRow = await getOrCreateChat({ chatId, userId });
  await appendMessage(chatRow.id, 'user', message);
  const history = await fetchHistory(chatRow.id);

  const systemPrompt = SYSTEM_TEMPLATE(tagsText);
  const apiKey =
    process.env.GIMINI_KEY
    || process.env.GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.API_KEY;

  const reply = await sendChat({
    apiKey,
    systemPrompt,
    history,
  });

  await appendMessage(chatRow.id, 'model', reply);
  const updatedHistory = await fetchHistory(chatRow.id);

  return { chatId: chatRow.id, messages: updatedHistory };
};

module.exports = { chat, fetchHistory };
module.exports = { chat, fetchHistory, fetchLatestByUser };

