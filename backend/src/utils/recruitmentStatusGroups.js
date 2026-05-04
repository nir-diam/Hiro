const RecruitmentStatus = require('../models/RecruitmentStatus');

/** Canonical buckets used by screening inclusion rules */
const CANONICAL = ['applied', 'screening', 'advanced', 'exit', 'hired'];

/** Map legacy status names (Hebrew UI) when no recruitment_statuses row matches */
const LEGACY_STATUS_NAME_TO_GROUP = {
  חדש: 'applied',
  'מועמד משך עניין': 'applied',
  פעיל: 'applied',
  'הוזמן לראיון': 'advanced',
  'לא רלוונטי': 'exit',
  בארכיון: 'exit',
};

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Normalize DB `statusGroup` (may be Hebrew like "בתהליך" or English canonical) to canonical bucket.
 */
function canonicalizeStatusGroup(raw) {
  const g = norm(raw);
  if (!g) return 'applied';
  if (CANONICAL.includes(g)) return g;

  if (/^(applied|screening|advanced|exit|hired)$/.test(g)) return g;

  // Hebrew / mixed labels commonly stored in recruitment_statuses.statusGroup
  if (/(סינון|טלפוני|screening)/i.test(raw)) return 'screening';
  if (/(ראיון|הפניה|לקוח|שאלון|questionnaire|interview|advanced)/i.test(raw)) return 'advanced';
  if (/(סירוב|ארכיון|לא רלוונטי|נפסל|דחייה|exit|reject)/i.test(raw)) return 'exit';
  if (/(מאויש|התקבל|hired|offer)/i.test(raw)) return 'hired';
  if (/(חדש|הגשה|applied|מועמד)/i.test(raw)) return 'applied';

  // Default "בתהליך" and unknown groups → screening-like queue
  if (/(בתהליך|תהליך|pipeline)/i.test(raw)) return 'screening';

  return 'applied';
}

/**
 * Resolve canonical group for a job–candidate link status name using client recruitment_statuses.
 * @param {string|null} clientId - UUID of Client
 * @param {string} statusName - JobCandidate.status value
 */
async function resolveStatusGroup(clientId, statusName) {
  const name = String(statusName ?? '').trim();
  if (!name) return 'applied';

  const legacy = LEGACY_STATUS_NAME_TO_GROUP[name];
  if (legacy) return legacy;

  if (!clientId) {
    return LEGACY_STATUS_NAME_TO_GROUP[name] || canonicalizeStatusGroup(name);
  }

  const rows = await RecruitmentStatus.findAll({
    where: { clientId },
    attributes: ['name', 'statusGroup'],
  });

  const nl = norm(name);
  const hit = rows.find((r) => norm(r.name) === nl);
  if (hit) return canonicalizeStatusGroup(hit.statusGroup);

  return LEGACY_STATUS_NAME_TO_GROUP[name] || canonicalizeStatusGroup(name);
}

module.exports = {
  CANONICAL,
  canonicalizeStatusGroup,
  resolveStatusGroup,
  LEGACY_STATUS_NAME_TO_GROUP,
};
