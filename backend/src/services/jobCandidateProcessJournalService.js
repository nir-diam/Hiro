const { v4: uuidv4 } = require('uuid');
const JobCandidate = require('../models/JobCandidate');
const JobCandidateStatusEvent = require('../models/JobCandidateStatusEvent');
const Job = require('../models/Job');
const User = require('../models/User');
const RecruitmentStatus = require('../models/RecruitmentStatus');
const CandidatePipeline = require('../models/CandidatePipeline');
const CandidatePipelineStage = require('../models/CandidatePipelineStage');
const clientUsageSettingService = require('./clientUsageSettingService');

const JOURNAL_CAP = 200;

const { EVENT_CLOSED_SUMMARY, EVENT_REOPENED_SUMMARY } = require('../utils/clientEventHistory');

const displayNameFromUser = (u) => {
  if (!u) return 'מערכת';
  const plain = u.get ? u.get({ plain: true }) : u;
  const n = plain.name && String(plain.name).trim();
  if (n) return n;
  const e = plain.email && String(plain.email).trim();
  if (e) return e;
  return 'משתמש';
};

const plainWorkflowMeta = (wm) =>
  wm && typeof wm === 'object' && !Array.isArray(wm) ? { ...wm } : {};

const tagsForStatusGroup = (statusGroup) => {
  const sg = String(statusGroup || '').trim();
  const tags = [];
  if (sg) tags.push(sg);
  if (!tags.some((t) => /גיוס/i.test(t))) tags.push('גיוס');
  return tags.slice(0, 4);
};

/**
 * Append or extend process journal inside workflowMeta.statusJournal.
 */
function appendStatusJournal(meta, payload) {
  const base = plainWorkflowMeta(meta);
  const journal = Array.isArray(base.statusJournal) ? [...base.statusJournal] : [];
  const {
    status,
    fromStatus,
    description,
    creator,
    dueDate,
    dueTime,
    subUpdate,
    forceNew,
  } = payload;

  if (!forceNew && subUpdate && journal.length > 0 && journal[0].status === status) {
    const head = { ...journal[0] };
    head.updates = Array.isArray(head.updates) ? [...head.updates] : [];
    head.updates.unshift(subUpdate);
    journal[0] = head;
    base.statusJournal = journal.slice(0, JOURNAL_CAP);
    return base;
  }

  const entry = {
    id: uuidv4(),
    status: String(status || '').trim(),
    fromStatus: fromStatus != null ? String(fromStatus).trim() : null,
    description: description != null ? String(description).trim() : '',
    createdAt: new Date().toISOString(),
    creator: creator || 'מערכת',
    dueDate: dueDate || null,
    dueTime: dueTime || null,
    isActive: true,
    updates: [],
  };
  journal.unshift(entry);
  base.statusJournal = journal.slice(0, JOURNAL_CAP);
  return base;
}

/** Append an activity row to a journal entry's updates; optionally set isActive. */
function appendJournalEntryActivity(entry, { summary, actor, isActive } = {}) {
  if (!entry || typeof entry !== 'object') return entry;
  const title = String(summary || '').trim();
  if (!title) return entry;
  const creator = String(actor || 'מערכת').trim() || 'מערכת';
  const ts = new Date().toISOString();
  const updates = Array.isArray(entry.updates) ? [...entry.updates] : [];
  updates.unshift({
    id: uuidv4(),
    title,
    date: ts,
    creator,
  });
  const next = {
    ...entry,
    updates: updates.slice(0, 50),
  };
  if (isActive !== undefined) {
    next.isActive = isActive !== false;
  }
  return next;
}

