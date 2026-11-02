jest.mock('../vectorSearchService', () => ({
  normalizeEmbedding: (e) => (Array.isArray(e) ? e : []),
}));

jest.mock('../jobTaxonomyResolver', () => ({
  loadTaxonomyIndex: jest.fn().mockResolvedValue({}),
  resolveJobTaxonomy: jest.fn(() => ({})),
  resolveAllJobTaxonomies: jest.fn(() => []),
  taxonomiesFromCandidateProfile: jest.fn(() => []),
  buildLinkedJobsForIntent: jest.fn().mockResolvedValue([]),
}));

jest.mock('../embeddingService', () => ({
  embedText: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../models/City', () => ({
  findAll: jest.fn(),
}));

jest.mock('../tagAliasIndexService', () => ({
  loadTagAliasIndex: jest.fn().mockResolvedValue(new Map()),
  resolveCanonicalTagKey: (raw, index) => {
    const term = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!term) return '';
    return index?.get?.(term) || term;
  },
  tagKeysEquivalent: (a, b, index) => {
    const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const na = norm(a);
    const nb = norm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const ca = index?.get?.(na) || na;
    const cb = index?.get?.(nb) || nb;
    return ca === cb;
  },
}));

const City = require('../../models/City');
const {
  computeFullMatchScore,
  computeTagScore,
  computeGeoScore,
  computeGeoPenaltyPoints,
  computeIntentScore,
  resolveGeoRegionId,
  invalidateCityCache,
} = require('../matchingScoreService');
const { DEFAULT_PENALTY_POLICIES } = require('../matchingPenaltyService');

const BASE_CONFIG = {
  mainWeights: { vector: 0, tags: 0, geo: 0, experience: 0, intent: 0 },
  missingGeoScore: 0,
  missingSalaryScore: 0,
  salaryDiffThreshold: 10,
  salaryPenalty: 5,
  ageGapPenalty: 2,
  isExperienceEnabled: false,
  penaltyPolicies: DEFAULT_PENALTY_POLICIES,
  tagWeights: [],
  intentWeights: [],
  geoRegions: [],
};

describe('resolveGeoRegionId', () => {
  it('maps Hebrew district labels to config ids', () => {
    expect(resolveGeoRegionId('צפון')).toBe('north');
    expect(resolveGeoRegionId('מרכז, שרון וגוש דן')).toBe('center');
    expect(resolveGeoRegionId('השפלה')).toBe('shfela');
    expect(resolveGeoRegionId('ירושלים')).toBe('jerusalem');
    expect(resolveGeoRegionId('דרום')).toBe('south');
    expect(resolveGeoRegionId('north')).toBe('north');
  });
});

describe('computeGeoScore regional penaltyPerKm', () => {
  const haifaCoords = { pointx: 192465, pointy: 742695 };
  const haderaCoords = { pointx: 195277, pointy: 725041 };

  beforeEach(() => {
    invalidateCityCache();
    City.findAll.mockResolvedValue([
      { cityName: 'חיפה', city: 'חיפה', column4: 'צפון', ...haifaCoords },
      { cityName: 'חדרה', city: 'חדרה', column4: 'צפון', ...haderaCoords },
    ]);
  });

  const geoRegions = [
    { id: 'center', grace: 15, penaltyPerKm: 99 },
    { id: 'north', grace: 10, penaltyPerKm: 2 },
    { id: 'south', grace: 15, penaltyPerKm: 99 },
    { id: 'shfela', grace: 15, penaltyPerKm: 99 },
    { id: 'jerusalem', grace: 15, penaltyPerKm: 99 },
  ];

  it('uses the job region config (north), not center, for Haifa ↔ Hadera', async () => {
    const job = { city: 'חיפה', region: '' };
    const candidate = { city: 'חדרה', address: 'חדרה' };

    const lowPenalty = await computeGeoScore(candidate, job, geoRegions, 0);
    const highNorth = await computeGeoScore(candidate, job, [
      ...geoRegions.filter((r) => r.id !== 'north'),
      { id: 'north', grace: 10, penaltyPerKm: 12 },
    ], 0);

    expect(lowPenalty.missing).toBe(false);
    expect(lowPenalty.maxValidKm).toBe(10);
    expect(lowPenalty.score).toBeGreaterThan(highNorth.score);
    expect(lowPenalty.score).toBeLessThan(100);
  });

  it('changing center penaltyPerKm does not affect a northern job pair', async () => {
    const job = { city: 'חיפה' };
    const candidate = { address: 'חדרה' };
    const mildCenter = geoRegions;
    const harshCenter = geoRegions.map((r) =>
      r.id === 'center' ? { ...r, penaltyPerKm: 50 } : r,
    );

    const a = await computeGeoScore(candidate, job, mildCenter, 0);
    const b = await computeGeoScore(candidate, job, harshCenter, 0);
    expect(a.score).toBe(b.score);
  });

  it('scores 100 when the job has no city or location, even if a region is still saved', async () => {
    const result = await computeGeoScore(
      { address: 'חדרה', city: 'חדרה' },
      { city: '', location: '  ', region: 'תל אביב' },
      geoRegions,
      0,
    );
    expect(result.score).toBe(100);
    expect(result.missing).toBe(false);
    expect(result.distance).toBeNull();
  });

  it('uses the region saved on the job, not the city-catalog district', async () => {
    const job = { city: 'חיפה', region: 'מרכז' };
    const candidate = { address: 'חדרה' };
    const result = await computeGeoScore(candidate, job, [
      { id: 'center', grace: 15, penaltyPerKm: 2 },
      { id: 'north', grace: 10, penaltyPerKm: 99 },
    ], 0);
    expect(result.maxValidKm).toBe(15);
  });
});

