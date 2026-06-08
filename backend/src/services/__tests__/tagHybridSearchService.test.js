const {
  buildTypeFilter,
  normalizeTagType,
} = require('../tagHybridSearchService');

describe('tagHybridSearchService type filter', () => {
  test('buildTypeFilter returns null for empty type', () => {
    expect(buildTypeFilter(null)).toBeNull();
    expect(buildTypeFilter('')).toBeNull();
  });

  test('buildTypeFilter normalizes tag type', () => {
    expect(buildTypeFilter('Skill')).toEqual({ type: 'skill' });
    expect(buildTypeFilter('degree')).toEqual({ type: 'degree' });
  });

  test('normalizeTagType lowercases trimmed value', () => {
    expect(normalizeTagType('  ROLE ')).toBe('role');
  });
});
