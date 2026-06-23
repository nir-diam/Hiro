const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const EXPECTED_DIMENSIONS = undefined;

const QUERY_EMB_CACHE_TTL = 24 * 60 * 60; // 24 h
// In-memory fallback cache (survives Redis being down, process-scoped)
const _inMemEmbCache = new Map(); // hash → { emb, expiresAt }

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

/**
 * Like embedText but caches the result in memory (+ Redis when available) by SHA-256 hash.
 * Eliminates repeated Gemini round-trips (13-30s) for the same text within a server session.
 */
async function embedTextCached(text) {
  if (!text || !text.trim()) return [];

  const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);

  // 1. In-memory cache (fastest — works even when Redis is down)
  const mem = _inMemEmbCache.get(hash);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.emb;
  }

  // 2. Redis cache
  let redisService = null;
  try { redisService = require('./redisService'); } catch (_) { /* optional */ }
  if (redisService) {
    try {
      const cached = await redisService.get(`embed:q:${hash}`);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        _inMemEmbCache.set(hash, { emb: cached, expiresAt: Date.now() + QUERY_EMB_CACHE_TTL * 1000 });
        return cached;
      }
    } catch (_) { /* cache miss */ }
  }

  // 3. Call Gemini
  const embedding = await embedText(text);
  if (embedding && embedding.length > 0) {
    _inMemEmbCache.set(hash, { emb: embedding, expiresAt: Date.now() + QUERY_EMB_CACHE_TTL * 1000 });
    if (redisService) {
      redisService.set(`embed:q:${hash}`, embedding, { ttlSeconds: QUERY_EMB_CACHE_TTL }).catch(() => {});
    }
  }
  return embedding;
}

module.exports = { embedText, embedTextCached };
