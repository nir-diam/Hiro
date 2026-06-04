const {
  filterSerpOrganicResults,
  isIrrelevantSerpOrganicResult,
} = require('../filterSerpOrganicResults');

describe('filterSerpOrganicResults', () => {
  it('removes Google Play app listings', () => {
    const rows = [
      {
        position: 1,
        title: 'מכבי שירותי בריאות - אפליקציות ב-Google Play',
        link: 'https://play.google.com/store/apps/details?id=com.ideomobile.maccabi',
        source: 'Google Play',
      },
      {
        position: 2,
        title: 'מכבי שירותי בריאות',
        link: 'https://www.maccabi4u.co.il/',
      },
    ];
    const filtered = filterSerpOrganicResults(rows);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].link).toContain('maccabi4u');
  });

  it('removes YouTube and Apple App Store links', () => {
    expect(
      isIrrelevantSerpOrganicResult({
        link: 'https://www.youtube.com/watch?v=abc',
        title: 'Company channel',
      }),
    ).toBe(true);
    expect(
      isIrrelevantSerpOrganicResult({
        link: 'https://apps.apple.com/app/id123',
        title: 'App on the App Store',
      }),
    ).toBe(true);
    expect(
      isIrrelevantSerpOrganicResult({
        link: 'https://example.com',
        title: 'Official site',
      }),
    ).toBe(false);
  });
});
