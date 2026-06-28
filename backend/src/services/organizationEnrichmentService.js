'use strict';

/**
 * organizationEnrichmentService
 * Full company enrichment (same field set as POST /api/organizations/enrich)
 * and persists directly to Organization — used after create_company AI decisions.
 */

const axios = require('axios');
const Organization = require('../models/Organization');
const promptService = require('./promptService');
const picklistService = require('./picklistService');
const { sendChat, resolveGeminiApiKey } = require('./geminiService');
const { normalizeEmployeeCount } = require('../utils/normalizeEmployeeCount');
const { filterSerpOrganicResults } = require('../utils/filterSerpOrganicResults');
const { scheduleOrganizationEmbedding } = require('./organizationEmbeddingService');
const { buildCompanyEnrichmentPrompt } = require('../prompts/companyEnrichmentPrompt');

const ACTIVITY_STATUSES = new Set(['פעילה', 'לא פעילה', 'בפירוק', 'לא ידוע']);

// ── prompt (aligned with organizationController.enrich) ─────────────────────

const fallbackCompanyPrompt = (companyNames, mainFieldOptions = [], website = '', snippet = '') =>
  buildCompanyEnrichmentPrompt({ companyNames, mainFieldOptions, website, snippet });

const buildCompanyPrompt = async (companyData) => {
  const mainFieldOptions = await picklistService.getMainFieldOptionNames();
  const companyNames = [companyData.name];
  const website = companyData.website || '';
  const snippet = companyData.snippet || '';

  try {
    const record = await promptService.ensureById('company_enrichment');
    const template = record?.template || '';
    if (template) {
      let out = template;
      if (out.includes('{{company_names_json}}')) {
        out = out.replace('{{company_names_json}}', JSON.stringify(companyNames));
      }
      if (out.includes('${companyNamesJson}')) {
        out = out.replace('${companyNamesJson}', JSON.stringify(companyNames));
      }
      if (out.includes('${mainFieldJson}')) {
        out = out.replace('${mainFieldJson}', JSON.stringify(mainFieldOptions));
      }
      if (out.includes('${website}')) {
        out = out.replace('${website}', website);
      }
      if (out.includes('${snippet}')) {
        out = out.replace('${snippet}', snippet);
      }
      return out;
    }
  } catch {
    // fall through
  }
  return fallbackCompanyPrompt(companyNames, mainFieldOptions, website, snippet);
};

// ── JSON helpers ──────────────────────────────────────────────────────────────

const sanitizeEllipsis = (text) =>
  text.replace(/,\s*"[^"]+":\s*"[^"…]*…[^"]*"(?!,|\s*\})/g, '');

const parseJsonResponse = (raw) => {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  try { return JSON.parse(text); } catch { /* fall through */ }

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(sanitizeEllipsis(arrMatch[0])); } catch { /* fall through */ }
  }

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(sanitizeEllipsis(objMatch[0])); } catch { /* fall through */ }
  }
  return null;
};

// ── Serper helpers ────────────────────────────────────────────────────────────

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

const searchSnippet = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const q = hasHebrew(companyName) ? `${companyName} חברה` : `${companyName} company`;
    const data = await serperRaw(q, 3);
    const top = (data?.organic || [])[0];
    return top?.snippet ? String(top.snippet).trim() : null;
  } catch (err) {
    console.warn('[orgEnrich] snippet search failed:', err?.message || err);
    return null;
  }
};

const extractFoundedYear = (serperData) => {
  const attrs = serperData?.knowledgeGraph?.attributes || {};
  for (const [key, val] of Object.entries(attrs)) {
    if (/found|נוסד|הוקמ/i.test(key)) {
      const m = String(val).match(/\b(19|20)\d{2}\b/);
      if (m) return m[0];
    }
  }
  for (const result of (serperData?.organic || []).slice(0, 3)) {
    const text = String(result.snippet || '');
    if (/נוסד|הוקמ|שנת|מאז|founded|since/i.test(text)) {
      const m = text.match(/\b(19|20)\d{2}\b/);
      if (m) return m[0];
    }
  }
  return null;
};

const ADDRESS_INDICATORS = /רחוב|רח׳|א\.ת|קומה|בניין|מגדל|כתובת|שד'/i;

const cleanAddressFromRaw = (raw) => {
  if (!raw) return null;
  const s = String(raw);
  const afterKw = s.match(/כתובת[:\s]+(.+?)(?=\s*[|・]\s*|\s*טלפון|\s*פקס|\s*שעות|\s*$)/i);
  if (afterKw) {
    const candidate = afterKw[1]
      .replace(/\s+/g, ' ')
      .replace(/\s*\.{2,}\s*$/, '')
      .replace(/[.!\s]+$/, '')
      .replace(/,\s*[\u0590-\u05FF]$/, '')
      .trim();
    if (candidate.length > 5 && !/טלפון|פקס|שעות|@|http/i.test(candidate)) return candidate;
  }
  if (!/טלפון|פקס|שעות|・/.test(s)) {
    return s
      .replace(/\s*\.{2,}\s*$/, '')
      .replace(/[.!\s]+$/, '')
      .replace(/,\s*[\u0590-\u05FF]$/, '')
      .trim() || null;
  }
  return null;
};

