/**
 * Regression tests: a detected-type disagreement must NEVER fork a duplicate catalog tag.
 *
 * The `forklift_license` bug had two halves:
 *   1. the AI was blind to the active tag (type-filtered hybrid search) → it said "create";
 *   2. `ensureTagRecord` skipped the existing row on `tool !== certification` and created
 *      a second pending row.
 *
 * These tests pin part 2: `ensureTagRecord` must reuse the existing row instead of
 * falling through to `Tag.create()`.
 */
const mockTag = {
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  findOrCreate: jest.fn(),
};
const mockQuery = jest.fn();

jest.mock('../../models/Tag', () => mockTag);
jest.mock('../../models/SystemTag', () => ({
  associations: {},
  belongsTo: jest.fn(),
}));
jest.mock('../../config/db', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    query: (...args) => mockQuery(...args),
    escape: (value) => `'${String(value).replace(/'/g, "''")}'`,
    QueryTypes: { SELECT: 'SELECT' },
  },
}));

const { ensureTagRecord } = require('../candidateTagService');

/** A catalog row shaped like the real active `forklift_license`. */
const buildActiveTag = (overrides = {}) => ({
  id: '9209c6eb-b9a9-4ed5-9ce1-0f840b5e7a68',
  tagKey: 'forklift_license',
  displayNameHe: 'רישיון מלגזה',
  displayNameEn: 'Forklift License',
  type: 'certification',
  status: 'active',
  usageCount: 265,
  update: jest.fn(),
  save: jest.fn(),
  ...overrides,
});

describe('ensureTagRecord — cross-type identity merge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // findTagByNameOrAlias resolves through the raw query, then Tag.findByPk.
    mockQuery.mockResolvedValue([{ id: '9209c6eb-b9a9-4ed5-9ce1-0f840b5e7a68' }]);
    mockTag.findByPk.mockResolvedValue(buildActiveTag());
    mockTag.findOne.mockResolvedValue(null);
    mockTag.findAll.mockResolvedValue([]);
    mockTag.create.mockReset();
  });

  it('reuses the existing certification tag instead of creating a tool duplicate', async () => {
    const result = await ensureTagRecord('forklift_license', {
      displayNameHe: 'רישיון מלגזה',
      displayNameEn: 'forklift_license',
      type: 'tool',
    });

    expect(mockTag.create).not.toHaveBeenCalled();
    expect(result?.created).toBeFalsy();
    expect(String(result?.tag?.id)).toBe('9209c6eb-b9a9-4ed5-9ce1-0f840b5e7a68');
  });

  it('does not re-type an active tag when the detected type disagrees', async () => {
    const active = buildActiveTag();
    mockTag.findByPk.mockResolvedValue(active);

    await ensureTagRecord('forklift_license', {
      displayNameHe: 'רישיון מלגזה',
      displayNameEn: 'forklift_license',
      type: 'tool',
    });

    // maybeUpgradeType only touches `role` or `pending` rows.
    expect(active.update).not.toHaveBeenCalled();
    expect(active.type).toBe('certification');
  });

  it('still returns the existing tag when only the alias matches across types', async () => {
    mockTag.findByPk.mockResolvedValue(
      buildActiveTag({
        tagKey: 'forklift_operator_license',
        displayNameHe: 'רישיון מפעיל מלגזה',
        displayNameEn: 'Forklift Operator License',
      }),
    );

    const result = await ensureTagRecord('forklift_licence_typo', {
      displayNameHe: 'רישיון מלגזה',
      displayNameEn: 'Forklift License',
      type: 'tool',
    });

    expect(mockTag.create).not.toHaveBeenCalled();
    expect(result?.tag).toBeTruthy();
  });

  it('creates a new pending tag when nothing in the catalog matches', async () => {
    mockQuery.mockResolvedValue([]);
    mockTag.findOne.mockResolvedValue(null);
    mockTag.create.mockResolvedValue(
      buildActiveTag({
        id: 'new-tag',
        tagKey: 'brand_new_skill',
        type: 'skill',
        status: 'pending',
        usageCount: 0,
      }),
    );

    const result = await ensureTagRecord('brand_new_skill', {
      displayNameHe: 'כישור חדש',
      type: 'skill',
    });

    expect(mockTag.create).toHaveBeenCalledTimes(1);
    expect(result?.created).toBe(true);
  });

  it('never recreates a blacklisted (deprecated) tag', async () => {
    mockTag.findByPk.mockResolvedValue(
      buildActiveTag({ id: 'dep-1', status: 'deprecated' }),
    );

    const result = await ensureTagRecord('forklift_license', {
      displayNameHe: 'רישיון מלגזה',
      type: 'tool',
    });

    expect(result).toBeNull();
    expect(mockTag.create).not.toHaveBeenCalled();
  });
});
