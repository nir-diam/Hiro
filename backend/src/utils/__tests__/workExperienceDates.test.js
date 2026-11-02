const { normalizeWorkExperience, cvParseFailedUpdate } = require('../workExperienceNormalize');
const { buildResumeResponseSchema } = require('../../services/cvParsingPromptService');

describe('work experience date schema', () => {
  test('gemini schema uses integer years and months, with dates last', () => {
    const item = buildResumeResponseSchema().properties.workExperience.items;
    expect(item.properties.startDate).toBeUndefined();
    expect(item.properties.endDate).toBeUndefined();
    expect(item.properties.startYear.type).toBe('integer');
    expect(item.properties.startMonth.type).toBe('integer');
    expect(item.properties.startYear.nullable).toBe(true);
    expect(item.properties.startMonth.nullable).toBe(true);
    expect(item.properties.endYear.nullable).toBe(true);
    expect(item.properties.endMonth.nullable).toBe(true);
    expect(item.properties.startMonth.description).toMatch(/null when not written/i);
    expect(item.properties.endMonth.description).toMatch(/null when isCurrent/i);
    expect(item.required).toEqual(expect.arrayContaining([
      'description', 'isCurrent', 'startYear', 'startMonth', 'endYear', 'endMonth',
    ]));
    const order = item.propertyOrdering;
    expect(order.slice(-4)).toEqual(['startYear', 'startMonth', 'endYear', 'endMonth']);
    expect(order.indexOf('description')).toBeLessThan(order.indexOf('startYear'));
  });

  test('integer dates become YYYY-MM and a current job ends at Present', () => {
    const [row] = normalizeWorkExperience([{
      title: 'מחסנאי',
      company: 'א',
      description: 'ליקוט',
      isCurrent: true,
      startYear: 2019,
      startMonth: 6,
      endYear: 2019,
      endMonth: 6,
    }]);
    expect(row.startDate).toBe('2019-06');
    expect(row.endDate).toBe('Present');
    expect(row.isCurrent).toBe(true);
    expect(row.startYear).toBe(2019);
    expect(row.endYear).toBeUndefined();
    expect(row.endMonth).toBeUndefined();
  });

  test('year-only CV dates stay YYYY and do not invent January or December', () => {
    const [row] = normalizeWorkExperience([{
      title: 'עצמאית',
      company: 'פז',
      description: 'ניהול',
      isCurrent: false,
      startYear: 1994,
      startMonth: null,
      endYear: 1995,
      endMonth: null,
    }]);
    expect(row.startDate).toBe('1994');
    expect(row.endDate).toBe('1995');
    expect(row.startMonth).toBeUndefined();
    expect(row.endMonth).toBeUndefined();
  });

  test('a future end date is treated as the current job', () => {
    const [row] = normalizeWorkExperience([{
      title: 'מנהלת',
      company: 'א',
      description: 'עבודה',
      isCurrent: false,
      startYear: 2024,
      startMonth: null,
      endYear: 2099,
      endMonth: 12,
    }]);
    expect(row.endDate).toBe('Present');
    expect(row.isCurrent).toBe(true);
    expect(row.endYear).toBeUndefined();
    expect(row.endMonth).toBeUndefined();
  });

  test('a CV with no parsed jobs is marked failed instead of keeping placeholder rows', () => {
    const failed = cvParseFailedUpdate(
      [{ title: 'ניסיון', startDate: '2000-01', endDate: '2000-12', description: 'טקסט' }],
      'קו"ח ארוך מספיק כדי שלא ייחשב ריק',
    );
    expect(failed.status).toBe('נכשל בעיבוד');
    expect(failed.workExperience).toEqual([]);
    expect(cvParseFailedUpdate([{ title: 'מחסנאי', company: 'א', startYear: 2020, startMonth: 1 }], 'קו"ח')).toBeNull();
  });
});
