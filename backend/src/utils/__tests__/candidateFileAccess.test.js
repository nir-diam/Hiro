const { selectOwnedCandidateFile } = require('../../services/candidateMediaUrlService');
const { isPublicApiRequest } = require('../../middleware/apiGlobalAuthMiddleware');

const candidate = {
  resumeUrl: 'https://hirobacket2025.s3.us-east-1.amazonaws.com/resumes/abc.pdf',
  profilePicture: 'https://hirobacket2025.s3.us-east-1.amazonaws.com/photos/a.jpg',
  documents: [
    {
      id: 'doc-1',
      url: 'https://hirobacket2025.s3.us-east-1.amazonaws.com/candidates/files/x/extra.pdf',
    },
  ],
};

describe('selectOwnedCandidateFile', () => {
  const prevBucket = process.env.AWS_S3_BUCKET;
  const prevRegion = process.env.AWS_REGION;

  beforeAll(() => {
    process.env.AWS_S3_BUCKET = 'hirobacket2025';
    process.env.AWS_REGION = 'us-east-1';
  });

  afterAll(() => {
    process.env.AWS_S3_BUCKET = prevBucket;
    process.env.AWS_REGION = prevRegion;
  });

  test('resume which returns only that candidate file', () => {
    const match = selectOwnedCandidateFile(candidate, { which: 'resume' });
    expect(match.key).toBe('resumes/abc.pdf');
    expect(match.field).toBe('resume');
  });

  test('a key that is not on the candidate is refused', () => {
    const match = selectOwnedCandidateFile(candidate, {
      storedUrl: 'https://hirobacket2025.s3.us-east-1.amazonaws.com/resumes/someone-else.pdf',
    });
    expect(match).toBeNull();
  });

  test('document id selects that document', () => {
    const match = selectOwnedCandidateFile(candidate, { documentId: 'doc-1' });
    expect(match.key).toBe('candidates/files/x/extra.pdf');
  });
});

describe('staff API allowlist', () => {
  const req = (method, originalUrl) => ({ method, originalUrl });

  test('candidate mutations are not public', () => {
    expect(isPublicApiRequest(req('POST', '/api/candidates'))).toBe(false);
    expect(isPublicApiRequest(req('PUT', '/api/candidates/abc'))).toBe(false);
    expect(isPublicApiRequest(req('DELETE', '/api/candidates/abc'))).toBe(false);
    expect(isPublicApiRequest(req('GET', '/api/candidates/abc/file-url'))).toBe(false);
  });

  test('picklist writes stay behind the token', () => {
    expect(isPublicApiRequest(req('GET', '/api/picklists'))).toBe(true);
    expect(isPublicApiRequest(req('POST', '/api/picklists'))).toBe(false);
    expect(isPublicApiRequest(req('PUT', '/api/picklists/1'))).toBe(false);
    expect(isPublicApiRequest(req('DELETE', '/api/picklists/1'))).toBe(false);
  });
});
