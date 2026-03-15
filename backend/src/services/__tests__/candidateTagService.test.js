// Mock Tag and CandidateTag models so we don't hit real Sequelize models
const mockQuery = jest.fn();
jest.mock('../../models/Tag', () => ({
  findByPk: jest.fn(),
}));
jest.mock('../../models/CandidateTag', () => ({
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
const { findTagByNameOrAlias } = require('../candidateTagService');

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
    expect(Tag.findByPk).toHaveBeenCalledWith('tag-1');
  });
});

