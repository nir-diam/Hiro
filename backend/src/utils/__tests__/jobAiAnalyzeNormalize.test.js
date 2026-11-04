const {
  coerceJobAges,
  mapAvailabilityToPicklistValue,
  normalizeAvailabilityOptionsFromAi,
  enrichJobAnalyzeResult,
  normalizeJobSkillYears,
  coerceJobMobility,
  normalizeJobPriority,
  normalizeLicenseTypesFromAi,
} = require('../jobAiAnalyzeNormalize');

describe('jobAiAnalyzeNormalize', () => {
  it('coerces ageMin/ageMax from aliases and swaps if reversed', () => {
    const r = coerceJobAges({ minAge: 45, maxAge: 25 });
    expect(r.ageMin).toBe(25);
    expect(r.ageMax).toBe(45);
  });

  it('infers age range from Hebrew internal notes', () => {
    const r = coerceJobAges({
      internalNotes: 'גיל 27-61, שכר 8K',
    });
    expect(r.ageMin).toBe(27);
    expect(r.ageMax).toBe(61);
  });

  it('maps availability Hebrew to picklist value', () => {
    expect(mapAvailabilityToPicklistValue('מיידי')).toBe('🟢 מיידי (זמין לעבודה מיד).');
    expect(mapAvailabilityToPicklistValue('🟡 חודש הודעה (עובד, מחפש אקטיבית).')).toBe(
      '🟡 חודש הודעה (עובד, מחפש אקטיבית).',
    );
  });

  it('dedupes availabilityOptions array', () => {
    const opts = normalizeAvailabilityOptionsFromAi({
      availability: 'מיידי',
      availabilityOptions: ['🟢 מיידי (זמין לעבודה מיד).', 'מיידי'],
    });
    expect(opts).toHaveLength(1);
    expect(opts[0]).toBe('🟢 מיידי (זמין לעבודה מיד).');
  });

  it('enrichJobAnalyzeResult sets ages and availability', () => {
    const out = enrichJobAnalyzeResult({
      ageMin: 22,
      ageMax: 55,
      availability: 'חודש הודעה',
    });
    expect(out.ageMin).toBe(22);
    expect(out.ageMax).toBe(55);
    expect(out.availabilityOptions[0]).toBe('🟡 חודש הודעה (עובד, מחפש אקטיבית).');
  });

  it('keeps the model years and leaves lookback null when the model left it null', () => {
    const fixed = normalizeJobSkillYears({
      name: 'שרטט/ת',
      tagType: 'role',
      years_experience: 3,
      lookback_years: null,
      quote: 'חובה ניסיון של 3 שנים',
    });
    expect(fixed.years_experience).toBe(3);
    expect(fixed.lookback_years).toBeNull();
  });

  it('does not copy years out of the quote onto a tag the model left empty', () => {
    const fixed = normalizeJobSkillYears({
      name: 'מנוסה',
      tagType: 'seniority',
      years_experience: null,
      lookback_years: null,
      quote: 'ניסיון של 3 שנים',
    });
    expect(fixed).toEqual({ years_experience: null, lookback_years: null });
  });

  it('clears years on types other than role, skill, and industry', () => {
    expect(normalizeJobSkillYears({
      tagType: 'language',
      years_experience: 4,
      lookback_years: 2,
    })).toEqual({ years_experience: null, lookback_years: null });
  });

  it('keeps an explicit lookback the model set', () => {
    const fixed = normalizeJobSkillYears({
      name: 'קניין/ית רכש',
      tagType: 'role',
      years_experience: 3,
      lookback_years: 2,
      quote: 'ניסיון של 3 שנים בתפקיד דומה ב-2 השנים האחרונות',
    });
    expect(fixed.years_experience).toBe(3);
    expect(fixed.lookback_years).toBe(2);
  });

  it('maps Yes mobility, urgent priority, and b_private_car', () => {
    expect(coerceJobMobility('Yes')).toBe(true);
    expect(coerceJobMobility('No')).toBe(false);
    expect(normalizeJobPriority('דחוף')).toBe('דחופה');
    expect(normalizeLicenseTypesFromAi({ drivingLicenses: ['b_private_car'] })).toEqual(['B']);
  });

  it('sets lookback to 0 when years_experience is 0', () => {
    expect(normalizeJobSkillYears({ tagType: 'role', years_experience: 0, lookback_years: 5 })).toEqual({
      years_experience: 0,
      lookback_years: 0,
    });
  });
});