const extractLocation = (serperData) => {
  const attrs = serperData?.knowledgeGraph?.attributes || {};
  for (const [key, val] of Object.entries(attrs)) {
    if (/עיר|מיקום|location|city/i.test(key)) return String(val).trim();
  }
  const kgAddr = serperData?.knowledgeGraph?.address;
  if (kgAddr) {
    const cityMatch = String(kgAddr).match(/\d+\s*,\s*([\u0590-\u05FF][^,\d\n]{2,}?)(?:\s*,|\s*$)/);
    if (cityMatch) return cityMatch[1].trim();
  }
  for (const result of (serperData?.organic || []).slice(0, 5)) {
    const snippet = String(result.snippet || '');
    if (!ADDRESS_INDICATORS.test(snippet)) continue;
    const cityMatch = snippet.match(/(?:רחוב|רח׳)[^,\d]*\d+\s*,\s*([\u0590-\u05FF][^,\d\n]{2,}?)(?:\s*,|\s*$)/i);
    if (cityMatch) return cityMatch[1].trim();
  }
  return null;
};

const extractAddress = (serperData) => {
  if (serperData?.knowledgeGraph?.address) {
    const clean = cleanAddressFromRaw(serperData.knowledgeGraph.address);
    if (clean) return clean;
  }
  for (const result of (serperData?.organic || []).slice(0, 5)) {
    const snippet = String(result.title || '');
    if (!ADDRESS_INDICATORS.test(snippet)) continue;
    const clean = cleanAddressFromRaw(snippet);
    if (clean) return clean;
    const m = snippet.match(/[^\n.!?]*(?:רחוב|רח׳|א\.ת|קומה|בניין|מגדל|שד')[^\n.!?]*/i);
    if (m) return m[0].replace(/,\s*[\u0590-\u05FF]$/, '').trim();
  }
  return null;
};

const searchFoundedYear = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const q = hasHebrew(companyName) ? `${companyName} שנת הקמה` : `${companyName} founded year`;
    return extractFoundedYear(await serperRaw(q, 5));
  } catch (err) {
    console.warn('[orgEnrich] founded year search failed:', err?.message || err);
    return null;
  }
};

