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

  const systemPrompt = `You are a top-tier recruitment taxonomy expert.
I will provide a list of Tag Names (in Hebrew).
For each tag, generate a detailed JSON object that strictly matches the following structure:

1. "displayNameHe": The input name (corrected if it has typos).
2. "displayNameEn": Professional English translation.
3. "category": A high-level professional category (e.g., "Software Development", "Marketing", "Human Resources").
4. "type": Exact classification from this list: ['role', 'skill', 'tool', 'industry', 'seniority', 'language'].
5. "descriptionHe": A concise professional definition in Hebrew (max 15 words).
6. "domains": An array of 2-3 relevant industry sectors (in Hebrew, e.g., ["הייטק", "פיננסים", "קמעונאות"]).
7. "synonyms": An array of 3-5 objects, each containing:
    - "phrase": The synonym string.
    - "language": "he" or "en".
    - "type": "synonym" or "alias" or "abbreviation".
    - "priority": Integer 1-5 (5 is highest match).

Input List: \${JSON.stringify(tagNames)}

Return ONLY the JSON Array of objects. No markdown formatting.`;

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

    const mappedSynonyms = Array.isArray(s.synonyms)
      ? s.synonyms
          .map((syn, i) => {
            const normalized = typeof syn === 'string' ? { phrase: syn } : syn || {};
            const phrase = normalized.phrase || (typeof syn === 'string' ? syn : '');
            if (!phrase) return null;
            const language = normalized.language || (/[a-zA-Z]/.test(phrase) ? 'en' : 'he');
            const priorityFromModel = Number(normalized.priority);
            const priority =
              Number.isFinite(priorityFromModel) && priorityFromModel >= 1 && priorityFromModel <= 5
                ? priorityFromModel
                : Math.max(1, 5 - i); // fallback: descending relevance by order
            return {
              id: normalized.id || `syn_${Date.now()}_${i}`,
              phrase,
              language,
              type: normalized.type || 'synonym',
              priority,
            };
          })
          .filter(Boolean)
      : orig.synonyms || [];

    // If the model returned identical priorities for all synonyms, re-rank by order to avoid flat scores.
    if (mappedSynonyms.length > 1) {
      const uniquePriorities = new Set(mappedSynonyms.map((syn) => syn.priority));
      if (uniquePriorities.size === 1) {
        mappedSynonyms.forEach((syn, i) => {
          syn.priority = Math.max(1, 5 - i);
        });
      }
    }

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
      synonyms: mappedSynonyms,
    };
  });
};

module.exports = { list, getById, create, update, remove, enrichSuggestions };

