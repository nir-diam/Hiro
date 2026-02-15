const path = require('path');
const dotenv = require('dotenv');
// Ensure env is loaded even if server missed it (e.g., different cwd)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();
const Chat = require('../models/Chat');
const ChatMessage = require('../models/ChatMessage');
const Prompt = require('../models/Prompt');
const promptService = require('./promptService');
const { sendChat } = require('./geminiService');

const SYSTEM_TEMPLATE_TAGS = (tagsText = '') => (
  `You are a taxonomy expert assistant for a recruitment system.
You have access to the current list of tags: ${tagsText || 'N/A'}.
Help the user organize, deduplicate, or suggest new tags. Answer in Hebrew.

CRITICAL: When suggesting new tags, if you suggest a list, also provide a JSON block at the end of your message in the following format so the system can import them automatically:
\`\`\`json
{
  "tags": [
    {
      "displayNameHe": "שם בעברית",
      "displayNameEn": "English Name",
      "category": "Category",
      "type": "skill|role|tool|industry|seniority|language",
      "synonyms": ["syn1", "syn2"]
    }
  ]
}
\`\`\`
Do not include conversational filler like "Summary" or "Title" as bullet points. Only include actual tags in your list or JSON.`
);

const candidateSchemaLines = [
  'fullName (STRING, not null)',
  'status (STRING)',
  'phone (STRING)',
  'email (STRING)',
  'address (STRING)',
  'idNumber, maritalStatus, gender, drivingLicense, mobility (STRING)',
  'userId (UUID, nullable)',
  'employmentType, jobScope, availability, physicalWork (STRING)',
  'birthYear, birthMonth, birthDay, age (STRING)',
  'title (STRING), professionalSummary (TEXT)',
  'profilePicture, resumeUrl (STRING)',
  'tags, internalTags (ARRAY of STRING)',
  'skills (JSONB { soft: [], technical: [] })',
  'languages (JSONB array)',
  'salaryMin, salaryMax (INTEGER)',
  'workExperience (JSONB array)',
  'industryAnalysis (JSONB)',
  'education (JSONB array)',
  'internalNotes, candidateNotes (TEXT)',
  'source (STRING)',
  'jobScopes, highlights (ARRAY of STRING)',
  'experience (JSONB array)',
  'lastActivity, lastActive (STRING)',
  'matchScore (INTEGER)',
  'matchAnalysis (JSONB)',
  'sector, companySize, field, industry (STRING)',
  'embedding (JSONB nullable), searchText (TEXT)',
  'isArchived (BOOLEAN)',
];

const getCandidateSchemaDescription = () => `
Candidate schema fields (preferred updates):
- fullName, title, professionalSummary, location, availability
- education, workExperience, tags, softSkills, techSkills
- candidateNotes, desiredRoles, salaryMin, salaryMax
- phone, email
Use these fields to match against whatever the user just wrote; respond with JSON edits for the ones that change.
`;

const getCandidateSchemaText = () => `
Candidate schema (from backend/src/models/Candidate.js):
${candidateSchemaLines.join('\n')}
Use this schema to find matches between the user's query and fields worth updating.
`;

const promptCache = new Map();

const loadPromptTemplateById = async (promptId) => {
  if (!promptId) return null;
  if (promptCache.has(promptId)) return promptCache.get(promptId);
  try {
    const record = await promptService.getById(promptId);
    const template = record?.template || null;
    promptCache.set(promptId, template);
    return template;
  } catch (err) {
    console.warn(`[chatService] missing prompt ${promptId}`, err?.message || err);
    promptCache.set(promptId, null);
    return null;
  }
};

const pruneContextData = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  const copy = JSON.parse(JSON.stringify(obj));
  // Remove huge / irrelevant fields for prompting
  delete copy.embedding;
  // Keep CV text but cap it
  if (typeof copy.searchText === 'string') copy.searchText = copy.searchText.slice(0, 20000);
  return copy;
};

