const path = require('path');
const { Op } = require('sequelize');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const organizationService = require('../services/organizationService');
const Job = require('../models/Job');
const organizationEmbeddingService = require('../services/organizationEmbeddingService');
const {
  resolveSubFieldFromPicklist,
  persistEnrichmentResults,
  verifyOrganizationWebsite,
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
} = require('../services/organizationEnrichmentService');
const promptService = require('../services/promptService');
const picklistService = require('../services/picklistService');
const { createS3Client, buildPublicUrl } = require('../services/s3Service');
const axios = require('axios');
const CandidateOrganization = require('../models/CandidateOrganization');
const Candidate = require('../models/Candidate');
const Organization = require('../models/Organization');
const OrganizationChangeHistory = require('../models/OrganizationChangeHistory');
const User = require('../models/User');
const ClientOrganizationLink = require('../models/ClientOrganizationLink');
const Client = require('../models/Client');

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
  try {
    const result = await organizationService.list(parseOrganizationListParams(req));
    res.json(result);
  } catch (err) {
    console.error('[organizationController.list]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'List failed' });
  }
};

/** POST body variant — avoids GET URL limits when many location cities are selected. */
const listQuery = async (req, res) => {
  try {
    const result = await organizationService.list(parseOrganizationListParams(req));
    res.json(result);
  } catch (err) {
    console.error('[organizationController.listQuery]', err.message || err);
    res.status(err.status || 500).json({ message: err.message || 'List failed' });
  }
};

/**
 * Read list filters from query (GET) and/or JSON body (POST /query).
 * @param {import('express').Request} req
 */
function parseOrganizationListParams(req) {
  const q = req.query || {};
  const b = req.body && typeof req.body === 'object' ? req.body : {};
  const pick = (key) => (b[key] !== undefined && b[key] !== null ? b[key] : q[key]);

  const includeMerged = String(pick('includeMerged') || '').toLowerCase() === 'true';
  const page = Math.max(1, parseInt(String(pick('page') ?? '1'), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(pick('limit') ?? '50'), 10) || 50));
  const search = typeof pick('search') === 'string' ? pick('search').trim() : '';
  const includeAdditionalLocations =
    String(pick('includeAdditionalLocations') || '').toLowerCase() === 'true' ||
    String(pick('includeAdditionalLocations') || '') === '1';
  const mainField = typeof pick('mainField') === 'string' ? pick('mainField').trim() : '';
  const activityFrom = typeof pick('activityFrom') === 'string' ? pick('activityFrom').trim() : '';
  const activityTo = typeof pick('activityTo') === 'string' ? pick('activityTo').trim() : '';
  const activityDate = typeof pick('activityDate') === 'string' ? pick('activityDate').trim() : '';

  let locations = null;
  const rawLocations = pick('locations');
  if (Array.isArray(rawLocations)) {
    locations = rawLocations.map((x) => String(x || '').trim()).filter(Boolean);
  } else if (typeof rawLocations === 'string' && rawLocations.trim()) {
    locations = rawLocations.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const location =
    locations && locations.length
      ? ''
      : typeof pick('location') === 'string'
        ? pick('location').trim()
        : '';

  return {
    includeMerged,
    page,
    limit,
    search,
    location,
    locations,
    includeAdditionalLocations,
    mainField,
    activityFrom,
    activityTo,
    activityDate,
  };
}

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

            // ── Serper: fetch website candidates + snippet context in one shot ────
            let websiteCandidates = [];
            let contextText = '';
            try {
              ({ websiteCandidates, contextText } = await fetchSearchContext(companyName));
              if (websiteCandidates.length) {
                console.log(`[geminiSearch] "${companyName}" website candidates →`, websiteCandidates.join(', '));
              }
            } catch { /* non-fatal */ }

            // ── Gemini extraction from injected context (no autonomous search tool) ─
            let g = {};
            try {
              g = await searchAllFieldsWithGemini(companyName, websiteCandidates, contextText);
              console.log(`[geminiSearch] "${companyName}" →`, JSON.stringify(g));
              if (g.linkedinUrl)         item.linkedinUrl         = g.linkedinUrl;
              if (g.foundedYear)         item.foundedYear          = String(g.foundedYear);
              if (g.address)             item.address              = g.address;
              if (g.location)            item.location             = g.location;
              if (g.website)             item.website              = g.website;
              if (g.snippet)             item.snippet              = g.snippet;
              if (g.registrationNumber)  item.registrationNumber   = String(g.registrationNumber);
              if (g.phone  && !String(item.phone  || '').trim()) item.phone = g.phone;
              if (g.email  && !String(item.email  || '').trim()) item.email = g.email;
            } catch (err) {
              console.warn('[organization-enrich] Gemini web search failed:', err?.message || err);
            }

            // Serper fallbacks for any field Gemini did not return
            if (!g.linkedinUrl) {
              try { item.linkedinUrl = await searchLinkedinUrl(companyName); } catch (err) { console.warn('[organization-enrich] linkedin search failed', err?.message || err); }
            }
            if (!g.foundedYear) {
              try { item.foundedYear = await searchFoundedYear(companyName); } catch (err) { console.warn('[organization-enrich] founded year search failed', err?.message || err); }
            }
            if (!g.address || !g.location) {
              try {
                const { address, location } = await searchAddress(companyName);
                if (!g.address)  item.address  = address;
                if (!g.location) item.location = location;
              } catch (err) { console.warn('[organization-enrich] address search failed', err?.message || err); }
            }
            if (!g.website) {
              if (websiteCandidates.length) item.website = websiteCandidates[0];
              else {
                try { item.website = await searchWebsiteUrl(companyName); } catch (err) { console.warn('[organization-enrich] website search failed', err?.message || err); }
              }
            }
            if (!g.snippet) {
              try { item.snippet = await searchSnippet(companyName); } catch (err) { console.warn('[organization-enrich] snippet search failed', err?.message || err); }
            }
            if (!g.phone && !String(item.phone || '').trim()) {
              try { item.phone = await searchPhone(companyName); } catch (err) { console.warn('[organization-enrich] phone search failed', err?.message || err); }
            }
            if (!g.email && !String(item.email || '').trim()) {
              try { item.email = await searchEmail(companyName); } catch (err) { console.warn('[organization-enrich] email search failed', err?.message || err); }
            }
            if (!g.registrationNumber && !String(item.registrationNumber || '').trim()) {
              try { item.registrationNumber = await searchRegistrationNumber(companyName); } catch (err) { console.warn('[organization-enrich] registration number search failed', err?.message || err); }
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
            
          // ── Gemini website verification (post-enrichment gate) ─────────────
          const detectedWebsite = item.website || null;
          if (detectedWebsite) {
            const verification = await verifyOrganizationWebsite({
              companyNameCv: companyName,
              extractedUrl: detectedWebsite,
            });
            console.log(`[orgVerify] "${companyName}" → is_match=${verification.isMatch} | ${verification.reason}`);

            if (!verification.isMatch) {
              item.website    = null;
              item.linkedinUrl = null;
              item.phone      = null;
              item.email      = null;
              item.dataConfidence = 'אין התאמה';
              logo = '';
              console.warn(`[orgVerify] "${companyName}" – mismatch. Nullified web/contact fields.`);
            } else {
              item.dataConfidence = 'לביקורת';
            }
          }
          // ──────────────────────────────────────────────────────────────────

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

    const shouldPersist = Boolean(req.body?.persist);
    let persistedIds = [];
    if (shouldPersist && suggestions.length) {
      persistedIds = await persistEnrichmentResults(suggestions);
    }

    res.json({ suggestions, enrichmentMap, persistedIds });
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

/**
 * GET /api/organizations/:id/primary-client
 * Returns the primary linked client (isPrimary=true, or first link) for this organization.
 * Used by the NewJob form so admin users can resolve clientId after selecting an org.
 */
const getPrimaryClient = async (req, res) => {
  try {
    const orgId = String(req.params.id || '').trim();
    if (!orgId) return res.status(400).json({ message: 'org id required' });

    // Prefer the isPrimary link; fall back to the first created link.
    const link = await ClientOrganizationLink.findOne({
      where: { organizationId: orgId },
      include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'displayName'] }],
      order: [['isPrimary', 'DESC'], ['created_at', 'ASC']],
    });

    if (!link || !link.client) {
      return res.json({ clientId: null, clientName: null });
    }

    const c = link.client;
    return res.json({
      clientId: String(c.id),
      clientName: String(c.displayName || c.name || ''),
    });
  } catch (err) {
    res.status(500).json({ message: err.message || 'Failed to get primary client' });
  }
};

