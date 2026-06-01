const {
  coerceJobAges,
  mapAvailabilityToPicklistValue,
  normalizeAvailabilityOptionsFromAi,
  enrichJobAnalyzeResult,
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
});
