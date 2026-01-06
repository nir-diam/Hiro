const path = require('path');
const dotenv = require('dotenv');
// Safety: load env here in case service is required before server loads it
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const MODEL = 'gemini-3-flash-preview';

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
  const text = extractText(data);
  if (text && text.trim()) return text;

  // Fallback: return a friendly message instead of throwing so UI keeps flowing
  const safety = data?.promptFeedback ? JSON.stringify(data.promptFeedback) : '';
  return `לא התקבלה תשובה מהמודל. ${safety ? `הערת מערכת: ${safety}` : 'נסה שוב או נסה לקצר את ההודעה.'}`;
};

module.exports = { sendChat };

