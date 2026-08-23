/**
 * In-memory index: normalized tag term → canonical normalized tag_key.
 * Used by matchingScoreService to match job skills against candidate tags via
 * catalog aliases, synonyms, and display names.
 */

function normTerm(raw) {
  return String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** @type {Map<string, string>|null} */
let _index = null;
/** @type {Promise<Map<string, string>>|null} */
let _loading = null;

function registerTerm(index, rawTerm, canonical) {
  const term = normTerm(rawTerm);
  const canon = normTerm(canonical);
  if (!term || !canon) return;
  index.set(term, canon);
}

function buildIndexFromRows(rows) {
  /** @type {Map<string, string>} */
  const index = new Map();
  for (const row of rows) {
    const tagKey = row.tagKey || row.tag_key || '';
    const canonical = normTerm(tagKey);
    if (!canonical) continue;

    registerTerm(index, tagKey, canonical);
    registerTerm(index, row.displayNameHe || row.display_name_he, canonical);
    registerTerm(index, row.displayNameEn || row.display_name_en, canonical);

    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    for (const alias of aliases) registerTerm(index, alias, canonical);

    const synonyms = Array.isArray(row.synonyms) ? row.synonyms : [];
    for (const syn of synonyms) {
      const phrase = typeof syn === 'string' ? syn : syn?.phrase;
      registerTerm(index, phrase, canonical);
    }
  }
  return index;
}

/**
 * @returns {Promise<Map<string, string>>}
 */
async function loadTagAliasIndex() {
  if (_index) return _index;
  if (_loading) return _loading;

  _loading = (async () => {
    try {
      const Tag = require('../models/Tag');
      const rows = await Tag.findAll({
        attributes: ['tagKey', 'displayNameHe', 'displayNameEn', 'aliases', 'synonyms'],
        raw: true,
      });
      _index = buildIndexFromRows(rows);
      return _index;
    } catch (e) {
      console.warn('[tagAliasIndexService] load failed:', e?.message || e);
      _index = new Map();
      return _index;
    } finally {
      _loading = null;
    }
  })();

  return _loading;
}

function invalidateTagAliasIndex() {
  _index = null;
  _loading = null;
}

/**
 * Resolve a free-text / alias / tag_key to canonical normalized tag_key.
 * @param {string} raw
 * @param {Map<string, string>} [index]
 * @returns {string}
 */
function resolveCanonicalTagKey(raw, index = _index) {
  const term = normTerm(raw);
  if (!term) return '';
  if (!index || !index.size) return term;
  return index.get(term) || term;
}

/**
 * True when two tag labels refer to the same catalog tag (via aliases/synonyms).
 * @param {string} a
 * @param {string} b
 * @param {Map<string, string>} [index]
 */
function tagKeysEquivalent(a, b, index = _index) {
  const na = normTerm(a);
  const nb = normTerm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (!index || !index.size) return false;
  return resolveCanonicalTagKey(na, index) === resolveCanonicalTagKey(nb, index);
}

module.exports = {
  normTerm,
  loadTagAliasIndex,
  invalidateTagAliasIndex,
  buildIndexFromRows,
  resolveCanonicalTagKey,
  tagKeysEquivalent,
};
