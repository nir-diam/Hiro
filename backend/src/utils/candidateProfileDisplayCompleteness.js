/** Mirrors frontend buildMissingProfileFieldLabels (CandidateProfile banner). */

const trim = (v) => (v != null && v !== undefined ? String(v).trim() : '');

const resolveDisplayAge = (candidate = {}) => {
  const y = parseInt(trim(candidate.birthYear), 10);
  if (Number.isFinite(y) && y >= 1900 && y <= 2100) {
    const now = new Date();
    let age = now.getFullYear() - y;
    const m = parseInt(trim(candidate.birthMonth), 10);
    const d = parseInt(trim(candidate.birthDay), 10);
    if (Number.isFinite(m) && m >= 1 && m <= 12) {
      const monthDiff = now.getMonth() + 1 - m;
      if (monthDiff < 0 || (monthDiff === 0 && Number.isFinite(d) && d >= 1 && now.getDate() < d)) {
        age -= 1;
      }
    }
    if (age >= 0 && age <= 130) return String(age);
  }
  return trim(candidate.age);
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
