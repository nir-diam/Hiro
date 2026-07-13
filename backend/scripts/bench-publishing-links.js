const { connectDb } = require('../src/config/db');
const Client = require('../src/models/Client');
const jobPublicationService = require('../src/services/jobPublicationService');

const CID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();
  const client = await Client.findByPk(CID);
  const start = Date.now();
  const links = await jobPublicationService.listDashboardLinks(client);
  const ms = Date.now() - start;
  console.log('links', links.length, 'ms', ms);
  const wrong = links.filter((l) => l.clientId !== CID);
  console.log('wrong clientId rows', wrong.length);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
