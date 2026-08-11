const candidateService = require('../src/services/candidateService');

(async () => {
  const res = await candidateService.listPaginated({ page: 1, limit: 50 });
  const names = res.rows.map((r) => ({
    id: r.id?.slice(0, 8),
    fullName: r.fullName,
    email: r.email,
    canonicalCandidateId: r.canonicalCandidateId,
  }));
  const irit = names.filter((n) => (n.fullName || '').includes('אירית') || (n.fullName || '').includes('טנקל'));
  const gili = names.filter((n) => (n.fullName || '').includes('גילי') || (n.fullName || '').includes('הכהן'));
  console.log('Total rows page 1:', res.rows.length, 'total:', res.total);
  console.log('אירית rows:', irit.length, irit);
  console.log('גילי rows:', gili.length, gili);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
