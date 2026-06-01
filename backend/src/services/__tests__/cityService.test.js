const {
  scoreCityNameMatch,
  resolveCityForCandidate,
} = require('../cityService');

describe('scoreCityNameMatch', () => {
  it('prefers exact match', () => {
    expect(scoreCityNameMatch('נהריה', 'נהריה')).toBe(1000);
    expect(scoreCityNameMatch('נהריה', 'עמק נהריה')).toBeLessThan(1000);
  });
});

describe('resolveCityForCandidate', () => {
  it('returns null for empty input without throwing', async () => {
    await expect(resolveCityForCandidate('')).resolves.toBeNull();
    await expect(resolveCityForCandidate(null)).resolves.toBeNull();
  });
});
