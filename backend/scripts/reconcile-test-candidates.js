const candidateService = require('../src/services/candidateService');

const TARGET_IDS = [
  'cd666010-7649-484a-885f-319cc48b66d0',
  'c008c857-2d04-4f3f-b56c-942c6a20b03b',
  '40131a16-ad81-48ed-9a76-dcf3158ee285',
  'dd1adc03-9778-475b-9d01-f42a4ba3253c',
  '96b8a5f9-4dc5-44bc-8ed0-da897cef64ad',
];

(async () => {
  for (const id of TARGET_IDS) {
    const merge = await candidateService.mergeIfDuplicateIdentity(id);
    const repair = await candidateService.repairPartialIdentityLink(id);
    console.log(id.slice(0, 8), { merge, repair });
  }

  const res = await candidateService.listPaginated({ page: 1, limit: 50 });
  const gili = res.rows.filter((r) => (r.fullName || '').includes('גילי') || (r.fullName || '').includes('הכהן'));
  const iritTankel = res.rows.filter((r) => (r.fullName || '').includes('טנקל'));
  console.log('\nList גילי/הכהן rows:', gili.length);
  gili.forEach((r) => console.log(' ', r.id.slice(0, 8), r.fullName, r.email));
  console.log('List אירית טנקל rows:', iritTankel.length);
  iritTankel.forEach((r) => console.log(' ', r.id.slice(0, 8), r.fullName, r.email));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
