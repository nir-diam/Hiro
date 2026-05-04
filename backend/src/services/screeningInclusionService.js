const { Op } = require('sequelize');
const Candidate = require('../models/Candidate');
const Job = require('../models/Job');
const JobCandidate = require('../models/JobCandidate');
const clientUsageSettingService = require('./clientUsageSettingService');
const { resolveStatusGroup, canonicalizeStatusGroup } = require('../utils/recruitmentStatusGroups');

/** Sources treated as explicit application / staff link */
const APPLICATION_SOURCES = new Set(['email', 'bulk_job_filter', 'manual_screening', 'public_apply', 'referral']);

/** Path 1 = explicit application/link source; Path 3 = included via field/title interest match only (still passes hard rules, etc.). */
function jcHasExplicitApplicationSource(jc) {
  const src = jc.source ? String(jc.source).trim() : '';
  return Boolean(src && APPLICATION_SOURCES.has(src));
}

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase();
}

function normTag(x) {
  return norm(x).replace(/\s+/g, ' ');
}

function partialMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function interestMatches(candidate, job) {
  const jf = norm(job.field);
  const jr = norm(job.role);
  const cf = norm(candidate.field);
  const ct = norm(candidate.title);
  if (!jf && !jr) return false;
  const fieldOk = !jf || cf === jf || partialMatch(cf, jf);
  const roleOk = !jr || ct === jr || partialMatch(ct, jr);
  return fieldOk && roleOk;
}

function hasAffinity(jc, candidate, job) {
  const src = jc.source ? String(jc.source).trim() : '';
  if (src && APPLICATION_SOURCES.has(src)) return true;
  return interestMatches(candidate, job);
}

function collectCandidateSkillKeys(candidate) {
  const keys = new Set();
  const sk = candidate.skills;
  if (!sk || typeof sk !== 'object') return keys;
  for (const bucket of ['technical', 'soft']) {
    const arr = sk[bucket];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      if (typeof item === 'string') keys.add(normTag(item));
      else if (item && typeof item === 'object') {
        if (item.key) keys.add(normTag(item.key));
        if (item.name) keys.add(normTag(item.name));
        if (item.tag_key) keys.add(normTag(item.tag_key));
      }
    }
  }
  return keys;
}

function parseCandidateAge(candidate) {
  const ag =
    candidate.age != null ? parseInt(String(candidate.age).replace(/[^\d]/g, ''), 10) : NaN;
  if (Number.isFinite(ag) && ag > 10 && ag < 120) return ag;
  const y = candidate.birthYear != null ? parseInt(String(candidate.birthYear), 10) : NaN;
  if (Number.isFinite(y) && y > 1900) {
    const cy = new Date().getFullYear();
    return cy - y;
  }
  return null;
}

function checkHardRequirements(candidate, job, settings) {
  const reasons = [];
  const keys = collectCandidateSkillKeys(candidate);
  const skills = Array.isArray(job.skills) ? job.skills : [];

  for (const s of skills) {
    if (!s || typeof s !== 'object') continue;
    const mode = norm(s.mode);
    const key = normTag(s.key || s.name || '');
    if (!key) continue;
    if (mode === 'mandatory' && !keys.has(key)) reasons.push('mandatory_skill');
    if (mode === 'negative' && keys.has(key)) reasons.push('negative_skill');
  }

  if (settings.requireOriginalCv) {
    const ru = candidate.resumeUrl ? String(candidate.resumeUrl).trim() : '';
    if (!ru) reasons.push('no_cv');
  }

  const lic = job.licenseType ? String(job.licenseType).trim() : '';
  if (lic && lic !== 'לא חשוב') {
    const dl = norm(candidate.drivingLicense);
    const dls = Array.isArray(candidate.drivingLicenses)
      ? candidate.drivingLicenses.map((x) => norm(String(x))).join(' ')
      : '';
    const needle = norm(lic);
    if (!partialMatch(dl, needle) && !dls.includes(needle)) reasons.push('license');
  }

  const amin = Number(job.ageMin);
  const amax = Number(job.ageMax);
  if (Number.isFinite(amin) || Number.isFinite(amax)) {
    const age = parseCandidateAge(candidate);
    if (age == null) reasons.push('age_unknown');
    else {
      if (Number.isFinite(amin) && age < amin) reasons.push('age_min');
      if (Number.isFinite(amax) && age > amax) reasons.push('age_max');
    }
  }

  const jlangs = Array.isArray(job.languages) ? job.languages : [];
  const clangs = candidate.languages;
  const candLangStr = Array.isArray(clangs)
    ? clangs
        .map((x) => (typeof x === 'string' ? x : x?.language || x?.name || ''))
        .map(norm)
        .join('|')
    : '';

  for (const jl of jlangs) {
    if (!jl || typeof jl !== 'object') continue;
    const reqName = norm(jl.language || jl.name || '');
    if (!reqName) continue;
    const mandatory = jl.mandatory === true || norm(jl.level) === 'mandatory';
    if (mandatory && !candLangStr.includes(reqName)) reasons.push('mandatory_language');
  }

  return { ok: reasons.length === 0, reasons };
}

