const {
  mergeHybridCandidateHits,
  VECTOR_LIMIT,
  VECTOR_MIN_SCORE,
  FUZZY_LIMIT,
} = require('../tagHybridCandidateMerge');

describe('tagHybridSearch candidate limits', () => {
  test('exports expanded Gemini pool limits', () => {
    expect(VECTOR_LIMIT).toBe(20);
    expect(VECTOR_MIN_SCORE).toBe(0.6);
    expect(FUZZY_LIMIT).toBe(5);
  });
});

describe('mergeHybridCandidateHits', () => {
  test('keeps all vector hits then adds fuzzy hits not already present', () => {
    const vector = [
      { name: 'React', source: 'vector', score: 0.91 },
      { name: 'Vue', source: 'vector', score: 0.72 },
    ];
    const fuzzy = [
      { name: 'React', source: 'fuzzy' },
      { name: 'Angular', source: 'fuzzy' },
      { name: 'Svelte', source: 'fuzzy' },
    ];
    const merged = mergeHybridCandidateHits(vector, fuzzy, 2);
    expect(merged.map((h) => h.name)).toEqual(['React', 'Vue', 'Angular', 'Svelte']);
  });

  test('caps fuzzy additions at fuzzyLimit after dedup against vector hits', () => {
    const vector = Array.from({ length: 20 }, (_, i) => ({
      name: `Vector ${i}`,
      source: 'vector',
      score: 0.9 - i * 0.01,
    }));
    const fuzzy = Array.from({ length: 12 }, (_, i) => ({
      name: `Fuzzy ${i}`,
      source: 'fuzzy',
    }));
    const merged = mergeHybridCandidateHits(vector, fuzzy, 5);
    expect(merged.filter((h) => h.source === 'vector')).toHaveLength(20);
    expect(merged.filter((h) => h.source === 'fuzzy')).toHaveLength(5);
    expect(merged).toHaveLength(25);
  });
});
