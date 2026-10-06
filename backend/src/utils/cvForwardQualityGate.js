const { resumeTextLooksOcrGarbled } = require('./pdfTextQuality');

const MIN_RESUME_BYTES = 80;
const MIN_TEXT_CHARS = 40;

function looksLikeRawPdfBytes(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  const head = buffer.subarray(0, 5).toString('ascii');
  return head.startsWith('%PDF');
}

/**
 * Minimum quality check before auto-forwarding a CV (does not wait for full AI).
 * @param {{
 *   resumeBuffer?: Buffer | null,
 *   resumeUrl?: string | null,
 *   extractedText?: string | null,
 *   hasCvText?: boolean,
 *   ranFullEnrichment?: boolean,
 *   mimeType?: string | null,
 * }} input
 * @returns {{ ok: boolean, reason?: string }}
 */
function passesCvForwardQualityGate(input = {}) {
  const buffer = input.resumeBuffer && Buffer.isBuffer(input.resumeBuffer) ? input.resumeBuffer : null;
  const extractedText = String(input.extractedText || '').trim();
  const hasCvText =
    input.hasCvText === true
    || extractedText.length >= MIN_TEXT_CHARS
    || Boolean(input.ranFullEnrichment);

  if (buffer) {
    if (buffer.length < MIN_RESUME_BYTES) {
      return { ok: false, reason: 'resume_too_small' };
    }
    if (!hasCvText && !looksLikeRawPdfBytes(buffer)) {
      return { ok: false, reason: 'unrecognized_file' };
    }
    if (extractedText && resumeTextLooksOcrGarbled(extractedText) && extractedText.length < MIN_TEXT_CHARS) {
      return { ok: false, reason: 'garbled_text' };
    }
    return { ok: true };
  }

  if (input.resumeUrl && (hasCvText || input.ranFullEnrichment)) {
    return { ok: true };
  }

  return { ok: false, reason: 'missing_resume' };
}

module.exports = {
  MIN_RESUME_BYTES,
  MIN_TEXT_CHARS,
  passesCvForwardQualityGate,
  looksLikeRawPdfBytes,
};
