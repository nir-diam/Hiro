'use strict';

/**
 * organizationEnrichmentService
 * Full company enrichment (same field set as POST /api/organizations/enrich)
 * and persists directly to Organization — used after create_company AI decisions.
 */

const axios = require('axios');
const Organization = require('../models/Organization');
const { syncOrganizationToLinkedClients } = require('./clientOrganizationSyncService');
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

const serperSearch = async (q, num = 10) => {
  const response = await axios.post(
    "https://google.serper.dev/search",
    {
      q,
      num,

      // Country
      gl: "il",

      // Interface language
      hl: "iw",

      // User location
      location: "Israel",

      // Disable SafeSearch
      safe: "off",

      // Prefer recent index
      autocorrect: true,

      // Optional: if you search news
      // tbs: "qdr:m"
    },
    {
      timeout: 10000,
      headers: {
        "X-API-KEY": process.env.SERPDEV,
        "Content-Type": "application/json"
      }
    }
  );

  return filterSerpOrganicResults(response.data.organic);
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

/**
 * Run two Serper queries in parallel (website + general info) and return:
 *   - websiteCandidates: up to 5 deduplicated origin strings
 *   - contextText: formatted snippet block to inject into the Gemini prompt
 *
 * Using Serper ourselves avoids giving Gemini the googleSearch tool, which
 * causes TOO_MANY_TOOL_CALLS when the model tries to verify every field.
 */
const fetchSearchContext = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return { websiteCandidates: [], contextText: '' };
  try {
    const isHeb = hasHebrew(companyName);
    const queries = [
      isHeb ? `${companyName} אתר רשמי` : `${companyName} official website`,
      isHeb ? `${companyName} חברה מידע כתובת טלפון` : `${companyName} company address phone info`,
    ];
    // Run both queries in parallel
    const [websiteResults, infoResults] = await Promise.all(
      queries.map((q) => serperSearch(q, 5).catch(() => [])),
    );
    const allResults = [...websiteResults, ...infoResults];

    // Deduplicated website candidates (exclude social/directory sites)
    const seen = new Set();
    const websiteCandidates = [];
    for (const r of websiteResults) {
      if (!r.link || WEBSITE_EXCLUDED.some((ex) => r.link.toLowerCase().includes(ex))) continue;
      try {
        const origin = new URL(r.link).origin;
        if (!seen.has(origin)) { seen.add(origin); websiteCandidates.push(origin); }
      } catch { /* skip malformed URLs */ }
      if (websiteCandidates.length >= 5) break;
    }

    // Build a compact context block from snippets for the Gemini prompt
    const contextLines = allResults
      .filter((r) => r.snippet || r.title)
      .slice(0, 10)
      .map((r, i) => `[${i + 1}] ${r.title || ''}\n    URL: ${r.link || ''}\n    ${r.snippet || ''}`)
      .join('\n\n');

    return { websiteCandidates, contextText: contextLines };
  } catch (err) {
    console.warn('[orgEnrich] search context fetch failed:', err?.message || err);
    return { websiteCandidates: [], contextText: '' };
  }
};

// Kept for backward compat and as a direct Serper-only fallback
const getWebsiteCandidates = async (companyName) => {
  const { websiteCandidates } = await fetchSearchContext(companyName);
  return websiteCandidates;
};

/**
 * Serper-only fallback: return the first valid candidate (used when Gemini
 * already ran but didn't return a website).
 */
const searchWebsiteUrl = async (companyName) => {
  const candidates = await getWebsiteCandidates(companyName);
  return candidates[0] ?? null;
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

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_RE = /(?:\+972[\s-]?|0)(?:[\s-]?\d){8,10}/;

const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  return digits;
};

const pickBestEmail = (candidates = []) => {
  const skip = /noreply|no-reply|example\.com|sentry|wixpress|facebook|linkedin/i;
  return candidates.find((e) => e && !skip.test(String(e))) || null;
};

