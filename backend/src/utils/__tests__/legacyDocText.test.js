const { joinLegacyDocParts } = require('../legacyDocText');

describe('joinLegacyDocParts', () => {
  it('puts the header before the body so contact details are not dropped', () => {
    const text = joinLegacyDocParts({
      getHeaders: () => 'איגור רטניצקי\n054-7336290 iratnitsky@gmail.com',
      getBody: () => 'ניסיון תעסוקתי\nתיאום עבודות בין קבלנים.',
      getFooters: () => '',
      getTextboxes: () => '',
    });
    expect(text.indexOf('איגור רטניצקי')).toBe(0);
    expect(text).toContain('iratnitsky@gmail.com');
    expect(text.indexOf('ניסיון תעסוקתי')).toBeGreaterThan(text.indexOf('054-7336290'));
  });

  it('skips a part that is already included', () => {
    const header = 'איגור רטניצקי';
    const text = joinLegacyDocParts({
      getHeaders: () => header,
      getBody: () => 'body',
      getTextboxes: () => header,
    });
    expect(text.split('איגור רטניצקי')).toHaveLength(2);
  });
});
