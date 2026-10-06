const {
  companyNameLookupVariants,
  namesLikelySameCompany,
  resolveOrgIdFromLabelMap,
  findBestLabelOptionMatch,
} = require('../companyNameMatch');

describe('companyNameMatch', () => {
  it('builds variants from dash-separated brand suffix', () => {
    const keys = companyNameLookupVariants('יוניון מוטורס - GEELY');
    expect(keys).toContain('יוניון מוטורס - geely');
    expect(keys).toContain('יוניון מוטורס');
  });

  it('matches union motors with geely suffix', () => {
    expect(namesLikelySameCompany('יוניון מוטורס - GEELY', 'יוניון מוטורס')).toBe(true);
    expect(namesLikelySameCompany('Union Motors - GEELY', 'Union Motors')).toBe(true);
  });

  it('does not match unrelated companies', () => {
    expect(namesLikelySameCompany('יוניון מוטורס - GEELY', 'מימד אנושי')).toBe(false);
    expect(namesLikelySameCompany('ABC Corp', 'XYZ Ltd')).toBe(false);
    expect(namesLikelySameCompany('סי לאב בע"מ', 'מעין לוגיסטיקה (1977) בע"מ')).toBe(false);
  });

  it('resolveOrgIdFromLabelMap finds org via fuzzy key', () => {
    const map = new Map([
      ['יוניון מוטורס', 'org-uuid-1'],
      ['מימד אנושי', 'org-uuid-2'],
    ]);
    expect(resolveOrgIdFromLabelMap('יוניון מוטורס - GEELY', map)).toBe('org-uuid-1');
    expect(resolveOrgIdFromLabelMap('unknown company', map)).toBeNull();
  });

  it('findBestLabelOptionMatch picks org option', () => {
    const options = [
      { id: '1', label: 'מימד אנושי' },
      { id: '2', label: 'יוניון מוטורס' },
    ];
    const hit = findBestLabelOptionMatch('יוניון מוטורס - GEELY', options);
    expect(hit?.id).toBe('2');
  });
});
