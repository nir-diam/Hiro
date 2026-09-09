const {
  scoreResumeTextExtract,
  pickBestResumeTextExtract,
} = require('../pdfTextQuality');

describe('pdfTextQuality', () => {
  it('prefers readable Hebrew over gibberish of similar length', () => {
    const good = 'קורות חיים\nניסיון תעסוקתי\nניהול מכירות בחברת הייטק בתל אביב';
    const bad = 'ןויסינ םייורק \uFFFD\uFFFD \uE001\uE002 תיב רתא';
    expect(scoreResumeTextExtract(good)).toBeGreaterThan(scoreResumeTextExtract(bad));
  });

  it('pickBestResumeTextExtract chooses higher-scoring candidate', () => {
    const picked = pickBestResumeTextExtract([
      { text: 'abc', source: 'a' },
      { text: 'קורות חיים ניסיון ניהול שיווק', source: 'b' },
    ]);
    expect(picked.source).toBe('b');
    expect(picked.text).toContain('קורות');
  });
});
