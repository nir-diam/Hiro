const {
  computeParameterMatches,
  computeGeneralPenalties,
  parseCandidateAge,
  jobRequiresGender,
  jobRequiresMobility,
  jobRequiresScope,
  jobRequiresLicense,
  jobRequiresAge,
  jobRequiresSalary,
  jobRequiresAvailability,
  normalizeAvailabilityTier,
  DEFAULT_PENALTY_POLICIES,
} = require('../matchingPenaltyService');

const CONFIG = { penaltyPolicies: DEFAULT_PENALTY_POLICIES };

describe('parseCandidateAge', () => {
  it('uses explicit age field', () => {
    expect(parseCandidateAge({ age: '32' })).toBe(32);
  });

  it('derives age from birthYear + birthMonth + birthDay', () => {
    const y = new Date().getFullYear() - 30;
    expect(parseCandidateAge({ birthYear: String(y), birthMonth: '1', birthDay: '1' })).toBe(30);
  });
});

describe('computeParameterMatches — traffic lights', () => {
  const jobFull = {
    gender: 'זכר',
    mobility: true,
    salaryMin: 8000,
    salaryMax: 12000,
    ageMin: 25,
    ageMax: 45,
    licenseType: 'B',
    jobType: ['משרה מלאה'],
    skills: [{ key: 'excel', mode: 'mandatory' }],
    languages: [{ language: 'אנגלית', mandatory: true }],
    description: 'נדרשת זמינות מיידית',
  };

  const candPerfect = {
    gender: 'זכר',
    mobility: 'כן',
    salaryMin: 10000,
    birthYear: String(new Date().getFullYear() - 30),
    drivingLicense: 'B',
    jobScope: 'משרה מלאה',
    preferredWorkingHours: '09:00-17:00',
    availability: 'מיידי',
    skills: { technical: [{ key: 'excel', name: 'Excel' }] },
    languages: ['אנגלית'],
  };

  it('all required dimensions green when candidate matches', () => {
    const pm = computeParameterMatches(candPerfect, jobFull);
    expect(pm.gender).toBe('match');
    expect(pm.mobility).toBe('match');
    expect(pm.scope).toBe('match');
    expect(pm.license).toBe('match');
    expect(pm.salary).toBe('match');
    expect(pm.age).toBe('match');
    expect(pm.mandatory_skill).toBe('match');
    expect(pm.mandatory_language).toBe('match');
    expect(pm.work_hours).toBe('match');
    expect(pm.availability).toBe('match');
  });

  it('mismatch when job requires and candidate differs', () => {
    const pm = computeParameterMatches(
      { ...candPerfect, gender: 'נקבה', mobility: 'לא', salaryMin: 20000, jobScope: 'משרה חלקית' },
      jobFull,
    );
    expect(pm.gender).toBe('mismatch');
    expect(pm.mobility).toBe('mismatch');
    expect(pm.scope).toBe('mismatch');
    expect(pm.salary).toBe('mismatch');
  });

  it('gray (unknown) when job does not require dimension', () => {
    const jobEmpty = {
      gender: 'לא משנה',
      mobility: false,
      licenseType: 'לא חשוב',
      jobType: [],
      salaryMax: null,
      ageMin: null,
      ageMax: null,
    };
    const pm = computeParameterMatches(candPerfect, jobEmpty);
    expect(pm.gender).toBe('unknown');
    expect(pm.mobility).toBe('unknown');
    expect(pm.scope).toBe('unknown');
    expect(pm.license).toBe('unknown');
    expect(pm.salary).toBe('unknown');
    expect(pm.age).toBe('unknown');
    expect(pm.mandatory_skill).toBe('unknown');
    expect(pm.mandatory_language).toBe('unknown');
  });

  it('missing when required info absent on candidate', () => {
    const pm = computeParameterMatches(
      { gender: '', mobility: '', salaryMin: null, jobScope: '' },
      jobFull,
    );
    expect(pm.gender).toBe('missing');
    expect(pm.mobility).toBe('missing');
    expect(pm.salary).toBe('missing');
    expect(pm.scope).toBe('missing');
  });

  it('not_mobile is mismatch (not match) when job requires mobility', () => {
    const pm = computeParameterMatches(
      { mobility: 'not_mobile' },
      { mobility: true },
    );
    expect(pm.mobility).toBe('mismatch');
  });

  it('employment type alone does not count as scope info', () => {
    const pm = computeParameterMatches(
      { employmentType: 'שכיר', jobScope: '' },
      { jobType: ['משרה מלאה'] },
    );
    expect(pm.scope).toBe('missing');
  });

  it('גמיש preferredWorkingHours is missing when job has concrete hours', () => {
    const job = { preferredWorkingHours: '08:00-17:00' };
    const pm = computeParameterMatches({ preferredWorkingHours: 'גמיש' }, job);
    expect(pm.work_hours).toBe('missing');
  });

  it('compares HH:mm-HH:mm ranges for match and mismatch', () => {
    const job = { preferredWorkingHours: '08:00-17:00' };
    expect(
      computeParameterMatches({ preferredWorkingHours: '08:00-17:00' }, job).work_hours,
    ).toBe('match');
    expect(
      computeParameterMatches({ preferredWorkingHours: '09:00-17:00' }, job).work_hours,
    ).toBe('match');
    expect(
      computeParameterMatches({ preferredWorkingHours: '08:00-09:00' }, job).work_hours,
    ).toBe('mismatch');
    expect(
      computeParameterMatches({ preferredWorkingHours: '18:00-22:00' }, job).work_hours,
    ).toBe('mismatch');
  });

  it('infers full-time job hours when job is גמיש + משרה מלאה', () => {
    const pm = computeParameterMatches(
      { preferredWorkingHours: '08:00-09:00' },
      { preferredWorkingHours: 'גמיש', jobType: ['משרה מלאה'] },
    );
    expect(pm.work_hours).toBe('mismatch');
  });

  it('matches job.availability field against candidate emoji timeline', () => {
    const jobImmediate = {
      availability: '🟢 מיידי (זמין לעבודה מיד).',
    };
    const candImmediate = { availability: '🟢 מיידי (זמין לעבודה מיד).' };
    const candNotice = { availability: '🟡 חודש הודעה (עובד, מחפש אקטיבית).' };
    expect(computeParameterMatches(candImmediate, jobImmediate).availability).toBe('match');
    expect(computeParameterMatches(candNotice, jobImmediate).availability).toBe('mismatch');
    expect(
      computeParameterMatches(candImmediate, {
        availability: '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
      }).availability,
    ).toBe('match');
  });

  it('legacy מיידי text matches description requiring immediate availability', () => {
    const pm = computeParameterMatches(
      { availability: 'מיידי' },
      { description: 'נדרשת זמינות מיידית' },
    );
    expect(pm.availability).toBe('match');
  });

  it('candidate not_relevant is mismatch when job requires availability', () => {
    const pm = computeParameterMatches(
      { availability: '🔴 לא רלוונטי (התקבל לעבודה / הקפיא תהליכים).' },
      { availability: '🟢 מיידי (זמין לעבודה מיד).' },
    );
    expect(pm.availability).toBe('mismatch');
  });

  it('matches when job accepts multiple availability options (OR)', () => {
    const job = {
      availabilityOptions: [
        '🟢 מיידי (זמין לעבודה מיד).',
        '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
      ],
    };
    expect(
      computeParameterMatches(
        { availability: '🟢 מיידי (זמין לעבודה מיד).' },
        job,
      ).availability,
    ).toBe('match');
    expect(
      computeParameterMatches(
        { availability: '🟡 חודש הודעה (עובד, מחפש אקטיבית).' },
        job,
      ).availability,
    ).toBe('match');
    expect(
      computeParameterMatches(
        { availability: '🟠 פסיבי (לא מחפש, אבל פתוח להצעות - Headhunting).' },
        job,
      ).availability,
    ).toBe('mismatch');
  });

  it('matches when job requires any of multiple license types (OR)', () => {
    const job = { licenseTypes: ['B', 'C'] };
    expect(computeParameterMatches({ drivingLicense: 'B' }, job).license).toBe('match');
    expect(computeParameterMatches({ drivingLicense: 'C' }, job).license).toBe('match');
    expect(computeParameterMatches({ drivingLicense: 'A1' }, job).license).toBe('mismatch');
  });

  it('matches Hebrew job gender to English picklist candidate values', () => {
    const jobFemale = { gender: 'נקבה' };
    expect(computeParameterMatches({ gender: 'female' }, jobFemale).gender).toBe('match');
    expect(computeParameterMatches({ gender: 'נקבה' }, jobFemale).gender).toBe('match');
    expect(computeParameterMatches({ gender: 'male' }, jobFemale).gender).toBe('mismatch');
    expect(computeParameterMatches({ gender: 'זכר' }, jobFemale).gender).toBe('mismatch');
  });

  it('no gender penalty when female job matches female candidate (English value)', () => {
    const pen = computeGeneralPenalties(
      { gender: 'female' },
      { gender: 'נקבה' },
      CONFIG,
    );
    expect(pen.total).toBe(0);
    expect(pen.reasons.some((r) => r.key === 'gender')).toBe(false);
  });
});

