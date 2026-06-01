const { hebrewCityCompareKey, hebrewCitySpellingVariants } = require('../hebrewCityVariants');
const { scoreCityNameMatch } = require('../../services/cityService');

describe('hebrewCityVariants', () => {
  it('treats נהריה and נהרייה as equivalent keys', () => {
    expect(hebrewCityCompareKey('נהריה')).toBe(hebrewCityCompareKey('נהרייה'));
  });

  it('generates spelling variants for search', () => {
    const v = hebrewCitySpellingVariants('נהריה');
    expect(v).toContain('נהריה');
    expect(v).toContain('נהרייה');
  });

  it('scores נהריה against catalog נהרייה highly', () => {
    expect(scoreCityNameMatch('נהריה', 'נהרייה')).toBeGreaterThanOrEqual(980);
  });
});
