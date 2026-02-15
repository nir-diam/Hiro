const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const MODEL = 'gemini-3-flash-preview';
const fetchImpl = (typeof fetch !== 'undefined') ? fetch : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

const extractText = (data) => {
  if (!data?.candidates?.length) return '';
  for (const cand of data.candidates) {
    const parts = cand?.content?.parts || [];
    for (const p of parts) {
      if (p?.text) return p.text;
    }
  }
  return '';
};

const buildContentsFromHistory = (history = [], message = '') => {
  const orderedHistory = Array.isArray(history) ? [...history].reverse() : [];
  const recentHistory = orderedHistory.slice(-5);

  const historyLines = recentHistory
    .map((m) => `${m.role === 'model' ? 'model' : 'user'}: ${m.text || ''}`)
    .filter(Boolean)
    .join('\n');

  const contents = [];
  if (message?.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: message.trim() }],
    });
  }
  if (historyLines) {
    contents.push({
      role: 'system',
      parts: [
        { text: 'background history:' },
        { text: historyLines },
      ],
    });
  }
  return contents;
};

const sendChat = async ({ apiKey, systemPrompt, history = [], message = '' }) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const contents = buildContentsFromHistory(history, message);

  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents,
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini request failed: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = extractText(data);
  if (text && text.trim()) return text;

  const safety = data?.promptFeedback ? JSON.stringify(data.promptFeedback) : '';
  return `לא התקבלה תשובה מהמודל. ${safety ? `הערת מערכת: ${safety}` : 'נסה שוב או נסה לקצר את ההודעה.'}`;
};

const sendSingleTurnChat = async ({ apiKey, systemPrompt, message }) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }
  if (!message || !message.trim()) {
    const err = new Error('Single turn call requires a message');
    err.status = 400;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
    ],
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Gemini request failed: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text =  extractText(data);
  if (text && text.trim()) return text;

  const safety = data?.promptFeedback ? JSON.stringify(data.promptFeedback) : '';
  return `לא התקבלה תשובה מהמודל. ${safety ? `הערת מערכת: ${safety}` : 'נסה שוב או נסה לקצר את ההודעה.'}`;
};

module.exports = { sendChat, sendSingleTurnChat };