const SYSTEM_TEMPLATE_FIELD_DETECTION = async ({ message, contextData }) => {
  const pruned = pruneContextData(contextData);
  const contextBlock = `
  Candidate profile JSON (ground truth):
  ${JSON.stringify(pruned || {}, null, 2)}

  message from user:
  ${message || ''}
  `;
  const template = await loadPromptTemplateById('candidate_ai_agent');
  if (template) {
    return template
      .replace('{context}', JSON.stringify(pruned || {}, null, 2))
      .replace('{message}', message || '')
      .replace('{schema}', getCandidateSchemaText());
  }
  return `
  You are Hiro, an expert AI Career Coach and Recruitment Assistant.
  Your task is to determine which fields from the candidate schema are directly referenced or implied in the user's latest message.
  Grounding (CRITICAL):
  - Use ONLY the provided candidate profile JSON and the user's message to identify relevant fields.
  - Do NOT invent fields that cannot be grounded in the schema + message.
  Output requirements:
  - Return ONLY valid JSON, no markdown, no extra prose.
  - Follow this exact schema:
    {
      "relevantFields": ["fieldName1", "fieldName2", ...],
      "message": "Hebrew sentence describing either the detected fields or explaining you could not map any fields."
    }
  - If the message does not contain any actionable information, return an empty array for relevantFields and a short Hebrew message explaining no updates are needed.
  - The field names must match the schema fields listed below.
  Your Mission is to find the fields from the candidate schema: ${getCandidateSchemaText()} that are relevant to the message: ${message}
`;
};

const SYSTEM_TEMPLATE_COMPANY_FIELD_DETECTION = ({ message, contextData }) => {
  const pruned = pruneContextData(contextData);
  return `
You are Hiro, a corporate intelligence assistant keeping this organization's data reliable.
Read the user's latest message alongside the provided company JSON and classify the user's intent:
1. They expect a conversational reply (no update).
2. They expect you to update the existing company.
3. They are describing a new company that should be created.
Pay attention to Hebrew verbs such as "הוסף", "תוסיף", "צור", "תייצר", "תוסיף לי" as signals for new companies.
Grounding (CRITICAL):
- Use ONLY the provided company JSON and the user's message.
- Do NOT invent facts that cannot be inferred from the schema or message.
Output (strict JSON only):
{
  "intent": "reply" | "update" | "createOrganization",
  "relevantFields": ["fieldName1", "fieldName2", ...],
  "message": "short Hebrew sentence describing what you detected or why no update is needed."
}
If no actionable fields exist, return intent = "reply" and relevantFields = [] with a short Hebrew explanation.
If the user clearly describes a new company (name, industry, location, etc.), set intent = "createOrganization" and include those inferred fields.
The field names must match the organization schema fields listed below.
${ORGANIZATION_SCHEMA_TEXT}
Company profile JSON:
${JSON.stringify(pruned || {}, null, 2)}
Message to analyze:
${message || ''}
`;
};

const ORGANIZATION_SCHEMA_TEXT = `
Organization schema fields (supported updates):
- name, legalName, mainField, subField, structure, businessModel, productType, classification
- tags, techTags, description, location, employeeCount, growthIndicator, website
Use these fields to match the user’s request when updating a company.
`;

const SYSTEM_TEMPLATE_COMPANY_PROFILE = ({ message, contextData, overridePrompt, relevantFields = [], intent = 'update' }) => {
  const pruned = pruneContextData(contextData);
  const systemInstruction = `
You are Hiro, a corporate intelligence assistant for this organization.
**Goal:** Suggest structured JSON patches that improve the company’s profile (tags, description, fields, etc.).
**Personality:** Professional, concise, proactive, Hebrew only.
${ORGANIZATION_SCHEMA_TEXT}
**Current Company Context:** ${JSON.stringify(pruned || {}, null, 2)}
`;
  const groundingRules = `
Grounding (CRITICAL):
- Base suggestions only on the provided company context and the user’s message.
- Do NOT invent new companies or facts outside the supplied data.
- If no actionable fields are present, reply with { "relevantFields": [], "message": "..." }.
- When you propose updates, return a JSON array of patches. For new organizations, include "tool":"createOrganization" with the proposed organization object.
Output (strict JSON only):
{
  "intent": "reply" | "update" | "createOrganization",
  "message": "short Hebrew sentence (useful for UI feedback)",
  "proposals": [
    {
      ("field" | "tool"): STRING,
      "currentValue": ANY | null,
      "proposedValue": ANY,
      "reason": STRING (short, Hebrew)
    }
  ]
}
`;
  const contextBlock = `
message from user:
${message || ''}
`;
  return `${systemInstruction}
${groundingRules}
${overridePrompt ? String(overridePrompt) : ''}
${contextBlock}`;
};



