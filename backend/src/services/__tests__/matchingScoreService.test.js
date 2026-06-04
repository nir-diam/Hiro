jest.mock('../vectorSearchService', () => ({
  normalizeEmbedding: (e) => (Array.isArray(e) ? e : []),
}));

jest.mock('../../models/City', () => ({
  findAll: jest.fn(),
}));

const City = require('../../models/City');
const {
  computeFullMatchScore,
  computeTagScore,
  computeGeoScore,
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
        breakdown.generalPenalties,
    );
    expect(finalScore).toBe(expected);
    expect(breakdown.generalPenalties).toBeGreaterThan(0);
    expect(breakdown.penaltyReasons.length).toBeGreaterThan(0);
  });

  it('computeTagScore respects tagWeights per job skill tagType category', () => {
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
      ],
    };
    const roleHeavy = computeTagScore(candidate, job, [
      { id: 'role', value: 100 },
      { id: 'skill', value: 0 },
    ], {});
    const skillHeavy = computeTagScore(candidate, job, [
      { id: 'role', value: 0 },
      { id: 'skill', value: 100 },
    ], {});
    expect(roleHeavy.score).toBeGreaterThan(skillHeavy.score);
    expect(roleHeavy.breakdown.role).toBe(100);
    expect(roleHeavy.breakdown.skill).toBe(0);
  });

  it('returns 0 with empty breakdown when job has no skills', () => {
    const candidate = {
      tagDetails: [{ rawType: 'skill', tagKey: 'react', displayNameHe: 'react' }],
    };
    const empty = computeTagScore(candidate, { skills: [] }, [], {});
    expect(empty.score).toBe(0);
    expect(empty.breakdown).toEqual({});
  });

  it('scores below 100 when job skills do not match candidate tags', () => {
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
    const result = computeTagScore(candidate, job, [
      { id: 'skill', value: 50 },
      { id: 'role', value: 50 },
    ], {});
    expect(result.score).toBeLessThan(100);
    expect(Object.keys(result.breakdown).length).toBeGreaterThan(0);
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
