/**
 * Debug intent score for candidate + job pair.
 * Usage: node scripts/debug-intent-score.js <candidateId> <jobId>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Job = require('../src/models/Job');
const Candidate = require('../src/models/Candidate');
const JobCandidate = require('../src/models/JobCandidate');
const {
  computeIntentScore,
  buildIntentOptionsByCandidateIds,
  buildLinkedInfoFromJobCandidate,
} = require('../src/services/matchingScoreService');
const { resolveJobTaxonomy, loadTaxonomyIndex } = require('../src/services/jobTaxonomyResolver');
const matchingEngineService = require('../src/services/matchingEngineService');

async function main() {
  const candidateId = process.argv[2];
  const jobId = process.argv[3];
  if (!candidateId || !jobId) {
    console.error('Usage: node scripts/debug-intent-score.js <candidateId> <jobId>');
    process.exit(1);
  }

  const { sequelize } = require('../src/config/db');
  await sequelize.authenticate();

  const config = await matchingEngineService.getConfig();
  const intentWeights = Array.isArray(config.intentWeights)
    ? config.intentWeights
    : Object.entries(config.intentWeights || {}).map(([id, value]) => ({ id, value: Number(value) }));

  const candidate = await Candidate.findByPk(candidateId, {
    attributes: ['id', 'fullName', 'field', 'title'],
  });
  const job = await Job.findByPk(jobId, { attributes: ['id', 'title', 'field', 'role'] });
  const jc = await JobCandidate.findOne({ where: { candidateId, jobId } });
  const allLinks = await JobCandidate.findAll({
    where: { candidateId },
    attributes: ['id', 'jobId', 'source', 'status', 'workflowMeta'],
  });

  const intentByCandidate = await buildIntentOptionsByCandidateIds([candidateId]);
  const intentOpts = intentByCandidate.get(String(candidateId)) || {};
  const linkedInfo = buildLinkedInfoFromJobCandidate(jc ? jc.get({ plain: true }) : null);

  const index = await loadTaxonomyIndex();
  const targetTax = resolveJobTaxonomy(job?.get({ plain: true }), index);

  const intentResult = computeIntentScore(
    candidate?.get({ plain: true }),
    job?.get({ plain: true }),
    linkedInfo,
    intentWeights,
    {
      ...intentOpts,
      targetTaxonomy: targetTax,
    },
  );

  console.log(JSON.stringify({
    candidate: candidate?.get({ plain: true }),
    job: job?.get({ plain: true }),
    directLink: jc ? jc.get({ plain: true }) : null,
    allJobCandidateLinks: allLinks.map((l) => l.get({ plain: true })),
    intentWeights,
    targetTaxonomy: targetTax,
    linkedJobsForIntent: intentOpts.linkedJobs || [],
    intentResult,
  }, null, 2));

  await sequelize.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
