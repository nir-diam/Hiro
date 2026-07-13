const path = require('path');
const { Op } = require('sequelize');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const organizationService = require('../services/organizationService');
const organizationEmbeddingService = require('../services/organizationEmbeddingService');
const { resolveSubFieldFromPicklist, searchWebsiteUrl } = require('../services/organizationEnrichmentService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const { createS3Client, buildPublicUrl } = require('../services/s3Service');
const axios = require('axios');
const CandidateOrganization = require('../models/CandidateOrganization');
const Candidate = require('../models/Candidate');
const Organization = require('../models/Organization');
const OrganizationChangeHistory = require('../models/OrganizationChangeHistory');
const User = require('../models/User');

const { sendSingleTurnChat, sendChat, resolveGeminiApiKey } = require('../services/geminiService');
const { normalizeEmployeeCount } = require('../utils/normalizeEmployeeCount');
const { filterSerpOrganicResults } = require('../utils/filterSerpOrganicResults');
const { buildCompanyEnrichmentPrompt } = require('../prompts/companyEnrichmentPrompt');

const UUID_RE = /^[0-9a-f-]{36}$/i;

const resolveOrganizationActor = (req) => {
  if (req.dbUser) {
    const plain = req.dbUser.get ? req.dbUser.get({ plain: true }) : req.dbUser;
    return {
      actingUser: plain.id,
      actorName: plain.name || plain.email || null,
      actorEmail: plain.email || null,
    };
  }
  const userId = req.user?.sub || req.user?.id;
  if (userId) {
    return {
      actingUser: userId,
      actorName: req.user?.name || req.user?.email || null,
      actorEmail: req.user?.email || null,
    };
  }
  return { actingUser: 'system', actorName: null, actorEmail: null };
};

const resolveHistoryActorDisplay = (plain, userMap) => {
  const actor = plain.actor;
  const changes = plain.changes || {};
  const user = userMap.get(String(actor));

  if (user?.name) return user.name;
  if (user?.email) return user.email;
  if (changes.actorName) return changes.actorName;
  if (changes.actorEmail) return changes.actorEmail;

  if (actor && typeof actor === 'string' && !UUID_RE.test(actor) && actor !== 'system') {
    return actor;
  }

  if (actor && actor !== 'system') return null;
  return null;
};

// Module-level helpers so they are available before the enrich try-block
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
    const q = /[\u0590-\u05FF]/.test(companyName)
      ? `${companyName} חברה`
      : `${companyName} company`;
    const data = await serperRaw(q, 3);
    const top = (data?.organic || [])[0];
    return top?.snippet ? String(top.snippet).trim() : null;
  } catch (err) {
    console.warn('[organization-enrich] snippet search failed', err?.message || err);
    return null;
  }
};

const fallbackCompanyPrompt = (companyNames, mainFieldOptions = [], website = '', snippet = '') =>
  buildCompanyEnrichmentPrompt({ companyNames, mainFieldOptions, website, snippet });

let companyPromptTemplate = null;
const loadCompanyPromptTemplate = async () => {
  try {
    const record = await promptService.ensureById('company_enrichment');
    companyPromptTemplate = record.template;
  } catch (err) {
    console.warn('[organization-enrich] missing company_enrichment prompt', err.message || err);
    companyPromptTemplate = null;
  }
  return companyPromptTemplate;
};

/**
 * @param {Array<{name:string, website?:string|null}>} companyData
 */
const buildCompanyPrompt = async (companyData) => {
  const mainFieldOptions = await picklistService.getMainFieldOptionNames();
  // Support both legacy (string[]) and new ({name,website}[]) shapes
  const companyNames = companyData.map((c) => (typeof c === 'string' ? c : c.name));
  // Single-company website for ${website} placeholder
  const firstWebsite = companyData.length > 0
    ? (typeof companyData[0] === 'string' ? '' : companyData[0].website || '')
    : '';
  const firstSnippet = companyData.length > 0
    ? (typeof companyData[0] === 'string' ? '' : companyData[0].snippet || '')
    : '';

  const template = await loadCompanyPromptTemplate();
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
      out = out.replace('${website}', firstWebsite);
    }
    if (out.includes('${snippet}')) {
      out = out.replace('${snippet}', firstSnippet);
    }
    return out;
  }
  return fallbackCompanyPrompt(companyNames, mainFieldOptions, firstWebsite, firstSnippet);
};

