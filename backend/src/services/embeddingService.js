const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const EXPECTED_DIMENSIONS = undefined;


const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GEMINI_API_TOKEN;
const geminiClient = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

async function embedText(text) {
  if (!geminiClient) {
    throw new Error('Gemini API key not configured');
  }

  if (!text || !text.trim()) return [];

  const response = await geminiClient.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [text],
    config: { output_dimensionality: EXPECTED_DIMENSIONS },
  });

  const embedding =
    response?.embeddings?.[0]?.values ?? response?.embeddings?.[0]?.value ?? [];



  return embedding;
}

module.exports = { embedText };