function withinValidity(candidate, validityDays) {
  if (!Number.isFinite(validityDays) || validityDays <= 0) return true;
  const updated = candidate.updatedAt ? new Date(candidate.updatedAt) : null;
  if (!updated) return false;
  const ms = validityDays * 24 * 60 * 60 * 1000;
  return Date.now() - updated.getTime() <= ms;
}

function cooldownActive(lastExitAt, months) {
  if (!lastExitAt || !Number.isFinite(months) || months <= 0) return false;
  const d = new Date(lastExitAt);
  const until = new Date(d.getTime());
  until.setUTCMonth(until.getUTCMonth() + months);
  return Date.now() < until.getTime();
}

function cooldownUntilIso(lastExitAt, months) {
  const d = new Date(lastExitAt);
  const until = new Date(d.getTime());
  until.setUTCMonth(until.getUTCMonth() + months);
  return until.toISOString();
}

async function effectiveGroupForLink(jc, clientId) {
  if (jc.lastStatusGroup) return canonicalizeStatusGroup(jc.lastStatusGroup);
  return resolveStatusGroup(clientId, jc.status);
}

function workflowMetaPlain(jc) {
  return jc.workflowMeta && typeof jc.workflowMeta === 'object' && !Array.isArray(jc.workflowMeta)
    ? jc.workflowMeta
    : {};
}

function buildScreeningJobPayload(job, candidate, jc) {
  const jp = job.get ? job.get({ plain: true }) : { ...job };
  const wm = workflowMetaPlain(jc);
  const fp = wm.filterPosition != null ? String(wm.filterPosition).trim() : '';
  const fn = wm.filterNotes != null ? String(wm.filterNotes).trim() : '';
  const matchPct =
    typeof candidate.matchScore === 'number' && Number.isFinite(candidate.matchScore)
      ? candidate.matchScore
      : 85;
  return {
    ...jp,
    matchPercentage: matchPct,
    filterPosition: fp || undefined,
    filterNotes: fn || undefined,
  };
}

async function evaluateLink(candidate, jc, job, settings, clientId) {
  const group = await effectiveGroupForLink(jc, clientId);
  const jobPayload = buildScreeningJobPayload(job, candidate, jc);
  const baseOut = {
    group,
    jobPayload,
    jobCandidateId: jc.id,
  };

  if (group === 'advanced' || group === 'hired') {
    return { include: false, path: null, reasons: ['already_advanced'], ...baseOut };
  }

  const manual = jc.manualOverride === true;
  if (manual && (group === 'applied' || group === 'screening')) {
    return { include: true, path: 2, reasons: [], ...baseOut };
  }

  const affinity = hasAffinity(jc, candidate, job);
  if (!affinity) {
    return { include: false, path: null, reasons: ['no_affinity'], ...baseOut };
  }

  const hard = checkHardRequirements(candidate, job, settings);
  if (!hard.ok) {
    return { include: false, path: null, reasons: hard.reasons, ...baseOut };
  }

  if (!withinValidity(candidate, settings.validityDays)) {
    return { include: false, path: null, reasons: ['profile_expired'], ...baseOut };
  }

  if (jc.lastExitAt && cooldownActive(jc.lastExitAt, settings.reScreeningCooldownMonths)) {
    return {
      include: false,
      path: null,
      reasons: ['cooldown'],
      meta: {
        until: cooldownUntilIso(jc.lastExitAt, settings.reScreeningCooldownMonths),
        lastExitReason: jc.lastExitReason || null,
      },
      ...baseOut,
    };
  }

  if (group === 'applied' || group === 'screening' || group === 'exit') {
    const path = jcHasExplicitApplicationSource(jc) ? 1 : 3;
    return { include: true, path, reasons: [], ...baseOut };
  }

  return { include: false, path: null, reasons: ['status_not_screening'], ...baseOut };
}