const SYSTEM_TEMPLATE_CANDIDATE_PROFILE = ({ message, contextData, overridePrompt, relevantFields = [] }) => {
  const pruned = pruneContextData(contextData);
  const cvText = (contextData && typeof contextData.searchText === 'string') ? contextData.searchText.slice(0, 20000) : '';
  const formData = pruned || {};
  const schemaDescription = getCandidateSchemaDescription();
  const candidateSchemaText = getCandidateSchemaText();
  const fieldsHint = relevantFields.length
    ? `Relevant fields for this update: ${relevantFields.join(', ')}.`
    : 'Relevant fields for this update: none were identified (but you should still obey grounding rules).';
  const systemInstruction = `
You are Hiro, an expert AI Career Coach and Recruitment Assistant dedicated to helping the candidate "${formData.fullName || 'דרך פרופיל'}".
**Your Goal:** Help the candidate create a "winning profile" that maximizes their chances of getting hired. You have direct write-access to their profile data via tools.
**Your Personality:**
1. **Professional & Encouraging:** Be polite, empathetic, but focus on professional growth.
2. **Proactive:** Don't just wait for commands. If you see missing fields (like a missing summary or skill), suggest adding them.
3. **Concise:** Keep your responses short, natural, and action-oriented.
4. **Language:** Always converse in Hebrew (he-IL).
**Operational Guidelines:**
1. **Context Awareness:** Use the provided profile JSON to understand their current status.
2. **Tool Usage:**
   - Use \\updateCandidateField\\ for simple text fields (Name, Title, Summary, Phone, Email, Location).
   - Use \\upsertWorkExperience\\ to add or fix job history.
   - INFER information: If the user says "I worked at Wix as a Dev", map it correctly to the tool arguments without asking unnecessary questions.
3. **Validation:** If the user provides vague info (e.g., "I do marketing"), ask for specifics ("What kind of marketing? Digital? Content?") before saving.
4. **Salary Limits:** Keep any salary patches within 0-20000 ש"ח (e.g., "מ-8000 עד 10000"); ask the user to adjust the range if it falls outside that window.
${fieldsHint}
**Current Profile Context:** ${JSON.stringify(formData || {}, null, 2)}
`;
  const groundingRules = `
Grounding (CRITICAL):
- You MUST base suggestions ONLY on the provided message from the user and the candidate profile JSON.
- Do NOT invent new professions/tech stacks/experience that are not supported by the candidate profile JSON or the user's message.
- If you cannot support a suggestion from the message, DO NOT suggest it.
- When suggesting skills/roles/tags, prefer items that explicitly appear in the user details, profile JSON, or message.
- Whenever the user's latest message includes personal details (name, age, location, experience, skills, education), you MUST add a JSON patch for the corresponding field(s) even if they conflict with existing profile data.
Output formatting:
- Follow the user's requested JSON schema STRICTLY.
- Return ONLY valid JSON, no markdown, no extra text.
${schemaDescription}
${candidateSchemaText}
`;
  const outputRules = `
OUTPUT RULES (CRITICAL):
- You are operating in PROPOSAL MODE only.
- Do NOT update the profile.
- Do NOT summarize the candidate.
- Do NOT give career advice.
- Do NOT explain beyond a short reason per proposal.
- You MUST return ONLY valid JSON. No markdown, no prose, no Hebrew sentences outside the JSON block.
- The output MUST follow this schema:
  {
    "proposals": [
      {
        ("field" | "tool"): STRING,
        "currentValue": ANY | null,
        "proposedValue": ANY,
        "reason": STRING (short, Hebrew)
      }
    ]
  }
- Propose updates ONLY when they are directly supported by the user's latest message.
- If a detail is missing (e.g., exact university name), DO NOT guess it; omit that proposal.
- If nothing can be safely updated, return: { "proposals": [] }
`;
  const contextBlock = `
Candidate profile JSON (ground truth):
${JSON.stringify(pruned || {}, null, 2)}

CV text (ground truth, may be partial):
${cvText || ''}

message from user:
${message || ''}

MUST: implment all fields from Relevant fields for this update: [${relevantFields.join(', ')}] by the user message.
`;

  return `${systemInstruction}
${groundingRules}
${outputRules}
${overridePrompt ? String(overridePrompt) : ''}
${contextBlock}`;
};

