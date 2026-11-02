/**
 * Postgres json/jsonb text rejects `\u` when not followed by exactly 4 hex digits.
 * Parsed CV / AI fields often contain literal backslash-u sequences.
 */
const sanitizeInvalidJsonUnicodeEscapes = (str) => {
  if (typeof str !== 'string' || !str.includes('\\')) return str;
  return str.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
};

const deepSanitizeStringsForPostgres = (value) => {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return sanitizeInvalidJsonUnicodeEscapes(value);
  if (Array.isArray(value)) return value.map(deepSanitizeStringsForPostgres);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deepSanitizeStringsForPostgres(v);
    }
    return out;
  }
  return value;
};

const isUnsupportedUnicodeEscapeError = (err) =>
  /unsupported Unicode escape sequence/i.test(String(err?.message || err?.parent?.message || ''));

module.exports = {
  sanitizeInvalidJsonUnicodeEscapes,
  deepSanitizeStringsForPostgres,
  isUnsupportedUnicodeEscapeError,
};
