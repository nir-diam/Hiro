const jobService = require('../services/jobService');
const jobCandidateService = require('../services/jobCandidateService');
const Job = require('../models/Job');

const analyzeDescription = async (req, res) => {
  try {
    const { text } = req.body || {};
    const result = await jobService.analyzeRawDescription(text);
    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'AI analysis failed' });
  }
};

const list = async (_req, res) => {
  const jobs = await jobService.list();
  res.json(jobs);
};

const get = async (req, res) => {
  try {
    const job = await jobService.getById(req.params.id);
    res.json(job);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    let postingCode;
    let exists = true;
    const maxAttempts = 50;
    let attempts = 0;
    while (exists && attempts < maxAttempts) {
      postingCode = String(Math.floor(1 + Math.random() * 999999));
      const existing = await Job.findOne({ where: { postingCode } });
      exists = !!existing;
      attempts++;
    }
    if (exists) {
      return res.status(500).json({ message: 'Could not generate unique posting code' });
    }
    const uniqueEmail = `humand+${postingCode}@app.hiro.co.il`;
    const payload = { ...req.body, postingCode, uniqueEmail };
    const job = await jobService.create(payload);
    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ message: err.message || 'Create failed' });
  }
};

const update = async (req, res) => {
  try {
    const job = await jobService.update(req.params.id, req.body);
    res.json(job);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await jobService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const getCandidates = async (req, res) => {
  try {
    const job = await jobService.getById(req.params.id);
    const candidates = await jobCandidateService.listForJob(req.params.id);
    res.json({ job, candidates });
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

module.exports = { list, get, create, update, remove, getCandidates, analyzeDescription };