async function resolveClientIdForJobCandidate(jc) {
  if (!jc?.jobId) return null;
  const job = await Job.findByPk(jc.jobId, { attributes: ['id', 'client', 'clientId'] });
  if (job?.clientId) return String(job.clientId);
  if (!job?.client) return null;

  const label = String(job.client).trim();
  const direct = await clientUsageSettingService.getClientIdForJobClientLabel(label);
  if (direct) return direct;

  const beforeParen = label.split('(')[0].trim();
  if (beforeParen && beforeParen !== label) {
    const fromPrefix = await clientUsageSettingService.getClientIdForJobClientLabel(beforeParen);
    if (fromPrefix) return fromPrefix;
  }

  const parenMatch = label.match(/\(([^)]+)\)/);
  if (parenMatch?.[1]) {
    const fromInner = await clientUsageSettingService.getClientIdForJobClientLabel(parenMatch[1].trim());
    if (fromInner) return fromInner;
  }

  return null;
}

async function loadStatusTagsByName(clientId) {
  const map = new Map();
  if (!clientId) return map;

  const pipelines = await CandidatePipeline.findAll({
    where: { clientId },
    include: [{ model: CandidatePipelineStage, as: 'stages', required: false }],
  });
  for (const p of pipelines) {
    const pipelineName = String(p.name || 'תהליך מועמדים').trim() || 'תהליך מועמדים';
    for (const s of p.stages || []) {
      const stageName = String(s.name || '').trim();
      if (stageName) map.set(stageName, [pipelineName, 'גיוס']);
    }
  }

  const rows = await RecruitmentStatus.findAll({
    where: { clientId, isActive: true },
    attributes: ['name', 'statusGroup'],
  });
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (name && !map.has(name)) {
      map.set(name, tagsForStatusGroup(r.statusGroup));
    }
  }
  return map;
}

async function resolveUserLabels(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const users = await User.findAll({
    where: { id: ids },
    attributes: ['id', 'name', 'email'],
  });
  const map = new Map();
  for (const u of users) {
    map.set(String(u.id), displayNameFromUser(u));
  }
  return map;
}

function normalizeJournalEntry(raw, tagMap) {
  if (!raw || typeof raw !== 'object') return null;
  const status = String(raw.status || '').trim();
  if (!status) return null;
  const updates = Array.isArray(raw.updates)
    ? raw.updates
        .map((u, i) => {
          if (!u || typeof u !== 'object') return null;
          const title = String(u.title || u.summary || '').trim();
          if (!title) return null;
          return {
            id: String(u.id || `u-${i}`),
            title,
            date: String(u.date || u.timestamp || ''),
            creator: String(u.creator || u.user || ''),
          };
        })
        .filter(Boolean)
    : [];
  return {
    id: String(raw.id || uuidv4()),
    title: status,
    status,
    description: String(raw.description || ''),
    date: String(raw.createdAt || raw.date || new Date().toISOString()),
    creator: String(raw.creator || 'מערכת'),
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : null,
    dueTime: raw.dueTime ? String(raw.dueTime) : null,
    isActive: raw.isActive !== false,
    tags: tagMap.get(status) || tagsForStatusGroup(''),
    updates,
  };
}

async function backfillJournalFromEvents(jc, tagMap) {
  const events = await JobCandidateStatusEvent.findAll({
    where: { jobCandidateId: jc.id },
    order: [['changedAt', 'DESC']],
  });
  if (!events.length) {
    const status = String(jc.status || 'חדש').trim() || 'חדש';
    const wm = plainWorkflowMeta(jc.workflowMeta);
    return [
      normalizeJournalEntry(
        {
          id: `initial-${jc.id}`,
          status,
          description: wm.internalNote || '',
          createdAt: jc.updatedAt || jc.createdAt || new Date().toISOString(),
          creator: 'מערכת',
          dueDate: wm.dueDate || null,
          dueTime: wm.dueTime || null,
          updates: [],
        },
        tagMap,
      ),
    ].filter(Boolean);
  }

  const userIds = events.map((e) => e.changedByUserId).filter(Boolean);
  const userLabels = await resolveUserLabels(userIds);
  const wm = plainWorkflowMeta(jc.workflowMeta);

  return events
    .map((ev, idx) => {
      const status = String(ev.toStatus || '').trim();
      if (!status) return null;
      const creator = userLabels.get(String(ev.changedByUserId)) || 'מערכת';
      const isLatest = idx === 0;
      return normalizeJournalEntry(
        {
          id: String(ev.id),
          status,
          fromStatus: ev.fromStatus,
          description: isLatest ? wm.internalNote || '' : '',
          createdAt: ev.changedAt || new Date().toISOString(),
          creator,
          dueDate: isLatest ? wm.dueDate || null : null,
          dueTime: isLatest ? wm.dueTime || null : null,
          updates: isLatest && Array.isArray(wm.statusJournal?.[0]?.updates) ? wm.statusJournal[0].updates : [],
        },
        tagMap,
      );
    })
    .filter(Boolean);
}

