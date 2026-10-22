const {
  stripCvDocumentTitleFromPersonName,
  nameLooksLikeCvDocumentTitle,
  nameLooksLikeJobHeadline,
  sanitizePersonNameFields,
} = require('../personName');

describe('stripCvDocumentTitleFromPersonName', () => {
  it('strips Hebrew CV header before the person name', () => {
    expect(stripCvDocumentTitleFromPersonName('קורות חיים – שי אוחיון')).toBe('שי אוחיון');
    expect(stripCvDocumentTitleFromPersonName('קורות חיים - שי אוחיון')).toBe('שי אוחיון');
    expect(stripCvDocumentTitleFromPersonName('קורות חיים שי אוחיון')).toBe('שי אוחיון');
    expect(stripCvDocumentTitleFromPersonName('קורות חיים של אליהו ארי יחזקאל')).toBe('אליהו ארי יחזקאל');
  });

  it('leaves a real person name unchanged', () => {
    expect(stripCvDocumentTitleFromPersonName('שי אוחיון')).toBe('שי אוחיון');
  });

  it('returns empty for title-only strings', () => {
    expect(stripCvDocumentTitleFromPersonName('קורות חיים')).toBe('');
    expect(stripCvDocumentTitleFromPersonName('Resume')).toBe('');
  });

  it('strips a trailing document title and split first/last title words', () => {
    expect(stripCvDocumentTitleFromPersonName('שרה ברוורמן // קורות')).toBe('שרה ברוורמן');
    expect(stripCvDocumentTitleFromPersonName('קורות חיים – גדעון')).toBe('גדעון');
    expect(stripCvDocumentTitleFromPersonName('CV: Dana Levi')).toBe('Dana Levi');
    expect(stripCvDocumentTitleFromPersonName('שי אוחיון - Resume')).toBe('שי אוחיון');
  });
});

describe('sanitizePersonNameFields', () => {
  it('clears a document title split across first and last name', () => {
    expect(sanitizePersonNameFields({ firstName: 'קורות', lastName: 'חיים' })).toEqual({
      firstName: '',
      lastName: '',
      fullName: '',
      cleared: true,
    });
  });

  it('keeps the person when the title is only a prefix or suffix', () => {
    expect(sanitizePersonNameFields({ fullName: 'קורות חיים – גדעון' }).fullName).toBe('גדעון');
    expect(sanitizePersonNameFields({ fullName: 'שרה ברוורמן // קורות' }).fullName).toBe('שרה ברוורמן');
  });

  it('does not treat חיים as a title when it is a real name', () => {
    expect(sanitizePersonNameFields({ fullName: 'חיים כהן' }).fullName).toBe('חיים כהן');
    expect(sanitizePersonNameFields({ fullName: 'חיים כהן' }).cleared).toBe(false);
  });
});

describe('nameLooksLikeCvDocumentTitle', () => {
  it('detects a CV title glued onto a person name', () => {
    expect(nameLooksLikeCvDocumentTitle('קורות חיים – שי אוחיון')).toBe(true);
    expect(nameLooksLikeCvDocumentTitle('שרה ברוורמן // קורות')).toBe(true);
    expect(nameLooksLikeCvDocumentTitle('שי אוחיון')).toBe(false);
  });
});

describe('nameLooksLikeJobHeadline', () => {
  it('rejects a professional headline that is not a person name', () => {
    expect(nameLooksLikeJobHeadline('מבצעים ותמיכה יומיומית בבעיות בשטח')).toBe(true);
    expect(nameLooksLikeJobHeadline('מנהל אזור בתחום הקמעונאות')).toBe(true);
  });

  it('keeps a real person name', () => {
    expect(nameLooksLikeJobHeadline('שי אוחיון')).toBe(false);
    expect(nameLooksLikeJobHeadline('אליהו ארי יחזקאל')).toBe(false);
  });
});
