const Tag = require('../models/Tag');
const { sendChat } = require('./geminiService');

const list = async () => Tag.findAll();

const getById = async (id) => {
  const tag = await Tag.findByPk(id);
  if (!tag) {
    const err = new Error('Tag not found');
    err.status = 404;
    throw err;
  }
  return tag;
};

const create = async (payload) => Tag.create(payload);

const update = async (id, payload) => {
  const tag = await getById(id);
  await tag.update(payload);
  return tag;
};

const remove = async (id) => {
  const tag = await getById(id);
  await tag.destroy();
};

const enrichSuggestions = async (tagsPayload = []) => {
  const apiKey =
    process.env.GIMINI_KEY
    || process.env.GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.API_KEY;

  const systemPrompt = `You are a taxonomy expert. For each tag, fill any missing fields and add 3-5 relevant synonyms.
Return ONLY JSON array of objects in the same order as input:
[
  {
    "id": "<same as input>",
    "displayNameHe": "...",
    "displayNameEn": "...",
    "category": "...",
    "type": "role|skill|industry|tool|certification|language|seniority|domain",
    "synonyms": ["...","..."],
    "status": "active|draft|deprecated|archived",
    "qualityState": "verified|needs_review|experimental"
  }
]
If a field is already present, keep it. Always include id from input.`;

  const userMessage = `Input tags (JSON): ${JSON.stringify(tagsPayload)}`;

  const reply = await sendChat({
    apiKey,
    systemPrompt,
    history: [{ role: 'user', text: userMessage }],
  });

  let parsed = [];
  try {
    parsed = JSON.parse(reply);
    if (!Array.isArray(parsed)) throw new Error('Response is not array');
  } catch (e) {
    const err = new Error('Failed to parse AI response');
    err.status = 400;
    throw err;
  }

  return parsed.map((s) => {
    const orig = tagsPayload.find((t) => t.id === s.id) || {};
    return {
      id: s.id || orig.id,
      displayNameHe: s.displayNameHe || orig.displayNameHe,
      displayNameEn: s.displayNameEn || orig.displayNameEn,
      category: s.category || orig.category,
      type: s.type || orig.type,
      status: s.status || orig.status,
      qualityState: s.qualityState || orig.qualityState,
      matchable: orig.matchable,
      usageCount: orig.usageCount,
      lastUsed: orig.lastUsed,
      source: orig.source,
      synonyms: Array.isArray(s.synonyms)
        ? s.synonyms.map((phrase, i) => ({
            id: `syn_${Date.now()}_${i}`,
            phrase,
            language: /[a-zA-Z]/.test(phrase) ? 'en' : 'he',
            type: 'synonym',
            priority: 3,
          }))
        : orig.synonyms || [],
    };
  });
};

module.exports = { list, getById, create, update, remove, enrichSuggestions };

