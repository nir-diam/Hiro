const {
  resolveSubjectPrefixTemplate,
  buildCvForwardEmailSubject,
  listCvForwardSubjectVariablesForApi,
  resolveRecruitmentSourceLabel,
  resolveJobTitle,
  resolveCandidateName,
} = require('../cvForwardSubjectVariables');

describe('cvForwardSubjectVariables', () => {
  it('lists API metadata for registered variables', () => {
    const vars = listCvForwardSubjectVariablesForApi();
    expect(vars.map((v) => v.key)).toEqual([
      'מקור_גיוס',
      'שם_משרה',
      'קוד_משרה',
      'שם_לקוח',
      'שם_מועמד',
    ]);
    expect(vars[0].token).toBe('{{מקור_גיוס}}');
  });

  it('resolves recruitment source from explicit name first', () => {
    expect(
      resolveRecruitmentSourceLabel({
        recruitmentSourceName: 'LinkedIn',
        candidate: { source: 'email' },
      }),
    ).toBe('LinkedIn');
  });

  it('falls back to candidate.source and jobCandidate metadata', () => {
    expect(resolveRecruitmentSourceLabel({ candidate: { source: 'דף פרסום (linkedin)' } })).toBe(
      'דף פרסום (linkedin)',
    );
    expect(
      resolveRecruitmentSourceLabel({
        jobCandidate: {
          source: 'public_apply:linkedin',
          workflowMeta: { recruitmentSource: 'LinkedIn Premium' },
        },
      }),
    ).toBe('LinkedIn Premium');
  });

  it('resolves job and candidate fields', () => {
    expect(
      resolveJobTitle({
        job: { title: 'מפתח Full Stack', publicJobTitle: 'Developer' },
      }),
    ).toBe('מפתח Full Stack');
    expect(
      resolveCandidateName({
        candidate: { fullName: 'ישראל ישראלי' },
      }),
    ).toBe('ישראל ישראלי');
  });

  it('replaces multiple placeholders in one template', () => {
    const out = resolveSubjectPrefixTemplate('[{{קוד_משרה}}] {{שם_משרה}} · {{מקור_גיוס}}', {
      job: { postingCode: '123456', title: 'מנהל/ת מוצר' },
      recruitmentSourceName: 'AllJobs',
    });
    expect(out).toBe('[123456] מנהל/ת מוצר · AllJobs');
  });

  it('leaves unknown placeholders intact', () => {
    const out = resolveSubjectPrefixTemplate('{{משתנה_לא_קיים}} test', {
      recruitmentSourceName: 'X',
    });
    expect(out).toBe('{{משתנה_לא_קיים}} test');
  });

  it('builds final subject as prefix + original', () => {
    expect(
      buildCvForwardEmailSubject('{{מקור_גיוס}}', 'קורות חיים - מועמד', {
        recruitmentSourceName: 'Drushim',
      }),
    ).toBe('Drushim קורות חיים - מועמד');
  });

  it('returns only prefix or subject when the other is empty', () => {
    expect(
      buildCvForwardEmailSubject('{{מקור_גיוס}}', '', { recruitmentSourceName: 'A' }),
    ).toBe('A');
    expect(buildCvForwardEmailSubject('', 'Original subject', {})).toBe('Original subject');
  });
});