async function getProcessJournal(jobCandidateId) {
  const jc = await JobCandidate.findByPk(jobCandidateId);
  if (!jc) {
    const err = new Error('Job link not found');
    err.status = 404;
    throw err;
  }

  const clientId = await resolveClientIdForJobCandidate(jc);
  const tagMap = await loadStatusTagsByName(clientId);
  const wm = await materializeStatusJournal(jc, tagMap);
  const entries = (Array.isArray(wm.statusJournal) ? wm.statusJournal : [])
    .map((row) => normalizeJournalEntry(row, tagMap))
    .filter(Boolean);

  return {
    jobCandidateId: jc.id,
    candidateId: jc.candidateId,
    jobId: jc.jobId,
    clientId,
    currentStatus: String(jc.status || '').trim(),
    workflowMeta: {
      internalNote: wm.internalNote != null ? String(wm.internalNote) : '',
      dueDate: wm.dueDate != null ? String(wm.dueDate) : '',
      dueTime: wm.dueTime != null ? String(wm.dueTime) : '',
      inviteCandidate: Boolean(wm.inviteCandidate),
      inviteClient: Boolean(wm.inviteClient),
    },
    entries,
  };
}

async function materializeStatusJournal(jc, tagMap) {
  const meta = plainWorkflowMeta(jc.workflowMeta);
  if (Array.isArray(meta.statusJournal) && meta.statusJournal.length) {
    return meta;
  }
  const entries = await backfillJournalFromEvents(jc, tagMap);
  meta.statusJournal = entries
    .map((entry) => ({
      id: entry.id,
      status: entry.status,
      fromStatus: null,
      description: entry.description || '',
      createdAt: entry.date || new Date().toISOString(),
      creator: entry.creator || 'מערכת',
      dueDate: entry.dueDate || null,
      dueTime: entry.dueTime || null,
      isActive: entry.isActive !== false,
      updates: Array.isArray(entry.updates)
        ? entry.updates.map((update) => ({
            id: update.id,
            title: update.title,
            date: update.date,
            creator: update.creator,
          }))
        : [],
    }))
    .filter((row) => row.status);
  return meta;
}

async function materializeStatusJournalForPatch(jc) {
  const clientId = await resolveClientIdForJobCandidate(jc);
  const tagMap = await loadStatusTagsByName(clientId);
  return materializeStatusJournal(jc, tagMap);
}