const JOB_FIELD_SCHEMA_TEXT = `
Job taxonomy layers:
- Categories
- Clusters / fieldTypes within each category
- Roles (titles) with synonyms
Use these layers when proposing updates.
`;

const templateCache = new Map();

const fillTemplate = (template, data) =>
  template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(data[key] ?? ''));

const resolvePromptTemplate = async (promptId, params = {}) => {
  if (!promptId) return SYSTEM_TEMPLATE_JOB_FIELDS(params);
  if (!templateCache.has(promptId)) {
    const promptRow = await Prompt.findByPk(promptId);
    templateCache.set(promptId, promptRow?.template || '');
  }
  const template = templateCache.get(promptId);
  if (!template) return SYSTEM_TEMPLATE_JOB_FIELDS(params);
  return fillTemplate(template, {
    message: params.message || '',
    context: JSON.stringify(params.contextData || {}, null, 2),
    categories: JSON.stringify(params.contextData?.categories || [], null, 2),
    overridePrompt: params.overridePrompt || '',
  });
};

const SYSTEM_TEMPLATE_JOB_FIELDS = ({ message, contextData, overridePrompt }) => {
  const categories = Array.isArray(contextData?.categories) ? contextData.categories : [];
  const categoriesSummary = categories
    .map((cat) => `${cat.name} (${(cat.fieldTypes || []).length} clusters)`)
    .join(', ') || 'אין קטגוריות בינתיים';
  const contextBlock = `
Current taxonomy snapshot:
${JSON.stringify(categories || [], null, 2)}
`;
  return `
You are Hiro, a taxonomy expert for "ניהול טקסונומיה (תחומי משרה)".
Focus on keeping the categories, clusters, and roles organized, deduplicated, and aligned with the user's request.
Use ONLY the provided taxonomy snapshot and the latest user message.

When you detect a clear need to add or adjust a category, cluster, role, or synonyms, reply with a short Hebrew sentence and append a JSON block containing the proposals in this format:
\`\`\`json
{
  "proposals": [
    {
      "field": "category" | "cluster" | "role" | "synonym",
      "currentValue": STRING | null,
      "proposedValue": STRING | ARRAY,
      "reason": "short Hebrew reason"
    },
    ...
  ]
}
\`\`\`
The JSON block must appear at the end of your response and include only grounded proposals derived from the user's message.
If the user is only asking questions or having a conversation without actionable updates, reply with a short Hebrew sentence (no JSON block) explaining what they can do next.

${JOB_FIELD_SCHEMA_TEXT}

Current Categories: ${categoriesSummary}

User message:
${message || ''}

${contextBlock}

${overridePrompt ? String(overridePrompt) : ''}
`;
};

const tryParseJson = (s) => {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    // try to salvage first JSON array/object from the text
    const startArr = trimmed.indexOf('[');
    const endArr = trimmed.lastIndexOf(']');
    if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
      try { return JSON.parse(trimmed.slice(startArr, endArr + 1)); } catch (__) { /* ignore */ }
    }
    const startObj = trimmed.indexOf('{');
    const endObj = trimmed.lastIndexOf('}');
    if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
      try { return JSON.parse(trimmed.slice(startObj, endObj + 1)); } catch (__) { /* ignore */ }
    }
    return null;
  }
};

