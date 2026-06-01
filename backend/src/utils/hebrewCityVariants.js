/**
 * Hebrew city spelling normalization (e.g. AI "נהריה" vs catalog "נהרייה").
 */

function normCityCompare(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Collapse duplicate yod and normalize final -יה / -ייה for comparison. */
function hebrewCityCompareKey(s) {
  let x = normCityCompare(s);
  if (!x) return '';
  x = x.replace(/י+/g, 'י');
  if (x.endsWith('ייה')) {
    x = `${x.slice(0, -3)}יה`;
  }
  return x;
}

/** Generate search spellings for ILIKE (נהריה ↔ נהרייה, etc.). */
function hebrewCitySpellingVariants(term) {
  const t = String(term ?? '').trim();
  if (!t) return [];
  const out = new Set([t]);
  const collapsed = t.replace(/י+/g, 'י');
  out.add(collapsed);

  if (t.endsWith('יה') && !t.endsWith('ייה')) {
    out.add(`${t.slice(0, -2)}ייה`);
  }
  if (t.endsWith('ייה')) {
    out.add(`${t.slice(0, -3)}יה`);
  }
  if (collapsed.endsWith('יה') && !collapsed.endsWith('ייה')) {
    out.add(`${collapsed.slice(0, -2)}ייה`);
  }

  return [...out].filter(Boolean);
}

module.exports = {
  normCityCompare,
  hebrewCityCompareKey,
  hebrewCitySpellingVariants,
};