const LOGO_ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

const createLogoUploadUrl = async (req, res) => {
  const { fileName, contentType, organizationId } = req.body || {};
  if (!fileName || !contentType) {
    return res.status(400).json({ message: 'fileName and contentType are required' });
  }
  if (!String(contentType).toLowerCase().startsWith('image/')) {
    return res.status(400).json({ message: 'contentType must be an image' });
  }
  try {
    const safeName = path.basename(String(fileName));
    const ext = path.extname(safeName).toLowerCase();
    if (ext && !LOGO_ALLOWED_EXT.has(ext)) {
      return res.status(400).json({ message: 'Unsupported image type' });
    }
    const orgSegment =
      organizationId && String(organizationId).trim()
        ? String(organizationId).trim()
        : 'new';
    const key = `organizations/logos/${orgSegment}/${Date.now()}-${safeName}`;
    const client = createS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    });
    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 5 });
    res.json({ uploadUrl, key, publicUrl: buildPublicUrl(key) });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to generate upload URL' });
  }
};

const list = async (req, res) => {
  const includeMerged = String(req.query.includeMerged).toLowerCase() === 'true';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const activityFrom = typeof req.query.activityFrom === 'string' ? req.query.activityFrom.trim() : '';
  const activityTo = typeof req.query.activityTo === 'string' ? req.query.activityTo.trim() : '';
  const activityDate = typeof req.query.activityDate === 'string' ? req.query.activityDate.trim() : '';
  const result = await organizationService.list({
    includeMerged,
    page,
    limit,
    search,
    activityFrom,
    activityTo,
    activityDate,
  });
  res.json(result);
};

const globalLookup = async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const limit = Math.min(10, Math.max(1, parseInt(req.query.limit, 10) || 6));
    if (q.length < 2) {
      return res.json({ data: [] });
    }
    const data = await organizationService.globalLookup(q, { limit });
    res.json({ data });
  } catch (err) {
    console.error('[organizationController.globalLookup]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'Lookup failed' });
  }
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
    const actor = resolveOrganizationActor(req);
    const org = await organizationService.create(req.body, {
      actingUser: actor.actingUser,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
    });
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
    const actor = resolveOrganizationActor(req);
    const org = await organizationService.update(req.params.id, req.body, {
      actingUser: actor.actingUser,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
    });
    res.json(org);
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Update failed' });
  }
};

const remove = async (req, res) => {
  try {
    const actor = resolveOrganizationActor(req);
    await organizationService.remove(req.params.id, {
      actingUser: actor.actingUser,
      actorName: actor.actorName,
      actorEmail: actor.actorEmail,
    });
    res.status(204).end();
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message || 'Delete failed' });
  }
};

