/**
 * Join word-extractor parts for a legacy .doc.
 * AllJobs-style CVs put the name, phone, and email in the header, which
 * `getBody()` never returns.
 */

function piece(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .trim();
}

function joinLegacyDocParts(doc) {
  if (!doc) return '';
  const headers = piece(typeof doc.getHeaders === 'function' ? doc.getHeaders({ includeFooters: false }) : '');
  const body = piece(typeof doc.getBody === 'function' ? doc.getBody() : '');
  const footers = piece(typeof doc.getFooters === 'function' ? doc.getFooters() : '');
  const textboxes = piece(
    typeof doc.getTextboxes === 'function'
      ? doc.getTextboxes({ includeHeadersAndFooters: true, includeBody: true })
      : '',
  );
  const footnotes = piece(typeof doc.getFootnotes === 'function' ? doc.getFootnotes() : '');
  const endnotes = piece(typeof doc.getEndnotes === 'function' ? doc.getEndnotes() : '');
  const annotations = piece(typeof doc.getAnnotations === 'function' ? doc.getAnnotations() : '');

  const used = [];
  for (const part of [headers, body, footers, textboxes, footnotes, endnotes, annotations]) {
    if (!part) continue;
    if (used.some((prev) => prev.includes(part))) continue;
    used.push(part);
  }
  return used.join('\n');
}

async function extractLegacyDocText(buffer, { WordExtractor } = {}) {
  const Extractor = WordExtractor || require('word-extractor');
  const doc = await new Extractor().extract(buffer);
  return joinLegacyDocParts(doc);
}

module.exports = {
  joinLegacyDocParts,
  extractLegacyDocText,
};
