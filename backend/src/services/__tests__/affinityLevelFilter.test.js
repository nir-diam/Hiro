const { normalizeAffinityLevel, passesAffinityLevel } = require('../affinityLevelFilter');

describe('affinityLevelFilter', () => {
  it('normalizes UI levels', () => {
    expect(normalizeAffinityLevel(null)).toBe('none');
    expect(normalizeAffinityLevel('exact')).toBe('exact');
    expect(normalizeAffinityLevel('same_cluster')).toBe('same_cluster');
    expect(normalizeAffinityLevel('same_category')).toBe('same_category');
    expect(normalizeAffinityLevel('role')).toBe('same_cluster');
  });

  it('exact allows only exact intent', () => {
    expect(passesAffinityLevel('exact', 'exact')).toBe(true);
    expect(passesAffinityLevel('role', 'exact')).toBe(false);
    expect(passesAffinityLevel('cluster', 'exact')).toBe(false);
    expect(passesAffinityLevel('different', 'exact')).toBe(false);
  });

  it('same_cluster allows exact and role', () => {
    expect(passesAffinityLevel('exact', 'same_cluster')).toBe(true);
    expect(passesAffinityLevel('role', 'same_cluster')).toBe(true);
    expect(passesAffinityLevel('cluster', 'same_cluster')).toBe(false);
    expect(passesAffinityLevel('different', 'same_cluster')).toBe(false);
  });

  it('same_category allows exact, role, cluster', () => {
    expect(passesAffinityLevel('exact', 'same_category')).toBe(true);
    expect(passesAffinityLevel('role', 'same_category')).toBe(true);
    expect(passesAffinityLevel('cluster', 'same_category')).toBe(true);
    expect(passesAffinityLevel('different', 'same_category')).toBe(false);
  });

  it('none does not filter', () => {
    expect(passesAffinityLevel('different', 'none')).toBe(true);
    expect(passesAffinityLevel('cluster', '')).toBe(true);
  });
});