const extractProposals = (parsed) => {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object' && parsed !== null) {
    if (Array.isArray(parsed.proposals)) return parsed.proposals;
    if (Array.isArray(parsed.updates)) return parsed.updates;
    if (Array.isArray(parsed.suggestions)) return parsed.suggestions;
  }
  return null;
};

const ALLOWED_COMPANY_FIELDS = new Set([
  'name',
  'legalName',
  'mainField',
  'subField',
  'structure',
  'businessModel',
  'productType',
  'classification',
  'tags',
  'techTags',
  'description',
  'location',
  'employeeCount',
  'growthIndicator',
  'website',
]);

const ALLOWED_COMPANY_TOOLS = new Set(['createOrganization']);

const sanitizedCompanyProposal = (item) => {
  if (!item || typeof item !== 'object') return null;
  const field = typeof item.field === 'string' ? item.field : null;
  const tool = typeof item.tool === 'string' ? item.tool : null;
  if (!field && !tool) return null;
  if (field && !ALLOWED_COMPANY_FIELDS.has(field)) return null;
  if (!field && tool && !ALLOWED_COMPANY_TOOLS.has(tool)) return null;
  const value = item.value ?? item.proposedValue ?? item.organization ?? null;
  if (value === null || value === undefined) return null;
  return {
    ...item,
    field: field || undefined,
    tool: tool || undefined,
    value,
  };
};

const filterCompanyProfileResponse = (replyText) => {
  const parsed = tryParseJson(replyText);
  if (!parsed) return replyText;
  const proposals = extractProposals(parsed);
  if (!Array.isArray(proposals) || !proposals.length) return replyText;
  const filtered = proposals
    .map(sanitizedCompanyProposal)
    .filter(Boolean)
    .slice(0, 20);
  if (!filtered.length) return replyText;
  const intent = typeof parsed.intent === 'string' ? parsed.intent : 'update';
  const message = typeof parsed.message === 'string' && parsed.message.trim().length > 0
    ? parsed.message
    : 'הנה הצעות לעדכון פרופיל החברה.';
  return JSON.stringify({
    intent,
    message,
    proposals: filtered,
  });
};

