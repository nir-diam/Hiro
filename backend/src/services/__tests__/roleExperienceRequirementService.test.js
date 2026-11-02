const { evaluateRoleExperience, computeRoleExperiencePenalties } = require('../roleExperienceRequirementService');

const NOW = new Date(2026, 9, 15); // Oct 2026

const candidate = {
  workExperience: [
    { title: 'מנכ"ל ובעלים', roleTag: 'מנכ"ל/ית', startDate: '2015-01', endDate: 'Present' },
    { title: 'מנכ"ל', roleTag: 'מנכ"ל/ית', startDate: '2014-01', endDate: '2015-06' },
    { title: 'סמנכ"ל מכירות', roleTag: 'סמנכ"ל/ית מכירות', startDate: '2012-01', endDate: '2014-12' },
    { title: 'Procurement buyer', roleTag: 'קניין/ית רכש', startDate: '2010-01', endDate: '2011-12' },
  ],
};

const roleSkill = (name, extra) => ({ id: name, name, tagType: 'role', ...extra });

describe('evaluateRoleExperience', () => {
  it('is not applicable when no role tag has values', () => {
    const job = { skills: [roleSkill('מנכ"ל/ית'), { name: 'Excel', tagType: 'skill', years_experience: 3 }] };
    expect(evaluateRoleExperience(candidate, job, NOW)).toMatchObject({ applicable: false, ok: true });
  });

  it('counts overlapping rows once and passes on enough years', () => {
    const job = { skills: [roleSkill('מנכ"ל/ית', { years_experience: 10 })] };
    const res = evaluateRoleExperience(candidate, job, NOW);
    expect(res.ok).toBe(true);
    expect(res.details[0].years).toBeCloseTo(12.8, 1);
  });

  it('does not count סמנכ"ל rows as מנכ"ל', () => {
    const job = { skills: [roleSkill('סמנכ"ל/ית מכירות', { years_experience: 4 })] };
    const res = evaluateRoleExperience(candidate, job, NOW);
    expect(res.details[0].years).toBe(3);
    expect(res.ok).toBe(false);
  });

  it('clips to the look-back window', () => {
    const job = { skills: [roleSkill('קניין/ית רכש', { years_experience: 1, lookback_years: 10 })] };
    const res = evaluateRoleExperience(candidate, job, NOW);
    expect(res.details[0].years).toBe(0);
    expect(res.ok).toBe(false);
  });

  it('look-back only: any experience in the window passes', () => {
    const job = { skills: [roleSkill('מנכ"ל/ית', { lookback_years: 2 })] };
    expect(evaluateRoleExperience(candidate, job, NOW).ok).toBe(true);
  });

  it('passes when any one role requirement is met', () => {
    const job = {
      skills: [
        roleSkill('קניין/ית רכש', { years_experience: 5 }),
        roleSkill('מנכ"ל/ית', { years_experience: 3 }),
      ],
    };
    expect(evaluateRoleExperience(candidate, job, NOW).ok).toBe(true);
  });

  it('fails a candidate with no work experience', () => {
    const job = { skills: [roleSkill('מנכ"ל/ית', { years_experience: 1 })] };
    expect(evaluateRoleExperience({ workExperience: [] }, job, NOW).ok).toBe(false);
  });

  it('matches a feminine title against a slash-gender role tag', () => {
    const job = { skills: [roleSkill('מנהל/ת חשבונות', { years_experience: 1, lookback_years: 5 })] };
    const res = evaluateRoleExperience({
      workExperience: [
        { title: 'מנהלת חשבונות בכירה', startDate: '2022-01', endDate: 'Present' },
      ],
    }, job, NOW);
    expect(res.ok).toBe(true);
    expect(res.details[0].years).toBeGreaterThanOrEqual(1);
  });

  it('reads startYear/startMonth when startDate is missing', () => {
    const job = { skills: [roleSkill('מנהל/ת חשבונות', { years_experience: 1 })] };
    const res = evaluateRoleExperience({
      workExperience: [
        { title: 'מנהלת חשבונות', startYear: 2020, startMonth: 1, isCurrent: true },
      ],
    }, job, NOW);
    expect(res.ok).toBe(true);
  });

  it('matches secondary roleTagIds on the same row', () => {
    const tagId = 'role-tag-ops';
    const job = { skills: [{ id: tagId, tagId, name: 'מנהל/ת תפעול', tagType: 'role', years_experience: 1 }] };
    const res = evaluateRoleExperience({
      workExperience: [
        {
          title: 'מנהלת פרויקטים',
          roleTagIds: ['other-id', tagId],
          startDate: '2024-01',
          endDate: 'Present',
        },
      ],
    }, job, NOW);
    expect(res.ok).toBe(true);
  });

  it('counts year-only dates using January–December without requiring stored months', () => {
    const job = { skills: [roleSkill('מנהל/ת חשבונות', { years_experience: 1 })] };
    const res = evaluateRoleExperience({
      workExperience: [
        { title: 'מנהלת חשבונות', startYear: 2024, startDate: '2024', endYear: 2025, endDate: '2025' },
      ],
    }, job, NOW);
    expect(res.ok).toBe(true);
    expect(res.details[0].years).toBeGreaterThanOrEqual(1);
  });
});

