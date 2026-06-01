function norm(s) {
  return String(s ?? '').trim();
}

function syntheticJobFromWorkflowMeta(wm, row) {
  const meta = wm && typeof wm === 'object' ? wm : {};
  const category = norm(meta.category);
  const role = norm(meta.role);
  const fieldType = norm(meta.fieldType);
  const label =
    norm(meta.interestLabel) || (role && category ? `${category} › ${role}` : 'התעניינות בתחום');
  return {
    id: null,
    title: label,
    publicJobTitle: label,
    client: fieldType || '—',
    field: category,
    role,
    city: '',
    location: '',
    description: '',
    rating: 0,
    status: 'טיוטה',
    _fieldInterestOnly: true,
    _jobCandidateId: row?.jobCandidateId,
  };
}

module.exports = { syntheticJobFromWorkflowMeta, norm };
