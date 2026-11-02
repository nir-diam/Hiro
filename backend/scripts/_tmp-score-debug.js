const jobService = require('../src/services/jobService');
const candidateService = require('../src/services/candidateService');
const { resolveEngineConfigForJob } = require('../src/services/matchingEngineService');
const {
  computeMatchPackage,
  getJobEmbedding,
} = require('../src/services/matchingScoreService');

(async () => {
  const job = await jobService.getById('5b670d35-5a06-4aad-a398-bdc4844eecb8');
  const jobPlain = jobService.toPlainJobForMatchScore(job);
  const engineConfig = await resolveEngineConfigForJob(jobPlain, { tenantClientId: null });
  const jobEmb = await getJobEmbedding(jobPlain);
  const ids = [
    '8cdd79e3-062f-4ba4-a95b-e94ce50fb83e',
    '1f151a2c-0638-489c-82ec-cb5c980a70e0',
    '1b5ec6c9-68f3-486c-a4c6-c263c1c641aa',
  ];
  const rows = await candidateService.findManyWithTagsForMatchScore(ids);
  for (const row of rows) {
    const cand = candidateService.toPlainCandidateForMatchScore(row);
    const result = await computeMatchPackage(cand, jobPlain, jobEmb, engineConfig, null, {});
    const b = result.scoreBreakdown || {};
    console.log(
      JSON.stringify({
        name: cand.fullName,
        matchScore: result.matchScore,
        vector: b.vector,
        tags: b.tags,
        tagBreakdown: b.tagBreakdown,
        exp: b.experience,
        intent: b.intent,
        core: b.coreScore,
        geoPenalty: b.geoPenalty,
        geoDistance: b.geoDistance,
        geoMaxKm: b.geoMaxKm,
        age: b.ageGapPenalty,
        general: b.generalPenalties,
        weights: b.weights,
        reasons: (b.penaltyReasons || []).map((r) => `${r.label}:${r.amount}`),
      }),
    );
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
