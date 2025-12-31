const path = require('path');
const dotenv = require('dotenv');
// Safety: load env here in case service is required before server loads it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const MODEL = 'gemini-3-flash-preview';

const sendChat = async ({ apiKey, systemPrompt, history }) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents: history.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
  };

  const res = await fetch(url, {
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
  const candidate = data?.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text || '';
  if (!text) {
    const err = new Error('Gemini returned empty response');
    err.status = 500;
    throw err;
  }
  return text;
};

module.exports = { sendChat };

