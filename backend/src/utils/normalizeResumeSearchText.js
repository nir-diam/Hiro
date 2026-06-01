/**
 * Normalize raw text extracted from PDF/DOCX/OCR before persisting as searchText.
 * Form-style CVs often yield "label\\n\\nvalue\\n\\n" per field; we keep single line breaks
 * and at most one blank line before major section headers.
 */

const SECTION_HEADER =
  /^(ניסיון תעסוקתי|השכלה|השכלות|כישורים|מיומנויות|שפות|הסמכות|הכשרות|פרטים אישיים|סיכום מקצועי|פרופיל מקצועי|experience|education|skills|languages|certifications|summary|profile)/i;

/**
 * @param {string} raw
 * @returns {string}
 */
function normalizeResumeSearchText(raw) {
  if (!raw) return '';
  let text = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  text = text
    .split('\n')
    .map((line) => line.replace(/\u00a0/g, ' ').trimEnd())
    .join('\n');

  // Drop lines that are only punctuation/spaces (lone "." from form fields)
  text = text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^[.\-–—•·]+$/.test(t)) return false;
      return true;
    })
    .join('\n');

  // Collapse runs of blank lines to a single newline (no double-spacing between fields)
  text = text.replace(/\n{2,}/g, '\n');

  // Re-introduce one blank line before section headers for readability
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      i > 0 &&
      trimmed &&
      SECTION_HEADER.test(trimmed) &&
      out.length > 0 &&
      out[out.length - 1] !== ''
    ) {
      out.push('');
    }
    out.push(line);
  }
  text = out.join('\n');

  // Never more than one consecutive blank line
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

module.exports = { normalizeResumeSearchText };
