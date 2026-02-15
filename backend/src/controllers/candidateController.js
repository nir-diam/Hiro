const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { flexibleChecksumsMiddlewareOptions } = require('@aws-sdk/middleware-flexible-checksums');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const candidateService = require('../services/candidateService');
const { embedCandidateAndSave, searchCandidates } = require('../services/vectorSearchService');
const { sendChat, sendSingleTurnChat } = require('../services/geminiService');
const organizationService = require('../services/organizationService');
const promptService = require('../services/promptService');
const candidateTagService = require('../services/candidateTagService');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');

const extractTextFromImageBuffer = async (buffer) => {
  const worker = await createWorker('eng+heb');
  try {
    const { data } = await worker.recognize(buffer);
    return data?.text?.trim() || '';
  } catch (err) {
    console.error('[embed-ocr-error]', err.message || err);
    return '';
  } finally {
    await worker.terminate();
  }
};

// Best-effort embedding wrapper so we don't block main response
const tryEmbedCandidate = async (candidateId, extraText = '') => {
  if (!candidateId) return;
  try {
    await embedCandidateAndSave(candidateId, extraText);
  } catch (err) {
    // Swallow errors to avoid breaking main flow; log for observability
    console.error('Embedding failed for candidate', candidateId, err.message || err);
  }
};

const requiredS3Env = ['AWS_REGION', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];

const ensureS3Env = () => {
  const missing = requiredS3Env.filter((key) => !process.env[key]);
  if (missing.length) {
    const err = new Error(`Missing S3 config: ${missing.join(', ')}`);
    err.status = 500;
    throw err;
  }
};

const s3Client = () => {
  ensureS3Env();
  const client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // Force the SDK to avoid request checksum injection
    requestChecksumCalculation: 'NEVER',
  });
  // Remove checksum middleware globally so presigned URLs won't require checksum headers
  client.middlewareStack.remove(flexibleChecksumsMiddlewareOptions.name);
  client.middlewareStack.removeByTag('SET_BODY_CHECKSUM');
  return client;
};

const buildPublicUrl = (key) =>
  `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

// --- AI CV parsing (Gemini) ---
const tryParseJson = (text) => {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Try to extract the first JSON object/array from the response
    const startObj = trimmed.indexOf('{');
    const startArr = trimmed.indexOf('[');
    const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
    if (start === -1) return null;
    const endObj = trimmed.lastIndexOf('}');
    const endArr = trimmed.lastIndexOf(']');
    const end = endObj === -1 ? endArr : endArr === -1 ? endObj : Math.max(endObj, endArr);
    if (end === -1 || end <= start) return null;
    const slice = trimmed.slice(start, end + 1);
    let aiTagEntries = [];
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
};

const normalizeStringArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  return [];
};

const normalizeWorkExperience = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x || typeof x !== 'object') return null;
      const title = String(x.title || '').trim();
      const company = String(x.company || '').trim();
      const description = String(x.description || '').trim();
      if (!title && !company && !description) return null;
      const startDate = String(x.startDate || '').trim() || '2000-01';
      const endDate = String(x.endDate || '').trim() || (startDate || '2000-12');
      return {
        id: x.id || idx + 1,
        title: title || 'ניסיון תעסוקתי',
        company,
        companyField: String(x.companyField || '').trim(),
        startDate,
        endDate,
        description: description || [title, company].filter(Boolean).join(' - '),
      };
    })
    .filter(Boolean);
};

const normalizeEducation = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const v = x.trim();
        return v ? { id: idx + 1, value: v } : null;
      }
      if (typeof x === 'object') {
        const v = String(x.value || x.degree || x.title || x.description || '').trim();
        return v ? { id: x.id || idx + 1, value: v } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const normalizeLanguages = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x, idx) => {
      if (!x) return null;
      if (typeof x === 'string') {
        const name = x.trim();
        return name ? { id: idx + 1, name, level: 50, levelText: '' } : null;
      }
      if (typeof x === 'object') {
        const name = String(x.name || '').trim();
        if (!name) return null;
        const level = typeof x.level === 'number' ? x.level : 50;
        return { id: x.id || idx + 1, name, level, levelText: String(x.levelText || x.level || '').trim() };
      }
      return null;
    })
    .filter(Boolean);
};

const extractCompanyNames = (experience) => {
  if (!Array.isArray(experience)) return [];
  const names = experience
    .map((item) => {
      if (!item) return '';
      const candidate =  item.company|| '';
      return String(candidate || '').trim();
    })
    .filter(Boolean);
  return Array.from(new Set(names));
};

const promptTemplateCache = new Map();
const loadPromptTemplate = async (promptId) => {
  if (!promptId) return null;
  if (promptTemplateCache.has(promptId)) return promptTemplateCache.get(promptId);
  try {
    const record = await promptService.getById(promptId);
    const template = record?.template || null;
    promptTemplateCache.set(promptId, template);
    return template;
  } catch (err) {
    console.warn(`[candidateController] prompt ${promptId} missing`, err.message || err);
    promptTemplateCache.set(promptId, null);
    return null;
  }
};

const buildExperiencePrompt = async (contextParts) => {
  const template = await loadPromptTemplate('candidate_Profile Summary AI-Enhanced');
  if (template) {
    return template.replace(/{{contextParts}}/g, contextParts.join('\n'));
  }
  return `
