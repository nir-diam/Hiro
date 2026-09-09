const GOOGLE_FAVICON_MARKER = 'google.com/s2/favicons';

function trimLogo(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function isGoogleFaviconUrl(url) {
  return String(url || '').includes(GOOGLE_FAVICON_MARKER);
}

/** Match frontend resolveClientLogoUrl — client row, metadata, linked org. */
function resolveClientLogoUrl(data) {
  if (!data || typeof data !== 'object') return null;
  const candidates = [];
  const push = (v) => {
    const s = trimLogo(v);
    if (s) candidates.push(s);
  };

  push(data.logoUrl);
  const meta = data.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    push(meta.logo);
  }

  const links = Array.isArray(data.organizationLinks) ? data.organizationLinks : [];
  const sorted = [...links].sort((a, b) => {
    const ap = a && typeof a === 'object' && a.isPrimary ? 1 : 0;
    const bp = b && typeof b === 'object' && b.isPrimary ? 1 : 0;
    return bp - ap;
  });
  for (const link of sorted) {
    if (!link || typeof link !== 'object') continue;
    const org = link.organization;
    if (org && typeof org === 'object') {
      push(org.logo);
    }
  }

  if (!candidates.length) return null;
  const preferred = candidates.find((url) => !isGoogleFaviconUrl(url));
  return preferred ?? candidates[0];
}

function detectImageType(url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  if (ct.includes('gif')) return 'gif';
  if (ct.includes('bmp')) return 'bmp';
  const lower = String(url || '').toLowerCase();
  if (/\.jpe?g(\?|$)/.test(lower)) return 'jpg';
  if (/\.gif(\?|$)/.test(lower)) return 'gif';
  if (/\.bmp(\?|$)/.test(lower)) return 'bmp';
  return 'png';
}

module.exports = {
  resolveClientLogoUrl,
  detectImageType,
};
