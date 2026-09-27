const {
  buildSearchTextFromAiParse,
  resolveCandidateSearchText,
  isGenericCvTitle,
} = require('../buildSearchTextFromAiParse');
const { resumeTextLooksOcrGarbled } = require('../pdfTextQuality');

describe('buildSearchTextFromAiParse', () => {
  it('builds structured Hebrew CV text from AI parse', () => {
    const text = buildSearchTextFromAiParse({
      fullName: 'ברכה מייסון',
      title: 'מנהלת חשבונות בכירה',
      email: 'msob26@gmail.com',
      phone: '052-4927277',
      address: "ג'דיידה-מכר",
      professionalSummary: 'ניסיון של 30 שנה בניהול תקציבים וחשבות שכר.',
      workExperience: [
        {
          title: 'מנהלת חשבונות',
          company: 'חברת XYZ',
          startDate: '2019-01',
          endDate: '2024-12',
          description: 'ניהול מלא של הנהלת חשבונות.',
        },
      ],
      education: [{ value: 'תואר הנדסאי תוכנה, מכללת המזרח התיכון' }],
      skills: { soft: ['תקשורת'], technical: ['חשבשבת'] },
    });
    expect(text).toContain('ברכה מייסון');
    expect(text).toContain('תקציר מקצועי');
    expect(text).toContain('ניסיון תעסוקתי');
    expect(text).toContain('חברת XYZ');
    expect(text).not.toContain('ה8ש');
  });

  it('skips generic CV title labels', () => {
    expect(isGenericCvTitle('מסמך קורות חיים')).toBe(true);
    expect(isGenericCvTitle('מנהלת חשבונות')).toBe(false);
  });

  it('resolveCandidateSearchText prefers AI over garbled OCR', () => {
    const ocr = "יותר מ 30 ה8ש יהול תקציבים ותזרימי 8ה\"ח";
    expect(resumeTextLooksOcrGarbled(ocr)).toBe(true);
    const resolved = resolveCandidateSearchText(
      {
        fullName: 'ברכה מייסון',
        professionalSummary: 'ניסיון של 30 שנה בניהול תקציבים וחשבות שכר בחברות גדולות.',
        workExperience: [{ title: 'מנהלת חשבונות', company: 'ABC', description: 'ניהול חשבונות' }],
      },
      ocr,
    );
    expect(resolved).toContain('ברכה מייסון');
    expect(resolved).not.toContain('ה8ש');
  });
});
