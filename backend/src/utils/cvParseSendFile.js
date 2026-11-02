/** Max inline payload for Gemini generateContent (PDF / image). */
const GEMINI_CV_INLINE_MAX_BYTES = 20 * 1024 * 1024;

function envFlagOn(name, defaultOn = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return defaultOn;
  const v = String(raw).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  return defaultOn;
}

/**
 * When true, CV ingest sends the original PDF/image to Gemini instead of (as primary)
 * the locally extracted text. Text extract still runs for search / heuristics / fallback.
 *
 * Env: CV_PARSE_SEND_FILE_TO_GEMINI=true
 */
function isCvParseSendFileToGeminiEnabled() {
  return envFlagOn('CV_PARSE_SEND_FILE_TO_GEMINI', false);
}

function looksLikePdfBuffer(buffer) {
  return Boolean(buffer && buffer.length >= 5 && buffer.slice(0, 5).toString('utf8') === '%PDF-');
}

/**
 * Gemini generateContent inlineData MIME types we can send without a File API upload.
 * Word (.doc/.docx) is not in this list — those still go through local text extract.
 */
function geminiInlineMimeForCv(mimeType, buffer) {
  if (looksLikePdfBuffer(buffer)) return 'application/pdf';
  const m = String(mimeType || '').toLowerCase();
  if (m.includes('pdf')) return 'application/pdf';
  if (m.includes('png')) return 'image/png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'image/jpeg';
  if (m.includes('webp')) return 'image/webp';
  if (m.includes('gif')) return 'image/gif';
  if (m.includes('heic')) return 'image/heic';
  if (m.includes('heif')) return 'image/heif';
  return null;
}

function resolveGeminiCvInlineFile(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) return null;
  if (buffer.length > GEMINI_CV_INLINE_MAX_BYTES) return null;
  const mime = geminiInlineMimeForCv(mimeType, buffer);
  if (!mime) return null;
  return { mimeType: mime, data: buffer.toString('base64') };
}

function buildCvFileParseInstruction({ fileNameHint = null, repairMissing = null } = {}) {
  const hint = fileNameHint
    ? ` Prefer this exact candidate full name from the filename unless the document clearly shows another person: "${fileNameHint}". Do NOT drop middle names.`
    : '';
  if (repairMissing) {
    return (
      `Your previous JSON was missing or malformed for these keys: ${JSON.stringify(repairMissing)}.\n` +
      'Re-read the resume document above and return ONE complete JSON object matching the schema, ' +
      'with EVERY required key present (use null / [] / {} when truly unknown). ' +
      'workExperience dates are integers: startYear, startMonth, endYear, endMonth, plus isCurrent. ' +
      'Months are null when not written in the CV. Never a date string. ' +
      `Do not drop any fields you already populated correctly.${hint}`
    );
  }
  return (
    'The document above is a candidate resume (CV). Extract all data exactly as instructed in the system prompt ' +
    `and return the JSON object. Do not invent months or years that are not written in the document.${hint}`
  );
}

function buildGeminiCvFileUserParts({ buffer, mimeType, instruction }) {
  const file = resolveGeminiCvInlineFile(buffer, mimeType);
  if (!file) return null;
  const text = String(instruction || '').trim() || buildCvFileParseInstruction();
  return [
    { inlineData: file },
    { text },
  ];
}

module.exports = {
  GEMINI_CV_INLINE_MAX_BYTES,
  isCvParseSendFileToGeminiEnabled,
  geminiInlineMimeForCv,
  resolveGeminiCvInlineFile,
  buildCvFileParseInstruction,
  buildGeminiCvFileUserParts,
};
