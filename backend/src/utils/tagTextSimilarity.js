const normalizeForComparison = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]/g, '')
    .trim();
};

const levenshteinDistance = (a, b) => {
  const matrix = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= b.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[b.length][a.length];
};

const stringSimilarity = (a, b) => {
  if (!a || !b) return 0;
  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 0;
  return 1 - distance / maxLen;
};

const tokenizeForFuzzy = (text) =>
  String(text || '')
    .split(/[\s,/|·\-–—()[\]]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

/**
 * Text similarity score for fuzzy candidate ranking (0–1).
 * Uses Levenshtein on full strings plus token substring boosts.
 */
const scoreTagTextAgainstQuery = (originalTerm, contextSample, label) => {
  const normLabel = normalizeForComparison(label);
  if (!normLabel) return 0;

  const queries = [originalTerm, contextSample].filter(Boolean);
  let best = 0;

  for (const q of queries) {
    const normQ = normalizeForComparison(q);
    if (!normQ) continue;
    best = Math.max(best, stringSimilarity(normQ, normLabel));
    if (normLabel.includes(normQ) || normQ.includes(normLabel)) {
      best = Math.max(best, 0.55);
    }
    for (const tok of tokenizeForFuzzy(q)) {
      const normTok = normalizeForComparison(tok);
      if (normTok.length >= 2 && normLabel.includes(normTok)) {
        best = Math.max(best, 0.28 + Math.min(0.35, normTok.length / Math.max(normLabel.length, 1)));
      }
    }
  }

  return best;
};

module.exports = {
  normalizeForComparison,
  stringSimilarity,
  tokenizeForFuzzy,
  scoreTagTextAgainstQuery,
};
