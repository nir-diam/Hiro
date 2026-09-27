/** Max semantic (vector) candidates sent to Gemini — same tag type, score >= VECTOR_MIN_SCORE. */
const VECTOR_LIMIT = 20;
const VECTOR_MIN_SCORE = 0.6;
/** Max fuzzy candidates after vector picks, deduped against semantic results. */
const FUZZY_LIMIT = 5;
/** Over-fetch fuzzy rows so we can still fill FUZZY_LIMIT after dedup. */
const FUZZY_FETCH_LIMIT = 30;

/** Merge vector hits first, then up to `fuzzyLimit` fuzzy hits not already present. */
const mergeHybridCandidateHits = (vectorHits, fuzzyHits, fuzzyLimit = FUZZY_LIMIT) => {
  const seen = new Set();
  const merged = [];

  for (const hit of vectorHits) {
    const key = (hit.name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
  }

  let fuzzyAdded = 0;
  for (const hit of fuzzyHits) {
    if (fuzzyAdded >= fuzzyLimit) break;
    const key = (hit.name || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    fuzzyAdded += 1;
  }

  return merged;
};

module.exports = {
  VECTOR_LIMIT,
  VECTOR_MIN_SCORE,
  FUZZY_LIMIT,
  FUZZY_FETCH_LIMIT,
  mergeHybridCandidateHits,
};
