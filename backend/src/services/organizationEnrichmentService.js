'use strict';

/**
 * organizationEnrichmentService
 * Calls the company_enrichment Gemini prompt for a single organization and
 * writes the enriched fields back to the Organization record.
 * Used as a fire-and-forget background step after create_company AI decisions.
 */

const axios = require('axios');
const Organization = require('../models/Organization');
const promptService = require('./promptService');
const picklistService = require('./picklistService');
const { sendChat, sendSingleTurnChat, resolveGeminiApiKey } = require('./geminiService');
const { normalizeEmployeeCount } = require('../utils/normalizeEmployeeCount');
const { filterSerpOrganicResults } = require('../utils/filterSerpOrganicResults');

// ── prompt helpers ────────────────────────────────────────────────────────────

const fallbackPrompt = (companyName) =>
  `You are a Corporate Intelligence Extraction Agent for an Israeli database.
Enrich this company: "${companyName}".
Return a valid JSON array with one object containing:
name, nameEn, description (Hebrew), location (Hebrew city), mainField (Hebrew), subField (Hebrew),
website, logo, employeeCount, foundedYear, linkedinUrl, techTags (English array), tags (Hebrew array).
If unknown use null. No extra text.`;

const buildPrompt = async (companyName, website = null) => {
  try {
    const record = await promptService.getById('company_enrichment');
    const template = record?.template || '';
    if (template) {
      return template
        .replace('{{company_names_json}}', JSON.stringify([companyName]))
        .replace('${companyNamesJson}', JSON.stringify([companyName]))
        .replace('${website}', website || '');
    }
  } catch {
    // fall through to fallback
  }
  return fallbackPrompt(companyName);
};

// ── JSON helpers ──────────────────────────────────────────────────────────────

/** Identical sanitisation used by organizationController.enrich */
const sanitizeEllipsis = (text) =>
  text.replace(/,\s*"[^"]+":\s*"[^"…]*…[^"]*"(?!,|\s*\})/g, '');

const parseJsonResponse = (raw) => {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // Try the whole string first (JSON-mode responses come back clean)
  try { return JSON.parse(text); } catch { /* fall through */ }

  // Extract the outermost array (greedy — handles nested arrays in values)
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(sanitizeEllipsis(arrMatch[0]));
    } catch { /* fall through */ }
  }

  // Extract an outermost object instead
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(sanitizeEllipsis(objMatch[0]));
    } catch { /* fall through */ }
  }

  return null;
};

// ── website search ────────────────────────────────────────────────────────────

const WEBSITE_EXCLUDED = [
  'linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
  'youtube.com', 'wikipedia.org', 'walla.co.il', 'ynet.co.il',
  'google.com', 'glassdoor.com', 'indeed.com', 'jobmaster.co.il',
];

const hasHebrew = (s) => /[\u0590-\u05FF]/.test(s);

