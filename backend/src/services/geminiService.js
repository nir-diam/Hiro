const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const MODEL = 'gemini-3-flash-preview';
const fetchImpl = (typeof fetch !== 'undefined') ? fetch : ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const appLogger = require('../utils/appLogger');

/** Prefer GEMINI_* keys — GOOGLE_API_KEY is often a separate key (e.g. Search) blocked on Generative Language API. */
const resolveGeminiApiKey = () =>
  process.env.GEMINI_API_KEY ||
  process.env.GEMINI_KEY ||
  process.env.GIMINI_KEY ||
  process.env.API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';

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
 * @param {string} [opts.promptId] Tracked prompt id — logs input/output JSON to app_logs when whitelisted.
 * @param {Object|Array|string} [opts.llmInputJson] Explicit input payload for logging.
 */
const sendChat = async ({
  apiKey,
  systemPrompt,
  history = [],
  message = '',
  generationConfig,
  responseMimeType,
  responseSchema,
  promptId,
  llmInputJson,
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

  const resolveInputJsonForLog = () => {
    if (!promptId) {
      if (llmInputJson != null) return llmInputJson;
      const fromMessage = appLogger.tryParseJson(message);
      if (fromMessage != null) return fromMessage;
      return { message: appLogger.truncate(message, 8000) };
    }
    return appLogger.buildLlmInputForLog({
      systemPrompt,
      message,
      history,
      generationConfig: Object.keys(mergedGenConfig).length ? mergedGenConfig : null,
      variables: llmInputJson,
      model: MODEL,
    });
  };

  try {
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
      appLogger.logPromptExchange({
        promptId,
        inputJson: resolveInputJsonForLog(),
        outputText: parsedErr?.error?.message || text,
        error: err,
      });
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

    const finalText = (text && text.trim())
      ? text
      : `לא התקבלה תשובה מהמודל. ${data?.promptFeedback ? `הערת מערכת: ${JSON.stringify(data.promptFeedback)}` : 'נסה שוב או נסה לקצר את ההודעה.'}`;

    appLogger.logPromptExchange({
      promptId,
      inputJson: resolveInputJsonForLog(),
      outputText: finalText,
    });

    return finalText;
  } catch (err) {
    if (!err?.status) {
      appLogger.logPromptExchange({
        promptId,
        inputJson: resolveInputJsonForLog(),
        outputText: null,
        error: err,
      });
    }
    throw err;
  }
};

const sendSingleTurnChat = async ({
  apiKey,
  systemPrompt,
  message,
  promptId,
  llmInputJson,
}) => {
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

  const resolveInputJsonForLog = () => {
    if (!promptId) {
      if (llmInputJson != null) return llmInputJson;
      const fromMessage = appLogger.tryParseJson(message);
      if (fromMessage != null) return fromMessage;
      return { message: appLogger.truncate(message, 8000) };
    }
    return appLogger.buildLlmInputForLog({
      systemPrompt,
      message,
      variables: llmInputJson,
      model: MODEL,
    });
  };

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`Gemini request failed: ${res.status} ${text}`);
      err.status = res.status;
      appLogger.logPromptExchange({
        promptId,
        inputJson: resolveInputJsonForLog(),
        outputText: text,
        error: err,
      });
      throw err;
    }

    const data = await res.json();
    const text = extractText(data);
    const finalText = (text && text.trim())
      ? text
      : `לא התקבלה תשובה מהמודל. ${data?.promptFeedback ? `הערת מערכת: ${JSON.stringify(data.promptFeedback)}` : 'נסה שוב או נסה לקצר את ההודעה.'}`;

    appLogger.logPromptExchange({
      promptId,
      inputJson: resolveInputJsonForLog(),
      outputText: finalText,
    });

    return finalText;
  } catch (err) {
    if (!err?.status) {
      appLogger.logPromptExchange({
        promptId,
        inputJson: resolveInputJsonForLog(),
        outputText: null,
        error: err,
      });
    }
    throw err;
  }
};

const IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
  'gemini-2.0-flash-preview-image-generation',
];

/** Nano Banana image models (Gemini native image generation). */
const NANO_BANANA_MODELS = [
  process.env.NANO_BANANA_MODEL,
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
].filter(Boolean);

