const { connectDb, sequelize } = require('../src/config/db');

const CID = 'f1b12e27-0299-4b2a-930b-04e3bf8cb2bc';

async function main() {
  await connectDb();
  const [stats] = await sequelize.query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE client_id = :cid)::int AS with_client_id,
      COUNT(*) FILTER (WHERE LOWER(TRIM(client)) = LOWER(TRIM('מימד אנושי')))::int AS client_label_mimed,
      COUNT(*) FILTER (WHERE unique_email ILIKE '%humand+%')::int AS humand_inbox
    FROM jobs`,
    { replacements: { cid: CID } },
  );
  console.log('JOB STATS', stats[0]);

  const Job = require('../src/models/Job');
  const Client = require('../src/models/Client');
  const jobPublicationService = require('../src/services/jobPublicationService');
  const client = await Client.findByPk(CID);

  const allJobs = await Job.findAll({
    attributes: ['id', 'client', 'clientId', 'uniqueEmail'],
  });

  const labels = await jobPublicationService.collectClientScopeLabels?.(client);
  // collectClientScopeLabels is not exported - use internal via jobsForClientScope
  const scoped = await jobPublicationService.jobsForClientScope(client);
  const scopedIds = new Set(scoped.map((j) => j.id));

  const reasons = { clientIdFk: 0, labelDirect: 0, humandInbox: 0, other: 0 };
  const clientUsageSettingService = require('../src/services/clientUsageSettingService');

  for (const job of allJobs) {
    if (!scopedIds.has(job.id)) continue;
    const plain = job.get({ plain: true });
    if (plain.clientId && String(plain.clientId) === CID) {
      reasons.clientIdFk++;
      continue;
    }
    const label = String(plain.client || '').trim().toLowerCase();
    if (label === 'מימד אנושי' || label === 'humand') {
      reasons.labelDirect++;
      continue;
    }
    const inbox = await clientUsageSettingService.resolveClientIdFromJobInbox(plain.uniqueEmail);
    if (inbox === CID) {
      reasons.humandInbox++;
      continue;
    }
    reasons.other++;
  }

  console.log('SCOPED', scoped.length, 'MATCH REASONS', reasons);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
