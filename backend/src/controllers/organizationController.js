const organizationService = require('../services/organizationService');
const promptService = require('../services/promptService');

const { sendSingleTurnChat } = require('../services/geminiService');

const fallbackCompanyPrompt = (companyNames) => `
You are a Corporate Intelligence Extraction Agent for an Israeli database.

I have a list of Israeli companies: ${JSON.stringify(companyNames)}.

*MANDATORY INSTRUCTIONS:*

1. *LANGUAGE RULES:* 

   - 'description', 'location', 'mainField', 'subField' MUST be in *HEBREW*.

   - 'techTags' MUST be in *ENGLISH* (e.g. React, Python, AWS).

   - 'tags' (general tags) MUST be in *HEBREW* (e.g. שיווק דיגיטלי, ניהול).

2. *LOCATION ACCURACY:*

   - Provide the specific City name in Hebrew (e.g., 'פתח תקווה', 'הרצליה', 'קיסריה', 'איירפורט סיטי').

   - For "Nisko", use "איירפורט סיטי" or "רמת גן" based on the main entity. Do NOT use "Petah Tikva" unless verified for a specific branch.

3. *DATA ENRICHMENT:*

   - Use the *Google Search tool* to find real data.

   - Infer 'Business Model', 'Growth Indicator'.

   - Identify 'Corporate Structure' (Parent/Subsidiary).

4. *ALIASES:*

   - Provide known 'aliases' or variations of the name in Hebrew and English.

Return a valid JSON array matching this structure:

[

  {

    "name": "Common Name",

    "nameEn": "English Name",

    "legalName": "Full Legal Name",

    "aliases": ["Alias 1", "Alias 2"],

    "description": "Hebrew description (2 sentences)",

    "mainField": "Industry Primary in Hebrew",

    "subField": "Industry Secondary in Hebrew",

    "employeeCount": "estimate range",

    "website": "url",

    "linkedinUrl": "url", 

    "foundedYear": "YYYY",

    "location": "City Name (Hebrew)",

    "hqCountry": "Country (English)",

    "type": "one of ['הייטק', 'תעשייה', 'מסחר וקמעונאות', 'שירותים', 'פיננסים', 'נדל\"ן', 'אחר']",

    "classification": "one of ['פרטית', 'ציבורית', 'ממשלתית', 'מלכ\"ר']",

    "businessModel": "one of ['B2B', 'B2C', 'B2G', 'Mixed', 'Unknown']",

    "productType": "one of ['Product', 'Service', 'Platform', 'Project', 'Unknown']",

    "growthIndicator": "one of ['Growing', 'Stable', 'Shrinking', 'Unknown']",

    "structure": "one of ['Independent', 'Parent', 'Subsidiary']",

    "parentCompany": "Name of parent if Subsidiary",

    "subsidiaries": ["Name1", "Name2"],

    "tags": ["Tag1 (Hebrew)", "Tag2 (Hebrew)"],

    "techTags": ["Tech1 (English)", "Tech2 (English)"],

    "dataConfidence": "one of ['High', 'Medium', 'Low']"

  }

]

check that all fields exist and good for the table schema`;

let companyPromptTemplate = null;
const loadCompanyPromptTemplate = async () => {
  try {
    const record = await promptService.getById('company_enrichment');
    companyPromptTemplate = record.template;
  } catch (err) {
    console.warn('[organization-enrich] missing company_enrichment prompt', err.message || err);
    companyPromptTemplate = null;
  }
  return companyPromptTemplate;
};

const buildCompanyPrompt = async (companyNames) => {
  const template = await loadCompanyPromptTemplate();
  if (template) {
    if (template.includes('${company_names_json}')) {
      return template.replace('${company_names_json}', JSON.stringify(companyNames));
    }
    return template;
  }
  return fallbackCompanyPrompt(companyNames);
};

const list = async (_req, res) => {
  const orgs = await organizationService.list();
  res.json(orgs);
};

const get = async (req, res) => {
  try {
    const org = await organizationService.getById(req.params.id);
    res.json(org);
  } catch (err) {
    res.status(err.status || 404).json({ message: err.message || 'Not found' });
  }
};

const create = async (req, res) => {
  try {
    const org = await organizationService.create(req.body);
    res.status(201).json(org);
  } catch (err) {
    res.status(err.status || 400).json({
      message: err.message || 'Create failed',
      existing: err.existing,
    });
  }
};

const update = async (req, res) => {
  try {
    const org = await organizationService.update(req.params.id, req.body);
    res.json(org);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    await organizationService.remove(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const enrich = async (req, res) => {
  const { companyIds } = req.body || {};
  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    return res.status(400).json({ message: 'companyIds are required' });
  }

  try {
    const companies = await organizationService.getByIds(companyIds);
    if (!companies.length) {
      return res.status(404).json({ message: 'No companies found to enrich' });
    }

    const companyNames = companies.map((c) => c.name || c.title || c.company).filter(Boolean);
    const systemPrompt = await buildCompanyPrompt(companyNames);
    const response = await sendSingleTurnChat({
      apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
      systemPrompt, 
      message: companyNames[0],
    });

    const jsonMatch = response.match(/\[\s*[\s\S]*\s*]/);
    const rawJson = jsonMatch ? jsonMatch[0] : '[]';
    const quotedTrimmed = rawJson.trim().replace(/^['"]+|['"]+$/g, '');
    const sanitizeEllipsis = (text) =>
      text.replace(/,\s*"[^"]+":\s*"[^"…]*…[^"]*"(?!,|\s*\})/g, '');
    const jsonStr = sanitizeEllipsis(quotedTrimmed);
    let parsed = [];
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('Failed to parse enrichment response', parseError);
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      return res.status(500).json({ message: 'Invalid enrichment response' });
    }

    const nameIndex = new Map();
    companies.forEach((org) => {
      const key = (org.name || '').trim().toLowerCase();
      if (key) nameIndex.set(key, org.id);
      const alt = (org.nameEn || '').trim().toLowerCase();
      if (alt) nameIndex.set(alt, org.id);
    });

    const suggestions = parsed.map((item) => {
      const canonical = (item.name || item.companyName || item.nameEn || '').trim().toLowerCase();
      const matchedId = canonical ? nameIndex.get(canonical) : null;
      return {
        companyId: companyIds[0],
        companyName: item.name || item.companyName || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        techTags: Array.isArray(item.techTags) ? item.techTags : [],
        enriched: { ...item },
      };
    }).filter(s => s.companyName);

    const enrichmentMap = suggestions.reduce((acc, suggestion) => {
      if (suggestion.companyId) acc[suggestion.companyId] = suggestion.enriched;
      return acc;
    }, {});

    res.json({ suggestions, enrichmentMap });
  } catch (err) {
    console.error('[organization-enrich-error]', err);
    res.status(err.status || 500).json({ message: err.message || 'AI enrichment failed' });
  }
};

module.exports = { list, get, create, update, remove, enrich };