const serperSearch = async (q, num = 5) => {
  const response = await axios.post(
    'https://google.serper.dev/search',
    { q, num },
    {
      headers: { 'X-API-KEY': process.env.SERPDEV, 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );
  return filterSerpOrganicResults(response.data?.organic);
};

const serperRaw = async (q, num = 5) => {
  const response = await axios.post(
    'https://google.serper.dev/search',
    { q, num },
    {
      headers: { 'X-API-KEY': process.env.SERPDEV, 'Content-Type': 'application/json' },
      timeout: 10000,
    },
  );
  return response.data;
};

// Priority A: knowledgeGraph attributes (Founded / נוסד)
// Priority B: scan first 3 snippets for a 4-digit year near founding keywords
const extractFoundedYear = (serperData) => {
  const attrs = serperData?.knowledgeGraph?.attributes || {};
  for (const [key, val] of Object.entries(attrs)) {
    if (/found|נוסד|הוקמ/i.test(key)) {
      const m = String(val).match(/\b(19|20)\d{2}\b/);
      if (m) return m[0];
    }
  }
  const organic = serperData?.organic || [];
  for (const result of organic.slice(0, 3)) {
    const text = String(result.snippet || '');
    if (/נוסד|הוקמ|שנת|מאז|founded|since/i.test(text)) {
      const m = text.match(/\b(19|20)\d{2}\b/);
      if (m) return m[0];
    }
  }
  return null;
};

// Loop 5 organic snippets for Israeli address indicators; fallback to knowledgeGraph
const ADDRESS_INDICATORS = /רחוב|א\.ת|קומה|בניין|מגדל|כתובת|שד'/i;
const extractAddress = (serperData) => {
  const organic = serperData?.organic || [];
  for (const result of organic.slice(0, 5)) {
    const snippet = String(result.snippet || '');
    if (ADDRESS_INDICATORS.test(snippet)) {
      const m = snippet.match(/[^\n.!?]*(?:רחוב|א\.ת|קומה|בניין|מגדל|שד')[^\n.!?]*/i);
      if (m) return m[0].trim();
      return snippet.slice(0, 200).trim();
    }
  }
  if (serperData?.knowledgeGraph?.address) return serperData.knowledgeGraph.address;
  return null;
};

const searchFoundedYear = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const isHebrew = /[\u0590-\u05FF]/.test(companyName);
    const q = isHebrew ? `${companyName} שנת הקמה` : `${companyName} founded year`;
    const data = await serperRaw(q, 5);
    return extractFoundedYear(data);
  } catch (err) {
    console.warn('[orgEnrich] founded year search failed:', err?.message || err);
    return null;
  }
};

const searchAddress = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const data = await serperRaw(`${companyName} כתובת`, 5);
    return extractAddress(data);
  } catch (err) {
    console.warn('[orgEnrich] address search failed:', err?.message || err);
    return null;
  }
};

const searchWebsiteUrl = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const q = `${companyName} ${hasHebrew(companyName) ? 'האתר הרשמי' : 'official website'}`;
    const results = await serperSearch(q);
    if (!results.length) return null;
    const official = results.find((r) => {
      if (!r.link) return false;
      const domain = r.link.toLowerCase();
      return !WEBSITE_EXCLUDED.some((ex) => domain.includes(ex));
    });
    return official?.link ? new URL(official.link).origin : null;
  } catch (err) {
    console.warn('[orgEnrich] website search failed:', err?.message || err);
    return null;
  }
};

const searchLinkedinUrl = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const results = await serperSearch(`${companyName} linkedin`);
    if (!results.length) return null;
    const hit =
      results.find((r) => r.link?.toLowerCase().includes('linkedin.com/company')) ||
      results.find((r) => r.link?.toLowerCase().includes('linkedin.com'));
    return hit?.link || null;
  } catch (err) {
    console.warn('[orgEnrich] linkedin search failed:', err?.message || err);
    return null;
  }
};

// ── core enrichment ───────────────────────────────────────────────────────────

