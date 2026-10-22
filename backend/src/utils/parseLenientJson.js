/**
 * Parse model output that is almost JSON.
 * Handles markdown fences, trailing commas, and unescaped " inside strings
 * (common in Hebrew abbreviations such as מק"ט).
 */

const stripCodeFence = (text) => {
  let cleaned = String(text || '').trim();
  if (!cleaned.startsWith('```')) return cleaned;
  cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  return cleaned.trim();
};

const extractJsonObject = (text) => {
  const cleaned = stripCodeFence(text).replace(/^\uFEFF/, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
};

const stripTrailingCommas = (text) => text.replace(/,\s*([}\]])/g, '$1');

/** Escape a " that sits inside a string instead of closing it. */
const repairUnescapedQuotes = (text) => {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const next = text[j];
      const closes = next == null || next === ':' || next === ',' || next === '}' || next === ']';
      if (closes) {
        out += ch;
        inString = false;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (ch === '\n') {
      out += '\\n';
      continue;
    }
    if (ch === '\r') {
      out += '\\r';
      continue;
    }
    if (ch === '\t') {
      out += '\\t';
      continue;
    }
    out += ch;
  }
  return out;
};

const parseLenientJsonObject = (raw) => {
  const extracted = extractJsonObject(raw);
  const attempts = [
    extracted,
    stripTrailingCommas(extracted),
    repairUnescapedQuotes(extracted),
    stripTrailingCommas(repairUnescapedQuotes(extracted)),
  ];

  let lastError = null;
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (err) {
      lastError = err;
    }
  }

  const err = new Error('Failed to parse AI response as JSON');
  err.status = 500;
  err.cause = lastError;
  throw err;
};

module.exports = {
  parseLenientJsonObject,
  repairUnescapedQuotes,
};
