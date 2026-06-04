const { normalizeEmployeeCount, HIRO_EMPLOYEE_BUCKETS } = require('../normalizeEmployeeCount');

const PROMPT_VALUES = [
  ['(Seed) 1-10', '1-10'],
  ['(Startup) 11-50', '11-50'],
  ['(Growth) 51-200', '51-200'],
  ['(Scale) 201-1000', '201-1000'],
  ['(Enterprise) +1000', '1000+'],
  ['(Mega Enterprise) +10000', '10000+'],
];

describe('normalizeEmployeeCount', () => {
  it('maps enrich prompt literals to Hiro select buckets', () => {
    for (const [input, expected] of PROMPT_VALUES) {
      expect(normalizeEmployeeCount(input)).toBe(expected);
    }
  });

  it('passes through Hiro buckets', () => {
    for (const bucket of HIRO_EMPLOYEE_BUCKETS) {
      expect(normalizeEmployeeCount(bucket)).toBe(bucket);
    }
  });

  it('maps PDL granular sizes to Hiro buckets', () => {
    expect(normalizeEmployeeCount('201-500')).toBe('201-1000');
    expect(normalizeEmployeeCount('1001-5000')).toBe('1000+');
  });

  it('maps numeric headcount to bucket', () => {
    expect(normalizeEmployeeCount(83)).toBe('51-200');
    expect(normalizeEmployeeCount('5000')).toBe('1000+');
  });

  it('rejects placeholders', () => {
    expect(normalizeEmployeeCount('estimate range')).toBeNull();
    expect(normalizeEmployeeCount('Unknown')).toBeNull();
  });
});