const extractContactFromSerper = (data) => {
  const kg = data?.knowledgeGraph || {};
  let phone = kg.phone ? normalizePhone(kg.phone) : null;
  let email = pickBestEmail([kg.email].filter(Boolean));

  const texts = (data?.organic || [])
    .slice(0, 5)
    .map((r) => `${r.title || ''} ${r.snippet || ''} ${r.link || ''}`)
    .join('\n');

  if (!phone) {
    const match = texts.match(PHONE_RE);
    if (match) phone = normalizePhone(match[0]);
  }
  if (!email) {
    const emails = texts.match(new RegExp(EMAIL_RE.source, 'g')) || [];
    email = pickBestEmail(emails);
  }

  return { phone, email };
};

const searchPhone = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  const q = hasHebrew(companyName) ? `${companyName} טלפון` : `${companyName} phone`;
  const results = await serperSearch(q, 5);
  const texts = (results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`).join('\n');
  const match = texts.match(PHONE_RE);
  return match ? normalizePhone(match[0]) : null;
};

const searchEmail = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  const q = hasHebrew(companyName) ? `${companyName} אימייל` : `${companyName} email`;
  const results = await serperSearch(q, 5);
  const texts = (results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`).join('\n');
  const emails = texts.match(new RegExp(EMAIL_RE.source, 'g')) || [];
  return pickBestEmail(emails);
};

const REGISTRATION_NUMBER_RE = /\b(\d{8,9})\b/g;