describe('computeGeoPenaltyPoints', () => {
  it('caps long commutes so they cannot subtract 100 points', () => {
    const pts = computeGeoPenaltyPoints(
      { missing: false, distance: 77, maxValidKm: 15, penaltyPerKm: 2, score: 0 },
      { maxGeoPenalty: 30 },
    );
    expect(pts).toBe(30);
    expect(pts).toBeLessThan(100);
  });

  it('uses raw (km − grace) × perKm for moderate distances', () => {
    const pts = computeGeoPenaltyPoints(
      { missing: false, distance: 18, maxValidKm: 15, penaltyPerKm: 2, score: 94 },
      { maxGeoPenalty: 30 },
    );
    expect(pts).toBe(6);
  });
});

describe('age gap penalty cap', () => {
  it('does not zero a moderate core score when age is far above job max', async () => {
    const birthYear = new Date().getFullYear() - 61;
    const job = {
      city: 'אור יהודה',
      gender: 'זכר',
      ageMin: 24,
      ageMax: 35,
      skills: [{ tagType: 'role', key: 'operations_and_control_coordinator', mode: 'normal' }],
    };
    const candidate = {
      gender: 'זכר',
      birthYear: String(birthYear),
      address: 'כפר סבא',
      embedding: [],
      tagDetails: [
        { rawType: 'role', tagKey: 'operations_manager', displayNameHe: 'מנהל תפעול' },
      ],
    };
    const config = {
      ...BASE_CONFIG,
      mainWeights: { vector: 50, tags: 50, experience: 0, intent: 0 },
      maxAgeGapPenalty: 25,
      maxGeoPenalty: 30,
      geoRegions: [{ id: 'center', grace: 15, penaltyPerKm: 2 }],
      tagWeights: [{ id: 'role', value: 100 }],
      isExperienceEnabled: false,
    };
    City.findAll.mockResolvedValue([
      { cityName: 'אור יהודה', city: 'אור יהודה', column4: 'מרכז', pointx: 200000, pointy: 650000 },
      { cityName: 'כפר סבא', city: 'כפר סבא', column4: 'מרכז', pointx: 195000, pointy: 680000 },
    ]);
    const { finalScore, breakdown } = await computeFullMatchScore(
      candidate,
      job,
      [],
      config,
      null,
      { vectorScore: 73 },
    );
    expect(breakdown.ageGapPenalty).toBe(25);
    expect(breakdown.ageGapPenalty).toBeLessThan(52);
    expect(finalScore).toBeGreaterThan(0);
  });
});

