'use strict';

/**
 * Canonical generic-bucket labels (תחום כללי).
 * DB rows may still use legacy "(גנרי)" — matching accepts both suffixes.
 */
const GENERIC_ORGANIZATION_BUCKET_NAMES = [
  'הייטק ומחשוב (כללי)',
  'שירותי תוכנה (כללי)',
  'פיננסים וביטוח (כללי)',
  'תעשייה ויצור (כללי)',
  'בריאות ורפואה (כללי)',
  'חינוך והוראה (כללי)',
  'ביטחון וצבא (כללי)',
  'שירותים ומסחר קמעונאי (כללי)',
  'נדל"ן ובנייה (כללי)',
  'תחבורה ולוגיסטיקה (כללי)',
  'מנהל ואדמיניסטרציה (כללי)',
  'משפטים ורגולציה (כללי)',
];

const GENERIC_BUCKET_SUFFIXES = ['(כללי)', '(גנרי)'];

const isGenericBucketName = (name) => {
  const s = String(name || '').trim();
  return GENERIC_BUCKET_SUFFIXES.some((suffix) => s.includes(suffix));
};

/** Normalize legacy "(גנרי)" label to "(כללי)" for display / matching. */
const normalizeGenericBucketLabel = (name) =>
  String(name || '').trim().replace('(גנרי)', '(כללי)');

module.exports = {
  GENERIC_ORGANIZATION_BUCKET_NAMES,
  GENERIC_BUCKET_SUFFIXES,
  isGenericBucketName,
  normalizeGenericBucketLabel,
};
