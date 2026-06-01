/**
 * Manual debug: load real job + candidate from DB and print match package.
 * Usage: node scripts/debug-match-scenarios.js [jobId] [candidateId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Job = require('../src/models/Job');
const candidateService = require('../src/services/candidateService');
const { computeMatchPackage, getJobEmbedding, buildLinkedInfoFromJobCandidate } = require('../src/services/matchingScoreService');
const { resolveEngineConfigForJob } = require('../src/services/matchingEngineService');
const JobCandidate = require('../src/models/JobCandidate');

async function scorePair(jobId, candidateId) {
  const jobRow = await Job.findByPk(jobId);
  if (!jobRow) throw new Error(`Job not found: ${jobId}`);
  const jobPlain = jobRow.get({ plain: true });

  const candRow = await candidateService.findByPkWithTagsForMatchScore(candidateId);
  if (!candRow) throw new Error(`Candidate not found: ${candidateId}`);
  const candPlain = candidateService.toPlainCandidateForMatchScore(candRow);

  const jc = await JobCandidate.findOne({ where: { jobId, candidateId } });
  const linkedInfo = buildLinkedInfoFromJobCandidate(jc ? jc.get({ plain: true }) : null);

  const config = await resolveEngineConfigForJob(jobPlain);
  const jobEmb = await getJobEmbedding(jobPlain);
  const result = await computeMatchPackage(candPlain, jobPlain, jobEmb, config, linkedInfo);

  return { job: { id: jobPlain.id, title: jobPlain.title }, candidate: { id: candPlain.id, name: candPlain.fullName || candPlain.name }, result };
}

async function main() {
  const jobId = process.argv[2] || 'acc6b123-5983-44d5-9715-6b6f7bd2e36b';
  const candidateId = process.argv[3] || '81c9924c-2aa8-40e7-8051-f8d6ed350489';

  const { sequelize } = require('../src/config/db');
  await sequelize.authenticate();

  console.log('=== Match debug ===\n');
  const out = await scorePair(jobId, candidateId);
  console.log(JSON.stringify(out, null, 2));

  const pm = out.result.parameterMatches || {};
  const colors = { match: 'GREEN', gap: 'RED', unknown: 'GRAY' };
  console.log('\n--- Traffic lights ---');
  for (const [k, v] of Object.entries(pm)) {
    console.log(`  ${k}: ${v} (${colors[v] || v})`);
  }

  const bd = out.result.scoreBreakdown || {};
  console.log('\n--- Formula ---');
  console.log(`  coreScore: ${bd.coreScore}`);
  console.log(`  - salaryPenalty: ${bd.salaryPenalty}`);
  console.log(`  - ageGapPenalty: ${bd.ageGapPenalty}`);
  console.log(`  - generalPenalties: ${bd.generalPenalties}`);
  console.log(`  = matchScore: ${out.result.matchScore}`);

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
