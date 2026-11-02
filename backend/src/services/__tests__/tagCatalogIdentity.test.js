/**
 * Regression tests for the `forklift_license` duplicate.
 *
 * A CV emitted the term `forklift_license` with detected type `tool`, while the catalog
 * already held `forklift_license` as `certification`. Two separate gates let a duplicate
 * pending row through:
 *   1. `ensureTagRecord` skipped the existing row on a type mismatch.
 *   2. `findHybridCandidates` type-filtered the catalog, so the AI never saw the target
 *      and proposed `create`.
 */

// Models are mocked so the service can be required without a live DB / Sequelize model graph.
jest.mock('../../models/Tag', () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
}));
jest.mock('../../models/SystemTag', () => ({
  associations: {},
  belongsTo: jest.fn(),
}));
jest.mock('../../config/db', () => ({
  sequelize: {
    define: jest.fn(() => ({})),
    query: jest.fn(async () => []),
    escape: (value) => `'${String(value).replace(/'/g, "''")}'`,
  },
}));

const { isSameCatalogIdentity } = require('../candidateTagService');

describe('isSameCatalogIdentity', () => {
  test('matches on identical tagKey regardless of type', () => {
    expect(
      isSameCatalogIdentity(
        { tagKey: 'forklift_license', type: 'certification', displayNameHe: 'רישיון מלגזה' },
        { tagKey: 'forklift_license', displayNameHe: 'רישיון מלגזה' },
      ),
    ).toBe(true);
  });

  test('matches when both display names agree even if tagKey differs', () => {
    expect(
      isSameCatalogIdentity(
        {
          tagKey: 'forklift_license',
          displayNameHe: 'רישיון מלגזה',
          displayNameEn: 'Forklift License',
        },
        {
          tagKey: 'forklift_licence',
          displayNameHe: 'רישיון מלגזה',
          displayNameEn: 'forklift license',
        },
      ),
    ).toBe(true);
  });

  test('does not match different terms that share only a Hebrew name', () => {
    expect(
      isSameCatalogIdentity(
        {
          tagKey: 'forklift_license',
          displayNameHe: 'רישיון מלגזה',
          displayNameEn: 'Forklift License',
        },
        {
          tagKey: 'crane_license',
          displayNameHe: 'רישיון מלגזה',
          displayNameEn: 'Crane License',
        },
      ),
    ).toBe(false);
  });

  test('tolerates missing fields without throwing', () => {
    expect(isSameCatalogIdentity(null, { tagKey: 'x' })).toBe(false);
    expect(isSameCatalogIdentity({ tagKey: 'x' }, {})).toBe(false);
    expect(isSameCatalogIdentity({}, {})).toBe(false);
  });

  test('ignores surrounding whitespace and casing', () => {
    expect(
      isSameCatalogIdentity(
        { tagKey: '  Forklift_License ' },
        { tagKey: 'forklift_license' },
      ),
    ).toBe(true);
  });
});
