const { resolveMainWeights, mergeEngineConfig, normalizeEngineConfig, DEFAULT_CONFIG } = require('../matchingEngineService');
const { computeGeneralPenalties } = require('../matchingPenaltyService');

describe('resolveMainWeights', () => {
  it('restores balanced defaults when only vector is weighted', () => {
    const w = resolveMainWeights({ vector: 100, tags: 0, geo: 0, experience: 0, intent: 0 });
    expect(w).toEqual(DEFAULT_CONFIG.mainWeights);
  });

  it('keeps custom balanced weights', () => {
    const custom = { vector: 30, tags: 30, geo: 20, experience: 10, intent: 10 };
    expect(resolveMainWeights(custom)).toEqual(custom);
  });

  it('keeps vector-only weights when preset allows it', () => {
    const v = { vector: 100, tags: 0, geo: 0, experience: 0, intent: 0 };
    expect(resolveMainWeights(v, { allowVectorOnly: true })).toEqual(v);
  });
});

describe('normalizeEngineConfig', () => {
  it('fills missingAgeScore and penaltyPolicies on legacy partial JSON', () => {
    const norm = normalizeEngineConfig({ mainWeights: { vector: 40, tags: 30, geo: 20, experience: 5, intent: 5 } });
    expect(norm.missingAgeScore).toBe(DEFAULT_CONFIG.missingAgeScore);
    expect(norm.missingGeoScore).toBe(DEFAULT_CONFIG.missingGeoScore);
    expect(norm.penaltyPolicies.mobility.missing).toBe(DEFAULT_CONFIG.penaltyPolicies.mobility.missing);
  });
});

describe('mergeEngineConfig penaltyPolicies', () => {
  it('deep-merges per-dimension mismatch/missing from panel override', () => {
    const merged = mergeEngineConfig(DEFAULT_CONFIG, {
      penaltyPolicies: {
        scope: { mismatch: 40, missing: 3 },
      },
    });
    expect(merged.penaltyPolicies.scope).toEqual({ mismatch: 40, missing: 3 });
    expect(merged.penaltyPolicies.gender).toEqual(DEFAULT_CONFIG.penaltyPolicies.gender);
  });

  it('changes general penalty total when scope mismatch weight changes', () => {
    const job = { jobType: ['מלאה'], gender: 'לא משנה', mobility: false, licenseType: 'לא חשוב' };
    const candidate = { jobScope: 'חלקית', gender: '', mobility: '' };
    const low = computeGeneralPenalties(candidate, job, DEFAULT_CONFIG).total;
    const high = computeGeneralPenalties(candidate, job, {
      penaltyPolicies: { ...DEFAULT_CONFIG.penaltyPolicies, scope: { mismatch: 40, missing: 5 } },
    }).total;
    expect(high).toBeGreaterThan(low);
  });
});