const parseLogoInline = (logoDataUrl) => {
  if (!logoDataUrl || !String(logoDataUrl).startsWith('data:image/')) return null;
  const match = String(logoDataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
};

const resolveLogoInline = async (logoDataUrl) => {
  const inline = parseLogoInline(logoDataUrl);
  if (inline) return inline;
  const url = String(logoDataUrl || '').trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const mimeType = (res.headers.get('content-type') || 'image/png').split(';')[0];
    const data = Buffer.from(await res.arrayBuffer()).toString('base64');
    return { mimeType, data };
  } catch {
    return null;
  }
};

const extractInteractionImage = (data) => {
  const out = data?.output_image;
  if (out?.data) {
    return {
      buffer: Buffer.from(out.data, 'base64'),
      mimeType: out.mime_type || out.mimeType || 'image/png',
    };
  }
  for (const step of data?.steps || []) {
    for (const block of step?.content || []) {
      if (block?.type === 'image' && block?.data) {
        return {
          buffer: Buffer.from(block.data, 'base64'),
          mimeType: block.mime_type || block.mimeType || 'image/png',
        };
      }
    }
  }
  return null;
};

/**
 * Generate an image via Gemini Nano Banana (Interactions API).
 * Falls back to generateContent image models if Interactions API is unavailable.
 */
const generateNanoBananaImage = async ({
  apiKey,
  prompt,
  aspectRatio = '3:4',
  imageSize = '2K',
  logoDataUrl = null,
}) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }
  if (!prompt || !String(prompt).trim()) {
    const err = new Error('Image prompt is required');
    err.status = 400;
    throw err;
  }

  const logo = await resolveLogoInline(logoDataUrl);
  const input = logo
    ? [
        { type: 'text', text: String(prompt).trim() },
        { type: 'image', mime_type: logo.mimeType, data: logo.data },
      ]
    : String(prompt).trim();

  for (const model of NANO_BANANA_MODELS) {
    const useHighRes = model.includes('3.');
    const responseFormat = useHighRes
      ? { type: 'image', aspect_ratio: aspectRatio, image_size: imageSize }
      : { type: 'image', aspect_ratio: aspectRatio };
    try {
      const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          input,
          response_format: responseFormat,
        }),
      });
      if (!res.ok) {
        console.warn('[generateNanoBananaImage] interactions model failed', {
          model,
          status: res.status,
          body: (await res.text()).slice(0, 400),
        });
        continue;
      }
      const data = await res.json();
      const image = extractInteractionImage(data);
      if (image?.buffer?.length) {
        return { ...image, model, provider: 'nano-banana-interactions' };
      }
    } catch (err) {
      console.warn('[generateNanoBananaImage] interactions error', { model, message: err?.message });
    }
  }

  const fallback = await generateImage({ apiKey, prompt, aspectRatio, logoDataUrl });
  if (fallback?.buffer?.length) {
    return { ...fallback, provider: 'nano-banana-generate-content' };
  }
  return null;
};

const extractInlineImage = (data) => {
  for (const cand of data?.candidates || []) {
    for (const part of cand?.content?.parts || []) {
      if (part?.inlineData?.data) {
        return {
          buffer: Buffer.from(part.inlineData.data, 'base64'),
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }
  return null;
};

/**
 * Generate an image via Gemini image-capable models.
 * Returns { buffer, mimeType } or null if generation is unavailable.
 */
const generateImage = async ({ apiKey, prompt, aspectRatio = '16:9', logoDataUrl = null }) => {
  if (!apiKey) {
    const err = new Error('Gemini API key not configured');
    err.status = 500;
    throw err;
  }
  if (!prompt || !String(prompt).trim()) {
    const err = new Error('Image prompt is required');
    err.status = 400;
    throw err;
  }

  const parts = [];
  if (logoDataUrl && String(logoDataUrl).startsWith('data:image/')) {
    const match = String(logoDataUrl).match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }
  }
  parts.push({ text: String(prompt).trim() });

  for (const model of IMAGE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      };
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn('[geminiService.generateImage] model failed', {
          model,
          status: res.status,
          body: (await res.text()).slice(0, 300),
        });
        continue;
      }
      const data = await res.json();
      const image = extractInlineImage(data);
      if (image?.buffer?.length) return image;
    } catch (err) {
      console.warn('[geminiService.generateImage] model error', { model, message: err?.message });
    }
  }
  return null;
};

module.exports = {
  sendChat,
  sendSingleTurnChat,
  generateImage,
  generateNanoBananaImage,
  resolveGeminiApiKey,
  MODEL,
  IMAGE_MODELS,
  NANO_BANANA_MODELS,
};

