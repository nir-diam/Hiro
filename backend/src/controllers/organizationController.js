const organizationService = require('../services/organizationService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const axios = require('axios');
const CandidateOrganization = require('../models/CandidateOrganization');
const Candidate = require('../models/Candidate');
const Organization = require('../models/Organization');

const { sendSingleTurnChat } = require('../services/geminiService');

const fallbackCompanyPrompt = (companyNames, mainFieldOptions = []) => {
 
  const mainFieldJson = JSON.stringify(mainFieldOptions);
  const companyNamesJson = JSON.stringify(companyNames);
  return `
You are a Data Architect specialized in the Israeli Labor Market and Corporate Intelligence.

TASK: Enrich ONLY the specific company names provided in this list: ${companyNamesJson}.
Use Google Search and your internal knowledge to provide real, accurate data for each entity.

*MANDATORY INSTRUCTIONS:*

1. STRICT RULES:
   - NO HALLUCINATION: If a company is not found, return "Unknown" or null for its specific fields, but always return the JSON object for that name.
   - LANGUAGE RULES:
   - Hebrew: description, location, mainField, subField, secondaryField, tags, legalName.
   - English: nameEn, techTags, hqCountry.
   - LOCATION ACCURACY: Provide the specific City name in Hebrew (e.g., 'פתח תקווה', 'הרצליה', 'איירפורט סיטי'). Do NOT use general districts.
   -  DATA ENRICHMENT: Every object MUST include exhaustive 'tags' (Hebrew) and 'techTags' (English) based on the company's activity and job requirements.

2. *MAINFIELD (CRITICAL):*

   - 'mainField' MUST be exactly one of these values (copy verbatim, do not invent): ${mainFieldJson}.
   - Choose the single best match for the company's primary industry. Do NOT create or paraphrase any other value.

DATA SPECIFICATIONS:
- description: 2-3 sentences in Hebrew about the company's core business.
- employeeCount: Must be one of ['1-10', '11-50', '51-200', '201-1000', '1000+', '10000+'].
- type: Must be one of ['הייטק', 'תעשייה', 'מסחר וקמעונאות', 'שירותים', 'פיננסים', 'נדל"ן', 'אחר'].
- classification: Must be one of ['פרטית', 'ציבורית', 'ממשלתית', 'מלכ"ר'].
- dataConfidence: Set based on the quality of search results ('High', 'Medium', 'Low').

OUTPUT FORMAT: Return ONLY a valid JSON array. No conversational text, no headers, no markdown outside the JSON block.

JSON STRUCTURE:
[

  {

    "name": "Common Name",

    "nameEn": "English Name",

    "legalName": "Full Legal Name",

    "aliases": ["Alias 1", "Alias 2"],

    "description": "Hebrew description (2 sentences)",

    "mainField": "MUST be exactly one of: ${mainFieldJson}",

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
};

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
  const mainFieldOptions = await picklistService.getMainFieldOptionNames();
  const template = await loadCompanyPromptTemplate();
  if (template) {
    let out = template;
    if (out.includes('${companyNamesJson}')) {
      out = out.replace('${companyNamesJson}', JSON.stringify(companyNames));
    }
    if (out.includes('${mainFieldJson}')) {
      out = out.replace('${mainFieldJson}', JSON.stringify(mainFieldOptions));
    }
    return out;
  }
  return fallbackCompanyPrompt(companyNames, mainFieldOptions);
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

// Parse year from experience date string (YYYY-MM, YYYY, or "Present")
const parseExperienceYear = (s) => {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  if (/present|כיום/i.test(t)) return new Date().getFullYear();
  const match = t.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
};

// Compute years in company from experience entries that match org name/aliases
const yearsInCompanyForOrg = (experience, orgName, aliases = []) => {
  const names = new Set([
    (orgName || '').trim().toLowerCase(),
    ...(Array.isArray(aliases) ? aliases : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean),
  ]);
  if (!names.size) return null;
  let totalYears = 0;
  const exp = Array.isArray(experience) ? experience : [];
  for (const item of exp) {
    const company = String(item?.company || '').trim().toLowerCase();
    if (!company || !names.has(company)) continue;
    const start = parseExperienceYear(item.startDate);
    const end = parseExperienceYear(item.endDate);
    if (start != null && end != null && end >= start) totalYears += end - start;
  }
  return totalYears > 0 ? totalYears : null;
};

// List candidates linked to an organization via CandidateOrganization
const listCandidates = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'Missing organization id' });

    const [org, links] = await Promise.all([
      Organization.findByPk(id, { attributes: ['name', 'aliases'] }),
      CandidateOrganization.findAll({ where: { organizationId: id } }),
    ]);
    const candidateIds = Array.from(
      new Set(links.map((link) => link.candidateId).filter(Boolean)),
    );
    if (!candidateIds.length) return res.json([]);

    const candidates = await Candidate.findAll({
      where: { id: candidateIds },
      attributes: ['id', 'fullName', 'title', 'lastActivity', 'status', 'experience', 'workExperience'],
    });

    const orgName = org?.name || '';
    const aliases = org?.aliases || [];
    const payload = candidates.map((c) => {
      const row = c.toJSON ? c.toJSON() : { ...c.get() };
      const { experience, workExperience, ...rest } = row;
      const combinedExperience = [
        ...(Array.isArray(experience) ? experience : []),
        ...(Array.isArray(workExperience) ? workExperience : []),
      ];
      rest.yearsInCompany = yearsInCompanyForOrg(combinedExperience, orgName, aliases);
      return rest;
    });

    res.json(payload);
  } catch (err) {
    console.error('[organizationController.listCandidates]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to list candidates' });
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

    const getDomain = (url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
    };

    const verifyLogoUrl = async (logoUrl) => {
      if (!logoUrl) return null;
      try {
        const res = await axios.head(logoUrl, { timeout: 5000 });
        const contentType = res.headers['content-type'] || '';
        if (contentType.startsWith('image/')) return logoUrl;
        return null;
      } catch {
        return null;
      }
    };

    const searchOfficialWebsite = async (companyName) => {
      if (!companyName) return null;

      const query = `${companyName} official website`;

      try {
        const response = await axios.get('https://serpapi.com/search.json', {
          params: {
            engine: 'google',
            q: query,
            api_key: process.env.SERPAPI_KEY,
            num: 5,
          },
          timeout: 10000,
        });

        const results = response.data?.organic_results;
        if (!results?.length) return null;

        const companySlug = String(companyName).toLowerCase().replace(/\s/g, '');
        const official = results.find(
          (r) => r.link && r.link.toLowerCase().includes(companySlug)
        );

        const chosen = official || results[0];
        if (!chosen?.link) return null;

        const domain = getDomain(chosen.link);
        const logoDevToken = process.env.LOGODEV_TOKEN;
        const logoUrl =
          domain && logoDevToken
            ? `https://img.logo.dev/${domain}?token=${logoDevToken}`
            : null;
        const logo = logoUrl ? await verifyLogoUrl(logoUrl) : null;

        return {
          link: chosen.link,
          domain,
          logo,
        };
      } catch (err) {
        console.error('[organization-enrich] SerpAPI search failed:', err.response?.data || err.message);
        return null;
      }
    };

    const searchLinkedinUrl = async (companyName) => {
      if (!companyName) return null;

      const query = `${companyName} linkedin`;

      try {
        const response = await axios.get('https://serpapi.com/search.json', {
          params: {
            engine: 'google',
            q: query,
            api_key: process.env.SERPAPI_KEY,
            num: 5,
          },
          timeout: 10000,
        });

        const results = response.data?.organic_results;
        if (!results || !results.length) return null;

        // Prefer official LinkedIn company pages
        const companyResult =
          results.find(
            (r) =>
              r.link &&
              r.link.toLowerCase().includes('linkedin.com/company'),
          ) ||
          results.find(
            (r) =>
              r.link &&
              r.link.toLowerCase().includes('linkedin.com'),
          );

        return companyResult?.link || null;
      } catch (err) {
        console.error('[organization-enrich] SerpAPI LinkedIn search failed:', err.response?.data || err.message);
        return null;
      }
    };

    const suggestions = (
      await Promise.all(
        parsed.map(async (item) => {
          const rawName = item.name || item.companyName || item.nameEn || '';
          const canonical = rawName.trim().toLowerCase();
          const matchedId = canonical ? nameIndex.get(canonical) : null;

          const companyId = matchedId || companyIds[0];
          const companyName = rawName.trim();
          if (!companyName) return null;

          let website = '';
            

          let logo = typeof item.logo === 'string' ? item.logo : '';

          const official = await searchOfficialWebsite(companyName);
          if (official?.link) {
            website = official.link;
          }
          if (official?.logo) {
            logo = official.logo;
          }

          // Fallback: Google favicon if Logo.dev did not return a valid image
          if (!logo && website) {
            try {
              const hostname = new URL(website).hostname;
              logo = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
            } catch {
              logo = '';
            }
          }


          //HERE!!! — mainField from item; subField = LLM picks one from PicklistCategoryValues of this mainField
          const mainField = item.mainField || '';
          let subField = item.subField || '';
          try {
            if (mainField) {
              const subcats = await picklistService.listSubcategories(picklistService.BUSINESS_FIELD_CATEGORY_ID);
              const mainFieldCat = (subcats || []).find((c) => (c.name || '').trim() === mainField.trim());
              if (mainFieldCat) {
                const vals = await picklistService.listCategoryValues(mainFieldCat.id);
                const subFieldOptions = (vals || []).map((v) => (v.label || v.value || '').trim()).filter(Boolean);
                if (subFieldOptions.length) {
                  const subJson = JSON.stringify(subFieldOptions);
                  const prompt = `Company: ${companyName}. Description: ${(item.description || '').slice(0, 300)}.
Return ONLY a JSON object with one key: "subField".
subField MUST be exactly one of (copy verbatim): ${subJson}.
Example: {"subField":"..."}`;
                  const llmRes = await sendSingleTurnChat({
                    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
                    systemPrompt: prompt,
                    message: prompt,
                  });
                  const objMatch = llmRes.match(/\{\s*[\s\S]*\s*\}/);
                  if (objMatch) {
                    const obj = JSON.parse(objMatch[0]);
                    if (obj.subField && subFieldOptions.includes(obj.subField)) subField = obj.subField;
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[organization-enrich] subField LLM failed', e?.message || e);
          }
          item.mainField = mainField;
          item.subField = subField;

          // People Data Labs company enrich (by domain) — fills employeeCount, foundedYear, linkedinUrl, address, growthTrend, etc.
          const domainForPdl = website ? getDomain(website) : null;
          if (domainForPdl && process.env.PDL_API_KEY) {
            try {
              const pdlRes = await axios.get('https://api.peopledatalabs.com/v5/company/enrich', {
                params: {
                  api_key: process.env.PDL_API_KEY,
                  website: domainForPdl,
                },
                timeout: 10000,
              });
              const pdl = pdlRes.data;
              if (pdl && pdl.status === 200) {
                if (pdl.employee_count != null) item.employeeCount = String(pdl.employee_count);
                if (pdl.size) item.employeeCount = item.employeeCount || pdl.size;
                if (pdl.founded != null) item.foundedYear = String(pdl.founded);
                if (pdl.linkedin_url) {
                  const lu = pdl.linkedin_url.trim();
                  item.linkedinUrl = lu.startsWith('http') ? lu : `https://${lu}`;
                }
                if (pdl.location) {
                  const loc = pdl.location;
                  if (loc.locality) item.location = loc.locality;
                  else if (loc.name) item.location = loc.name;
                  const parts = [loc.street_address, loc.address_line_2, loc.locality, loc.region, loc.country].filter(Boolean);
                  if (parts.length) item.address = parts.join(', ');
                  else if (loc.name) item.address = item.address || loc.name;
                  if (loc.geo && typeof loc.geo === 'string') {
                    const [latStr, lonStr] = loc.geo.split(',').map((s) => s && s.trim());
                    const lat = latStr && !Number.isNaN(Number(latStr)) ? Number(latStr) : null;
                    const lon = lonStr && !Number.isNaN(Number(lonStr)) ? Number(lonStr) : null;
                    if (lat != null) item.latitude = lat;
                    if (lon != null) item.longitude = lon;
                  }
                }
                if (pdl.latest_funding_stage) item.growthTrend = pdl.latest_funding_stage;
                else if (pdl.number_funding_rounds != null && pdl.number_funding_rounds > 0) item.growthTrend = `Funding rounds: ${pdl.number_funding_rounds}`;
              }
            } catch (err) {
              console.warn('[organization-enrich] PDL company enrich failed', err?.response?.data || err?.message || err);
            }
          }

          // Only search Google for LinkedIn URL if PDL did not return one
          if (!item.linkedinUrl) {
            try {
              item.linkedinUrl = await searchLinkedinUrl(companyName);
            } catch (err) {
              console.warn('[organization-enrich] linkedin search failed', err?.message || err);
            }
          }

          const enriched = { ...item, website: website || item.website, logo };

          return {
            companyId,
            companyName,
            tags: Array.isArray(item.tags) ? item.tags : [],
            techTags: Array.isArray(item.techTags) ? item.techTags : [],
            enriched,
          };
        }),
      )
    ).filter(Boolean);

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

module.exports = { list, get, create, update, remove, enrich, listCandidates };

