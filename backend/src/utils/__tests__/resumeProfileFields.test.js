const {
  mapResumeProfileFields,
  keepRecruiterProfileFields,
  computeAgeFromBirth,
} = require('../resumeProfileFields');

describe('resumeProfileFields', () => {
  const now = new Date(2026, 9, 28);

  it('maps Gemini license, gender, mobility and birth year, and computes age', () => {
    const mapped = mapResumeProfileFields({
      drivingLicenses: ['b_private_car', 'd_bus'],
      gender: 'male',
      mobility: 'Yes',
      birthYear: 1990,
      age: 34,
    }, now);
    expect(mapped.drivingLicenses).toEqual(['B', 'D']);
    expect(mapped.drivingLicense).toBe('B');
    expect(mapped.gender).toBe('male');
    expect(mapped.mobility).toBe('car_owner');
    expect(mapped.birthYear).toBe('1990');
    expect(mapped.age).toBe('36');
  });

  it('leaves mobility unset when Gemini sends null', () => {
    const mapped = mapResumeProfileFields({ mobility: null, gender: 'female', birthMonth: 3, birthDay: 2 }, now);
    expect(mapped.mobility).toBeUndefined();
    expect(mapped.gender).toBe('female');
    expect(mapped.birthMonth).toBe('3');
    expect(mapped.birthDay).toBe('2');
    expect(mapped.age).toBeUndefined();
  });

  it('does not replace a value the recruiter already entered', () => {
    const parsed = mapResumeProfileFields({
      drivingLicenses: ['d_bus'],
      gender: 'male',
      mobility: 'Yes',
      birthYear: 1990,
      age: 34,
    }, now);
    const kept = keepRecruiterProfileFields(parsed, {
      gender: 'נקבה',
      mobility: 'not_mobile',
      drivingLicense: 'C',
      drivingLicenses: ['C'],
      birthYear: '1985',
      age: '41',
    });
    expect(kept.gender).toBeUndefined();
    expect(kept.mobility).toBeUndefined();
    expect(kept.drivingLicenses).toBeUndefined();
    expect(kept.birthYear).toBeUndefined();
    expect(kept.age).toBeUndefined();
  });

  it('fills empty fields and replaces raw Gemini tokens', () => {
    const parsed = mapResumeProfileFields({
      drivingLicenses: ['b_private_car'],
      gender: 'male',
      mobility: 'Yes',
      birthYear: 1990,
    }, now);
    const kept = keepRecruiterProfileFields(parsed, {
      gender: 'male',
      mobility: 'Yes',
      drivingLicenses: ['b_private_car'],
      drivingLicense: 'b_private_car',
    });
    expect(kept.gender).toBeUndefined();
    expect(kept.mobility).toBe('car_owner');
    expect(kept.drivingLicenses).toEqual(['B']);
    expect(kept.birthYear).toBe('1990');
    expect(kept.age).toBe('36');
  });

  it('computes age from a full birth date', () => {
    expect(computeAgeFromBirth('1990', '11', '2', now)).toBe('35');
    expect(computeAgeFromBirth('1990', null, null, now)).toBe('36');
  });
});