describe('jobRequires* helpers', () => {
  it('detects requirements from job fields', () => {
    expect(jobRequiresGender({ gender: 'זכר' })).toBe(true);
    expect(jobRequiresGender({ gender: 'לא משנה' })).toBe(false);
    expect(jobRequiresMobility({ mobility: true })).toBe(true);
    expect(jobRequiresMobility({ mobility: false })).toBe(false);
    expect(jobRequiresScope({ jobType: ['משרה מלאה'] })).toBe(true);
    expect(jobRequiresLicense({ licenseType: 'B' })).toBe(true);
    expect(jobRequiresLicense({ licenseTypes: ['B', 'C'] })).toBe(true);
    expect(jobRequiresLicense({ licenseType: 'לא חשוב' })).toBe(false);
    expect(jobRequiresAvailability({ availabilityOptions: ['🟢 מיידי (זמין לעבודה מיד).'] })).toBe(true);
    expect(jobRequiresAge({ ageMin: 25 })).toBe(true);
    expect(jobRequiresSalary({ salaryMax: 10000 })).toBe(true);
    expect(jobRequiresAvailability({ availability: '🟢 מיידי (זמין לעבודה מיד).' })).toBe(true);
    expect(jobRequiresAvailability({ description: 'נדרשת זמינות' })).toBe(true);
    expect(jobRequiresAvailability({})).toBe(false);
  });
});

