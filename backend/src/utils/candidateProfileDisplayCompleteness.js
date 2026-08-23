/** Mirrors frontend buildMissingProfileFieldLabels (CandidateProfile banner). */

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

const resolveDisplayAge = (candidate = {}) => {
  const age = trim(candidate.age);
  if (age) return age;
  const y = parseInt(trim(candidate.birthYear), 10);
  if (Number.isFinite(y) && y >= 1900 && y <= 2100) {
    return String(new Date().getFullYear() - y);
  }
  return '';
};

const buildProfileDisplayMissingLabels = (candidate = {}) => {
  const labels = [];
  const field = trim(candidate.field);
  const title = trim(candidate.title);
  if (!field && !title) labels.push('תחום משרה');
  else {
    if (!field) labels.push('תחום משרה');
    if (!title) labels.push('כותרת משרה');
  }
  const city = trim(candidate.address) || trim(candidate.location);
  if (!city) labels.push('כתובת');
  const displayAge = resolveDisplayAge(candidate);
  if (!displayAge) labels.push('גיל');
  if (!trim(candidate.phone)) labels.push('טלפון');
  return labels;
};

module.exports = {
  resolveDisplayAge,
  buildProfileDisplayMissingLabels,
};
