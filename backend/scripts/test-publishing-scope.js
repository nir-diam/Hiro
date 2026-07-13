const { connectDb } = require('../src/config/db');
const Client = require('../src/models/Client');
const jobPublicationService = require('../src/services/jobPublicationService');

const CID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();
  const client = await Client.findByPk(CID);
  const links = await jobPublicationService.listDashboardLinks(client);
  const clients = [...new Set(links.map((l) => l.client))];
  console.log('link count', links.length);
  console.log('distinct job.client labels', clients.length, clients.slice(0, 10));
  const all = await jobPublicationService.listDashboardLinks(null);
  console.log('admin all count', all.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