const getHistory = async (req, res) => {
  const organizationId = req.params.id;
  if (!organizationId) {
    return res.status(400).json({ message: 'Missing organization id' });
  }

  try {
    const entries = await OrganizationChangeHistory.findAll({
      where: { organizationId },
      order: [['created_at', 'DESC']],
    });

    const actorIds = [
      ...new Set(
        entries
          .map((row) => row.actor)
          .filter((actor) => actor && actor !== 'system' && UUID_RE.test(String(actor))),
      ),
    ];

    const users = actorIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: actorIds } },
          attributes: ['id', 'name', 'email'],
        })
      : [];
    const userMap = new Map(users.map((u) => [String(u.id), u.get({ plain: true })]));

    const payload = entries.map((entry) => {
      const plain = entry.toJSON ? entry.toJSON() : entry.get({ plain: true });
      const actor = plain.actor;
      const user = userMap.get(String(actor));
      const actorDisplayName = resolveHistoryActorDisplay(plain, userMap);
      const createdAt =
        plain.createdAt ||
        plain.created_at ||
        plain.updatedAt ||
        plain.updated_at ||
        null;
      return {
        ...plain,
        createdAt,
        created_at: createdAt,
        actorDisplayName,
        userName: user?.name || plain.changes?.actorName || null,
        userEmail: user?.email || plain.changes?.actorEmail || null,
      };
    });

    res.json(payload);
  } catch (err) {
    console.error('[organizationController.getHistory]', err);
    res.status(500).json({ message: 'Failed to load organization history' });
  }
};

const parseExperienceYear = (s) => {
  if (!s || typeof s !== 'string') return null;
  const t = s.trim();
  if (/present|כיום/i.test(t)) return new Date().getFullYear();
  const match = t.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
};