async function computeScreeningForCandidate(candidateId) {
  const candidate = await Candidate.findByPk(candidateId);
  if (!candidate) {
    const err = new Error('Candidate not found');
    err.status = 404;
    throw err;
  }

  const links = await JobCandidate.findAll({
    where: { candidateId, jobId: { [Op.ne]: null } },
    include: [{ model: Job, as: 'job', required: true }],
    order: [['updatedAt', 'DESC']],
  });

  const included = [];
  const excluded = [];

  for (const jc of links) {
    const job = jc.job;
    const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(job);
    const clientId = settings.clientId;
    const ev = await evaluateLink(candidate, jc, job, settings, clientId);
    const row = {
      job: ev.jobPayload,
      jobCandidateId: ev.jobCandidateId,
      path: ev.path,
      reasons: ev.reasons,
      meta: ev.meta || null,
      matchPercentage: ev.jobPayload.matchPercentage,
    };
    if (ev.include) included.push(row);
    else excluded.push(row);
  }

  return { included, excluded };
}

async function computeScreeningForJob(jobId) {
  const job = await Job.findByPk(jobId);
  if (!job) {
    const err = new Error('Job not found');
    err.status = 404;
    throw err;
  }

  const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(job);
  const clientId = settings.clientId;

  const links = await JobCandidate.findAll({
    where: { jobId },
    include: [{ model: Candidate, as: 'candidate', required: true }],
    order: [['updatedAt', 'DESC']],
  });

  const included = [];
  const excluded = [];

  for (const jc of links) {
    const candidate = jc.candidate;
    const ev = await evaluateLink(candidate, jc, job, settings, clientId);
    const candPlain = candidate.get ? candidate.get({ plain: true }) : candidate;
    const row = {
      candidate: candPlain,
      jobCandidateId: ev.jobCandidateId,
      path: ev.path,
      reasons: ev.reasons,
      meta: ev.meta || null,
      matchPercentage:
        typeof candPlain.matchScore === 'number' ? candPlain.matchScore : ev.jobPayload?.matchPercentage ?? 85,
    };
    if (ev.include) included.push(row);
    else excluded.push(row);
  }

  return { job: job.get({ plain: true }), included, excluded };
}

async function precheckManualAdd(jobId, candidateId) {
  const job = await Job.findByPk(jobId);
  const candidate = await Candidate.findByPk(candidateId);
  if (!job || !candidate) {
    const err = new Error(!job ? 'Job not found' : 'Candidate not found');
    err.status = 404;
    throw err;
  }

  const settings = await clientUsageSettingService.resolveScreeningDefaultsForJob(job);
  const clientId = settings.clientId;

  let jc = await JobCandidate.findOne({ where: { jobId, candidateId } });
  const warnings = [];

  if (!jc) {
    jc = JobCandidate.build({
      jobId,
      candidateId,
      status: 'חדש',
      source: null,
      manualOverride: false,
      workflowMeta: {},
    });
  }

  const group = await effectiveGroupForLink(jc, clientId);

  if (group === 'advanced' || group === 'hired') {
    warnings.push({ code: 'already_advanced', group });
  }

  if (jc.lastExitAt && cooldownActive(jc.lastExitAt, settings.reScreeningCooldownMonths)) {
    warnings.push({
      code: 'cooldown',
      until: cooldownUntilIso(jc.lastExitAt, settings.reScreeningCooldownMonths),
      lastExitReason: jc.lastExitReason || null,
    });
  }

  const hard = checkHardRequirements(candidate, job, settings);
  if (!hard.ok) {
    warnings.push({ code: 'hard_requirements', reasons: hard.reasons });
  }

  return { warnings, settings: { validityDays: settings.validityDays, reScreeningCooldownMonths: settings.reScreeningCooldownMonths } };
}

module.exports = {
  computeScreeningForCandidate,
  computeScreeningForJob,
  precheckManualAdd,
  checkHardRequirements,
  hasAffinity,
  APPLICATION_SOURCES,
};
