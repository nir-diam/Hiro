'use strict';

const Organization = require('../models/Organization');
const organizationService = require('./organizationService');
const {
  enrichOrganizationById,
  scheduleOrganizationEnrichment,
} = require('./organizationEnrichmentService');

const buildOrganizationCreatePayload = (payload = {}) => {
  const meta = payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};
  const name = String(payload.name || payload.clientName || '').trim();
  const aliases = Array.isArray(meta.aliases)
    ? meta.aliases.map((a) => String(a || '').trim()).filter(Boolean)
    : [];
  const mainField = String(payload.mainField || payload.industry || meta.mainField || '').trim() || null;
  const mainField2 = Array.isArray(payload.mainField2)
    ? payload.mainField2.map((s) => String(s || '').trim()).filter(Boolean)
    : Array.isArray(meta.mainField2)
      ? meta.mainField2.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
  const subField = Array.isArray(payload.subField)
    ? payload.subField.map((s) => String(s || '').trim()).filter(Boolean)
    : Array.isArray(meta.subField)
      ? meta.subField.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
  const secondaryField = String(payload.secondaryField || meta.secondaryField || '').trim() || null;

  return {
    name,
    mainField,
    mainField2,
    subField,
    secondaryField,
    website: meta.website ? String(meta.website).trim() : null,
    phone: payload.phone ? String(payload.phone).trim() : null,
    location: meta.address ? String(meta.address).trim() : null,
    snippet: meta.description ? String(meta.description).trim() : null,
    aliases,
    logo: payload.logoUrl ? String(payload.logoUrl).trim() : null,
    dataConfidence: 'לביקורת',
  };
};

const isOrganizationRecord = (record) => {
  if (!record) return false;
  if (record instanceof Organization) return true;
  const table = record.constructor?.tableName || record.constructor?.options?.tableName;
  return table === 'organizations';
};

/**
 * Gemini classify (organization_ai_enriched) → create Organization + sync enrich, or stage OrganizationTmp.
 * Used when a tenant client manager links a new company name not in the global DB.
 */
const processNewCompanyForClientLink = async (payload = {}) => {
  const pipelineStartedAt = Date.now();
  const clientId = payload.clientId ? String(payload.clientId) : null;
  const orgDefaults = buildOrganizationCreatePayload(payload);
  const name = orgDefaults.name;

  console.log('[orgLinkPipeline] ── new company link pipeline started ──', {
    clientId,
    companyName: name || '(empty)',
    engine: 'gemini',
  });

  if (!name) {
    console.warn('[orgLinkPipeline] pipeline aborted — empty company name');
    return {
      outcome: 'invalid',
      orgPipeline: { phase: 'failed', reason: 'empty_name', engine: 'gemini' },
      organization: null,
      organizationTmp: null,
    };
  }

  console.log(`[orgLinkPipeline] checking DB for existing org "${name}"...`);
  const existing = await organizationService.findByName(name);
  if (existing) {
    console.log(`[orgLinkPipeline] org already exists (id=${existing.id}) — skipping Gemini`);
    return {
      outcome: 'existing',
      orgPipeline: { phase: 'skipped', reason: 'already_in_db', engine: 'gemini' },
      organization: existing,
      organizationTmp: null,
    };
  }

  console.log(`[orgLinkPipeline] no DB match — Gemini classification for "${name}"`);
  const orgPipeline = {
    phase: 'ai_classifying',
    engine: 'gemini',
  };

  const { name: _ignoredName, ...restDefaults } = orgDefaults;
  const result = await organizationService.findOrCreateByName(name, {
    context: 'manual_client_create',
    clientId,
    ...restDefaults,
  });

  if (!result) {
    orgPipeline.phase = 'completed';
    orgPipeline.outcome = 'staging';
    orgPipeline.reason = 'no_result';
    console.warn(`[orgLinkPipeline] findOrCreateByName returned null for "${name}"`);
    return {
      outcome: 'staging',
      orgPipeline,
      organization: null,
      organizationTmp: null,
    };
  }

  if (isOrganizationRecord(result)) {
    orgPipeline.aiDecision = 'organization';
    const backgroundEnrichment = payload.backgroundEnrichment === true;

    if (backgroundEnrichment) {
      console.log(`[orgLinkPipeline] Gemini → Organization (id=${result.id}) — scheduling background enrichment`);
      orgPipeline.phase = 'enriching';
      orgPipeline.background = true;
      orgPipeline.enriched = null;
      scheduleOrganizationEnrichment(result);
    } else {
      console.log(`[orgLinkPipeline] Gemini → Organization (id=${result.id}) — starting sync enrichment...`);
      orgPipeline.phase = 'enriching';
      const enrichStartedAt = Date.now();
      try {
        await enrichOrganizationById(result.id);
        orgPipeline.enriched = true;
        console.log(`[orgLinkPipeline] ✓ enrichment completed for org ${result.id} (${Date.now() - enrichStartedAt}ms)`);
      } catch (err) {
        console.error(`[orgLinkPipeline] ✗ enrichment failed for org ${result.id}:`, err?.message || err);
        orgPipeline.enriched = false;
        orgPipeline.enrichError = err?.message || 'enrichment_failed';
      }
      orgPipeline.phase = 'completed';
    }

    orgPipeline.outcome = 'organization';
    console.log(
      `[orgLinkPipeline] ── pipeline done: ORGANIZATION (id=${result.id}, enriched=${orgPipeline.enriched})`
      + ` — ${Date.now() - pipelineStartedAt}ms total ──`,
    );

    return {
      outcome: 'organization',
      orgPipeline,
      organization: result,
      organizationTmp: null,
    };
  }

  orgPipeline.phase = 'completed';
  orgPipeline.outcome = 'staging';
  orgPipeline.aiDecision = 'organization_tmp';
  console.log(
    `[orgLinkPipeline] ── pipeline done: STAGING (tmpId=${result.id}) — ${Date.now() - pipelineStartedAt}ms total ──`,
  );

  return {
    outcome: 'staging',
    orgPipeline,
    organization: null,
    organizationTmp: result,
  };
};

module.exports = {
  processNewCompanyForClientLink,
  buildOrganizationCreatePayload,
};