// Experience rows matching org name/aliases (for users tab)
const experienceMetaAtOrg = (experience, orgName, aliases = []) => {
  const names = new Set([
    (orgName || '').trim().toLowerCase(),
    ...(Array.isArray(aliases) ? aliases : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean),
  ]);
  if (!names.size) {
    return { roleAtOrg: null, isCurrent: false, yearsInCompany: null, yearsSinceLeft: null };
  }
  const exp = Array.isArray(experience) ? experience : [];
  const currentYear = new Date().getFullYear();
  let roleAtOrg = null;
  let isCurrent = false;
  let totalYears = 0;
  let yearsSinceLeft = null;

  for (const item of exp) {
    const company = String(item?.company || '').trim().toLowerCase();
    if (!company || !names.has(company)) continue;
    roleAtOrg =
      item.title || item.role || item.position || roleAtOrg;
    const start = parseExperienceYear(item.startDate);
    const endIsPresent = /present|כיום/i.test(String(item?.endDate || ''));
    const end = endIsPresent ? currentYear : parseExperienceYear(item.endDate);
    if (endIsPresent) isCurrent = true;
    if (start != null && end != null && end >= start) {
      totalYears += end - start;
      if (!endIsPresent) {
        const since = currentYear - end;
        if (yearsSinceLeft == null || since < yearsSinceLeft) yearsSinceLeft = since;
      }
    }
  }

  return {
    roleAtOrg,
    isCurrent,
    yearsInCompany: totalYears > 0 ? totalYears : null,
    yearsSinceLeft,
  };
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
      const meta = experienceMetaAtOrg(combinedExperience, orgName, aliases);
      rest.roleAtOrg = meta.roleAtOrg;
      rest.isCurrent = meta.isCurrent;
      rest.yearsInCompany = meta.yearsInCompany;
      rest.yearsSinceLeft = meta.yearsSinceLeft;
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

    // Build company data; for each entry pre-fetch website + snippet so the LLM
    // receives them via ${website} / ${snippet} placeholders before generating data.
    const companyData = await Promise.all(
      companies
        .map((c) => ({ name: c.name || c.title || c.company, website: c.website || null, snippet: null }))
        .filter((c) => c.name)
        .map(async (c) => {
          if (!c.website) {
            try {
              c.website = await searchWebsiteUrl(c.name);
            } catch {
              c.website = null;
            }
          }
          try {
            c.snippet = await searchSnippet(c.name);
          } catch {
            c.snippet = null;
          }
          return c;
        }),
    );
    const companyNames = companyData.map((c) => c.name);

    // Prompt now contains ${website} replaced with the discovered URL
    const systemPrompt = await buildCompanyPrompt(companyData);

    // User-turn message also carries name + website for additional context
    const messagePayload = companyData.length === 1
      ? JSON.stringify(companyData[0])
      : JSON.stringify(companyData);

    const response = await sendSingleTurnChat({
      apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
      systemPrompt,
      message: messagePayload,
      promptId: 'company_enrichment',
      llmInputJson: companyData.length === 1 ? companyData[0] : companyData,
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

    const ADDRESS_INDICATORS = /רחוב|רח׳|א\.ת|קומה|בניין|מגדל|כתובת|שד'/i;

    // Extract a clean street address from a raw string that may include phone/hours noise.
    // Looks for "כתובת:" keyword first, then falls back to street-pattern sentences.
    const cleanAddressFromRaw = (raw) => {
      if (!raw) return null;
      const s = String(raw);

      // Extract text after "כתובת:" stopping at noise delimiters or end
      const afterKw = s.match(/כתובת[:\s]+(.+?)(?=\s*[|・]\s*|\s*טלפון|\s*פקס|\s*שעות|\s*$)/i);
      if (afterKw) {
        const candidate = afterKw[1]
          .replace(/\s+/g, ' ')
          .replace(/\s*\.{2,}\s*$/, '')          // trailing ellipsis
          .replace(/[.!\s]+$/, '')                // trailing punctuation/space
          .replace(/,\s*[\u0590-\u05FF]$/, '')    // truncated ", ת" style ending
          .trim();
        if (candidate.length > 5 && !/טלפון|פקס|שעות|@|http/i.test(candidate)) return candidate;
      }

      // If string already looks clean (no phone/hours), use it directly
      if (!/טלפון|פקס|שעות|・/.test(s)) {
        return s
          .replace(/\s*\.{2,}\s*$/, '')
          .replace(/[.!\s]+$/, '')
          .replace(/,\s*[\u0590-\u05FF]$/, '')
          .trim() || null;
      }
      return null;
    };

    // Extract city/location from serper data
    const extractLocation = (serperData) => {
      // 1. Try knowledgeGraph attributes for explicit city key
      const attrs = serperData?.knowledgeGraph?.attributes || {};
      for (const [key, val] of Object.entries(attrs)) {
        if (/עיר|מיקום|location|city/i.test(key)) return String(val).trim();
      }

      // 2. Try to parse city from knowledgeGraph.address (e.g. "רח׳ כנרת 4, תל אביב")
      const kgAddr = serperData?.knowledgeGraph?.address;
      if (kgAddr) {
        const cityMatch = String(kgAddr).match(/\d+\s*,\s*([\u0590-\u05FF][^,\d\n]{2,}?)(?:\s*,|\s*$)/);
        if (cityMatch) return cityMatch[1].trim();
      }

      // 3. Scan organic snippets for city after a street number
      const organic = serperData?.organic || [];
      for (const result of organic.slice(0, 5)) {
        const snippet = String(result.snippet || '');
        if (!ADDRESS_INDICATORS.test(snippet)) continue;
        const cityMatch = snippet.match(/(?:רחוב|רח׳)[^,\d]*\d+\s*,\s*([\u0590-\u05FF][^,\d\n]{2,}?)(?:\s*,|\s*$)/i);
        if (cityMatch) return cityMatch[1].trim();
      }

      return null;
    };

    // Extract a clean street address from serper results.
    const extractAddress = (serperData) => {
      // 1. Try knowledgeGraph.address — clean it even if it contains noise
      if (serperData?.knowledgeGraph?.address) {
        const clean = cleanAddressFromRaw(serperData.knowledgeGraph.address);
        if (clean) return clean;
      }

      // 2. Scan organic snippets
      const organic = serperData?.organic || [];
      for (const result of organic.slice(0, 5)) {
        const snippet = String(result.title || '');
        if (!ADDRESS_INDICATORS.test(snippet)) continue;

        const clean = cleanAddressFromRaw(snippet);
        if (clean) return clean;

        // Fallback: sentence containing a street pattern
        const m = snippet.match(/[^\n.!?]*(?:רחוב|רח׳|א\.ת|קומה|בניין|מגדל|שד')[^\n.!?]*/i);
        if (m) return m[0].replace(/,\s*[\u0590-\u05FF]$/, '').trim();
      }
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
        console.warn('[organization-enrich] founded year search failed:', err?.message || err);
        return null;
      }
    };

    const searchAddress = async (companyName) => {
      if (!companyName || !process.env.SERPDEV) return { address: null, location: null };
      try {
        const data = await serperRaw(`${companyName} כתובת`, 5);
        const organic = data?.organic || [];

        // Try Gemini extraction — it understands messy Hebrew snippets and titles much better than regex
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

            const systemPrompt = `You extract a company's street address and city from Google search result snippets.
Return ONLY a valid JSON object with exactly two keys:
- "address": the street address (street name + number only, e.g. "רח׳ כנרת 4"). null if not found.
- "city": the city name only (e.g. "איירפורט סיטי", "תל אביב"). null if not found.
Do NOT include phone numbers, fax, hours, or any extra text.`;

            const message = `Company: ${companyName}\n\nSearch results:\n${snippets}\n\nExtract street address and city.`;

            const llmRes = await sendChat({
              apiKey: geminiKey,
              systemPrompt,
              message,
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
              return {
                address: obj.address || null,
                location: obj.city || null,
              };
            }
          } catch (llmErr) {
            console.warn('[organization-enrich] Gemini address extraction failed, falling back to regex:', llmErr?.message);
          }
        }

        // Regex fallback if Gemini is unavailable or returned nothing
        return {
          address: extractAddress(data),
          location: extractLocation(data),
        };
      } catch (err) {
        console.warn('[organization-enrich] address search failed:', err?.message || err);
        return { address: null, location: null };
      }
    };

    const searchLinkedinUrl = async (companyName) => {
      if (!companyName || !process.env.SERPDEV) return null;
      try {
        const results = await serperSearch(`${companyName} linkedin`);
        if (!results.length) return null;
        const companyResult =
          results.find((r) => r.link?.toLowerCase().includes('linkedin.com/company')) ||
          results.find((r) => r.link?.toLowerCase().includes('linkedin.com'));
        return companyResult?.link || null;
      } catch (err) {
        console.error('[organization-enrich] LinkedIn search failed:', err.response?.data || err.message);
        return null;
      }
    };

    const searchWebsiteUrl = async (companyName) => {
      if (!companyName || !process.env.SERPDEV) return null;
      try {
        const q = `${companyName} ${/[\u0590-\u05FF]/.test(companyName) ? 'האתר הרשמי' : 'official website'}`;
        const EXCLUDED = ['linkedin.com', 'facebook.com', 'twitter.com', 'instagram.com',
                          'youtube.com', 'wikipedia.org', 'walla.co.il', 'ynet.co.il',
                          'google.com', 'glassdoor.com', 'indeed.com', 'jobmaster.co.il'];
        const results = await serperSearch(q);
        if (!results.length) return null;
        const official = results.find((r) => {
          if (!r.link) return false;
          const domain = r.link.toLowerCase();
          return !EXCLUDED.some((ex) => domain.includes(ex));
        });
        return official?.link ? new URL(official.link).origin : null;
      } catch (err) {
        console.warn('[organization-enrich] website search failed', err?.message || err);
        return null;
      }
    };

    const searchPhone = async (companyName) => {
      if (!companyName || !process.env.SERPDEV) return null;
      const q = /[\u0590-\u05FF]/.test(companyName) ? `${companyName} טלפון` : `${companyName} phone`;
      const results = await serperSearch(q, 5);
      const texts = (results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`).join('\n');
      const match = texts.match(/(?:\+972[\s-]?|0)(?:[\s-]?\d){8,10}/);
      return match ? match[0].replace(/[^\d+]/g, '') : null;
    };

    const searchEmail = async (companyName) => {
      if (!companyName || !process.env.SERPDEV) return null;
      const q = /[\u0590-\u05FF]/.test(companyName) ? `${companyName} אימייל` : `${companyName} email`;
      const results = await serperSearch(q, 5);
      const texts = (results || []).map((r) => `${r.title || ''} ${r.snippet || ''}`).join('\n');
      const emails = texts.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || [];
      const skip = /noreply|no-reply|example\.com/i;
      return emails.find((e) => !skip.test(e)) || null;
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

          await resolveSubFieldFromPicklist(item, companyName);

          const domainForPdl = item.website ? getDomain(item.website) : null;
          if (false &&domainForPdl && process.env.PDL_API_KEY) {
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
                const fromSize = pdl.size ? normalizeEmployeeCount(pdl.size) : null;
                const fromCount =
                  pdl.employee_count != null ? normalizeEmployeeCount(pdl.employee_count) : null;
                const normalized = fromSize || fromCount;
                if (normalized) item.employeeCount = normalized;
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

        
            try {
              item.linkedinUrl = await searchLinkedinUrl(companyName);
            } catch (err) {
              console.warn('[organization-enrich] linkedin search failed', err?.message || err);
            }

           
              try {
                item.foundedYear = await searchFoundedYear(companyName);
              } catch (err) {
                console.warn('[organization-enrich] founded year search failed', err?.message || err);
              }
            

              try {
                const { address, location } = await searchAddress(companyName);
               item.address = address;
                item.location = location;
              } catch (err) {
                console.warn('[organization-enrich] address search failed', err?.message || err);
              }


           
            

          // Fill website from pre-fetched companyData if LLM/PDL didn't return one
          try {
            item.website = await searchWebsiteUrl(companyName);
          } catch (err) {
            console.warn('[organization-enrich] website search failed', err?.message || err);
          }

          try {
            item.snippet = await searchSnippet(companyName);
          } catch (err) {
            console.warn('[organization-enrich] snippet search failed', err?.message || err);
          }

          if (!String(item.phone || '').trim()) {
            try {
              item.phone = await searchPhone(companyName);
            } catch (err) {
              console.warn('[organization-enrich] phone search failed', err?.message || err);
            }
          }

          if (!String(item.email || '').trim()) {
            try {
              item.email = await searchEmail(companyName);
            } catch (err) {
              console.warn('[organization-enrich] email search failed', err?.message || err);
            }
          }
          

            const bucket = normalizeEmployeeCount(item.employeeCount);
            if (bucket) item.employeeCount = bucket;
            else delete item.employeeCount;


            let logo = typeof item.logo === 'string' ? item.logo.trim() : '';
              try {
                const hostname = new URL(item.website).hostname;
                logo = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
              } catch {
                logo = '';
              }
            
          

          const enriched = { ...item , logo : logo || item.logo };

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

const rebuildEmbeddings = async (req, res) => {
  try {
    const onlyMissing = String(req.query.onlyMissing || '').toLowerCase() === 'true';
    const stats = await organizationEmbeddingService.rebuildAllEmbeddings({ onlyMissing });
    res.json(stats);
  } catch (err) {
    console.error('[organizationController.rebuildEmbeddings]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to rebuild organization embeddings' });
  }
};

const rebuildEmbedding = async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ message: 'Missing organization id' });
  }
  try {
    const embedding = await organizationEmbeddingService.rebuildOrganizationEmbedding(id);
    if (!embedding) {
      return res.status(404).json({ message: 'Organization not found or no text to embed' });
    }
    res.json({ success: true, embeddingLength: embedding.length });
  } catch (err) {
    console.error('[organizationController.rebuildEmbedding]', err);
    res.status(err.status || 500).json({ message: err.message || 'Failed to rebuild organization embedding' });
  }
};

module.exports = {
  list,
  globalLookup,
  get,
  create,
  update,
  remove,
  getHistory,
  enrich,
  listCandidates,
  createLogoUploadUrl,
  rebuildEmbeddings,
  rebuildEmbedding,
};

