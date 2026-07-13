const { sequelize, connectDb } = require('../src/config/db');
const jobPublicationService = require('../src/services/jobPublicationService');

const CLIENT_ID = process.argv[2] || 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';
const USER_EMAIL = process.argv[3] || 'diamantnir@gmail.com';

async function main() {
  await connectDb();
  const Client = require('../src/models/Client');
  const User = require('../src/models/User');

  const user = await User.findOne({ where: { email: USER_EMAIL } });
  console.log('USER:', user ? {
    id: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
  } : null);

  const client = await Client.findByPk(CLIENT_ID, {
    attributes: ['id', 'name', 'displayName', 'domain', 'metadata'],
  });
  console.log('CLIENT:', client ? client.get({ plain: true }) : null);

  const [totalRow] = await sequelize.query('SELECT COUNT(*)::int AS total FROM jobs');
  console.log('TOTAL JOBS:', totalRow[0].total);

  const [distinct] = await sequelize.query(
    'SELECT client, COUNT(*)::int AS c FROM jobs GROUP BY client ORDER BY c DESC LIMIT 25',
  );
  console.log('TOP JOB CLIENT LABELS:', distinct);

  if (client) {
    const scoped = await jobPublicationService.jobsForClientScope(client);
    console.log('SCOPED COUNT:', scoped.length);
    console.log('SCOPED SAMPLE:', scoped.slice(0, 5).map((j) => ({
      id: j.id,
      title: j.title,
      client: j.client,
    })));
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
