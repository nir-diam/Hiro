const { connectDb } = require('../src/config/db');
const Client = require('../src/models/Client');
const jobPublicationService = require('../src/services/jobPublicationService');

const CID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();
  const client = await Client.findByPk(CID);
  const jobs = await jobPublicationService.jobsForPublishingScope(client);
  const byEmployer = {};
  for (const j of jobs) {
    const label = j.client || j.get?.('client') || '?';
    byEmployer[label] = (byEmployer[label] || 0) + 1;
  }
  console.log('publishing scope jobs', jobs.length);
  console.table(Object.entries(byEmployer).map(([employer, jobs]) => ({ employer, jobs })));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
