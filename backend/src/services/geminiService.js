const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const MODEL = 'gemini-3-flash-preview';
const fetchImpl = (typeof fetch !== 'undefined') ? fetch : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

/**
 * Pull text out of a Gemini response. Gemini may split a single answer across
 * multiple `parts` (especially under JSON-mode + tight maxOutputTokens), so we
 * concatenate every text part on the first candidate instead of returning only
 * the first one.
 */
const extractText = (data) => {
  if (!data?.candidates?.length) return '';
  for (const cand of data.candidates) {
    const parts = cand?.content?.parts || [];
    const joined = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
    if (joined) return joined;
  }
  return '';
};

/** Return the first candidate's finishReason, if any. */
const extractFinishReason = (data) => {
  const cand = data?.candidates?.[0];
  return cand?.finishReason || null;
};

/**
 * Build Gemini `contents` from optional chat history and a final user `message`.
 * Important: Gemini accepts only `user` and `model` roles inside `contents`. Any
 * extra context the caller wants to share lives under `systemInstruction`.
 */
const buildContentsFromHistory = (history = [], message = '') => {
  const ordered = Array.isArray(history) ? history.filter(Boolean) : [];
  const contents = [];
  for (const turn of ordered.slice(-10)) {
    const role = turn.role === 'model' ? 'model' : 'user';
    const text = String(turn.text || '').trim();
    if (!text) continue;
    contents.push({ role, parts: [{ text }] });
  }
  const trimmedMessage = String(message || '').trim();
  if (trimmedMessage) {
    contents.push({ role: 'user', parts: [{ text: trimmedMessage }] });
  }
  return contents;
};

/**
 * Send a chat-style request to Gemini.
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.systemPrompt
 * @param {Array<{role:'user'|'model', text:string}>} [opts.history]
 * @param {string} [opts.message]
 * @param {Object} [opts.generationConfig] Optional Gemini generationConfig overrides
 *   (e.g. temperature, maxOutputTokens, topP, topK, candidateCount, stopSequences).
 * @param {string} [opts.responseMimeType] Convenience: shortcut for generationConfig.responseMimeType.
 *   Use 'application/json' to force JSON mode.
 * @param {Object} [opts.responseSchema] Convenience: shortcut for generationConfig.responseSchema.
 */
const sendChat = async ({
  apiKey,
  systemPrompt,
  history = [],
  message = '',
  generationConfig,
  responseMimeType,
  responseSchema,
}) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const contents = buildContentsFromHistory(history, message);

  const mergedGenConfig = { ...(generationConfig || {}) };
  if (responseMimeType && !mergedGenConfig.responseMimeType) {
    mergedGenConfig.responseMimeType = responseMimeType;
  }
  if (responseSchema && !mergedGenConfig.responseSchema) {
    mergedGenConfig.responseSchema = responseSchema;
  }

  const body = {
    systemInstruction: {
      role: 'system',
      parts: [{ text: systemPrompt }],
    },
    contents,
    ...(Object.keys(mergedGenConfig).length ? { generationConfig: mergedGenConfig } : {}),
  };

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    // Gemini hides the reason inside the error JSON. Surface it.
    let parsedErr = null;
    try { parsedErr = JSON.parse(text); } catch { /* keep raw */ }
    console.error('[geminiService.sendChat] non-2xx from Gemini', {
      status: res.status,
      message: parsedErr?.error?.message || text,
      details: parsedErr?.error?.details || null,
      requestKeys: {
        hasSystemInstruction: !!body.systemInstruction,
        contentsLen: Array.isArray(body.contents) ? body.contents.length : 0,
        generationConfigKeys: body.generationConfig ? Object.keys(body.generationConfig) : [],
        responseSchemaTopKeys: body.generationConfig?.responseSchema
          ? Object.keys(body.generationConfig.responseSchema)
          : [],
      },
    });
    const err = new Error(
      `Gemini request failed: ${res.status} ${parsedErr?.error?.message || text}`,
    );
    err.status = res.status;
    err.details = parsedErr?.error?.details || null;
    throw err;
  }

  const data = await res.json();
  const text = extractText(data);
  const finishReason = extractFinishReason(data);
  if (finishReason && finishReason !== 'STOP') {
    console.warn('[geminiService.sendChat] non-STOP finishReason', {
      finishReason,
      textLen: text ? text.length : 0,
    });
  }
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