const enrichOrganizationById = async (orgId) => {
  const org = await Organization.findByPk(orgId);
  if (!org) {
    console.warn(`[orgEnrich] org ${orgId} not found`);
    return;
  }

  const companyName = (org.name || '').trim();
  if (!companyName) return;

  console.log(`[orgEnrich] starting enrichment for "${companyName}" (${orgId})`);

  // Search for website first so it can be injected into the prompt via ${website}
  let website = org.website || null;
  if (!website) {
    try {
      website = await searchWebsiteUrl(companyName);
      if (website) console.log(`[orgEnrich] found website for "${companyName}": ${website}`);
    } catch {
      website = null;
    }
  }

  const systemPrompt = await buildPrompt(companyName, website);

  // User-turn also carries the website for additional context
  const messagePayload = JSON.stringify({
    name: companyName,
    website,
  });

  // Use sendChat with JSON mode so Gemini returns valid JSON reliably
  const rawResponse = await sendChat({
    apiKey: resolveGeminiApiKey(),
    systemPrompt,
    history: [],
    message: messagePayload,
    responseMimeType: 'application/json',
  });

  const parsedResponse = parseJsonResponse(rawResponse);
  if (!parsedResponse) {
    console.warn(`[orgEnrich] could not parse JSON for "${companyName}". Raw:`, String(rawResponse).substring(0, 300));
    return;
  }

  // Response can be an array [{...}] or a plain object {...}
  const item = Array.isArray(parsedResponse) ? parsedResponse[0] : parsedResponse;
  if (!item || typeof item !== 'object') return;

  // Resolve subField from picklist when mainField is available
  let subField = item.subField || '';
  const mainField = item.mainField || '';
  if (mainField) {
    try {
      const subcats = await picklistService.listSubcategories(picklistService.BUSINESS_FIELD_CATEGORY_ID);
      const mainCat = (subcats || []).find((c) => (c.name || '').trim() === mainField.trim());
      if (mainCat) {
        const vals = await picklistService.listCategoryValues(mainCat.id);
        const options = (vals || []).map((v) => (v.label || v.value || '').trim()).filter(Boolean);
        if (options.length) {
          const llmRaw = await sendChat({
            apiKey: resolveGeminiApiKey(),
            systemPrompt: `Company: ${companyName}. Description: ${(item.description || '').slice(0, 300)}.
Return ONLY a JSON object with one key "subField". subField MUST be exactly one of: ${JSON.stringify(options)}.`,
            history: [],
            message: companyName,
            responseMimeType: 'application/json',
          });
          const sub = parseJsonResponse(llmRaw);
          if (sub?.subField && options.includes(sub.subField)) subField = sub.subField;
        }
      }
    } catch (e) {
      console.warn(`[orgEnrich] subField LLM failed for "${companyName}"`, e?.message);
    }
  }

  // Use pre-fetched website as fallback when LLM did not return one
  const finalWebsite = item.website || website || null;

  // Search LinkedIn if LLM did not provide one
  let linkedinUrl = item.linkedinUrl || null;
  if (!linkedinUrl) {
    try {
      linkedinUrl = await searchLinkedinUrl(companyName);
    } catch {
      linkedinUrl = null;
    }
  }

  // Search founded year if LLM did not provide one
  let foundedYear = item.foundedYear ? String(item.foundedYear) : null;
  if (!foundedYear) {
    try {
      foundedYear = await searchFoundedYear(companyName);
    } catch {
      foundedYear = null;
    }
  }

  // Search physical address if LLM did not provide one
  let address = item.address || null;
  if (!address) {
    try {
      address = await searchAddress(companyName);
    } catch {
      address = null;
    }
  }

  // Derive logo from website favicon if not provided by LLM
  let logo = typeof item.logo === 'string' ? item.logo.trim() : '';
  if (!logo && finalWebsite) {
    try {
      const hostname = new URL(finalWebsite).hostname;
      logo = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      logo = '';
    }
  }

  // Normalize employee count to a canonical bucket string
  let employeeCount = item.employeeCount ?? null;
  if (employeeCount != null && employeeCount !== '') {
    const bucket = normalizeEmployeeCount(employeeCount);
    employeeCount = bucket || null;
  }

  const updates = {};
  if (item.nameEn)       updates.nameEn        = item.nameEn;
  if (item.description)  updates.description   = item.description;
  if (item.location)     updates.location      = item.location;
  if (mainField)         updates.mainField     = mainField;
  if (subField)          updates.subField      = subField;
  if (finalWebsite)      updates.website       = finalWebsite;
  if (logo)              updates.logo          = logo;
  if (employeeCount)     updates.employeeCount = employeeCount;
  if (foundedYear)       updates.foundedYear   = foundedYear;
  if (linkedinUrl)       updates.linkedinUrl   = linkedinUrl;
  if (address)           updates.address       = address;
  if (Array.isArray(item.techTags) && item.techTags.length) updates.techTags = item.techTags;
  if (Array.isArray(item.tags)     && item.tags.length)     updates.tags     = item.tags;

  if (Object.keys(updates).length === 0) {
    console.log(`[orgEnrich] no enrichable fields returned for "${companyName}"`);
    return;
  }

  await Organization.update(updates, { where: { id: orgId } });
  console.log(`[orgEnrich] enriched "${companyName}" (${orgId}) →`, Object.keys(updates).join(', '));
};

// ── fire-and-forget scheduler ─────────────────────────────────────────────────

const scheduleOrganizationEnrichment = (org) => {
  if (!org?.id) return;
  setImmediate(() => {
    enrichOrganizationById(org.id).catch((err) => {
      console.error('[orgEnrich] background enrichment failed', org.id, err?.message || err);
    });
  });
};

module.exports = {
  enrichOrganizationById,
  scheduleOrganizationEnrichment,
};