const normalizeForMatch = (s) => String(s || '')
  .toLowerCase()
  .replace(/[\u200e\u200f]/g, '') // bidi marks
  .replace(/[^\p{L}\p{N}\s+.-]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const shouldKeepValue = (val, corpusNorm) => {
  if (typeof val === 'object' && val !== null) {
    // For objects (like workExperience entries), check if any text field is grounded
    const textToCheck = [val.title, val.company, val.description, val.name].filter(Boolean).join(' ');
    return shouldKeepValue(textToCheck, corpusNorm);
  }
  const v = normalizeForMatch(val);
  if (!v) return false;
  // Keep if exact substring exists in corpus
  if (corpusNorm.includes(v)) return true;
  // Keep if any meaningful token exists in corpus
  const toks = v.split(' ').filter((t) => t.length >= 3);
  return toks.some((t) => corpusNorm.includes(t));
};

const filterHallucinationsCandidateProfile = (replyText, contextData, userMessage) => {
  const parsed = tryParseJson(replyText);
  const proposals = extractProposals(parsed);
  if (!Array.isArray(proposals)) return replyText;

  const pruned = pruneContextData(contextData) || {};
  const corpus = [
    pruned.fullName,
    pruned.title,
    pruned.professionalSummary,
    Array.isArray(pruned.tags) ? pruned.tags.join(' ') : '',
    Array.isArray(pruned.workExperience) ? pruned.workExperience.map((x) => `${x.title || ''} ${x.company || ''} ${x.description || ''}`).join(' ') : '',
    typeof pruned.searchText === 'string' ? pruned.searchText : '',
    userMessage || '',
  ].join('\n');
  const corpusNorm = normalizeForMatch(corpus);
  const normalizedUserMessage = normalizeForMatch(userMessage || '');
  const mentionValueInMessage = (value) => {
    const norm = normalizeForMatch(value);
    return Boolean(norm && normalizedUserMessage.includes(norm));
  };

  const allowedFields = new Set([
    'fullName', 'age', 'location', 'phone', 'email',
    'title', 'professionalSummary', 'workExperience', 'preferences', 'interests',
    'salaryMin', 'salaryMax', 'softSkills', 'techSkills', 'candidateNotes',
    'tags', 'desiredRoles', 'availability', 'education',
  ]);
  const allowedTools = new Set(['upsertWorkExperience', 'updateCandidateField', 'createOrganization']);

  console.debug('[filterHallucinationsCandidateProfile] parsed array', {
    parsedPreview: JSON.stringify(parsed).slice(0, 400),
    userMessage,
  });
  const filtered = proposals
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const field = item.field;
      const tool = item.tool;
      if (!field && !tool) return null;
      if (field && !allowedFields.has(field)) return null;
      if (!field && tool && !allowedTools.has(tool)) return null;
      let value = item.value !== undefined ? item.value : item.proposedValue;
      if (value === undefined) return null;
      const enriched = { ...item, value };

      if (field) {
        if (Array.isArray(value)) {
          if (!['workExperience', 'education'].includes(field)) {
            const kept = value.filter((v) => shouldKeepValue(v, corpusNorm)).slice(0, 20);
            if (!kept.length) return null;
            value = kept;
            enriched.value = kept;
          }
        }

        if (typeof value === 'string' && ['title', 'location', 'availability'].includes(field)) {
          if (!shouldKeepValue(value, corpusNorm)) return null;
        }
        if (['location', 'fullName', 'age'].includes(field)) {
          if (typeof value !== 'string' || !mentionValueInMessage(value)) {
            console.debug('[filterHallucinationsCandidateProfile] dropping', {
              field,
              value,
              userMessage,
            });
            return null;
          }
        }
      }

      return enriched;
    })
    .filter(Boolean)
    .slice(0, 10);

  const educationKeywords = ['השכלה', 'תואר', 'דוקטורט', 'תעודה', 'קורס', 'לימודי', 'הסמכה'];
  const userHintedEducation = educationKeywords.some((keyword) =>
    normalizedUserMessage.includes(normalizeForMatch(keyword)),
  );
  const hasEducationUpdate = filtered.some((item) => item.field === 'education');
  if (userHintedEducation && !hasEducationUpdate && normalizedUserMessage) {
    const educationLine = (userMessage || '').split('\n').find((line) => line.trim()) || '';
    filtered.push({
      field: 'education',
      value: educationLine.trim().slice(0, 220),
      reason: 'עודכן לפי פירוט השכלה חדש שנמסר בשיחה.',
    });
  }

  const message = userMessage || '';

  console.debug('[filterHallucinationsCandidateProfile] final filtered', { filtered });
  return JSON.stringify(filtered);
};

const getChatTitle = (chatType) => {
  if (chatType && chatType !== 'default') return chatType;
  return 'Taxonomy Chat';
};

const getOrCreateChat = async ({ chatId, userId, chatType }) => {
  if (chatId) {
    const chat = await Chat.findByPk(chatId);
    if (chat) return chat;
  }
  const title = getChatTitle(chatType);
  const existing = await Chat.findOne({ where: { userId, title } });
  if (existing) return existing;
  return Chat.create({ userId, title });
};

const fetchHistory = async (chatId, limit = 30) => {
  const rows = await ChatMessage.findAll({
    where: { chatId },
    order: [['createdAt', 'DESC']],
    limit,
  });
  return rows.map((m) => ({ role: m.role, text: m.text }));
};

const fetchLatestByUser = async (userId, chatType = 'default') => {
  const chat = await Chat.findOne({
    where: { userId, title: getChatTitle(chatType) },
    order: [['createdAt', 'DESC']],
  });
  if (!chat) return null;
  const messages = await fetchHistory(chat.id);
  return { chatId: chat.id, messages };
};

