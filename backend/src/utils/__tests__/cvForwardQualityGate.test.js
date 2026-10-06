const { passesCvForwardQualityGate, MIN_RESUME_BYTES, MIN_TEXT_CHARS } = require('../cvForwardQualityGate');

describe('cvForwardQualityGate', () => {
  test('passes with sufficient buffer and extracted text', () => {
    const result = passesCvForwardQualityGate({
      resumeBuffer: Buffer.alloc(MIN_RESUME_BYTES + 100),
      extractedText: 'John Doe\nSoftware Engineer\n5 years experience in backend development',
    });
    expect(result.ok).toBe(true);
  });

  test('passes with PDF bytes even when text is short', () => {
    const pdfHeader = Buffer.from('%PDF-1.4\n');
    const buffer = Buffer.concat([pdfHeader, Buffer.alloc(MIN_RESUME_BYTES)]);
    const result = passesCvForwardQualityGate({
      resumeBuffer: buffer,
      extractedText: 'short',
    });
    expect(result.ok).toBe(true);
  });

  test('fails when buffer too small', () => {
    const result = passesCvForwardQualityGate({
      resumeBuffer: Buffer.alloc(MIN_RESUME_BYTES - 1),
      extractedText: 'Some text here that is long enough for the gate check',
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('resume_too_small');
  });

  test('fails when no buffer and no resume URL', () => {
    const result = passesCvForwardQualityGate({
      extractedText: 'a'.repeat(MIN_TEXT_CHARS + 10),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_resume');
  });

  test('passes with resume URL when hasCvText flag is set', () => {
    const result = passesCvForwardQualityGate({
      resumeUrl: 'https://example.com/resume.pdf',
      hasCvText: true,
    });
    expect(result.ok).toBe(true);
  });
});
