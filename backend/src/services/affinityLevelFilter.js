/**
 * Domain-fit (זיקה לתחום) hard filter.
 *
 * Engine intentType (matchingScoreService):
 *   exact   — linked to this job or same roleId
 *   role    — same role cluster
 *   cluster — same category, different cluster
 *   different — no taxonomy overlap
 *
 * UI affinityLevel (allowed intent types):
 *   exact          → exact
 *   same_cluster   → exact, role
 *   same_category  → exact, role, cluster
 *   none           → no filter (intent still ranks)
 */

const LEVEL_TO_INTENTS = {
  exact: new Set(['exact']),
  same_cluster: new Set(['exact', 'role']),
  same_category: new Set(['exact', 'role', 'cluster']),
};

function normalizeAffinityLevel(raw) {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (!v || v === 'none' || v === 'off' || v === 'unfiltered') return 'none';
  if (v === 'exact') return 'exact';
  if (v === 'same_cluster' || v === 'role') return 'same_cluster';
  if (v === 'same_category' || v === 'same_cat' || v === 'category') return 'same_category';
  return 'none';
}

function passesAffinityLevel(intentType, affinityLevel) {
  const level = normalizeAffinityLevel(affinityLevel);
  const allowed = LEVEL_TO_INTENTS[level];
  if (!allowed) return true;
  const t = String(intentType || 'different')
    .trim()
    .toLowerCase();
  return allowed.has(t);
}

module.exports = {
  normalizeAffinityLevel,
  passesAffinityLevel,
};
