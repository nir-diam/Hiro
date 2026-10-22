const { readZipEntries } = require('./zipStoredEntries');

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&amp;/g, '&');
}

/**
 * All visible Word text, including tables and text boxes (`w:txbxContent`).
 * mammoth's extractRawText skips text boxes, which JobMaster CV templates use.
 */
function extractWordprocessingMlText(xml) {
  const src = String(xml || '');
  if (!src) return '';
  const chunks = [];
  const re = /<w:p\b[^>]*\/>|<\/w:p>|<w:tab\s*\/>|<w:br\s*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  let match;
  while ((match = re.exec(src))) {
    const tok = match[0];
    if (tok.startsWith('</w:p') || tok.startsWith('<w:p')) chunks.push('\n');
    else if (tok.startsWith('<w:tab')) chunks.push('\t');
    else if (tok.startsWith('<w:br')) chunks.push('\n');
    else if (match[1] != null) chunks.push(decodeXmlEntities(match[1]));
  }
  const lines = chunks.join('').split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim());
  const deduped = [];
  for (const line of lines) {
    if (!line) {
      if (deduped.length && deduped[deduped.length - 1] !== '') deduped.push('');
      continue;
    }
    if (deduped[deduped.length - 1] === line) continue;
    deduped.push(line);
  }
  return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isWordXmlPath(name) {
  const n = String(name || '').replace(/\\/g, '/');
  return /^word\/(document|header\d*|footer\d*)\.xml$/i.test(n);
}

/** Pull text from a docx buffer via the OOXML parts, not the file extension. */
function extractDocxXmlText(buffer) {
  let entries = [];
  try {
    entries = readZipEntries(buffer, isWordXmlPath);
  } catch (_err) {
    return '';
  }
  if (!entries.length) return '';
  const order = (name) => {
    const n = name.replace(/\\/g, '/');
    if (/document\.xml$/i.test(n)) return 0;
    if (/header/i.test(n)) return 1;
    return 2;
  };
  entries.sort((a, b) => order(a.name) - order(b.name));
  return entries
    .map((entry) => extractWordprocessingMlText(entry.data.toString('utf8')))
    .filter(Boolean)
    .join('\n')
    .trim();
}

module.exports = {
  extractWordprocessingMlText,
  extractDocxXmlText,
};