פעל כיועץ קריירה ומומחה לכתיבת קורות חיים (CV Expert) בעברית.
המטרה: כתיבה או שכתוב של תיאור ניסיון תעסוקתי בעברית בצורה מקצועית.
הנתונים עליהם יש להתבסס:
${contextParts.join('\n')}
הנחיות כתיבה:
1. כתוב 3-5 נקודות קצרות ומקצועיות בגוף ראשון עבר.
2. אם קיים תיאור - שפר אותו; אם לא, צור תיאור חדש.
3. החזר רק את רשימת הנקודות בעברית, ללא מבואות.
`.trim();
};

const ensureOrganizationsFromExperience = async (experience, candidateId = null) => {
  const companyNames = extractCompanyNames(experience);
  if (!companyNames.length) return;
  console.debug('[candidateController] syncing organizations for workExperience', { companyNames });
  try {
    await Promise.all(
      companyNames.map(async (name) => {
        console.debug('[candidateController] ensuring organization', { name });
        const org = await organizationService.findOrCreateByName(name, { candidateId });
        console.debug('[candidateController] ensured organization', { name, orgId: org?.id });
        return org;
      }),
    );
  } catch (err) {
    console.error('Failed to sync organizations for work experience', err);
  }
};

const generateExperienceSummary = async (req, res) => {
  try {
    const candidate = await candidateService.getById(req.params.id);
    const payload = req.body || {};
    const experience = {
      title: payload.title || candidate.title || '',
      company: payload.company || '',
      companyField: payload.companyField || '',
      description: payload.description || '',
    };
    const contextParts = [];
    if (experience.title) contextParts.push(`תפקיד: ${experience.title}`);
    if (experience.company) contextParts.push(`חברה: ${experience.company}`);
    if (experience.companyField) contextParts.push(`תחום עיסוק החברה: ${experience.companyField}`);
    if (experience.description) {
      const sanitizedDescription = experience.description.replace(/"/g, '\\"');
      contextParts.push(`תיאור קיים (טיוטה/נקודות): "${sanitizedDescription}"`);
    }

    if (!contextParts.length) {
      return res.status(400).json({ message: 'חובה לספק לפחות תפקיד או חברה כדי לגבש תיאור.' });
    }

    const prompt = await buildExperiencePrompt(contextParts);
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GIMINI_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'מפתח Gemini/API לא מוגדר.' });
    }

    const text = await sendSingleTurnChat({
      apiKey,
      systemPrompt: prompt,
      message: prompt,
    });

    const summary = (text || '').trim();
    if (!summary) {
      return res.status(500).json({ message: 'המודל לא החזיר תיאור תקין.' });
    }

    const updated = await candidateService.update(candidate.id, { professionalSummary: summary });
    res.json({ summary, candidate: updated });
  } catch (err) {
    console.error('[generateExperienceSummary]', err);
    res.status(err.status || 500).json({ message: err.message || 'יצירת תיאור ניסיון נכשלה.' });
  }
};

const extractSkillsHeuristic = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return { soft: [], technical: [] };

  // Very lightweight keyword-based extraction (fallback if Gemini returns empty)
  const techKeywords = [
    'excel', 'word', 'powerpoint', 'sql', 'python', 'java', 'javascript', 'typescript', 'react', 'node', 'node.js',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jira', 'confluence', 'sap', 'salesforce', 'power bi', 'tableau',
    'git', 'github', 'gitlab', 'linux', 'windows', 'photoshop', 'figma', 'google ads', 'meta ads', 'facebook ads',
    'seo', 'ppc', 'crm', 'erp',
    // Hebrew common
    'אקסל', 'אופיס', 'וורד', 'פאוורפוינט', 'סאפ', 'ג\'ירה', 'גירה', 'קונפלואנס', 'פאוור בי', 'טאבלו', 'פוטושופ',
  ];
  const softKeywords = [
    'communication', 'teamwork', 'leadership', 'problem solving', 'organization', 'time management', 'customer service',
    // Hebrew common
    'תקשורת', 'עבודת צוות', 'עבודה בצוות', 'מנהיגות', 'שירותיות', 'שירות לקוחות', 'סדר', 'ארגון', 'ניהול זמן', 'פתרון בעיות',
    'אחריות', 'מוטיבציה', 'יחסי אנוש', 'עצמאות', 'יכולת למידה',
  ];

  const pick = (arr) => arr.filter((k) => t.includes(k.toLowerCase()));
  const tech = Array.from(new Set(pick(techKeywords))).slice(0, 30);
  const soft = Array.from(new Set(pick(softKeywords))).slice(0, 30);
  return { soft, technical: tech };
};

const buildAiSkillsPrompt = () => `
You are an expert CV skill extractor. You receive raw CV text (Hebrew or English).
Return ONLY strict JSON (no markdown) exactly in this shape:
{
  "skills": {
    "soft": string[],
    "technical": string[]
  }
}