const listJobs = async (req, res) => {
  try {
    const org = await organizationService.getById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    const plainOrg = org.get ? org.get({ plain: true }) : org;
    const clientId = req.query?.clientId ? String(req.query.clientId).trim() : null;

    const labels = [
      plainOrg.name,
      plainOrg.nameEn,
      plainOrg.legalName,
      ...(Array.isArray(plainOrg.aliases) ? plainOrg.aliases : []),
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const where = { [Op.or]: [] };
    if (plainOrg.id) where[Op.or].push({ organizationId: plainOrg.id });
    for (const label of labels) {
      where[Op.or].push({ client: { [Op.iLike]: label } });
    }
    if (!where[Op.or].length) return res.json([]);
    if (clientId) where.clientId = clientId;

    const jobs = await Job.findAll({
      where,
      attributes: ['id', 'title', 'status', 'openDate', 'client', 'clientId', 'organizationId', 'postingCode', 'field', 'role', 'updatedAt'],
      order: [['openDate', 'DESC']],
      limit: 200,
    });

    // Resolve + persist organizationId when jobs match by name only
    const { enrichJobsWithOrganizationIds } = require('../services/jobOrganizationResolveService');
    await enrichJobsWithOrganizationIds(jobs);

    res.json(jobs.map((j) => (j.get ? j.get({ plain: true }) : j)));
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list jobs' });
  }
};

/**
 * Insights for one organization, optionally scoped to a tenant client
 * (jobs + referrals for that org under the current client).
 * GET /api/organizations/:id/insights?clientId=
 */
const getInsights = async (req, res) => {
  try {
    const { sequelize } = require('../config/db');
    const NotificationMessage = require('../models/NotificationMessage');

    const org = await organizationService.getById(req.params.id);
    if (!org) return res.status(404).json({ message: 'Organization not found' });

    const plainOrg = org.get ? org.get({ plain: true }) : org;
    const clientId = req.query?.clientId ? String(req.query.clientId).trim() : null;

    const orgLabels = new Set(
      [
        plainOrg.name,
        plainOrg.nameEn,
        plainOrg.legalName,
        ...(Array.isArray(plainOrg.aliases) ? plainOrg.aliases : []),
      ]
        .map((v) => String(v || '').trim())
        .filter(Boolean),
    );
    const labelList = [...orgLabels];

    // ── Jobs for this org (optionally under current client) ────────────────
    const jobOr = [];
    if (plainOrg.id) jobOr.push({ organizationId: plainOrg.id });
    for (const label of labelList) {
      jobOr.push({ client: { [Op.iLike]: label } });
    }
    const jobWhere = jobOr.length ? { [Op.or]: jobOr } : { id: null };
    if (clientId) jobWhere.clientId = clientId;

    const jobRows = await Job.findAll({
      where: jobWhere,
      attributes: ['id', 'status'],
      raw: true,
    });
    const jobCounts = { open: 0, frozen: 0, closed: 0 };
    const jobIds = [];
    for (const j of jobRows) {
      jobIds.push(String(j.id));
      const s = String(j.status || '').toLowerCase();
      if (s === 'פתוחה' || s === 'open') jobCounts.open++;
      else if (s === 'מוקפאת' || s === 'frozen' || s === 'paused') jobCounts.frozen++;
      else if (s === 'סגורה' || s === 'closed') jobCounts.closed++;
    }

    // ── Referrals: messages for org jobs or org name as clientName ────────
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    let referralsWeek = 0;
    let referralsMonth = 0;
    let referralsYear = 0;
    let hiredCount = 0;

    const matchOr = [];
    for (const l of labelList) {
      matchOr.push(sequelize.literal(`metadata->'taskPayload'->>'clientName' ILIKE ${sequelize.escape(l)}`));
    }
    for (const jid of jobIds.slice(0, 200)) {
      matchOr.push(sequelize.literal(`metadata->'taskPayload'->>'jobId' = ${sequelize.escape(jid)}`));
    }

    if (matchOr.length) {
      try {
        const messages = await NotificationMessage.findAll({
          where: {
            createdAt: { [Op.gte]: yearStart },
            [Op.or]: matchOr,
          },
          attributes: ['createdAt', 'status', 'metadata'],
          raw: true,
        });

        for (const msg of messages) {
          const d = new Date(msg.createdAt);
          if (d >= weekStart) referralsWeek++;
          if (d >= monthStart) referralsMonth++;
          referralsYear++;
        }

        const hiredAll = await NotificationMessage.findAll({
          where: {
            [Op.and]: [
              { [Op.or]: matchOr },
              {
                [Op.or]: [
                  { status: { [Op.iLike]: '%hired%' } },
                  sequelize.literal(`metadata->>'referralWorkflowStatus' ILIKE '%hired%'`),
                  sequelize.literal(`metadata->>'referralWorkflowStatus' ILIKE '%התקבל%'`),
                ],
              },
            ],
          },
          attributes: ['id'],
          raw: true,
        });
        hiredCount = hiredAll.length;
      } catch (refErr) {
        console.warn('[organizationInsights] referrals query failed:', refErr?.message || refErr);
      }
    }

    // Relationship start = when this client linked the org (fallback: org createdAt)
    let relationshipStartedAt = plainOrg.createdAt || null;
    if (clientId && plainOrg.id) {
      try {
        const link = await ClientOrganizationLink.findOne({
          where: { clientId, organizationId: plainOrg.id },
          order: [['created_at', 'ASC']],
        });
        if (link?.createdAt) relationshipStartedAt = link.createdAt;
      } catch (linkErr) {
        console.warn('[organizationInsights] link lookup failed:', linkErr?.message || linkErr);
      }
    }

    // Best-effort: stamp organizationId onto matched jobs for future queries
    if (plainOrg.id && jobIds.length) {
      Job.update(
        { organizationId: plainOrg.id },
        { where: { id: { [Op.in]: jobIds }, organizationId: null } },
      ).catch(() => {});
    }

    res.json({
      openJobs: jobCounts.open,
      frozenJobs: jobCounts.frozen,
      closedJobs: jobCounts.closed,
      referrals: { week: referralsWeek, month: referralsMonth, year: referralsYear },
      hiredCount,
      relationshipStartedAt,
    });
  } catch (err) {
    console.error('[organizationInsights]', err?.message || err);
    res.status(500).json({ message: err?.message || 'Failed to load insights' });
  }
};

module.exports = {
  list,
  listQuery,
  globalLookup,
  get,
  create,
  update,
  remove,
  getHistory,
  enrich,
  listCandidates,
  listJobs,
  getInsights,
  createLogoUploadUrl,
  rebuildEmbeddings,
  rebuildEmbedding,
  getPrimaryClient,
};

