const {
  coerceJobAges,
  mapAvailabilityToPicklistValue,
  normalizeAvailabilityOptionsFromAi,
  enrichJobAnalyzeResult,
  normalizeJobSkillYears,
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

  it('puts tenure years on years_experience and defaults lookback to 1', () => {
    const fixed = normalizeJobSkillYears({
      name: 'מנהל/ת חשבונות',
      years_experience: 1,
      lookback_years: 5,
      quote: 'ניסיון של לפחות 5 שנים בתחום הנהלת החשבונות - חובה.',
      tag_reason: 'מקצוע הבסיס הנדרש עם ניסיון של 5 שנים',
    });
    expect(fixed.years_experience).toBe(5);
    expect(fixed.lookback_years).toBe(1);
  });

  it('keeps explicit lookback when the text limits how recent experience must be', () => {
    const fixed = normalizeJobSkillYears({
      name: 'קניין/ית רכש',
      years_experience: 3,
      lookback_years: 2,
      quote: 'ניסיון של 3 שנים בתפקיד דומה ב-2 השנים האחרונות',
    });
    expect(fixed.years_experience).toBe(3);
    expect(fixed.lookback_years).toBe(2);
  });

  it('sets lookback to 0 when years_experience is 0', () => {
    expect(normalizeJobSkillYears({ years_experience: 0, lookback_years: 5 })).toEqual({
      years_experience: 0,
      lookback_years: 0,
    });
  });
});
