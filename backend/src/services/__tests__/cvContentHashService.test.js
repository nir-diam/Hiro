const {
  decodeFileBase64Payload,
  hashResumeBuffer,
  hashFileBase64,
  normalizeHash,
  findCandidateByResumeContentHash,
} = require('../cvContentHashService');

jest.mock('../../config/db', () => ({
  sequelize: {
    query: jest.fn(),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../candidateIdentityService', () => ({
  resolvePrimaryCandidateId: (row) =>
    row?.canonicalCandidateId ? String(row.canonicalCandidateId) : String(row?.id || ''),
}));

const { sequelize } = require('../../config/db');

describe('cvContentHashService', () => {
  const samplePdfBytes = Buffer.from('%PDF-1.4 fake resume content for hash test');

  describe('hashResumeBuffer', () => {
    it('returns stable SHA-256 hex for the same raw bytes', () => {
      const h1 = hashResumeBuffer(samplePdfBytes);
      const h2 = hashResumeBuffer(Buffer.from(samplePdfBytes));
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('returns different hashes for different file bytes', () => {
      const h1 = hashResumeBuffer(samplePdfBytes);
      const h2 = hashResumeBuffer(Buffer.from('%PDF-1.4 different bytes'));
      expect(h1).not.toBe(h2);
    });

    it('is independent of parsed text — same bytes, different strings elsewhere', () => {
      const geminiParseA = 'סיגלית ביופציק — חשבת';
      const geminiParseB = 'חברת יעוץ ונהול נכסים — wrong name from AI';
      expect(geminiParseA).not.toBe(geminiParseB);
      expect(hashResumeBuffer(samplePdfBytes)).toBe(hashResumeBuffer(samplePdfBytes));
    });

    it('returns null for empty or invalid buffers', () => {
      expect(hashResumeBuffer(null)).toBeNull();
      expect(hashResumeBuffer(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('hashFileBase64', () => {
    it('hashes decoded base64 the same as raw buffer', () => {
      const b64 = samplePdfBytes.toString('base64');
      expect(hashFileBase64(b64)).toBe(hashResumeBuffer(samplePdfBytes));
    });

    it('ignores data URL prefix and whitespace', () => {
      const b64 = samplePdfBytes.toString('base64');
      const wrapped = `data:application/pdf;base64,\n${b64.slice(0, 10)}\n${b64.slice(10)}`;
      expect(hashFileBase64(wrapped)).toBe(hashResumeBuffer(samplePdfBytes));
    });
  });

  describe('decodeFileBase64Payload', () => {
    it('strips data URL prefix', () => {
      const b64 = samplePdfBytes.toString('base64');
      const buf = decodeFileBase64Payload(`data:application/pdf;base64,${b64}`);
      expect(buf.equals(samplePdfBytes)).toBe(true);
    });
  });

  describe('normalizeHash', () => {
    it('accepts lowercase 64-char hex', () => {
      const h = hashResumeBuffer(samplePdfBytes);
      expect(normalizeHash(h)).toBe(h);
      expect(normalizeHash(h.toUpperCase())).toBe(h);
    });

    it('rejects invalid values', () => {
      expect(normalizeHash('')).toBeNull();
      expect(normalizeHash('abc')).toBeNull();
      expect(normalizeHash(null)).toBeNull();
    });
  });

  describe('findCandidateByResumeContentHash', () => {
    beforeEach(() => {
      sequelize.query.mockReset();
    });

    it('returns null for invalid hash', async () => {
      await expect(findCandidateByResumeContentHash('not-a-hash')).resolves.toBeNull();
      expect(sequelize.query).not.toHaveBeenCalled();
    });

    it('queries by normalized hash and excludes id when provided', async () => {
      const hash = hashResumeBuffer(samplePdfBytes);
      sequelize.query.mockResolvedValue([{ id: 'aaa-bbb', fullName: 'Test' }]);

      const row = await findCandidateByResumeContentHash(hash, { excludeId: 'exclude-me' });

      expect(row).toEqual({ id: 'aaa-bbb', fullName: 'Test' });
      expect(sequelize.query).toHaveBeenCalledTimes(1);
      const [sql, opts] = sequelize.query.mock.calls[0];
      expect(sql).toContain('resumeContentHash');
      expect(sql).toContain('id != $2::uuid');
      expect(opts.bind[0]).toBe(hash);
      expect(opts.bind[1]).toBe('exclude-me');
    });
  });
});
