const candidateService = require('../src/services/candidateService');
const Candidate = require('../src/models/Candidate');

(async () => {
  const res = await candidateService.listPaginated({ page: 1, limit: 50 });
  const gili = res.rows.filter((r) => (r.fullName || '').includes('גילי'));
  for (const r of gili) {
    console.log(r.id, r.fullName, r.email, r.phone, r.userId, r.canonicalCandidateId);
  }

  const iritAll = await Candidate.findAll({
    where: { isDeleted: false },
    attributes: ['id', 'fullName', 'email', 'phone', 'userId', 'canonicalCandidateId'],
    raw: true,
  });
  const irit = iritAll.filter((r) => (r.fullName || '').includes('אירית') || (r.fullName || '').includes('טנקל'));
  console.log('\nAll אירית in DB:', irit.length);
  irit.forEach((r) => console.log(r.id, r.fullName, r.email, r.canonicalCandidateId));

  const iritVisible = irit.filter((r) => !r.canonicalCandidateId);
  console.log('\nאירית visible (canonical null):', iritVisible.length);
  iritVisible.forEach((r) => console.log(r));

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
