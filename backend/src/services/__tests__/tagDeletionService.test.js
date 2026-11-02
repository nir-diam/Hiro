const mockQuery = jest.fn();
const mockTagDestroy = jest.fn();
const mockSystemTagDestroy = jest.fn();
const mockSystemTagFindAll = jest.fn();
const mockSystemTagFindOne = jest.fn();
const mockTagHistoryDestroy = jest.fn();

jest.mock('../../config/db', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    query: jest.fn((...args) => Promise.resolve(mockQuery(...args))),
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

jest.mock('../../models/Tag', () => ({
  destroy: (...args) => mockTagDestroy(...args),
}));

jest.mock('../../models/SystemTag', () => ({
  destroy: (...args) => mockSystemTagDestroy(...args),
  findAll: (...args) => mockSystemTagFindAll(...args),
  findOne: (...args) => mockSystemTagFindOne(...args),
}));

jest.mock('../../models/TagHistory', () => ({
  destroy: (...args) => mockTagHistoryDestroy(...args),
}));

const { purgeCatalogTagRows } = require('../tagDeletionService');

const fkViolation = () => {
  const err = new Error(
    'update or delete on table "tags" violates foreign key constraint '
    + '"candidate_tags_tag_id_fkey" on table "system_tags"',
  );
  err.code = '23503';
  return err;
};

describe('purgeCatalogTagRows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSystemTagFindAll.mockResolvedValue([]);
    mockSystemTagFindOne.mockResolvedValue(null);
    mockSystemTagDestroy.mockResolvedValue(0);
    mockTagHistoryDestroy.mockResolvedValue(0);
    mockQuery.mockResolvedValue([]);
    mockTagDestroy.mockResolvedValue(1);
  });

  it('clears system_tags and tag_histories before deleting the catalog tag', async () => {
    const deleted = await purgeCatalogTagRows(['tag-1']);

    expect(mockSystemTagDestroy).toHaveBeenCalled();
    const [[destroyArgs]] = mockSystemTagDestroy.mock.calls;
    const [tagIdFilter] = Object.getOwnPropertySymbols(destroyArgs.where.tag_id)
      .map((key) => destroyArgs.where.tag_id[key]);
    expect(tagIdFilter).toEqual(['tag-1']);

    expect(mockTagHistoryDestroy).toHaveBeenCalled();
    expect(mockTagDestroy).toHaveBeenCalled();
    expect(deleted).toBe(1);

    // Order matters: children must be gone before the parent row is deleted.
    const systemTagOrder = mockSystemTagDestroy.mock.invocationCallOrder[0];
    const tagOrder = mockTagDestroy.mock.invocationCallOrder[0];
    expect(systemTagOrder).toBeLessThan(tagOrder);
  });

  it('moves candidate/job links onto the merge target instead of dropping them', async () => {
    mockSystemTagFindAll.mockResolvedValue([
      { id: 'link-1', entity_id: 'cand-1', type: 'candidate', update: jest.fn(), destroy: jest.fn() },
    ]);

    await purgeCatalogTagRows(['tag-1'], { targetTag: { id: 'target-1', status: 'active', type: 'skill' } });

    expect(mockTagDestroy).toHaveBeenCalled();
    expect(mockSystemTagFindOne).toHaveBeenCalledWith({
      where: { entity_id: 'cand-1', tag_id: 'target-1', type: 'candidate' },
    });
  });

  it('retries the delete after clearing an unexpected FK reference', async () => {
    mockTagDestroy
      .mockRejectedValueOnce(fkViolation())
      .mockResolvedValueOnce(1);
    mockQuery.mockImplementation((sql) => {
      if (String(sql).includes('pg_constraint')) {
        return [{ table_name: 'legacy_tag_links', column_name: 'tag_id' }];
      }
      return [];
    });

    const deleted = await purgeCatalogTagRows(['tag-1']);

    expect(deleted).toBe(1);
    expect(mockTagDestroy).toHaveBeenCalledTimes(2);
    const cleanupCall = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes('DELETE FROM "legacy_tag_links"'),
    );
    expect(cleanupCall).toBeTruthy();
  });

  it('is a no-op for an empty id list', async () => {
    const deleted = await purgeCatalogTagRows([]);
    expect(deleted).toBe(0);
    expect(mockTagDestroy).not.toHaveBeenCalled();
  });
});