describe('computeFullMatchScore formula', () => {
  it('S_final = max(0, S_core - salary - age - general)', async () => {
    const job = {
      gender: 'זכר',
      mobility: true,
      jobType: ['משרה מלאה'],
      salaryMax: 10000,
      ageMin: 25,
      ageMax: 40,
    };
    const candidate = {
      gender: 'נקבה',
      mobility: 'לא',
      jobScope: 'משרה חלקית',
      salaryMin: 15000,
      birthYear: String(new Date().getFullYear() - 20),
      embedding: [],
    };

    const { finalScore, breakdown } = await computeFullMatchScore(
      candidate,
      job,
      [],
      BASE_CONFIG,
      null,
    );

    const expected = Math.max(
      0,
      breakdown.coreScore -
        breakdown.salaryPenalty -
        breakdown.ageGapPenalty -
        (breakdown.roleExperiencePenalty || 0) -
        (breakdown.roleLookbackPenalty || 0) -
        breakdown.generalPenalties -
        breakdown.geoPenalty,
    );
    expect(finalScore).toBe(expected);
    expect(breakdown.generalPenalties).toBeGreaterThan(0);
    expect(breakdown.penaltyReasons.length).toBeGreaterThan(0);
  });

  it('applies geo as a direct penalty, not a weighted layer', async () => {
    const config = {
      ...BASE_CONFIG,
      mainWeights: { vector: 0, tags: 0, geo: 50, experience: 0, intent: 100 },
      missingGeoPenalty: 7,
    };
    const job = { city: 'חיפה' };
    const candidate = { embedding: [] };
    const { finalScore, breakdown } = await computeFullMatchScore(candidate, job, [], config, null);

    expect(breakdown.weightedContributions.geo).toBeUndefined();
    expect(breakdown.geoMissing).toBe(true);
    expect(breakdown.geoPenalty).toBe(7);
    expect(breakdown.penaltyReasons).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'geo', amount: 7, type: 'missing' })]),
    );
    expect(finalScore).toBe(Math.max(0, breakdown.coreScore - breakdown.generalPenalties - 7));
  });

  it('computeTagScore uses binary 0/100 per category and respects tagWeights', async () => {
    const candidate = {
      tagDetails: [
        { rawType: 'role', tagKey: 'developer', displayNameHe: 'developer' },
        { rawType: 'skill', tagKey: 'react', displayNameHe: 'react' },
      ],
    };
    const job = {
      skills: [
        { tagType: 'role', key: 'developer', name: 'developer' },
        { tagType: 'skill', key: 'missing-skill', name: 'missing-skill' },
        { tagType: 'skill', key: 'another-missing', name: 'another-missing' },
      ],
    };
    const roleHeavy = await computeTagScore(candidate, job, [
      { id: 'role', value: 100 },
      { id: 'skill', value: 0 },
    ], {}, new Map());
    const skillHeavy = await computeTagScore(candidate, job, [
      { id: 'role', value: 0 },
      { id: 'skill', value: 100 },
    ], {}, new Map());
    expect(roleHeavy.score).toBe(100);
    expect(roleHeavy.breakdown.role).toBe(100);
    expect(roleHeavy.breakdown.skill).toBe(0);
    expect(skillHeavy.breakdown.role).toBe(100);
    expect(skillHeavy.breakdown.skill).toBe(0);
    expect(skillHeavy.score).toBe(0);
  });

  it('treats related Hebrew role tokens as a category match', async () => {
    const candidate = {
      tagDetails: [
        {
          rawType: 'role',
          tagKey: 'operations_manager',
          displayNameHe: 'מנהל תפעול',
        },
      ],
    };
    const job = {
      skills: [
        {
          tagType: 'role',
          key: 'operations_and_control_coordinator',
          name: 'רכז/ת תפעול ובקרה',
          mode: 'normal',
        },
      ],
    };
    const result = await computeTagScore(candidate, job, [{ id: 'role', value: 100 }], {}, new Map());
    expect(result.breakdown.role).toBe(100);
    expect(result.score).toBe(100);
  });

  it('returns 0 with empty breakdown when job has no skills', async () => {
    const candidate = {
      tagDetails: [{ rawType: 'skill', tagKey: 'react', displayNameHe: 'react' }],
    };
    const empty = await computeTagScore(candidate, { skills: [] }, [], {}, new Map());
    expect(empty.score).toBe(0);
    expect(empty.breakdown).toEqual({});
  });

  it('binary category: one matching skill among several still yields 100% for that category', async () => {
    const candidate = {
      tagDetails: [{ rawType: 'skill', tagKey: 'priority_erp', displayNameHe: 'priority' }],
    };
    const job = {
      skills: [
        { tagType: 'skill', key: 'priority_erp', name: 'Priority' },
        { tagType: 'skill', key: 'medical_device_regulatory', name: 'Medical devices' },
        { tagType: 'role', key: 'back_office_desk', name: 'Back office' },
      ],
    };
    const result = await computeTagScore(candidate, job, [
      { id: 'skill', value: 50 },
      { id: 'role', value: 50 },
    ], {}, new Map());
    expect(result.breakdown.skill).toBe(100);
    expect(result.breakdown.role).toBe(0);
    expect(result.score).toBe(50);
  });

  it('matches catalog aliases/synonyms within the same category', async () => {
    const aliasIndex = new Map([
      ['הנהלת חשבונות', 'bookkeeping'],
      ['bookkeeping', 'bookkeeping'],
      ['אנגלית', 'english'],
      ['english', 'english'],
    ]);
    const candidate = {
      skills: { technical: ['הנהלת חשבונות'] },
      languages: [{ name: 'אנגלית', level: 9 }],
    };
    const job = {
      skills: [
        { tagType: 'skill', key: 'bookkeeping', name: 'bookkeeping' },
        { tagType: 'language', key: 'english', name: 'english' },
      ],
    };
    const result = await computeTagScore(candidate, job, [
      { id: 'skill', value: 50 },
      { id: 'language', value: 50 },
    ], {}, aliasIndex);
    expect(result.breakdown.skill).toBe(100);
    expect(result.breakdown.language).toBe(100);
    expect(result.score).toBe(100);
  });

  it('uses cluster intent weight for same category / different cluster (not legacy category:20)', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const result = computeIntentScore(
      {},
      { id: 'job-b', field: 'Retail', role: 'Cashier' },
      null,
      weights,
      {
        targetTaxonomy: { categoryId: 'cat-1', clusterId: 'cl-b' },
        linkedJobs: [
          { jobId: 'job-a', taxonomy: { categoryId: 'cat-1', clusterId: 'cl-a' } },
        ],
      },
    );
    expect(result.intentType).toBe('cluster');
    expect(result.score).toBe(50);
  });

  it('scores exact when linked and target share roleId (field_interest meta)', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const roleId = '29885c80-7be4-43ac-999b-5fe0404ed084';
    const result = computeIntentScore(
      {},
      { id: 'job-target', field: 'healthcare_pharmaceuticals', role: 'מנהל צוות מכירות' },
      null,
      weights,
      {
        targetTaxonomy: {
          categoryId: '786dbbc6-65ec-4199-850e-4a4b50e81af3',
          clusterId: '313d13b1-49e0-4196-8428-f7b48fd5813c',
          roleId,
        },
        linkedJobs: [
          {
            jobId: 'interest-ab10',
            taxonomy: {
              categoryId: '786dbbc6-65ec-4199-850e-4a4b50e81af3',
              clusterId: '313d13b1-49e0-4196-8428-f7b48fd5813c',
              roleId,
            },
          },
        ],
      },
    );
    expect(result.intentType).toBe('exact');
    expect(result.score).toBe(100);
  });

  it('same_cluster matches any of the job\'s selected clusters, not only the first field', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const result = computeIntentScore(
      {},
      { id: 'job-multi' },
      null,
      weights,
      {
        targetTaxonomies: [
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
          { categoryId: 'admin', clusterId: 'ops', roleId: 'ops_coord' },
          { categoryId: 'admin', clusterId: 'secretarial', roleId: 'secretary' },
        ],
        linkedJobs: [
          { jobId: 'other', taxonomy: { categoryId: 'admin', clusterId: 'ops', roleId: 'ops_coord' } },
        ],
      },
    );
    expect(result.intentType).toBe('exact');
    expect(result.score).toBe(100);
  });

  it('uses candidate role-tag taxonomy as same-role intent when they never applied to the cluster', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const result = computeIntentScore(
      {},
      { id: 'job-office' },
      null,
      weights,
      {
        targetTaxonomies: [
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
        ],
        candidateTaxonomies: [
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
        ],
      },
    );
    expect(result.intentType).toBe('exact');
    expect(result.score).toBe(100);
  });

  it('does not treat CV role tags as exact when candidate is linked to a different role', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const result = computeIntentScore(
      {},
      { id: 'job-office' },
      null,
      weights,
      {
        targetTaxonomies: [
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
        ],
        linkedJobs: [
          {
            jobId: 'warehouse-app',
            taxonomy: {
              categoryId: 'logistics',
              clusterId: 'warehouse',
              roleId: 'warehouse_picker',
            },
          },
        ],
        candidateTaxonomies: [
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
        ],
      },
    );
    expect(result.intentType).toBe('role');
    expect(result.score).toBe(80);
  });

  it('keeps CV role-tag exact when it matches a linked application role', () => {
    const weights = [
      { id: 'exact', value: 100 },
      { id: 'role', value: 80 },
      { id: 'cluster', value: 50 },
      { id: 'different', value: 0 },
    ];
    const result = computeIntentScore(
      {},
      { id: 'job-warehouse-2' },
      null,
      weights,
      {
        targetTaxonomies: [
          { categoryId: 'logistics', clusterId: 'warehouse', roleId: 'warehouse_picker' },
        ],
        linkedJobs: [
          {
            jobId: 'warehouse-app',
            taxonomy: {
              categoryId: 'logistics',
              clusterId: 'warehouse',
              roleId: 'warehouse_picker',
            },
          },
        ],
        candidateTaxonomies: [
          { categoryId: 'logistics', clusterId: 'warehouse', roleId: 'warehouse_picker' },
          { categoryId: 'admin', clusterId: 'office', roleId: 'office_mgr' },
        ],
      },
    );
    expect(result.intentType).toBe('exact');
    expect(result.score).toBe(100);
  });

  it('returns zero core when all main weights are zero', async () => {
    const { finalScore, breakdown } = await computeFullMatchScore(
      {},
      {},
      [],
      BASE_CONFIG,
      null,
    );
    expect(breakdown.coreScore).toBe(0);
    expect(finalScore).toBe(0);
  });
});
