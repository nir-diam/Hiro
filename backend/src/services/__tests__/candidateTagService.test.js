// Mock Tag and SystemTag models so we don't hit real Sequelize models
const mockQuery = jest.fn();
jest.mock('../../models/Tag', () => ({
  findByPk: jest.fn(),
}));
jest.mock('../../models/SystemTag', () => ({
  associations: {},
  belongsTo: jest.fn(),
}));

// Mock sequelize: query is used by findTagByNameOrAlias (raw SQL for synonym/alias match)
jest.mock('../../config/db', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    query: (...args) => mockQuery(...args),
    escape: (value) => `'${String(value).replace(/'/g, "''")}'`,
  },
}));

const Tag = require('../../models/Tag');
const {
  findTagByNameOrAlias,
  resolveIncomingTagType,
  normalizeCandidateTagType,
  mergeJobSkillPayloads,
} = require('../candidateTagService');

describe('resolveIncomingTagType', () => {
  it('keeps explicit certification from LLM', () => {
    expect(
      resolveIncomingTagType({
        raw_type: 'certification',
        name: 'תעודה בניהול רכש',
        context: 'Degree',
      }),
    ).toBe('certification');
  });

  it('promotes Hebrew certificate wording from degree to certification', () => {
    expect(
      resolveIncomingTagType({
        raw_type: 'degree',
        name: 'תעודת ניהול רכש ולוגיסטיקה',
        context: 'Degree',
      }),
    ).toBe('certification');
  });

  it('keeps academic degree when text mentions תואר', () => {
    expect(
      resolveIncomingTagType({
        raw_type: 'degree',
        name: 'תואר ראשון במנהל עסקים',
      }),
    ).toBe('degree');
  });
});

describe('normalizeCandidateTagType', () => {
  it('maps education alias to degree', () => {
    expect(normalizeCandidateTagType('education')).toBe('degree');
  });

  it('maps certificate alias to certification', () => {
    expect(normalizeCandidateTagType('certificate')).toBe('certification');
  });
});

describe('findTagByNameOrAlias', () => {
  beforeEach(() => {
    Tag.findByPk.mockReset();
    mockQuery.mockReset();
  });

  it('returns null and does not query when name is empty or whitespace', async () => {
    const result1 = await findTagByNameOrAlias('');
    const result2 = await findTagByNameOrAlias('   ');

    expect(result1).toBeNull();
    expect(result2).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('uses raw query and returns tag when name matches (e.g. synonym phrase)', async () => {
    const fakeTag = { id: 'tag-1', tagKey: 'microsoft_excel' };
    mockQuery.mockResolvedValue([{ id: 'tag-1' }]);
    Tag.findByPk.mockResolvedValue(fakeTag);

    const result = await findTagByNameOrAlias('excel');

    expect(result).toBe(fakeTag);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(String(mockQuery.mock.calls[0][0])).toContain('ORDER BY');
    expect(String(mockQuery.mock.calls[0][0])).toContain("'active' THEN 0");
    expect(Tag.findByPk).toHaveBeenCalledWith('tag-1');
  });

  it('passes status filter when requested', async () => {
    mockQuery.mockResolvedValue([]);
    await findTagByNameOrAlias('excel', { status: 'active' });
    expect(String(mockQuery.mock.calls[0][0])).toContain('status::text');
  });
});

describe('mergeJobSkillPayloads', () => {
  it('keeps mandatory, the higher score, and non-null years from either row', () => {
    const merged = mergeJobSkillPayloads(
      {
        tagKey: 'drafter',
        mode: 'normal',
        confidence_score: 0.8,
        years_experience: null,
        lookback_years: null,
        source: 'ai',
      },
      {
        tagKey: 'drafter',
        mode: 'mandatory',
        confidence_score: 1,
        years_experience: 3,
        lookback_years: null,
        source: 'ai',
      },
    );
    expect(merged.mode).toBe('mandatory');
    expect(merged.confidence_score).toBe(1);
    expect(merged.years_experience).toBe(3);
    expect(merged.lookback_years).toBeNull();
  });
});