Rules:
- Do NOT invent skills that are not supported by the CV.
- If the CV contains skills/tools/technologies/traits, extract them (do not leave both arrays empty).
- soft = interpersonal/behavioral skills (e.g., תקשורת בין-אישית, עבודת צוות, מנהיגות, שירותיות, סדר וארגון, פתרון בעיות).
- technical = tools/technologies/platforms/methods/certifications (e.g., Excel, SQL, Python, React, Jira, AWS, Google Ads, Power BI).
- Max 30 items per list. Prefer concise tokens.
`;

const parseSkillsWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!resumeText || !String(resumeText).trim()) return null;
  const raw = await sendChat({
    apiKey,
    systemPrompt: buildAiSkillsPrompt(),
    history: [{ role: 'user', text: String(resumeText).slice(0, 50000) }],
  });
  const parsed = tryParseJson(raw);
  return parsed && typeof parsed === 'object' ? parsed : null;
};

const buildAiResumePrompt = (candidate_tag) => `
You are an expert CV parser. You receive raw CV text (Hebrew or English).
Return ONLY a valid JSON object (no markdown, no explanations) matching this schema:
{
  "fullName": string|null,
  "email": string|null,
  "phone": string|null,
  "address": string|null,
  "title": string|null,
  "professionalSummary": string|null,
  "skills": { "soft": string[], "technical": string[] },
  "tags": string[],
  "languages": [{ "name": string, "level": string|number|null, "levelText": string|null }],
  "workExperience": [{
    "title": string|null,
    "company": string|null,
    "companyField": string|null,
    "startDate": string|null,   // YYYY-MM if possible
    "endDate": string|null,     // YYYY-MM or "Present"
    "description": string|null
  }],
  "education": [{ "value": string|null }]
}

Rules:
- Do NOT invent facts. If unknown, use null/empty.
- Extract multiple work/education entries when present.
- You MUST ALWAYS include the "skills" key with BOTH arrays: skills.soft and skills.technical (even if empty).
- If the user mentions skills, roles, tools, or other professional tags,also include them under the \`tags\` field so the backend can synchronize candidate_tag rows. candidate_tag  scehma:${candidate_tag } (must implement in candidate_tag from the llm: raw_type: (String) הסיווג מה-LLM (Role, Skill, etc). context: (String) האם זה Core, Tool או Degree.  is_current: (Boolean) האם מופיע בניסיון האחרון.  is_in_summary: (Boolean) האם מופיע בפתיח.  confidence_score: (Float) רמת הביטחון של ה-AI.)
- If the CV contains any skills/tools/technologies/traits, you MUST extract them into the relevant list (do not leave both lists empty).
- skills.soft = interpersonal/behavioral skills (e.g., תקשורת בין-אישית, עבודת צוות, מנהיגות, שירותיות, סדר וארגון, פתרון בעיות). Max 30.
- skills.technical = tools/technologies/platforms/methods/certifications (e.g., Excel, SQL, Python, React, Salesforce, Google Ads, Power BI, Jira, AWS, Docker). Max 30.
- Prefer realistic date formats; if only year exists use YYYY-01 / YYYY-12.

Output constraints:
- Return STRICT JSON (double quotes, no trailing commas).
- Do not wrap in \`\`\` fences.
`;

let resumePromptCache = null;
const getResumePromptTemplate = async () => {
  if (resumePromptCache) return resumePromptCache;
  try {
    resumePromptCache = await promptService.getById('cv_parsing');
  } catch (err) {
    console.warn('[attachMedia-ai] cv_parsing prompt missing', err.message || err);
    resumePromptCache = null;
  }
  return resumePromptCache;
};

const parseResumeWithAi = async ({ resumeText }) => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('[attachMedia-ai] missing GEMINI_API_KEY/API_KEY/GOOGLE_API_KEY -> skip ai');
    return null;
  }
  if (!resumeText || !String(resumeText).trim()) {
    console.log('[attachMedia-ai] empty resumeText -> skip ai');
    return null;
  }
  const promptRecord = await getResumePromptTemplate();
  promptRecord.template = promptRecord.template.replace('{candidate_tag}', getCandidateTagsSchemaText());
  const systemPrompt = promptRecord?.template || buildAiResumePrompt(getCandidateTagsSchemaText());
//

  console.log('[attachMedia-ai] calling gemini', { resumeLen: String(resumeText).length });
  const raw = await sendChat({
    apiKey,
    systemPrompt,
    history: [{ role: 'user', text: resumeText.slice(0, 50000) }],
    message:resumeText
  });
  const parsed = tryParseJson(raw);
  console.log('[attachMedia-ai] gemini response', {
    rawLen: String(raw || '').length,
    parsedOk: !!parsed,
    keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 20) : [],
    softSkillsCount: Array.isArray(parsed?.skills?.soft) ? parsed.skills.soft.length : 0,
    technicalSkillsCount: Array.isArray(parsed?.skills?.technical) ? parsed.skills.technical.length : 0,
  });
  return parsed;
};

const list = async (_req, res) => {
  const candidates = await candidateService.list();
  res.json(candidates);
};

const getByUser = async (req, res) => {
  try {
    const candidates = await candidateService.listByUserId(req.params.userId);
    res.json(candidates);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Not found' });
  }
};


const getCandidateTagsSchemaText = () => `
Candidate tag schema (from backend/src/models/CandidateTag.js):
- name (String)
- candidate_id (UUID, FK -> candidates.id)
- tag_id (UUID, FK -> tags.id)
- raw_type (role/skill/education/etc.)
- context (Core/Tool/Degree)
- is_current (boolean)
- is_in_summary (boolean)
- confidence_score (float)
- calculated_weight (float)
- final_score (float)
Use this schema as guidance when tagging professional skills or roles.
`;


