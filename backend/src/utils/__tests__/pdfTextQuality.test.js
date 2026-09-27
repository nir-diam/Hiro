const {
  scoreResumeTextExtract,
  pickBestResumeTextExtract,
  resumeTextLooksOcrGarbled,
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

  it('penalizes OCR Hebrew with embedded digits', () => {
    const clean = 'יותר מ-30 שנות ניסיון בניהול תקציבים וחשבות שכר';
    const ocr = 'יותר מ 30 ה8ש יהול תקציבים ותזרימי 8ה"ח ראשית';
    expect(scoreResumeTextExtract(clean)).toBeGreaterThan(scoreResumeTextExtract(ocr));
    expect(resumeTextLooksOcrGarbled(ocr)).toBe(true);
    expect(resumeTextLooksOcrGarbled(clean)).toBe(false);
  });

  it('prefers pdftotext over garbled OCR when both present', () => {
    const pdftotext = 'ברכה מייסון ג\'דיידה-מכר msob26@gmail.com ניסיון בחשבונאות';
    const ocr = 'ברכה מייסון ג\'דיידה -מכר 4927277-052 ‎gmail.comémsob26@‏ -יותר מ 30 ה8ש יהול';
    const picked = pickBestResumeTextExtract([
      { text: pdftotext, source: 'pdftotext-layout' },
      { text: ocr, source: 'ocr' },
    ]);
    expect(picked.source).toBe('pdftotext-layout');
  });
});
