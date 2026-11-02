const { normalizeCvProfileKind, pickReferralShadow } = require('../staffShadowReferral');

describe('normalizeCvProfileKind', () => {
  it('defaults to original', () => {
    expect(normalizeCvProfileKind(undefined)).toBe('original');
    expect(normalizeCvProfileKind('')).toBe('original');
    expect(normalizeCvProfileKind('מקור')).toBe('original');
  });

  it('accepts shadow aliases', () => {
    expect(normalizeCvProfileKind('shadow')).toBe('shadow');
    expect(normalizeCvProfileKind('staff')).toBe('shadow');
    expect(normalizeCvProfileKind('copy')).toBe('shadow');
  });
});

describe('pickReferralShadow', () => {
  const older = { id: 'old', staffShadowPinned: false, createdAt: '2026-10-01T00:00:00.000Z' };
  const newer = { id: 'new', staffShadowPinned: false, createdAt: '2026-11-01T00:00:00.000Z' };
  const pinnedOld = { id: 'pin', staffShadowPinned: true, createdAt: '2026-09-01T00:00:00.000Z' };

  it('returns null for empty input', () => {
    expect(pickReferralShadow([])).toBeNull();
    expect(pickReferralShadow(null)).toBeNull();
  });

  it('returns null when none is pinned', () => {
    expect(pickReferralShadow([older, newer])).toBeNull();
  });

  it('prefers the pinned shadow over a newer unpinned one', () => {
    expect(pickReferralShadow([newer, older, pinnedOld])?.id).toBe('pin');
  });
});