const get = async (req, res) => {
  console.log(
    '[candidateController.get] incoming request',
    { method: req.method, url: req.originalUrl, host: req.get('host'), candidateId: req.params.id },
  );
  try {
    const candidate = await candidateService.getById(req.params.id);
    console.log('[candidateController.get] found candidate', { id: candidate.id });
    res.json(candidate);
  } catch (err) {
    console.error('[candidateController.get] lookup failed', { id: req.params.id, error: err.message || err });
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const candidate = await candidateService.create(req.body);
    if (Array.isArray(req.body.tags) && req.body.tags.length) {
      await candidateTagService.syncTagsForCandidate(candidate.id, req.body.tags);
    }
    const enrichedCandidate = await candidateService.getById(candidate.id);
    // Fire-and-forget embedding only if we have text to embed
    const embedText = [
      candidate.fullName,
      candidate.professionalSummary,
      candidate.searchText,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (embedText.length > 3) {
      void tryEmbedCandidate(candidate.id, embedText);
    }
    await ensureOrganizationsFromExperience(enrichedCandidate.workExperience, enrichedCandidate.id);
    res.status(201).json(enrichedCandidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Create failed' });
  }
};

const createFromAi = async (req, res) => {
  try {
    const { resumeText, fileBase64, mimeType, fileName } = req.body || {};
    let text = typeof resumeText === 'string' ? resumeText : '';
    if (fileBase64 && !text) {
      const buffer = Buffer.from(fileBase64, 'base64');
      if ((mimeType || '').startsWith('image/')) {
        text = await extractTextFromImageBuffer(buffer);
      } else {
        text = await extractFromBuffer(buffer, mimeType);
      }
      if (!text || !text.trim()) {
        text = buffer.toString('utf8');
      }
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'resumeText or fileBase64 is required' });
    }

    const aiResult = (await parseResumeWithAi({ resumeText: text })) || {};
    const fallback = extractStructuredFields(text);

    const aiSkills = aiResult.skills || {};
    let softSkills = normalizeStringArray(aiSkills.soft);
    let techSkills = normalizeStringArray(aiSkills.technical);
    if (!softSkills.length && !techSkills.length) {
      const heuristic = extractSkillsHeuristic(text);
      softSkills = heuristic.soft;
      techSkills = heuristic.technical;
    }

    let tags = normalizeStringArray(aiResult.tags);
    if (!tags.length && (softSkills.length || techSkills.length)) {
      tags = Array.from(new Set([...softSkills, ...techSkills])).slice(0, 50);
    }

    const aiTagsForSync =
      Array.isArray(aiResult.tags) && aiResult.tags.length
        ? aiResult.tags
        : tags.map((name) => ({ name }));

    const candidatePayload = {
      fullName: aiResult.fullName || fallback.fullName || 'מועמד חדש',
      email: aiResult.email || fallback.email || null,
      phone: aiResult.phone || fallback.phone || null,
      address: aiResult.address || null,
      title: aiResult.title || fallback.title || null,
      professionalSummary:
        aiResult.professionalSummary || fallback.professionalSummary || fallback.summary || null,
      skills: {
        soft: softSkills.slice(0, 50),
        technical: techSkills.slice(0, 50),
      },
      tags,
      workExperience: normalizeWorkExperience(aiResult.workExperience || fallback.workExperience),
      education: normalizeEducation(aiResult.education || fallback.education),
      languages: normalizeLanguages(aiResult.languages || fallback.languages),
      industryAnalysis: aiResult.industryAnalysis || fallback.industryAnalysis || {},
      searchText: text.slice(0, 50000),
      source: 'ai-upload',
      status: 'חדש',
    };

    const createdCandidate = await candidateService.create(candidatePayload);
    if (fileBase64) {
      await uploadResumeForCandidate(createdCandidate.id, fileBase64, fileName, mimeType);
    }
    void tryEmbedCandidate(createdCandidate.id, text);
    void ensureOrganizationsFromExperience(createdCandidate.workExperience, createdCandidate.id);
    if (aiTagsForSync.length) {
      await candidateTagService.syncTagsForCandidate(createdCandidate.id, aiTagsForSync);
    }
    const enrichedCandidate = await candidateService.getById(createdCandidate.id);
    res.status(201).json({ candidate: enrichedCandidate, parsed: aiResult });
  } catch (err) {
    console.error('[createFromAi-error]', err);
    res.status(err.status || 500).json({ message: err.message || 'AI candidate creation failed' });
  }
};

