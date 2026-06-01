jest.mock('../vectorSearchService', () => ({
  searchCandidates: jest.fn(),
  normalizeEmbedding: (e) => (Array.isArray(e) ? e : []),
}));

jest.mock('../candidateTagService', () => ({
  hydrateJobSkills: jest.fn(async (job) => job),
  hydrateJobsSkills: jest.fn(async (jobs) => jobs),
}));

jest.mock('../candidateService', () => ({
  list: jest.fn(),
  findManyWithTagsForMatchScore: jest.fn(),
  toPlainCandidateForMatchScore: jest.fn((row) => ({
    id: row.id,
    fullName: row.fullName || 'Test',
    embedding: [0.1, 0.2, 0.3],
    ...row,
  })),
}));

jest.mock('../matchingScoreService', () => ({
  getJobEmbedding: jest.fn().mockResolvedValue([0.1, 0.2]),
  computeMatchPackage: jest.fn(),
  buildIntentOptionsByCandidateIds: jest.fn().mockResolvedValue(new Map([['c1', { linkedJobs: [] }]])),
}));

jest.mock('../matchingEngineService', () => ({
  resolveEngineConfigForJob: jest.fn().mockResolvedValue({ mainWeights: { vector: 100, tags: 0, geo: 0, intent: 0 } }),
}));

jest.mock('../clientUsageSettingService', () => ({
  resolveScreeningDefaultsForJob: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../models/Job', () => ({
  findByPk: jest.fn(),
}));

jest.mock('../../models/JobCandidate', () => ({
  findAll: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../models/JobCandidateScreening', () => ({
  findAll: jest.fn().mockResolvedValue([]),
}));

const Job = require('../../models/Job');
const { searchCandidates } = require('../vectorSearchService');
const { computeMatchPackage } = require('../matchingScoreService');
const candidateService = require('../candidateService');
const { runSonarScan, passesHardFilters, passesDistanceHardFilter } = require('../jobSonarService');

describe('jobSonarService', () => {
  const jobPlain = {
    id: 'job-1',
    title: 'Dev',
    gender: 'זכר',
    mobility: true,
    jobType: ['מלאה'],
    salaryMax: 10000,
    ageMin: 25,
    ageMax: 50,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Job.findByPk.mockResolvedValue({
      get: () => jobPlain,
    });
  });

  it('passesHardFilters uses parameterMatches dimensions', () => {
    const cand = { gender: 'נקבה', mobility: 'לא', jobScope: 'חלקית' };
    expect(passesHardFilters(cand, jobPlain, ['gender'], {})).toBe(false);
    expect(passesHardFilters(cand, jobPlain, ['mobility'], {})).toBe(false);
    expect(passesHardFilters({ gender: 'זכר', mobility: 'כן', jobScope: 'מלאה' }, jobPlain, ['gender', 'mobility'], {})).toBe(true);
  });

  it('passesDistanceHardFilter rejects weak geo when distance filter on', () => {
    expect(passesDistanceHardFilter({ geoScore: 40, geoDistance: 80 }, ['distance'])).toBe(false);
    expect(passesDistanceHardFilter({ geoScore: 90, geoDistance: 10 }, ['distance'])).toBe(true);
  });

  it('runSonarScan returns engine score + parameterMatches from computeMatchPackage', async () => {
    searchCandidates.mockResolvedValue([
      { id: 'c1', similarity: 0.85, fullName: 'Alice' },
    ]);
    candidateService.findManyWithTagsForMatchScore.mockResolvedValue([
      { id: 'c1', fullName: 'Alice' },
    ]);
    computeMatchPackage.mockResolvedValue({
      matchScore: 72,
      scoreBreakdown: {
        coreScore: 80,
        generalPenalties: 8,
        salaryPenalty: 0,
        ageGapPenalty: 0,
        semanticScore: 75,
        geoScore: 90,
        geoDistance: 12,
      },
      parameterMatches: {
        gender: 'match',
        scope: 'gap',
        salary: 'unknown',
      },
    });

    const data = await runSonarScan('job-1', { limit: 10, matchThresholdMin: 70, useVector: true });
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].matchPercentage).toBe(72);
    expect(data.rows[0].parameterMatches.scope).toBe('gap');
    expect(data.rows[0].scoreBreakdown.coreScore).toBe(80);
    expect(data.rows[0].candidate).not.toHaveProperty('embedding');
    expect(computeMatchPackage).toHaveBeenCalled();
  });
});
