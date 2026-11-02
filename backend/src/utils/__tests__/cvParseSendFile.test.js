const {
  isCvParseSendFileToGeminiEnabled,
  geminiInlineMimeForCv,
  resolveGeminiCvInlineFile,
  buildGeminiCvFileUserParts,
  GEMINI_CV_INLINE_MAX_BYTES,
} = require('../cvParseSendFile');

describe('cvParseSendFile', () => {
  const original = process.env.CV_PARSE_SEND_FILE_TO_GEMINI;

  afterEach(() => {
    if (original == null) delete process.env.CV_PARSE_SEND_FILE_TO_GEMINI;
    else process.env.CV_PARSE_SEND_FILE_TO_GEMINI = original;
  });

  test('flag defaults off', () => {
    delete process.env.CV_PARSE_SEND_FILE_TO_GEMINI;
    expect(isCvParseSendFileToGeminiEnabled()).toBe(false);
  });

  test.each(['true', '1', 'YES', 'on'])('flag on for %s', (value) => {
    process.env.CV_PARSE_SEND_FILE_TO_GEMINI = value;
    expect(isCvParseSendFileToGeminiEnabled()).toBe(true);
  });

  test.each(['false', '0', 'no', 'off'])('flag off for %s', (value) => {
    process.env.CV_PARSE_SEND_FILE_TO_GEMINI = value;
    expect(isCvParseSendFileToGeminiEnabled()).toBe(false);
  });

  test('detects PDF magic even when mime is octet-stream', () => {
    const buf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.from('x')]);
    expect(geminiInlineMimeForCv('application/octet-stream', buf)).toBe('application/pdf');
  });

  test('maps images and rejects docx', () => {
    expect(geminiInlineMimeForCv('image/png', Buffer.from('x'))).toBe('image/png');
    expect(geminiInlineMimeForCv(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('PK'),
    )).toBe(null);
  });

  test('buildGeminiCvFileUserParts returns inlineData + instruction', () => {
    const buf = Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.from('hello')]);
    const parts = buildGeminiCvFileUserParts({
      buffer: buf,
      mimeType: 'application/pdf',
      instruction: 'Parse this CV',
    });
    expect(parts).toHaveLength(2);
    expect(parts[0].inlineData.mimeType).toBe('application/pdf');
    expect(parts[0].inlineData.data).toBe(buf.toString('base64'));
    expect(parts[1].text).toBe('Parse this CV');
  });

  test('rejects oversized buffers', () => {
    const buf = Buffer.alloc(GEMINI_CV_INLINE_MAX_BYTES + 1);
    buf.write('%PDF-', 0);
    expect(resolveGeminiCvInlineFile(buf, 'application/pdf')).toBe(null);
  });
});