const update = async (req, res) => {
  try {
    const candidate = await candidateService.update(req.params.id, req.body);
    const embedText = [
      candidate.fullName,
      candidate.professionalSummary,
      candidate.searchText,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (embedText.length > 3) {
      void tryEmbedCandidate(candidate.id, embedText);
    }
    if (Array.isArray(req.body.tags)) {
      await candidateTagService.removeAbsentTags(candidate.id, req.body.tags);
    }
    const enrichedCandidate = await candidateService.getById(candidate.id);
    res.json(enrichedCandidate);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await candidateService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const createUploadUrl = async (req, res) => {
  const { fileName, contentType, folder = 'profiles' } = req.body;

  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }

  try {
    const client = s3Client();
    const safeName = path.basename(fileName);
    const key = `${folder}/${req.params.id}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      // Do not sign ContentType or checksum constraints
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

const attachMedia = async (req, res) => {
  const { key, type } = req.body;
  if (!key || !type) {
    return res.status(400).json({ message: 'key and type are required' });
  }

  try {
    const field = type === 'resume' ? 'resumeUrl' : 'profilePicture';
    const url = buildPublicUrl(key);
    console.log('[attachMedia] candidate', req.params.id, { key, type, field, url });
    const baseCandidate = await candidateService.update(req.params.id, { [field]: url });
    if (type === 'resume') {
      const extraText = await fetchResumeText(url, baseCandidate.id);
      console.log('[attachMedia] resume extraText length', baseCandidate.id, extraText ? extraText.length : 0);
      // Persist raw text for search/embedding + allow downstream keyword match
      const baseUpdates = extraText && extraText.trim()
        ? { searchText: extraText.slice(0, 50000) }
        : {};

      // Prefer AI parsing (Gemini) to populate candidate fields; fallback to regex parsing.
      let mergedUpdates = { ...baseUpdates };
      try {
        const ai = await parseResumeWithAi({ resumeText: extraText || '' });
        if (ai && typeof ai === 'object') {
          const candidateUpdates = {};
          if (ai.fullName) candidateUpdates.fullName = String(ai.fullName).trim();
          if (ai.email) candidateUpdates.email = String(ai.email).trim();
          if (ai.phone) candidateUpdates.phone = String(ai.phone).trim();
          if (ai.address) candidateUpdates.address = String(ai.address).trim();
          if (ai.title) candidateUpdates.title = String(ai.title).trim();
          if (ai.professionalSummary) candidateUpdates.professionalSummary = String(ai.professionalSummary).trim();

          // Skills: merge into candidate.skills (JSONB)
          const softFromAi = normalizeStringArray(ai.skills?.soft);
          const techFromAi = normalizeStringArray(ai.skills?.technical);
          if (softFromAi.length || techFromAi.length) {
            const existingSkills = baseCandidate.skills && typeof baseCandidate.skills === 'object'
              ? baseCandidate.skills
              : { soft: [], technical: [] };
            const existingSoft = normalizeStringArray(existingSkills.soft);
            const existingTech = normalizeStringArray(existingSkills.technical);
            candidateUpdates.skills = {
              soft: Array.from(new Set([...existingSoft, ...softFromAi])).slice(0, 50),
              technical: Array.from(new Set([...existingTech, ...techFromAi])).slice(0, 50),
            };
          }

          // If Gemini returned empty/missing skills, do a dedicated skills extraction pass (Gemini), then fallback heuristic.
          const currentSoft = normalizeStringArray(candidateUpdates.skills?.soft);
          const currentTech = normalizeStringArray(candidateUpdates.skills?.technical);
          if ((!currentSoft.length && !currentTech.length) && (extraText || '').trim().length > 50) {
            try {
              const skillsOnly = await parseSkillsWithAi({ resumeText: extraText });
              const soft2 = normalizeStringArray(skillsOnly?.skills?.soft);
              const tech2 = normalizeStringArray(skillsOnly?.skills?.technical);
              if (soft2.length || tech2.length) {
                const existingSkills = baseCandidate.skills && typeof baseCandidate.skills === 'object'
                  ? baseCandidate.skills
                  : { soft: [], technical: [] };
                const existingSoft = normalizeStringArray(existingSkills.soft);
                const existingTech = normalizeStringArray(existingSkills.technical);
                candidateUpdates.skills = {
                  soft: Array.from(new Set([...existingSoft, ...soft2])).slice(0, 50),
                  technical: Array.from(new Set([...existingTech, ...tech2])).slice(0, 50),
                };
                console.log('[attachMedia-ai] skills second-pass', baseCandidate.id, { soft: soft2.length, technical: tech2.length });
              } else {
                const heur = extractSkillsHeuristic(extraText);
                if (heur.soft.length || heur.technical.length) {
                  candidateUpdates.skills = {
                    soft: heur.soft,
                    technical: heur.technical,
                  };
                  console.log('[attachMedia-ai] skills heuristic', baseCandidate.id, { soft: heur.soft.length, technical: heur.technical.length });
                } else {
                  console.log('[attachMedia-ai] skills still empty after second-pass + heuristic', baseCandidate.id);
                }
              }
            } catch (e) {
              console.error('[attachMedia-ai] skills second-pass error', baseCandidate.id, e.message || e);
            }
          }

          aiTagEntries = Array.isArray(ai.tags) ? ai.tags : [];

          const exp = normalizeWorkExperience(ai.workExperience);
          if (exp.length) candidateUpdates.workExperience = exp;

          const edu = normalizeEducation(ai.education);
          if (edu.length) candidateUpdates.education = edu;

          const langs = normalizeLanguages(ai.languages);
          if (langs.length) candidateUpdates.languages = langs;

          mergedUpdates = { ...mergedUpdates, ...candidateUpdates };
          console.log('[attachMedia-ai]', baseCandidate.id, 'updates keys', Object.keys(candidateUpdates));
        } else {
          console.log('[attachMedia-ai]', baseCandidate.id, 'no ai result, fallback to regex');
          const fallback = buildParsedUpdates(baseCandidate, extraText);
          mergedUpdates = { ...mergedUpdates, ...fallback };
        }
      } catch (e) {
       
      }

      const needsUpdate = Object.keys(mergedUpdates).length > 0;
      if (needsUpdate) {
        await candidateService.update(baseCandidate.id, mergedUpdates);
      }
      if (aiTagEntries.length) {

        await candidateTagService.syncTagsForCandidate(baseCandidate.id, aiTagEntries);
      }
      // Fire-and-forget embedding with extra text
      void tryEmbedCandidate(baseCandidate.id, extraText);
      const refreshedCandidate = await candidateService.getById(baseCandidate.id);
      await ensureOrganizationsFromExperience(refreshedCandidate.workExperience, refreshedCandidate.id);
      return res.json(refreshedCandidate);
    }
    res.json(baseCandidate);
  } catch (err) {
    console.error('[attachMedia-error]', req.params.id, err);
    res.status(err.status || 400).json({ message: err.message || 'Failed to attach media' });
  }
};

const uploadResumeForCandidate = async (candidateId, fileBase64, filename, mimeType) => {
  if (!fileBase64) return null;
  const buffer = Buffer.from(fileBase64, 'base64');
  const name = filename ? path.basename(filename) : `resume-${Date.now()}.bin`;
  const key = `resumes/${candidateId}/${Date.now()}-${name}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType || 'application/octet-stream',
  });
  const client = s3Client();
  await client.send(command);
  const publicUrl = buildPublicUrl(key);
  await candidateService.update(candidateId, { resumeUrl: publicUrl });
  return publicUrl;
};

// Rebuild embeddings for all candidates with resumeUrl (best-effort)
const rewriteDriveUrl = (url) => {
  try {
    const m = url.match(/https:\/\/drive\.google\.com\/file\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://drive.google.com/uc?export=download&id=${m[1]}`;
    }
    return url;
  } catch {
    return url;
  }
};

const rewriteDocsExportTxt = (url) => {
  try {
    const m = url.match(/https:\/\/docs\.google\.com\/document\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://docs.google.com/document/d/${m[1]}/export?format=txt`;
    }
    return url;
  } catch {
    return url;
  }
};

const rewriteSheetsExportCsv = (url) => {
  try {
    const m = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([^/]+)\//);
    if (m && m[1]) {
      return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`;
    }
    return url;
  } catch {
    return url;
  }
};

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const extractFromBuffer = async (buffer, ct) => {
  const contentType = (ct || '').toLowerCase();
  const magic4 = buffer.slice(0, 4).toString('utf8');
  const magic2 = buffer.slice(0, 2).toString('binary');
  const looksPdf = magic4 === '%PDF';
  const looksZip = magic2 === 'PK';

  try {
    // Prefer magic-number detection, then fall back to content-type hints
    if (looksPdf || contentType.includes('pdf')) {
      try {
        const resPdf = await pdfParse(buffer);
        if (resPdf.text) return resPdf.text;
      } catch (e) {
        console.log('[embed-parse-pdf-error]', e.message || e);
      }
    }

    if (
      looksZip ||
      contentType.includes('officedocument') ||
      contentType.includes('wordprocessingml') ||
      contentType.includes('msword') ||
      contentType.includes('application/octet-stream')
    ) {
      try {
        const resDoc = await mammoth.extractRawText({ buffer });
        if (resDoc.value) return resDoc.value;
      } catch (e) {
        console.log('[embed-parse-doc-error]', e.message || e);
      }
    }

    // Last resort: try PDF once more, then plain text decode
    try {
      const resPdf = await pdfParse(buffer);
      if (resPdf.text) return resPdf.text;
    } catch (e) {
      // ignore final pdf attempt
    }

    const asText = buffer.toString('utf8');
    if (asText && asText.trim()) return asText;
  } catch (e) {
    console.log('[embed-parse-error]', e.message || e);
  }
  return '';
};

const fetchResumeText = async (resumeUrl, candidateIdForLog = '') => {
  let extraText = '';
  try {
    let fetchUrl = resumeUrl;
    if (fetchUrl.includes('docs.google.com/document/d/')) {
      fetchUrl = rewriteDocsExportTxt(fetchUrl);
    } else if (fetchUrl.includes('docs.google.com/spreadsheets/d/')) {
      fetchUrl = rewriteSheetsExportCsv(fetchUrl);
    } else if (fetchUrl.includes('drive.google.com/file/d/')) {
      fetchUrl = rewriteDriveUrl(fetchUrl);
    }

    const resp = await fetch(fetchUrl);
    const ct = resp.headers.get('content-type') || '';
    console.log('[embed-fetch]', candidateIdForLog, { fetchUrl, status: resp.status, contentType: ct });
    if (resp.ok) {
      if (ct.startsWith('text/') || ct.includes('json') || ct.includes('html') || ct.includes('csv')) {
        const raw = await resp.text();
        extraText = ct.includes('html') ? stripHtml(raw) : raw;
        console.log('[embed-fetch]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else if (ct.includes('pdf') || ct.includes('officedocument') || ct.includes('msword') || ct.includes('application/octet-stream')) {
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        extraText = await extractFromBuffer(buf, ct);
        console.log('[embed-fetch-binary]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else if (ct.startsWith('image/')) {
        const arrayBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        extraText = await extractTextFromImageBuffer(buf);
        console.log('[embed-fetch-ocr]', candidateIdForLog, 'extraText length', extraText.length, 'snippet', extraText.slice(0, 200));
      } else {
        console.log('[embed-fetch-skip]', candidateIdForLog, 'unsupported content-type');
      }
    } else {
      console.log('[embed-fetch-skip]', candidateIdForLog, 'status not ok');
    }
  } catch (e) {
    console.log('[embed-fetch-error]', candidateIdForLog, e.message || e);
  }
  return extraText;
};

const extractStructuredFields = (text) => {
  if (!text) return {};
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  const pipeParts = firstLine.split('|').map((p) => p.trim()).filter(Boolean);
  const nameCandidate = (() => {
    const raw = pipeParts[0] ? pipeParts[0].split(',')[0].trim() : firstLine.split(',')[0].trim();
    if (!raw) return undefined;
    if (/\d/.test(raw) || raw.includes('@')) return undefined;
    if (raw.length < 2 || raw.length > 80) return undefined;
    return raw;
  })();
  const phoneRegex = /(\+?972[-\s]?\d{1,3}[-\s]?\d{6,8}|\b0\d[-\s]?\d{7,8}\b|\+?\d{2,3}[-\s]?\d{7,10})/;
  const addressCandidate = (() => {
    const candidates = pipeParts.slice(1);
    for (const part of candidates) {
      if (!part) continue;
      if (part.includes('@')) continue;
      if (phoneRegex.test(part)) continue;
      if (part.length < 2 || part.length > 80) continue;
      return part;
    }
    return undefined;
  })();
  const genderCandidate = (() => {
    const lower = text.toLowerCase();
    if (lower.includes('נקבה') || lower.includes('female')) return 'female';
    if (lower.includes('זכר') || lower.includes('male')) return 'male';
    return undefined;
  })();
  const titleLine = lines.find(
    (l) =>
      l.length >= 4 &&
      l.length <= 80 &&
      !l.includes('@') &&
      !/\d{4,}/.test(l),
  );
  const summary = text.slice(0, 600);
  const linesLower = lines.map((l) => l.toLowerCase());
  const collectSections = (keywords, stopKeywords) => {
    const sections = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = linesLower[i];
      if (!keywords.some((k) => lower.includes(k))) continue;
      let acc = [];
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j];
        const lwr = linesLower[j];
        if (!line) {
          if (acc.length) {
            sections.push(acc.join(' '));
            acc = [];
          }
          continue;
        }
        if (keywords.some((k) => lwr.includes(k))) break; // next same header
        if (stopKeywords.some((k) => lwr.includes(k))) break; // other header
        if (/^(skills|כישורים|summary|סיכום|about|אודות)/i.test(line)) break;
        acc.push(line.trim());
      }
      if (acc.length) sections.push(acc.join(' '));
    }
    return sections;
  };
  const experienceBlocks = collectSections(
    [
      'נסיון',
      'ניסיון',
      'experience',
      'employment',
      'work history',
      'professional experience',
      'career history',
      'תעסוקה',
      'עבודה',
    ],
    ['השכלה', 'education', 'degree', 'תואר', 'לימודים', 'certification', 'תעודה', 'studies', 'academy'],
  );
  const educationBlocks = collectSections(
    [
      'השכלה',
      'education',
      'degree',
      'degrees',
      'תואר',
      'לימודים',
      'certification',
      'certifications',
      'תעודה',
      'studies',
      'academy',
      'academic',
      'bachelor',
      'master',
      'phd',
      'university',
      'college',
    ],
    ['נסיון', 'ניסיון', 'experience', 'employment', 'work history', 'professional experience', 'career history', 'תעסוקה', 'עבודה'],
  );
  const experienceCards = [];
  experienceBlocks.forEach((block) => {
    const segments = [];
    const rangeRegex = /(20\d{2}|19\d{2})\s*[–-]\s*(present|כיום|20\d{2}|19\d{2})/gi;
    const indices = [];
    let m;
    while ((m = rangeRegex.exec(block)) !== null) {
      indices.push({ index: m.index, sy: m[1], eyRaw: m[2] });
    }
    if (indices.length > 0) {
      indices.forEach((item, idx) => {
        const start = item.index;
        const end = idx + 1 < indices.length ? indices[idx + 1].index : block.length;
        const snippet = block.slice(start, end).trim();
        if (!snippet) return;
        const ey = /present|כיום/i.test(item.eyRaw) ? 'Present' : item.eyRaw;
        segments.push({
          sy: item.sy,
          ey,
          text: snippet,
        });
      });
    } else {
      segments.push({ sy: '2000', ey: '2000', text: block.trim() });
    }

    segments.forEach((seg) => {
      const sy = seg.sy || '2000';
      const ey = seg.ey || sy;
      experienceCards.push({
        id: experienceCards.length + 1,
        title: seg.text.split('.')[0] || `ניסיון ${sy}${ey ? `-${ey}` : ''}`,
        company: '',
        companyField: '',
        startDate: `${sy}-01`,
        endDate: /present|כיום/i.test(ey) ? 'Present' : ey === sy ? `${ey}-12` : `${ey}-12`,
        description: seg.text,
      });
    });
  });
  const educationCards = educationBlocks.map((block, idx) => ({
    id: idx + 1,
    value: block,
  }));

  // Fallback: if no experience blocks, try year-based lines
  if (experienceCards.length === 0) {
    const yearLines = lines
      .filter((l) => /(20\d{2}|19\d{2})/.test(l))
      .map((l) => l.trim())
      .filter(Boolean);
    if (yearLines.length) {
      experienceCards.push(
        ...yearLines.map((l, idx) => {
          const m = l.match(/(20\d{2}|19\d{2}).{0,10}(20\d{2}|19\d{2}|כיום|present)/i);
          const single = l.match(/(20\d{2}|19\d{2})/);
          const sy = m ? m[1] : single ? single[1] : '2000';
          const eyRaw = m ? m[2] : sy;
          const ey = /כיום|present/i.test(eyRaw) ? 'Present' : eyRaw;
          return {
            id: idx + 1,
            title: l,
            company: '',
            companyField: '',
            startDate: `${sy}-01`,
            endDate: ey === sy ? `${ey}-12` : ey === 'Present' ? 'Present' : `${ey}-12`,
            description: l,
          };
        }),
      );
    }
  }

  // Fallback: if no education blocks, look for common edu keywords per line
  if (educationCards.length === 0) {
    const eduLines = lines
      .filter((l) =>
        /(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma)/i.test(l),
      )
      .map((l) => l.trim())
      .filter(Boolean);
    if (eduLines.length) {
      eduLines.forEach((l, idx) => educationCards.push({ id: idx + 1, value: l }));
    }
  }

  // Final fallbacks: ensure at least one card is created so UI shows data
  if (experienceCards.length === 0 && text && text.trim().length > 30) {
    const snippet = text.trim().slice(0, 220);
    experienceCards.push({
      id: 1,
      title: snippet.split('.')[0] || 'ניסיון תעסוקתי',
      company: '',
      companyField: '',
      startDate: '2000-01',
      endDate: '2000-12',
      description: snippet,
    });
  }
  if (educationCards.length === 0) {
    const eduMatch = text.match(/.{0,50}(אוניברסיט|מכללה|college|university|degree|b\.?a|bcom|bsc|msc|m\.a|phd|mba|תואר|לימוד|studies|certif|certificate|תעודה|diploma).{0,80}/i);
    const eduText = eduMatch ? eduMatch[0].trim() : text.trim().slice(0, 150);
    if (eduText) {
      educationCards.push({ id: 1, value: eduText });
    }
  }

  return {
    email: emailMatch ? emailMatch[0] : undefined,
    phone: phoneMatch ? phoneMatch[0] : undefined,
    fullName: nameCandidate,
    address: addressCandidate,
    gender: genderCandidate,
    title: titleLine,
    professionalSummary: summary,
    workExperience: experienceCards,
    education: educationCards,
  };
};

const buildParsedUpdates = (candidate, text) => {
  const parsed = extractStructuredFields(text);
  const updates = {};
  if (parsed.email && parsed.email !== candidate.email) updates.email = parsed.email;
  if (parsed.phone && parsed.phone !== candidate.phone) updates.phone = parsed.phone;
  if (parsed.fullName && parsed.fullName !== candidate.fullName) updates.fullName = parsed.fullName;
  if (parsed.address && parsed.address !== candidate.address) updates.address = parsed.address;
  if (parsed.gender && parsed.gender !== candidate.gender) updates.gender = parsed.gender;
  if (parsed.title && parsed.title !== candidate.title) updates.title = parsed.title;
  if (parsed.professionalSummary && parsed.professionalSummary !== candidate.professionalSummary) {
    updates.professionalSummary = parsed.professionalSummary;
  }
  if (parsed.workExperience && parsed.workExperience.length) {
    updates.workExperience = parsed.workExperience
      .map((item, idx) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (!text) return null;
          const yearMatch = text.match(/(20\d{2}|19\d{2})/);
          const year = yearMatch ? `${yearMatch[1]}-01` : '2000-01';
          return {
            id: idx + 1,
            title: text,
            company: '',
            companyField: '',
            startDate: year,
            endDate: year,
            description: text,
          };
        }
        if (item && typeof item === 'object') {
          const title = item.title || item.value || item.description || '';
          const description = item.description || title;
          if (!title && !description) return null;
          const startDate = item.startDate || '2000-01';
          const endDate = item.endDate || startDate;
          return {
            id: item.id || idx + 1,
            title: title || 'ניסיון תעסוקתי',
            company: item.company || '',
            companyField: item.companyField || '',
            startDate,
            endDate,
            description,
          };
        }
        return null;
      })
      .filter(Boolean);
  }
  if (parsed.education && parsed.education.length) {
    updates.education = parsed.education
      .map((item, idx) => {
        if (typeof item === 'string') {
          const text = item.trim();
          if (!text) return null;
          return { id: idx + 1, value: text };
        }
        if (item && typeof item === 'object') {
          const val = item.value || item.title || item.description || '';
          if (!val) return null;
          return { id: item.id || idx + 1, value: val };
        }
        return null;
      })
      .filter(Boolean);
  }
  return updates;
};

const rebuildAllEmbeddings = async (_req, res) => {
  try {
    const candidates = await candidateService.list();
    let success = 0;
    let fail = 0;

    for (const c of candidates) {
      try {
        let extraText = '';
        if (c.resumeUrl) {
          extraText = await fetchResumeText(c.resumeUrl, c.id);
        }
        const updates = buildParsedUpdates(c, extraText);
        if (Object.keys(updates).length) {
          await candidateService.update(c.id, updates);
        }
        await embedCandidateAndSave(c.id, extraText);
        success++;
      } catch (e) {
        fail++;
        console.error('rebuildAllEmbeddings failed', c.id, e.message || e);
      }
    }

    res.json({ success, fail, total: candidates.length });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to rebuild embeddings' });
  }
};

// Rebuild embedding from stored candidate data (optionally with extra CV text)
const rebuildEmbedding = async (req, res) => {
  try {
    const { extraText } = req.body || {};
    const embedding = await embedCandidateAndSave(req.params.id, extraText || '');
    res.json({ embedding });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Failed to rebuild embedding' });
  }
};

// Semantic search endpoint
const semanticSearch = async (req, res) => {
  try {
    const { query, filters, limit } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ message: 'query is required' });
    }
    const results = await searchCandidates({ query, filters, limit: limit || 20 });
    res.json(results);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Semantic search failed' });
  }
};

// Lightweight free-text search on name / title / source only
const freeSearch = async (req, res) => {
  try {
    const { query, limit } = req.body || {};
    if (!query || !query.trim()) {
      return res.status(400).json({ message: 'query is required' });
    }
    const results = await candidateService.searchFree({ query, limit: limit || 50 });
    res.json(results);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Free search failed' });
  }
};

module.exports = {
  list,
  getByUser,
  get,
  create,
  createFromAi,
  update,
  remove,
  createUploadUrl,
  attachMedia,
  rebuildEmbedding,
  rebuildAllEmbeddings,
  semanticSearch,
  freeSearch,
  generateExperienceSummary,
};