const searchRegistrationNumber = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return null;
  try {
    const q = hasHebrew(companyName)
      ? `${companyName} מספר חברה ח.פ רשם החברות`
      : `${companyName} Israeli company registration number`;
    const results = await serperSearch(q, 5);
    const texts = (results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`).join('\n');
    const candidates = [...texts.matchAll(REGISTRATION_NUMBER_RE)].map((m) => m[1]);
    return candidates.length ? candidates[0] : null;
  } catch (err) {
    console.warn('[orgEnrich] registration number search failed:', err?.message || err);
    return null;
  }
};

const searchPhoneAndEmail = async (companyName) => {
  if (!companyName || !process.env.SERPDEV) return { phone: null, email: null };
  try {
    const q = hasHebrew(companyName)
      ? `${companyName} יצירת קשר טלפון אימייל`
      : `${companyName} contact phone email`;
    let result = extractContactFromSerper(await serperRaw(q, 5));

    if (!result.email) {
      const extra = extractContactFromSerper(
        await serperRaw(`${companyName} ${hasHebrew(companyName) ? 'דוא"ל' : 'email'}`, 5),
      );
      if (extra.email) result = { ...result, email: extra.email };
      if (!result.phone && extra.phone) result = { ...result, phone: extra.phone };
    }

    const geminiKey = resolveGeminiApiKey();
    if (geminiKey && (!result.phone || !result.email)) {
      try {
        const data = await serperRaw(q, 5);
        const organic = data?.organic || [];
        if (organic.length) {
          const snippets = organic
            .slice(0, 5)
            .map(
              (r, i) =>
                `[${i + 1}] Title: ${r.title || ''}\n    Snippet: ${r.snippet || ''}\n    Link: ${r.link || ''}`,
            )
            .join('\n\n');

          const llmRes = await sendChat({
            apiKey: geminiKey,
            systemPrompt: `You extract a company's public contact phone and email from Google search snippets.
Return ONLY a valid JSON object with exactly two keys:
- "phone": Israeli phone number as digits (e.g. 03-1234567 or +972...). null if not found.
- "email": company contact email. null if not found.
Do NOT invent values. Skip noreply/no-reply addresses.`,
            history: [],
            message: `Company: ${companyName}\n\nSearch results:\n${snippets}\n\nExtract phone and email.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                phone: { type: 'STRING', nullable: true },
                email: { type: 'STRING', nullable: true },
              },
            },
          });

          const obj = parseJsonResponse(llmRes);
          if (obj && typeof obj === 'object') {
            if (!result.phone && obj.phone) result.phone = normalizePhone(obj.phone);
            if (!result.email && obj.email) result.email = pickBestEmail([String(obj.email).trim()]);
          }
        }
      } catch (llmErr) {
        console.warn('[orgEnrich] Gemini contact extraction failed:', llmErr?.message || llmErr);
      }
    }

    return result;
  } catch (err) {
    console.warn('[orgEnrich] contact search failed:', err?.message || err);
    return { phone: null, email: null };
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

const hasStoredContact = (org, field) => {
  const plain = org?.get ? org.get({ plain: true }) : org;
  return !!String(plain?.[field] || '').trim();
};

/** Never overwrite phone/email on persist when the org already has them. */
const applyContactPreserveOnUpdates = (updates, existingOrg) => {
  if (!updates || !existingOrg) return updates;
  if (hasStoredContact(existingOrg, 'phone')) delete updates.phone;
  if (hasStoredContact(existingOrg, 'email')) delete updates.email;
  return updates;
};

// ── Gemini extraction from pre-fetched Serper context ───────────────────────
/**
 * Call Gemini once with injected Serper search snippets as context.
 * We deliberately do NOT pass the googleSearch tool here — letting Gemini
 * call Google Search autonomously leads to TOO_MANY_TOOL_CALLS (50+ queries).
 * Instead, we supply the search results ourselves and ask Gemini to extract.
 *
 * @param {string} name
 * @param {string[]} [websiteCandidates=[]] - Origin URLs from Serper website search
 * @param {string} [contextText='']         - Formatted Serper snippets (title + URL + snippet)
 */
const searchAllFieldsWithGemini = async (name, websiteCandidates = [], contextText = '') => {
  const apiKey = resolveGeminiApiKey();
  if (!apiKey) return {};
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const isHebrew = /[\u0590-\u05FF]/.test(name);
  const lang = isHebrew ? 'Hebrew' : 'English';

  const candidatesSection = websiteCandidates.length
    ? `\nWEBSITE CANDIDATES found via Google search (most likely the official site is one of these):
${websiteCandidates.map((c, i) => `  ${i + 1}. ${c}`).join('\n')}
Pick the most relevant one as the official website, or return null if none match.\n`
    : '';

  const contextSection = contextText
    ? `\nGOOGLE SEARCH RESULTS for "${name}" (use these as your primary source of truth):\n${contextText}\n`
    : '';

  const prompt = `You are a precise company data extraction assistant tasked with filling a structured profile for the Israeli company "${name}".
${contextSection}${candidatesSection}
CRITICAL RULES — YOU MUST FOLLOW THESE EXACTLY:
1. Extract data ONLY from the search results provided above. If a field is not present in the results, return null.
2. NEVER guess, infer, or hallucinate. Do NOT confuse "${name}" with a similarly-named company.
3. For website: prefer one of the WEBSITE CANDIDATES above (if correct). Return the origin only (e.g. https://example.com). Never return LinkedIn, Facebook, Google, news, or directory sites.
4. For phone: Israeli format only (e.g. 0521234567). Return null if not clearly stated in the results.
5. For address/location: must be in Hebrew and must be in Israel. Return null if uncertain.
6. For registrationNumber: Israeli ח.פ is exactly 9 digits — return null if not clearly found.

Return ONLY a valid JSON object (no markdown fences, no extra text) with exactly these keys:
{
  "linkedinUrl": "full LinkedIn /company/ URL or null",
  "foundedYear": "4-digit year string or null",
  "address": "street + number in Hebrew or null",
  "location": "city name in Hebrew or null and must be in Israel",
  "website": "https://official-domain.com (origin only) or null",
  "snippet": "1-2 sentence description of the company in ${lang} or null",
  "phone": "digits only e.g. 0521234567 or null",
  "email": "official contact email or null",
  "registrationNumber": "9-digit ח.פ string or null"
}`;

  try {
    const res = await axios.post(
      url,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // No googleSearch tool — we provide the search context ourselves to
        // avoid TOO_MANY_TOOL_CALLS from Gemini's autonomous search agent.
        generationConfig: { temperature: 0.0, candidateCount: 1 },
      },
      { headers: { 'Content-Type': 'application/json' } },
    );
    const parts = res.data?.candidates?.[0]?.content?.parts || [];
    const raw = parts.map((p) => (p?.text || '')).join('').trim();
    if (!raw) return {};
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned) || {};
  } catch (err) {
    console.warn('[geminiSearch] request or parse failed:', err?.message || err);
    return {};
  }
};

