const Job = require('../models/Job');
const Prompt = require('../models/Prompt');
const { sendChat } = require('./geminiService');
const cityService = require('./cityService');

const list = async () => Job.findAll();

const getById = async (id) => {
  const job = await Job.findByPk(id);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }
  return job;
};

const create = async (payload) => Job.create(payload);

const update = async (id, payload) => {
  const job = await getById(id);
  await job.update(payload);
  return job;
};

const remove = async (id) => {
  const job = await getById(id);
  await job.destroy();
};

const findByPostingCode = async (code) => {
  if (!code) return null;
  return Job.findOne({ where: { postingCode: code } });
};

const analyzeRawDescription = async (rawText) => {
  if (!rawText || !String(rawText).trim()) {
    const err = new Error('Raw job description is required');
    err.status = 400;
    throw err;
  }

  const apiKey =
    process.env.GIMINI_KEY ||
    process.env.GEMINI_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.API_KEY;

  const promptRow = await Prompt.findByPk('create_new_job');
  if (!promptRow || !promptRow.template) {
    const err = new Error('Prompt "create_new_job" not found or has no template');
    err.status = 500;
    throw err;
  }
  const systemPrompt = promptRow.template.trim();

  const rawResponse = await sendChat({
    apiKey,
    systemPrompt,
    history: [],
    message: String(rawText),
  });

  let parsed;
  try {
    const text = String(rawResponse || '').trim();

    // Strip markdown code fences if present
    let cleaned = text;
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, ''); // remove ``` or ```json
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();
    }

    // Try to extract JSON object substring if extra text exists
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const candidate =
      firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace
        ? cleaned.slice(firstBrace, lastBrace + 1)
        : cleaned;

    parsed = JSON.parse(candidate);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[jobService.analyzeRawDescription] Failed to parse AI JSON response:', rawResponse);
    const err = new Error('Failed to parse AI response as JSON');
    err.status = 500;
    throw err;
  }

  // Resolve location/city via City table: exact match first, then fuzzy. Only set when found.
  const rawLocation = parsed.city || parsed.location || '';
  if (rawLocation && String(rawLocation).trim()) {
    const resolved = await cityService.resolveCityForJob(String(rawLocation).trim());
    if (resolved) {
      parsed.city = resolved;
      parsed.location = resolved;
    } else {
      parsed.city = null;
      parsed.location = null;
    }
  }

  return parsed;
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  findByPostingCode,
  analyzeRawDescription,
};

