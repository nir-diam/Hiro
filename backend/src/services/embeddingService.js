const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const GEMINI_EMBED_MODEL = 'models/text-embedding-004';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_API_TOKEN;

/**
 * Call Gemini embedding endpoint for a given text.
 * Returns an array of floats.
 */
const embedText = async (text) => {
  if (!GEMINI_API_KEY) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }
  if (!text || !text.trim()) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const body = {
    model: GEMINI_EMBED_MODEL,
    content: { parts: [{ text }] },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await res.text();
    const err = new Error(`Gemini embedding failed: ${res.status} ${msg}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const vec = data?.embedding?.values || data?.embedding?.value || [];
  return Array.isArray(vec) ? vec : [];
};

module.exports = { embedText };


