const {
  resolveIngestStubFullName,
  extractNameFromIngestSubject,
  resolvePostIngestPersonName,
  isPortalFromEmail,
} = require('../emailIngestPersonName');

describe('emailIngestPersonName', () => {
  const allJobsSubject =
    "מועמדות חדשה מבראזני סביון למשרת מנהל.ת חשבונות לתל אביב במשרה חלקית והיברידית$ מס' 1000049";

  it('detects portal from addresses', () => {
    expect(isPortalFromEmail('alljobs@alljob.co.il')).toBe(true);
    expect(isPortalFromEmail('recruiter@company.co.il')).toBe(false);
  });

  it('extracts candidate name from AllJobs subject', () => {
    const name = extractNameFromIngestSubject(allJobsSubject, { recruitmentSourceName: 'AllJobs' });
    expect(name.fullName).toBe('בראזני סביון');
  });

  it('stub name uses subject instead of AllJobs From display name', () => {
    const stub = resolveIngestStubFullName({
      fromDisplayName: 'AllJobs',
      fromEmail: 'alljobs@alljob.co.il',
      subject: allJobsSubject,
      recruitmentSourceName: 'AllJobs',
    });
    expect(stub).toBe('בראזני סביון');
  });

  it('post-parse fallback replaces portal-like fullName', () => {
    const patch = resolvePostIngestPersonName({
      fullName: 'AllJobs',
      subject: allJobsSubject,
      recruitmentSourceName: 'AllJobs',
      nameHints: [],
    });
    expect(patch.source).toBe('fallback');
    expect(patch.fullName).toBe('בראזני סביון');
  });
});
