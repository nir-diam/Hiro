const {
  resolveOrgIdFromLabelMap,
} = require('../../utils/companyNameMatch');

describe('jobOrganizationResolveService fuzzy map lookup', () => {
  it('resolves GEELY suffix label to union motors org id', () => {
    const map = new Map([
      ['יוניון מוטורס', 'org-union'],
      ['מימד אנושי', 'org-mimed'],
    ]);
    expect(resolveOrgIdFromLabelMap('יוניון מוטורס - GEELY', map)).toBe('org-union');
  });

  it('prefers longest fuzzy match when multiple candidates exist', () => {
    const map = new Map([
      ['יוניון', 'org-short'],
      ['יוניון מוטורס', 'org-full'],
    ]);
    expect(resolveOrgIdFromLabelMap('יוניון מוטורס - GEELY', map)).toBe('org-full');
  });
});