describe('computeRoleExperiencePenalties', () => {
  const rates = { roleExperiencePenalty: 2, roleLookbackPenalty: 3 };

  it('is zero when the role tags have no years / look-back', () => {
    const job = { skills: [roleSkill('מנכ"ל/ית')] };
    expect(computeRoleExperiencePenalties(candidate, job, rates, NOW)).toEqual({
      roleExperiencePenalty: 0,
      roleLookbackPenalty: 0,
      reasons: [],
    });
  });

  it('penalises missing years of required experience', () => {
    const job = { skills: [roleSkill('סמנכ"ל/ית מכירות', { years_experience: 5 })] };
    const res = computeRoleExperiencePenalties(candidate, job, rates, NOW);
    expect(res.roleExperiencePenalty).toBe(4);
    expect(res.roleLookbackPenalty).toBe(0);
    expect(res.reasons[0]).toMatchObject({ key: 'role_experience', label: 'קנס ניסיון תעסוקתי', amount: 4 });
  });

  it('penalises experience that sits outside the look-back window', () => {
    const job = { skills: [roleSkill('קניין/ית רכש', { lookback_years: 5 })] };
    const res = computeRoleExperiencePenalties(candidate, job, rates, NOW);
    expect(res.roleExperiencePenalty).toBe(0);
    expect(res.roleLookbackPenalty).toBeGreaterThan(0);
    expect(res.reasons).toHaveLength(1);
    expect(res.reasons[0]).toMatchObject({ key: 'role_experience', amount: res.roleLookbackPenalty });
  });

  it('picks the lowest penalty among alternative role titles', () => {
    const job = {
      skills: [
        roleSkill('קניין/ית רכש', { years_experience: 5, lookback_years: 5 }),
        roleSkill('מנכ"ל/ית', { years_experience: 3 }),
      ],
    };
    const res = computeRoleExperiencePenalties(candidate, job, rates, NOW);
    expect(res.roleExperiencePenalty).toBe(0);
    expect(res.roleLookbackPenalty).toBe(0);
    expect(res.reasons).toEqual([]);
  });

  it('applies only the years shortfall when workExperience is missing', () => {
    const job = { skills: [roleSkill('מנהל/ת חשבונות', { years_experience: 1, lookback_years: 5 })] };
    const res = computeRoleExperiencePenalties({ workExperience: [] }, job, rates, NOW);
    expect(res.roleExperiencePenalty).toBe(2);
    expect(res.roleLookbackPenalty).toBe(0);
    expect(res.reasons).toEqual([
      { key: 'role_experience', type: 'mismatch', label: 'קנס ניסיון תעסוקתי', amount: 2 },
    ]);
  });
});
