/**
 * Parsed CV version history stored in candidates.originalText (JSONB array).
 * @typedef {{ text: string, savedAt: string | null }} ParsedTextHistoryEntry
 */

/**
 * @param {unknown} raw
 * @returns {ParsedTextHistoryEntry[]}
 */
function normalizeOriginalTextHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const text = String(entry.text ?? '').trim();
      if (!text) continue;
      const savedAt = entry.savedAt ? String(entry.savedAt) : null;
      out.push({ text: text.slice(0, 50000), savedAt });
      continue;
    }
    const text = String(entry ?? '').trim();
    if (!text) continue;
    out.push({ text: text.slice(0, 50000), savedAt: null });
  }
  return out;
}

module.exports = { normalizeOriginalTextHistory };
