const candidateApplicationService = require('../services/candidateApplicationService');

const normalizePayload = (body) => ({
  candidateId: body.candidateId,
  jobId: body.jobId || null,
  company: body.company || '',
  role: body.role || '',
  status: body.status || 'נשלח',
  applicationDate: body.applicationDate || body.date || null,
  link: body.link || null,
  cvFile: body.cvFile || null,
  notes: body.notes || null,
});

const list = async (req, res) => {
  const { candidateId } = req.query;
  if (!candidateId) {
    return res.status(400).json({ message: 'candidateId is required' });
  }
  const data = await candidateApplicationService.listByCandidate(candidateId);
  res.json(data);
};

const create = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    if (!payload.candidateId) {
      return res.status(400).json({ message: 'candidateId is required' });
    }
    if (!payload.company.trim() && !payload.role.trim()) {
      return res.status(400).json({ message: 'company or role is required' });
    }
    const record = await candidateApplicationService.create(payload);
    res.status(201).json(record);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const record = await candidateApplicationService.update(req.params.id, payload);
    res.json(record);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

const remove = async (req, res) => {
  try {
    await candidateApplicationService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
};

module.exports = {
  list,
  create,
  update,
  remove,
};

