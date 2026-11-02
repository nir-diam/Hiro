const { resolveRegionAgainstCatalog, catalogRegionNamesFromRows } = require('../jobRegionCatalog');

const CATALOG = ['מרכז', 'צפון', 'דרום', 'שפלה', 'ירושלים'];

describe('jobRegionCatalog', () => {
  it('keeps an exact catalog region', () => {
    expect(resolveRegionAgainstCatalog('מרכז', CATALOG)).toBe('מרכז');
  });

  it('maps גוש דן to מרכז', () => {
    expect(resolveRegionAgainstCatalog('גוש דן', CATALOG)).toBe('מרכז');
  });

  it('maps the long center alias as one region', () => {
    expect(resolveRegionAgainstCatalog('מרכז, שרון וגוש דן', CATALOG)).toBe('מרכז');
  });

  it('drops unknown regions instead of falling back to אחר', () => {
    expect(resolveRegionAgainstCatalog('איזור פלמחים', CATALOG)).toBeNull();
    expect(resolveRegionAgainstCatalog('אחר', CATALOG)).toBeNull();
  });

  it('keeps known parts of a comma list and drops the rest', () => {
    expect(resolveRegionAgainstCatalog('צפון, איזור פלמחים', CATALOG)).toBe('צפון');
  });

  it('reads unique region names from city rows', () => {
    expect(catalogRegionNamesFromRows([
      { column4: 'מרכז' },
      { region: 'מרכז' },
      { column4: 'ערים' },
      { column4: 'צפון' },
    ])).toEqual(['מרכז', 'צפון']);
  });
});