async function patchJournalEntry(jobCandidateId, entryId, body, actor) {
  const jc = await JobCandidate.findByPk(jobCandidateId);
  if (!jc) {
    const err = new Error('Job link not found');
    err.status = 404;
    throw err;
  }

  const clientId = await resolveClientIdForJobCandidate(jc);
  const tagMap = await loadStatusTagsByName(clientId);
  let meta = await materializeStatusJournal(jc, tagMap);
  const journal = Array.isArray(meta.statusJournal) ? [...meta.statusJournal] : [];
  const idx = journal.findIndex((row) => String(row.id) === String(entryId));
  if (idx < 0) {
    const err = new Error('Journal entry not found');
    err.status = 404;
    throw err;
  }
  if (idx !== 0) {
    const err = new Error('Only the latest journal entry can be edited');
    err.status = 403;
    throw err;
  }

  const actorName = actor || 'מערכת';
  let entry = { ...journal[idx] };
  if (body.description !== undefined) {
    entry.description = body.description == null ? '' : String(body.description).trim();
  }
  if (body.dueDate !== undefined) {
    entry.dueDate = body.dueDate == null || body.dueDate === '' ? null : String(body.dueDate).slice(0, 10);
  }
  if (body.dueTime !== undefined) {
    entry.dueTime = body.dueTime == null || body.dueTime === '' ? null : String(body.dueTime);
  }
  if (body.creator !== undefined) {
    entry.creator =
      body.creator == null || body.creator === '' ? 'מערכת' : String(body.creator).trim();
  }
  if (body.isActive !== undefined) {
    const prevActive = entry.isActive !== false;
    const nextActive = body.isActive !== false;
    entry.isActive = nextActive;
    if (prevActive !== nextActive) {
      entry = appendJournalEntryActivity(entry, {
        summary: nextActive ? EVENT_REOPENED_SUMMARY : EVENT_CLOSED_SUMMARY,
        actor: actorName,
      });
    }
  }
  const nextStageTitle =
    body.nextStageTitle != null ? String(body.nextStageTitle).trim() : '';
  if (nextStageTitle) {
    const updates = Array.isArray(entry.updates) ? [...entry.updates] : [];
    updates.unshift({
      id: uuidv4(),
      title: nextStageTitle,
      date: new Date().toISOString(),
      creator: actorName,
    });
    entry.updates = updates.slice(0, 50);
  }

  journal[idx] = entry;
  meta.statusJournal = journal;
  if (idx === 0) {
    meta.internalNote = entry.description || meta.internalNote || '';
    if (entry.dueDate !== undefined) meta.dueDate = entry.dueDate;
    if (entry.dueTime !== undefined) meta.dueTime = entry.dueTime;
  }

  await jc.update({ workflowMeta: meta });
  return getProcessJournal(jobCandidateId);
}

/**
 * Mutate workflowMeta with a journal row when status or notes change.
 */
function applyJournalOnStatusPatch({
  workflowMeta,
  prevStatus,
  newStatus,
  actor,
  internalNoteChanged,
  internalNote,
  dueDate,
  dueTime,
  forceAppendStatus = false,
}) {
  let meta = plainWorkflowMeta(workflowMeta);
  const actorName = actor || 'מערכת';
  const prev = String(prevStatus || '').trim();
  const next = String(newStatus || '').trim();
  const statusChanged = prev !== next;
  const shouldAppend = statusChanged || forceAppendStatus;

  if (shouldAppend) {
    const desc =
      (internalNote && String(internalNote).trim()) ||
      (statusChanged
        ? `עודכן סטטוס ל-${next}`
        : `עודכן שלב: ${next}`);
    meta = appendStatusJournal(meta, {
      status: next,
      fromStatus: prev || null,
      description: desc,
      creator: actorName,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      forceNew: true,
    });
  } else if (internalNoteChanged && internalNote) {
    meta = appendStatusJournal(meta, {
      status: next,
      subUpdate: {
        id: uuidv4(),
        title: String(internalNote).trim(),
        date: new Date().toISOString(),
        creator: actorName,
      },
    });
    if (meta.statusJournal?.[0]) {
      meta.statusJournal[0].description = String(internalNote).trim();
    }
  }

  return meta;
}

module.exports = {
  appendStatusJournal,
  appendJournalEntryActivity,
  applyJournalOnStatusPatch,
  plainWorkflowMeta,
  getProcessJournal,
  patchJournalEntry,
  materializeStatusJournalForPatch,
  displayNameFromUser,
};
