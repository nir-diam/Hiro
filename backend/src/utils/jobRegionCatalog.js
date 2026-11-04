const { resolveRegionSlugStrict, regionLabel, REGION_LABELS } = require('./publicJobCatalog');

function normRegionToken(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function catalogRegionNamesFromRows(rows) {
  const names = [];
  const seen = new Set();
  for (const row of rows || []) {
    const name = String(row.column4 || row.region || '').trim();
    if (!name || name === 'ערים') continue;
    const key = normRegionToken(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function matchOneRegion(part, catalog, byNorm) {
  const n = normRegionToken(part);
  if (!n) return null;
  if (byNorm.has(n)) return byNorm.get(n);

  const slug = resolveRegionSlugStrict(part);
  if (!slug) return null;
  const official = regionLabel(slug);
  if (official && official !== REGION_LABELS.other && byNorm.has(normRegionToken(official))) {
    return byNorm.get(normRegionToken(official));
  }
  for (const name of catalog) {
    if (resolveRegionSlugStrict(name) === slug) return name;
  }
  return null;
}

/** Map a free-text region onto catalog names. Unknown values become null — never "אחר". */
function resolveRegionAgainstCatalog(raw, catalogNames) {
  const full = String(raw || '').trim();
  if (!full) return null;
  const catalog = Array.isArray(catalogNames) ? catalogNames.filter(Boolean) : [];
  // City groups not loaded yet: keep a known alias (השפלה → שפלה) or the raw text.
  if (!catalog.length) {
    const slug = resolveRegionSlugStrict(full);
    if (slug && slug !== 'other') return regionLabel(slug);
    return full;
  }
  const byNorm = new Map(catalog.map((n) => [normRegionToken(n), n]));

  const whole = matchOneRegion(full, catalog, byNorm);
  if (whole) return whole;

  const parts = full.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return null;

  const resolved = [];
  const seen = new Set();
  for (const part of parts) {
    const hit = matchOneRegion(part, catalog, byNorm);
    if (hit && !seen.has(hit)) {
      seen.add(hit);
      resolved.push(hit);
    }
  }
  return resolved.length ? resolved.join(', ') : null;
}

module.exports = {
  catalogRegionNamesFromRows,
  resolveRegionAgainstCatalog,
};