const searchAddress = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return { address: null, location: null };
  try {
    const data = await serperRaw(`${companyName} כתובת`, 5);
    const organic = data?.organic || [];
    const geminiKey = resolveGeminiApiKey();

    if (geminiKey && organic.length) {
      try {
        const snippets = organic
          .slice(0, 5)
          .map(
            (r, i) =>
              `[${i + 1}] Title: ${r.title || ''}\n    Snippet: ${r.snippet || ''}\n    Link: ${r.link || ''}`,
          )
          .join('\n\n');

        const llmRes = await sendChat({
          apiKey: geminiKey,
          systemPrompt: `You extract a company's street address and city from Google search result snippets.
Return ONLY a valid JSON object with exactly two keys:
- "address": the street address (street name + number only). null if not found.
- "city": the city name only. null if not found.
Do NOT include phone numbers, fax, hours, or any extra text.`,
          history: [],
          message: `Company: ${companyName}\n\nSearch results:\n${snippets}\n\nExtract street address and city.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              address: { type: 'STRING', nullable: true },
              city: { type: 'STRING', nullable: true },
            },
          },
        });

        const obj = JSON.parse(llmRes);
        if (obj && (obj.address || obj.city)) {
          return { address: obj.address || null, location: obj.city || null };
        }
      } catch (llmErr) {
        console.warn('[orgEnrich] Gemini address extraction failed, falling back to regex:', llmErr?.message);
      }
    }

    return { address: extractAddress(data), location: extractLocation(data) };
  } catch (err) {
    console.warn('[orgEnrich] address search failed:', err?.message || err);
    return { address: null, location: null };
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

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

const toStrArray = (val) => {
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  const one = str(val);
  return one ? [one] : [];
};

const setStrArray = (updates, key, val) => {
  const arr = toStrArray(val);
  if (arr.length) updates[key] = arr;
};

// ── item post-processing (aligned with organizationController.enrich) ─────────

const filterSubFieldsToOptions = (raw, options) => {
  const allowed = new Set(options);
  const seen = new Set();
  const out = [];
  for (const s of toStrArray(raw)) {
    if (allowed.has(s) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
};

const buildSubFieldPicklistOptions = async (mainField, mainField2) => {
  const subcats = await picklistService.listSubcategories(picklistService.BUSINESS_FIELD_CATEGORY_ID);
  const mainFields = [];
  const primary = String(mainField || '').trim();
  if (primary) mainFields.push(primary);
  for (const mf of mainField2) {
    const t = String(mf || '').trim();
    if (t && !mainFields.includes(t)) mainFields.push(t);
  }

  const options = [];
  const subFieldToMainField = {};
  for (const mf of mainFields) {
    const mainCat = (subcats || []).find((c) => (c.name || '').trim() === mf);
    if (!mainCat) continue;
    const vals = await picklistService.listCategoryValues(mainCat.id);
    for (const v of vals || []) {
      const label = (v.label || v.value || '').trim();
      if (!label || options.includes(label)) continue;
      options.push(label);
      subFieldToMainField[label] = mf;
    }
  }
  return { options, subFieldToMainField };
};

const pickSubFieldsFromLlm = async (companyName, description, options, max = 3) => {
  const llmRaw = await sendChat({
    apiKey: resolveGeminiApiKey(),
    systemPrompt: `Company: ${companyName}. Description: ${String(description || '').slice(0, 300)}.
Return ONLY a JSON object with one key: "subField".
subField MUST be an array of 1 to ${max} strings.
Each string MUST be copied verbatim from this list: ${JSON.stringify(options)}.
Example: {"subField":["תת-תחום א","תת-תחום ב"]}`,
    history: [],
    message: companyName,
    responseMimeType: 'application/json',
  });
  const obj = parseJsonResponse(llmRaw);
  if (!obj || typeof obj !== 'object') return [];
  return filterSubFieldsToOptions(obj.subField, options).slice(0, max);
};

const resolveSubFieldFromPicklist = async (item, companyName) => {
  let mainField = item.mainField || '';
  const mainField2 = Array.isArray(item.mainField2) ? item.mainField2 : [];

  try {
    const { options, subFieldToMainField } = await buildSubFieldPicklistOptions(mainField, mainField2);
    if (!options.length) {
      item.subField = toStrArray(item.subField);
      item.mainField = mainField;
      return item;
    }

    let subFields = filterSubFieldsToOptions(item.subField, options);
    if (!subFields.length) {
      subFields = await pickSubFieldsFromLlm(companyName, item.description, options);
    }

    if (!mainField && subFields.length && subFieldToMainField[subFields[0]]) {
      mainField = subFieldToMainField[subFields[0]];
    }

    item.mainField = mainField;
    item.subField = subFields;

    // Normalize mainField2: additional industries only (never duplicate primary).
    const rawMf2 = Array.isArray(item.mainField2) ? item.mainField2 : [];
    item.mainField2 = rawMf2
      .map((f) => String(f || '').trim())
      .filter((f) => f && f !== (mainField || '').trim());
  } catch (e) {
    console.warn(`[orgEnrich] subField LLM failed for "${companyName}"`, e?.message);
    item.subField = toStrArray(item.subField);
  }

  return item;
};

const finalizeEnrichmentItem = async (item, companyName, prefetched = {}) => {
  const out = { ...item };

  if (prefetched.website && !out.website) out.website = prefetched.website;
  if (prefetched.snippet && !out.snippet) out.snippet = prefetched.snippet;

  await resolveSubFieldFromPicklist(out, companyName);

  if (!out.linkedinUrl) {
    try { out.linkedinUrl = await searchLinkedinUrl(companyName); } catch { /* ignore */ }
  }

  if (!out.foundedYear) {
    try { out.foundedYear = await searchFoundedYear(companyName); } catch { /* ignore */ }
  }

  if (!out.address || !out.location) {
    try {
      const { address, location } = await searchAddress(companyName);
      if (!out.address && address) out.address = address;
      if (!out.location && location) out.location = location;
    } catch { /* ignore */ }
  }

  if (!out.website) {
    try { out.website = await searchWebsiteUrl(companyName); } catch { /* ignore */ }
  }

  if (!out.snippet) {
    try { out.snippet = await searchSnippet(companyName); } catch { /* ignore */ }
  }

  if (out.employeeCount != null && out.employeeCount !== '') {
    const bucket = normalizeEmployeeCount(out.employeeCount);
    if (bucket) out.employeeCount = bucket;
    else delete out.employeeCount;
  }

  if (!out.logo && out.website) {
    try {
      const hostname = new URL(out.website).hostname;
      out.logo = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
    } catch {
      out.logo = '';
    }
  } else if (typeof out.logo === 'string') {
    out.logo = out.logo.trim();
  }

  return out;
};

const buildOrganizationUpdates = (item) => {
  const updates = {};

  const setStr = (key, val) => { if (val) updates[key] = val; };

  setStr('nameEn', str(item.nameEn));
  setStr('legalName', str(item.legalName));
  setStr('description', str(item.description));
  setStr('location', str(item.location));
  setStr('address', str(item.address));
  setStr('hqCountry', str(item.hqCountry));
  setStr('mainField', str(item.mainField));
  setStrArray(updates, 'subField', item.subField);
  setStr('secondaryField', str(item.secondaryField));
  setStr('website', str(item.website));
  setStr('logo', str(item.logo));
  setStr('linkedinUrl', str(item.linkedinUrl));
  setStr('snippet', str(item.snippet));
  setStr('type', str(item.type));
  setStr('classification', str(item.classification));
  setStrArray(updates, 'businessModel', item.businessModel);
  setStrArray(updates, 'productType', item.productType);
  setStr('growthIndicator', str(item.growthIndicator));
  setStr('structure', str(item.structure));
  setStr('parentCompany', str(item.parentCompany));
  setStr('growthTrend', str(item.growthTrend));
  setStr('dataConfidence', str(item.dataConfidence));
  setStr('relation', str(item.relation));
  setStr('email', str(item.email));
  setStr('phone', str(item.phone));

  if (item.foundedYear != null && String(item.foundedYear).trim()) {
    updates.foundedYear = String(item.foundedYear).trim();
  }

  if (item.employeeCount != null && item.employeeCount !== '') {
    const bucket = normalizeEmployeeCount(item.employeeCount);
    if (bucket) updates.employeeCount = bucket;
  }

  if (Array.isArray(item.aliases) && item.aliases.length) {
    updates.aliases = item.aliases.map(String).filter(Boolean);
  }
  if (Array.isArray(item.mainField2) && item.mainField2.length) {
    const primary = str(item.mainField);
    updates.mainField2 = item.mainField2
      .map(String)
      .map((f) => f.trim())
      .filter((f) => f && f !== primary);
  }
  if (Array.isArray(item.subsidiaries) && item.subsidiaries.length) {
    updates.subsidiaries = item.subsidiaries.map(String).filter(Boolean);
  }
  if (Array.isArray(item.techTags) && item.techTags.length) {
    updates.techTags = item.techTags.map(String).filter(Boolean);
  }
  if (Array.isArray(item.tags) && item.tags.length) {
    updates.tags = item.tags.map(String).filter(Boolean);
  }

  if (item.activityStatus && ACTIVITY_STATUSES.has(item.activityStatus)) {
    updates.activityStatus = item.activityStatus;
  }

  if (item.latitude != null && !Number.isNaN(Number(item.latitude))) {
    updates.latitude = Number(item.latitude);
  }
  if (item.longitude != null && !Number.isNaN(Number(item.longitude))) {
    updates.longitude = Number(item.longitude);
  }

  if (Object.keys(updates).length > 0) {
    updates.lastVerified = new Date().toISOString().split('T')[0];
  }

  return updates;
};

// ── core enrichment ───────────────────────────────────────────────────────────

const enrichOrganizationById = async (orgId) => {
  const org = await Organization.findByPk(orgId);
  if (!org) {
    console.warn(`[orgEnrich] org ${orgId} not found`);
    return null;
  }

  const companyName = (org.name || '').trim();
  if (!companyName) return null;

  console.log(`[orgEnrich] starting enrichment for "${companyName}" (${orgId})`);

  let website = org.website || null;
  if (!website) {
    try {
      website = await searchWebsiteUrl(companyName);
      if (website) console.log(`[orgEnrich] found website for "${companyName}": ${website}`);
    } catch {
      website = null;
    }
  }

  let snippet = org.snippet || null;
  if (!snippet) {
    try { snippet = await searchSnippet(companyName); } catch { snippet = null; }
  }

  const systemPrompt = await buildCompanyPrompt({ name: companyName, website, snippet });
  const messagePayload = JSON.stringify({ name: companyName, website, snippet });

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
    return null;
  }

  const rawItem = Array.isArray(parsedResponse) ? parsedResponse[0] : parsedResponse;
  if (!rawItem || typeof rawItem !== 'object') return null;

  const enriched = await finalizeEnrichmentItem(rawItem, companyName, { website, snippet });
  const updates = buildOrganizationUpdates(enriched);

  if (Object.keys(updates).length === 0) {
    console.log(`[orgEnrich] no enrichable fields returned for "${companyName}"`);
    return null;
  }

  await Organization.update(updates, { where: { id: orgId } });
  console.log(`[orgEnrich] enriched "${companyName}" (${orgId}) →`, Object.keys(updates).join(', '));

  scheduleOrganizationEmbedding({ id: orgId });
  return updates;
};

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
  buildOrganizationUpdates,
  finalizeEnrichmentItem,
  resolveSubFieldFromPicklist,
};