const finalizeEnrichmentItem = async (item, companyName, prefetched = {}) => {
  const out = { ...item };

  if (prefetched.website && !out.website) out.website = prefetched.website;
  if (prefetched.snippet && !out.snippet) out.snippet = prefetched.snippet;

  await resolveSubFieldFromPicklist(out, companyName);

  // ── 1. Serper: fetch website candidates + snippet context in one shot ────
  let websiteCandidates = [];
  let contextText = '';
  try {
    ({ websiteCandidates, contextText } = await fetchSearchContext(companyName));
    if (websiteCandidates.length) {
      console.log(`[geminiSearch] "${companyName}" website candidates →`, websiteCandidates.join(', '));
    }
  } catch { /* non-fatal */ }

  // ── 2. Gemini extraction from injected context (no autonomous search tool) ─
  let g = {};
  try {
    g = await searchAllFieldsWithGemini(companyName, websiteCandidates, contextText);
    console.log(`[geminiSearch] "${companyName}" →`, JSON.stringify(g));
    if (g.linkedinUrl)         out.linkedinUrl         = g.linkedinUrl;
    if (g.foundedYear)         out.foundedYear          = String(g.foundedYear);
    if (g.address)             out.address              = g.address;
    if (g.location)            out.location             = g.location;
    if (g.website)             out.website              = g.website;
    if (g.snippet)             out.snippet              = g.snippet;
    if (g.registrationNumber)  out.registrationNumber   = String(g.registrationNumber);
    if (g.phone  && !String(out.phone  || '').trim()) out.phone = g.phone;
    if (g.email  && !String(out.email  || '').trim()) out.email = g.email;
  } catch (err) {
    console.warn('[organization-enrich] Gemini web search failed:', err?.message || err);
  }

  // ── 2. Serper fallbacks for any field Gemini did not return ────────────
  if (!g.linkedinUrl) {
    try { out.linkedinUrl = await searchLinkedinUrl(companyName); } catch (err) { console.warn('[organization-enrich] linkedin search failed', err?.message || err); }
  }
  if (!g.foundedYear) {
    try { out.foundedYear = await searchFoundedYear(companyName); } catch (err) { console.warn('[organization-enrich] founded year search failed', err?.message || err); }
  }
  if (!g.address || !g.location) {
    try {
      const { address, location } = await searchAddress(companyName);
      if (!g.address)   out.address  = address;
      if (!g.location)  out.location = location;
    } catch (err) { console.warn('[organization-enrich] address search failed', err?.message || err); }
  }
  if (!g.website) {
    // Candidates already fetched — use the first one as a direct fallback
    if (websiteCandidates.length) out.website = websiteCandidates[0];
    else {
      try { out.website = await searchWebsiteUrl(companyName); } catch (err) { console.warn('[organization-enrich] website search failed', err?.message || err); }
    }
  }
  if (!g.snippet) {
    try { out.snippet = await searchSnippet(companyName); } catch (err) { console.warn('[organization-enrich] snippet search failed', err?.message || err); }
  }
  if (!g.phone && !String(out.phone || '').trim()) {
    try { out.phone = await searchPhone(companyName); } catch (err) { console.warn('[organization-enrich] phone search failed', err?.message || err); }
  }
  if (!g.email && !String(out.email || '').trim()) {
    try { out.email = await searchEmail(companyName); } catch (err) { console.warn('[organization-enrich] email search failed', err?.message || err); }
  }
  if (!g.registrationNumber && !String(out.registrationNumber || '').trim()) {
    try { out.registrationNumber = await searchRegistrationNumber(companyName); } catch (err) { console.warn('[organization-enrich] registration number search failed', err?.message || err); }
  }

  const bucket = normalizeEmployeeCount(out.employeeCount);
  if (bucket) out.employeeCount = bucket;
  else delete out.employeeCount;

  let logo = typeof out.logo === 'string' ? out.logo.trim() : '';
  try {
    const hostname = new URL(out.website).hostname;
    logo = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    logo = '';
  }


     //after finish all those steps. add one more step for verification. dont change any code. just add one move verification check

  return { ...out, logo: logo || out.logo };
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
  setStr('registrationNumber', str(item.registrationNumber));

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
  const inputPayload = { name: companyName, website, snippet };

  const rawResponse = await sendChat({
    apiKey: resolveGeminiApiKey(),
    systemPrompt,
    history: [],
    message: messagePayload,
    responseMimeType: 'application/json',
    promptId: 'company_enrichment',
    llmInputJson: inputPayload,
  });

  const parsedResponse = parseJsonResponse(rawResponse);
  if (!parsedResponse) {
    console.warn(`[orgEnrich] could not parse JSON for "${companyName}". Raw:`, String(rawResponse).substring(0, 300));
    return null;
  }

  const rawItem = Array.isArray(parsedResponse) ? parsedResponse[0] : parsedResponse;
  if (!rawItem || typeof rawItem !== 'object') return null;

  const plain = org.get ? org.get({ plain: true }) : org;
  const seeded = {
    ...rawItem,
    email: plain.email || null,
    phone: plain.phone || null,
  };

  const enriched = await finalizeEnrichmentItem(seeded, companyName, { website, snippet });
  const updates = applyContactPreserveOnUpdates(buildOrganizationUpdates(enriched), org);

  if (Object.keys(updates).length === 0) {
    console.log(`[orgEnrich] no enrichable fields returned for "${companyName}"`);
    return null;
  }

  // ── Gemini website verification (post-enrichment gate) ───────────────────
  const detectedWebsite = enriched.website || updates.website || website || null;
  if (detectedWebsite) {
    const verification = await verifyOrganizationWebsite({
      companyNameCv: companyName,
      extractedUrl: detectedWebsite,
    });
    console.log(`[orgVerify] "${companyName}" → is_match=${verification.isMatch} | ${verification.reason}`);

    if (!verification.isMatch) {
      // Nullify contact/web fields to prevent data pollution
      updates.website    = null;
      updates.linkedinUrl = null;
      updates.phone      = null;
      updates.email      = null;
      updates.dataConfidence = 'אין התאמה';
      console.warn(`[orgVerify] "${companyName}" – mismatch detected. Nullified web/contact fields, dataConfidence=אין התאמה`);
    } else {
      updates.dataConfidence = 'לביקורת';
      console.log(`[orgVerify] "${companyName}" – match confirmed. dataConfidence=לביקורת`);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  await Organization.update(updates, { where: { id: orgId } });
  console.log(`[orgEnrich] enriched "${companyName}" (${orgId}) →`, Object.keys(updates).join(', '));

  try {
    const synced = await syncOrganizationToLinkedClients(orgId);
    if (synced > 0) {
      console.log(`[orgEnrich] synced enriched data to ${synced} linked client(s) for org ${orgId}`);
    }
  } catch (err) {
    console.error('[orgEnrich] client sync failed', orgId, err?.message || err);
  }

  scheduleOrganizationEmbedding({ id: orgId });
  return updates;
};

const persistEnrichmentResults = async (suggestions = []) => {
  const persistedIds = [];
  for (const suggestion of suggestions) {
    const companyId = suggestion?.companyId;
    const enriched = suggestion?.enriched;
    if (!companyId || !enriched || typeof enriched !== 'object') continue;

    const updates = applyContactPreserveOnUpdates(buildOrganizationUpdates(enriched), await Organization.findByPk(companyId));
    if (!Object.keys(updates).length) continue;

    await Organization.update(updates, { where: { id: companyId } });
    persistedIds.push(companyId);
    console.log(`[orgEnrich] persisted enrichment for org ${companyId} →`, Object.keys(updates).join(', '));

    try {
      const synced = await syncOrganizationToLinkedClients(companyId);
      if (synced > 0) {
        console.log(`[orgEnrich] synced persisted enrichment to ${synced} linked client(s) for org ${companyId}`);
      }
    } catch (err) {
      console.error('[orgEnrich] client sync failed after persist', companyId, err?.message || err);
    }

    scheduleOrganizationEmbedding({ id: companyId });
  }
  return persistedIds;
};

const pendingEnrichmentIds = new Set();

const strField = (org, key) => {
  const plain = org?.get ? org.get({ plain: true }) : org;
  return String(plain?.[key] || '').trim();
};

/** True when core discovery fields are still empty and Serper + LLM enrich may help. */
const organizationNeedsEnrichment = (org) => {
  if (!org?.id) return false;
  const hasWebsite = !!strField(org, 'website');
  const hasLinkedin = !!strField(org, 'linkedinUrl');
  const hasLocation = !!strField(org, 'location') || !!strField(org, 'address');
  const hasDescription = !!strField(org, 'description');
  return !(hasWebsite && hasLinkedin && hasLocation && hasDescription);
};

const scheduleOrganizationEnrichment = (org) => {
  if (!org?.id) return;
  const id = String(org.id);
  if (pendingEnrichmentIds.has(id)) return;
  pendingEnrichmentIds.add(id);
  setImmediate(() => {
    enrichOrganizationById(org.id)
      .catch((err) => {
        console.error('[orgEnrich] background enrichment failed', org.id, err?.message || err);
      })
      .finally(() => {
        pendingEnrichmentIds.delete(id);
      });
  });
};

/** Background enrich only when the org record is still missing website/linkedin/location/description. */
const scheduleOrganizationEnrichmentIfNeeded = (org) => {
  if (!organizationNeedsEnrichment(org)) return;
  console.log(`[orgEnrich] scheduling enrichment for thin org ${org.id} "${org.name || ''}"`);
  scheduleOrganizationEnrichment(org);
};

// ── Website verification via Gemini ──────────────────────────────────────────

/**
 * Verifies that `extractedUrl` actually belongs to the given company using Gemini.
 *
 * @param {object} params
 * @param {string} params.companyNameCv   - Company name as it appears on the CV / in the DB
 * @param {string} [params.candidateContext] - Optional sentence describing candidate's role/activity there
 * @param {string} params.extractedUrl    - URL found by the enrichment step
 * @returns {Promise<{ isMatch: boolean, reason: string }>}
 */
const verifyOrganizationWebsite = async ({ companyNameCv, candidateContext = '', extractedUrl }) => {
  const NO_MATCH = { isMatch: false, reason: 'verification skipped – missing inputs' };

  if (!companyNameCv || !extractedUrl) return NO_MATCH;

  const contextLine = candidateContext
    ? `\nהקשר פעילות המועמד: "${candidateContext}"`
    : '';

  const prompt = `
אתה סוכן בקרת איכות של מאגר חברות.
עליך לקבוע האם כתובת האתר שנמצאה אכן שייכת לחברה המוזכרת, בהתאם לשם החברה והקשר הפעילות.

שם החברה (מקורות החיים): "${companyNameCv}"${contextLine}
כתובת האתר שנמצאה: ${extractedUrl}

ענה אך ורק ב-JSON תקני בפורמט הבא (ללא הסבר נוסף):
{ "is_match": true/false, "reason": "הסבר קצר" }

כללים:
- is_match = true רק אם יש התאמה לוגית ומקצועית ברורה בין שם החברה לבין מטרת האתר.
- is_match = false אם האתר שייך לחברה אחרת, לפלטפורמת דרושים, לוויקיפדיה, לחדשות, וכדומה.
- is_match = false אם לא ניתן לאמת התאמה בביטחון סביר.
`.trim();

  try {
    const raw = await sendChat({
      apiKey: resolveGeminiApiKey(),
      systemPrompt: 'You are a JSON-only response agent. Always reply with valid JSON only.',
      history: [],
      message: prompt,
      responseMimeType: 'application/json',
    });

    const parsed = parseJsonResponse(raw);
    if (!parsed || typeof parsed.is_match !== 'boolean') {
      console.warn('[orgVerify] unexpected Gemini response:', String(raw).substring(0, 200));
      return NO_MATCH;
    }

    return { isMatch: parsed.is_match, reason: String(parsed.reason || '') };
  } catch (err) {
    console.warn('[orgVerify] Gemini call failed:', err?.message || err);
    return NO_MATCH;
  }
};

module.exports = {
  enrichOrganizationById,
  organizationNeedsEnrichment,
  scheduleOrganizationEnrichment,
  scheduleOrganizationEnrichmentIfNeeded,
  buildOrganizationUpdates,
  finalizeEnrichmentItem,
  resolveSubFieldFromPicklist,
  persistEnrichmentResults,
  hasStoredContact,
  verifyOrganizationWebsite,
  // ── Search helpers (single source of truth) ──────────────────────────────
  searchAllFieldsWithGemini,
  fetchSearchContext,
  getWebsiteCandidates,
  searchWebsiteUrl,
  searchLinkedinUrl,
  searchFoundedYear,
  searchAddress,
  searchPhone,
  searchEmail,
  searchSnippet,
  searchRegistrationNumber,
};