describe('normalizeAvailabilityTier', () => {
  it('maps emoji picklist values', () => {
    expect(normalizeAvailabilityTier('🟢 מיידי (זמין לעבודה מיד).')).toBe('immediate');
    expect(normalizeAvailabilityTier('🟡 חודש הודעה (עובד, מחפש אקטיבית).')).toBe('notice');
    expect(normalizeAvailabilityTier('מיידי')).toBe('immediate');
  });
});

describe('computeGeneralPenalties aligns with parameterMatches', () => {
  const job = { gender: 'זכר', mobility: true, jobType: ['משרה מלאה'], licenseType: 'B' };

  it('applies penalty when parameter is mismatch', () => {
    const candidate = { gender: 'נקבה', mobility: 'לא', jobScope: 'משרה חלקית', drivingLicense: '' };
    const pm = computeParameterMatches(candidate, job);
    const pen = computeGeneralPenalties(candidate, job, CONFIG);
    expect(pm.gender).toBe('mismatch');
    expect(pm.mobility).toBe('mismatch');
    expect(pen.total).toBeGreaterThan(0);
    expect(pen.reasons.some((r) => r.key === 'gender')).toBe(true);
  });

  it('no penalty when job does not require', () => {
    const jobOpen = { gender: 'לא משנה', mobility: false, licenseType: 'לא חשוב', jobType: [] };
    const pen = computeGeneralPenalties({ gender: 'נקבה' }, jobOpen, CONFIG);
    expect(pen.total).toBe(0);
  });
});