const appendMessage = async (chatId, role, text) => {
  await ChatMessage.create({ chatId, role, text });
};
const appendTurn = async (chatId, userText, modelText) => {
  await appendMessage(chatId, 'user', userText);
  await appendMessage(chatId, 'model', modelText);
};

const chat = async ({ chatId, userId, message, tagsText, chatType, contextData, systemPrompt }) => {
  if (!message) {
    const err = new Error('Message is required');
    err.status = 400;
    throw err;
  }
  const chatRow = await getOrCreateChat({ chatId, userId, chatType });
  let history = await fetchHistory(chatRow.id);
  const apiKey =
    process.env.GIMINI_KEY
    || process.env.GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.API_KEY;

  let finalReply;
  if (chatType === 'candidate-profile') {
    const detectionPrompt = await SYSTEM_TEMPLATE_FIELD_DETECTION({ message, contextData });
    console.debug('[chatService] field detection prompt', {
      chatType,
      userId,
      message,
      snippet: detectionPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
      context: contextData && { id: contextData.id, fullName: contextData.fullName },
    });
    const detectionReply = await sendChat({ apiKey, systemPrompt: detectionPrompt, history, message });
    console.debug('[chatService] field detection reply', { reply: detectionReply?.slice?.(0, 400) });
    await appendTurn(chatRow.id, message, detectionReply);
    const detectionData = tryParseJson(detectionReply);
    const relevantFields = Array.isArray(detectionData?.relevantFields)
      ? detectionData.relevantFields
        .map((f) => (typeof f === 'string' ? f.trim() : String(f || '')))
        .map((f) => f.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      : [];
    if (!relevantFields.length) {
      let updatedHistory = await fetchHistory(chatRow.id);
      // create LLM that get the message and reply based on the next promp:
      const nextPrompt = `
      You are Hiro, an expert AI Career Coach and Recruitment Assistant dedicated to helping the candidate .
      **Your Goal:** Help the candidate create a "winning profile" that maximizes their chances of getting hired. You have direct write-access to their profile data via tools.
      **Your Personality:**
      **user messages can be without any fields or information, just a question or a statement.... so you need to reply with a short reply in Hebrew for the user to proceed with the conversation.
      dont reply with "לא נמצאו שדות לעדכון בהודעה זו" or any other message like that, just reply with a short reply in Hebrew for the user to proceed with the conversation.  
      `;
      const nextReply = await sendChat({ apiKey, systemPrompt: nextPrompt, history, message });
      console.debug('[chatService] next reply', { reply: nextReply?.slice?.(0, 400) });
      await appendTurn(chatRow.id, message, nextReply);
      updatedHistory = await fetchHistory(chatRow.id);
      updatedHistory.reverse();
      return { chatId: chatRow.id, messages: updatedHistory };
    }
    history = await fetchHistory(chatRow.id);
    const resolvedSystemPrompt = SYSTEM_TEMPLATE_CANDIDATE_PROFILE({
      message,
      contextData,
      overridePrompt: systemPrompt,
      relevantFields,
    });
    console.debug('[chatService] calling sendChat for candidate profile', {
      chatType,
      userId,
      message,
      snippet: resolvedSystemPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
      context: contextData && { id: contextData.id, fullName: contextData.fullName },
    });
    const reply = await sendChat({
      apiKey,
      systemPrompt: resolvedSystemPrompt,
      history,
      message,
    });
    console.debug('[chatService] raw LLM reply', { reply: reply?.slice?.(0, 400) });
    finalReply = filterHallucinationsCandidateProfile(reply, contextData, message);
  
    await appendTurn(chatRow.id, message, finalReply);
    
  } else if (chatType === 'company-profile') {
    const detectionPrompt = SYSTEM_TEMPLATE_COMPANY_FIELD_DETECTION({ message, contextData });
    console.debug('[chatService] company field detection prompt', {
      chatType,
      userId,
      message,
      snippet: detectionPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
      context: contextData && { id: contextData.id, name: contextData.name },
    });
    const detectionReply = await sendChat({ apiKey, systemPrompt: detectionPrompt, history, message });
    console.debug('[chatService] company detection reply', { reply: detectionReply?.slice?.(0, 400) });
    await appendTurn(chatRow.id, message, detectionReply);
    const detectionData = tryParseJson(detectionReply);
    const relevantFields = Array.isArray(detectionData?.relevantFields)
      ? detectionData.relevantFields
        .map((f) => (typeof f === 'string' ? f.trim() : String(f || '')))
        .map((f) => f.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      : [];
    const intent = typeof detectionData?.intent === 'string'
      ? detectionData.intent
      : 'reply';
    if (intent === 'reply') {
      //create LLM that get the message and reply based on the next promp:
      const nextPrompt = `
      You are Hiro, a corporate intelligence assistant for this organization.
      **Your Goal:** Help the get any information that he asked from your knowledge base or the internet.
      **Your Personality:**
      **user messages can be without any fields or information, just a question or a statement.... so you need to reply with a short reply in Hebrew for the user to proceed with the conversation.
      dont reply with "לא נמצאו שדות לעדכון בהודעה זו" or any other message like that, just reply with a short reply in Hebrew for the user to proceed with the conversation.  
      `;
      const nextReply = await sendChat({ apiKey, systemPrompt: nextPrompt, history, message });
      console.debug('[chatService] next reply', { reply: nextReply?.slice?.(0, 400) });
      await appendTurn(chatRow.id, message, nextReply);

      const updatedHistory = await fetchHistory(chatRow.id);
      updatedHistory.reverse();
      return { chatId: chatRow.id, messages: updatedHistory };
    }
    history = await fetchHistory(chatRow.id);
    const resolvedSystemPrompt = SYSTEM_TEMPLATE_COMPANY_PROFILE({
      message,
      contextData,
      overridePrompt: systemPrompt,
      relevantFields,
      intent,
    });
    console.debug('[chatService] calling sendChat for company profile', {
      chatType,
      userId,
      message,
      intent,
      snippet: resolvedSystemPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
      context: contextData && { id: contextData.id, name: contextData.name },
    });
    const reply = await sendChat({
      apiKey,
      systemPrompt: resolvedSystemPrompt,
      history,
      message,
    });
    console.debug('[chatService] raw company reply', { reply: reply?.slice?.(0, 400) });
    finalReply = filterCompanyProfileResponse(reply);
    await appendTurn(chatRow.id, message, finalReply);
  } else if (chatType === 'job-fields') {
    const resolvedSystemPrompt = await resolvePromptTemplate('Admin_Job_Categories_Smart_Agent', {
      message,
      contextData,
      overridePrompt: systemPrompt,
    });
    console.debug('[chatService] calling sendChat for job fields', {
      chatType,
      userId,
      message,
      snippet: resolvedSystemPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
    });
    const reply = await sendChat({
      apiKey,
      systemPrompt: resolvedSystemPrompt,
      history,
      message,
    });
    console.debug('[chatService] raw job-fields reply', { reply: reply?.slice?.(0, 400) });
    finalReply = reply;
    await appendTurn(chatRow.id, message, finalReply);
  } else {
    const resolvedSystemPrompt = SYSTEM_TEMPLATE_TAGS(tagsText);
    console.debug('[chatService] calling sendChat', {
      chatType,
      userId,
      message,
      snippet: resolvedSystemPrompt?.slice?.(0, 400).replace(/\s+/g, ' ').trim(),
      context: contextData && { id: contextData.id, fullName: contextData.fullName },
    });
    const reply = await sendChat({
      apiKey,
      systemPrompt: resolvedSystemPrompt,
      history,
      message,
    });
    console.debug('[chatService] raw LLM reply', { reply: reply?.slice?.(0, 400) });
    finalReply = reply;
    await appendTurn(chatRow.id, message, finalReply);
  }

  const updatedHistory = await fetchHistory(chatRow.id);
  updatedHistory.reverse();

  return { chatId: chatRow.id, messages: updatedHistory };
};

module.exports = { chat, fetchHistory, fetchLatestByUser };

