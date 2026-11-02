const CV_PROFILE_KIND_SHADOW = 'shadow';
const CV_PROFILE_KIND_ORIGINAL = 'original';

function normalizeCvProfileKind(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();
  if (value === 'shadow' || value === 'staff' || value === 'copy' || value === 'duplicate') {
    return CV_PROFILE_KIND_SHADOW;
  }
  return CV_PROFILE_KIND_ORIGINAL;
}

function shadowCreatedAtMs(row) {
  const raw = row?.createdAt || row?.created_at || 0;
  const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** The pinned staff shadow used for client CV referral (newest pin if multiple). */
function pickReferralShadow(shadows) {
  const rows = Array.isArray(shadows) ? shadows.filter((row) => row && row.id) : [];
  if (!rows.length) return null;
  const pinned = rows.filter((row) => row.staffShadowPinned === true);
  if (!pinned.length) return null;
  return pinned.slice().sort((a, b) => shadowCreatedAtMs(b) - shadowCreatedAtMs(a))[0];
}

module.exports = {
  CV_PROFILE_KIND_SHADOW,
  CV_PROFILE_KIND_ORIGINAL,
  normalizeCvProfileKind,
  pickReferralShadow,
};
