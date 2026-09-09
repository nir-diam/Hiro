import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
  CalendarDaysIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BuildingOffice2Icon,
  FunnelIcon,
  XMarkIcon,
  PencilIcon,
  CheckIcon,
  UserIcon,
  ArrowPathIcon,
  BriefcaseIcon,
  MagnifyingGlassIcon,
  InformationCircleIcon,
  TrashIcon,
} from './Icons';
import ProcessEventModal, { type ProcessEventSavePayload } from './ProcessEventModal';
import ProcessManagementCatalogPanel from './ProcessManagementCatalogPanel';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import JobDetailsDrawer from './JobDetailsDrawer';
import ContactDrawer from './ContactDrawer';
import OrganizationPreviewDrawer, {
  type OrganizationPreviewDrawerTarget,
} from './OrganizationPreviewDrawer';
import type { Contact } from './ClientsListView';
import type { Candidate } from './CandidatesListView';
import { authHeaders } from '../utils/authHeaders';
import { fetchPipelines, type PipelineDto, type PipelineStageDto } from '../services/pipelinesApi';
import { fetchCandidatePipelines, patchCandidatePipelineStage } from '../services/candidatePipelinesApi';
import { fetchStaffUsers } from '../services/usersApi';
import { fetchSystemEvents } from '../services/systemEventsApi';
import {
  buildSystemEventGroupsFromApiRows,
  buildSystemEventPipelineMatches,
  eventMatchesPipelineFilters,
  eventMatchesSystemEventFilters,
  filterOutcomesByStageSelection,
  type EnrichedPipeline,
  type SystemEventCatalogGroup,
} from '../utils/processManagementCatalog';
import { applyOutcomeDueDate, outcomeActionSubtitle, summarizeAutomationResults } from '../utils/processOutcomeSla';
import { dueDateTimeAfterSla, normalizeSlaUnit } from '../utils/slaDuration';
import { approvePipelineAutomations, executePipelineOutcome } from '../services/pipelineOutcomesApi';
import { dispatchClientJournalUpdated } from '../utils/clientJournalEvents';
import { fetchCandidateLinkedJobs, fetchJobLinkProcessJournal, patchJobLinkProcessJournalEntry, type CandidateJobLink, type ProcessJournalResponse } from '../utils/candidateLinkedJobs';
import {
  automationErrors,
  pendingAutomationRows,
  type PendingAutomationRow,
} from '../utils/automationApproval';
import AutomationApprovalModal from './AutomationApprovalModal';
import OutcomeAutomationsInfoModal from './OutcomeAutomationsInfoModal';
import { fetchClientMessageTemplates, type MessageTemplateDto } from '../services/messageTemplatesApi';
import {
  buildMoveTargetOptions,
  resolveMoveTarget,
  resolveStageIdFromMoveTargetLabel,
} from '../utils/pipelineMoveTargets';
import { useAuth } from '../context/AuthContext';
import {
  buildCandidateDrawerStub,
  buildContactDrawerStub,
  buildJobDrawerStub,
  hydrateContactForDrawer,
  hydrateJobForDrawer,
  type JobDrawerJob,
} from '../utils/processEntityDrawers';

export type JournalEvent = {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string;
  date: string;
  creator: string;
  dueDate: string | null;
  status: string;
  contactId: string | null;
  contactName: string | null;
  linkedToType?: string | null;
  isActive?: boolean;
  process: string;
  processId?: string | null;
  organizationId?: string | null;
  stage: string;
  stageId?: string | null;
  type?: string[];
  metadata?: Record<string, unknown>;
  updates: Array<{ id: string; title: string; date: string; creator: string; comment?: string }>;
};

type ActionPipelineContext = {
  pipeline: PipelineDto;
  pipelineKind: 'client' | 'candidate';
  stage: PipelineStageDto;
};

type ActionOutcome = {
  id: string;
  title: string;
  actionType: 'stay' | 'move' | 'freeze' | 'close';
  targetStageId?: string;
  autoFollowupDays?: number;
  trigger?: { type?: string; systemEventId?: string };
  automations?: unknown[];
};

const SYSTEM_EVENT_GROUPS_FALLBACK: SystemEventCatalogGroup[] = [
  {
    label: 'פורטל מועמד',
    events: [{
      value: 'candidate_confirmed_profile',
      label: 'אישור הפרופיל על ידי המועמד',
      triggerName: 'מועמד',
      eventName: 'אישור הפרופיל על ידי המועמד',
      rowIds: [],
    }],
  },
  {
    label: 'אישורי הגעה',
    events: [
      {
        value: 'candidate_confirmed_interview',
        label: 'אישר_הגעה_לראיון',
        triggerName: 'מועמד',
        eventName: 'אישר_הגעה_לראיון',
        rowIds: [],
      },
      {
        value: 'candidate_canceled_interview',
        label: 'ביטל_הגעה_לראיון',
        triggerName: 'מועמד',
        eventName: 'ביטל_הגעה_לראיון',
        rowIds: [],
      },
      {
        value: 'candidate_requested_reschedule',
        label: 'ביקש_לשנות_מועד',
        triggerName: 'מועמד',
        eventName: 'ביקש_לשנות_מועד',
        rowIds: [],
      },
    ],
  },
];

const processLabel = (p: string) => {
  const key = String(p || '').toLowerCase();
  if (key === 'sales' || key.includes('מכיר')) return 'מכירות';
  if (key === 'retention' || key.includes('שימור')) return 'שימור';
  if (key === 'collection' || key.includes('גבי')) return 'גבייה';
  return p || 'כללי';
};

const matchPipelineForEvent = (
  event: JournalEvent,
  pipelines: PipelineDto[],
): PipelineDto | undefined => {
  if (!pipelines.length) return undefined;
  if (event.processId) {
    const byId = pipelines.find((p) => p.id === event.processId);
    if (byId) return byId;
  }
  const proc = String(event.process || '').toLowerCase().trim();
  if (!proc) return pipelines[0];
  const found = pipelines.find((p) => {
    const n = String(p.name || '').toLowerCase();
    return (
      n === proc ||
      n.includes(proc) ||
      proc.includes(n) ||
      (proc.includes('sales') && n.includes('מכיר')) ||
      (proc.includes('מכיר') && (n.includes('sales') || n.includes('מכיר'))) ||
      (proc.includes('retention') && n.includes('שימור')) ||
      (proc.includes('שימור') && (n.includes('retention') || n.includes('שימור'))) ||
      (proc.includes('collection') && n.includes('גבי')) ||
      (proc.includes('גבי') && (n.includes('collection') || n.includes('גבי'))) ||
      (proc.includes('ראיון') && n.includes('ראיון'))
    );
  });
  return found || pipelines[0];
};

const resolveCandidateIdFromEvent = (event: JournalEvent): string | null => {
  const meta = event.metadata;
  if (meta?.candidateId) return String(meta.candidateId);
  if (meta?.missingDetailsCompletedCandidate) return String(meta.missingDetailsCompletedCandidate);
  if (meta?.profileApprovedByCandidate) return String(meta.profileApprovedByCandidate);
  const linkedType = String(event.linkedToType || '').trim();
  if (linkedType === 'מועמד' && event.contactId) return String(event.contactId);
  return null;
};

type ContactLookupRow = { id: string; name: string; organizationId?: string | null };

const normalizeContactLookupName = (name: string | null | undefined): string =>
  String(name || '').trim().toLowerCase();

const buildContactIdLookups = (rows: ContactLookupRow[]) => {
  const byName = new Map<string, string[]>();
  const byOrgAndName = new Map<string, string>();
  for (const row of rows) {
    const id = String(row.id || '').trim();
    const nameKey = normalizeContactLookupName(row.name);
    if (!id || !nameKey) continue;
    const orgId = String(row.organizationId || '').trim();
    if (orgId) byOrgAndName.set(`${orgId}|${nameKey}`, id);
    const bucket = byName.get(nameKey) || [];
    bucket.push(id);
    byName.set(nameKey, bucket);
  }
  const uniqueByName = new Map<string, string>();
  for (const [nameKey, ids] of byName.entries()) {
    if (ids.length === 1) uniqueByName.set(nameKey, ids[0]);
  }
  return { uniqueByName, byOrgAndName };
};

const lookupContactId = (
  event: JournalEvent,
  lookups: ReturnType<typeof buildContactIdLookups>,
): string | null => {
  const nameKey = normalizeContactLookupName(event.contactName);
  if (!nameKey) return null;
  const orgId = String(event.organizationId || '').trim();
  if (orgId) {
    const scoped = lookups.byOrgAndName.get(`${orgId}|${nameKey}`);
    if (scoped) return scoped;
  }
  return lookups.uniqueByName.get(nameKey) || null;
};

const resolveContactIdFromEvent = (
  event: JournalEvent,
  contactLookups?: ReturnType<typeof buildContactIdLookups>,
): string | null => {
  if (resolveCandidateIdFromEvent(event)) return null;
  const linkedType = String(event.linkedToType || '').trim();
  if (linkedType === 'לקוח' || linkedType === 'מועמד') return null;
  if (event.contactId) return String(event.contactId);
  if (contactLookups) {
    return lookupContactId(event, contactLookups);
  }
  return null;
};

const resolveContactIdForDrawer = (
  event: JournalEvent,
  scopeContactId?: string | null,
  scopeContactName?: string | null,
  contactLookups?: ReturnType<typeof buildContactIdLookups>,
): string | null => {
  const fromEvent = resolveContactIdFromEvent(event, contactLookups);
  if (fromEvent) return fromEvent;
  if (!scopeContactId) return null;
  if (event.contactId && String(event.contactId) === String(scopeContactId)) {
    return String(scopeContactId);
  }
  const scopedName = String(scopeContactName || '').trim();
  const eventName = String(event.contactName || '').trim();
  if (
    scopedName
    && eventName
    && (eventName.includes(scopedName) || scopedName.includes(eventName))
  ) {
    return String(scopeContactId);
  }
  return null;
};

const shouldShowPersonBadge = (
  event: JournalEvent,
  contactLookups?: ReturnType<typeof buildContactIdLookups>,
): boolean => {
  const linkedType = String(event.linkedToType || '').trim();
  if (linkedType === 'לקוח') return false;
  if (linkedType === 'מועמד' || linkedType === 'איש קשר') return Boolean(event.contactName);
  if (resolveCandidateIdFromEvent(event)) return Boolean(event.contactName);
  if (event.contactId) return Boolean(event.contactName);
  if (event.contactName && contactLookups && lookupContactId(event, contactLookups)) return true;
  return false;
};

const resolveCandidateIdForDrawer = (
  event: JournalEvent,
  scopeCandidateId?: string | null,
): string | null => {
  const fromEvent = resolveCandidateIdFromEvent(event);
  if (fromEvent) return fromEvent;
  const linkedType = String(event.linkedToType || '').trim();
  if (linkedType === 'איש קשר') return null;
  if (!scopeCandidateId) return null;
  if (linkedType === 'מועמד') return String(scopeCandidateId);
  if (eventMatchesContact(event, null, null, scopeCandidateId)) {
    return String(scopeCandidateId);
  }
  return null;
};

const normalizeJobTitle = (title: string | null | undefined): string | null => {
  const t = String(title || '').trim();
  if (!t || t === '—') return null;
  return t;
};

const pickJobLinkForEvent = (
  links: CandidateJobLink[],
  event: JournalEvent,
): CandidateJobLink | null => {
  if (!links.length) return null;
  const meta = event.metadata || {};
  if (meta.jobCandidateId) {
    const byLink = links.find((link) => link.linkId === String(meta.jobCandidateId));
    if (byLink) return byLink;
  }
  if (event.clientId) {
    const byClient = links.filter((link) => link.clientId === event.clientId);
    if (byClient.length === 1) return byClient[0];
    if (byClient.length > 1) return byClient[0];
  }
  if (links.length === 1) return links[0];
  return links[0];
};

const buildEventJournalSearchHaystack = (
  event: JournalEvent,
  companyLabel: string,
  candidateJobLinksById: Record<string, CandidateJobLink[]>,
  scopeCandidateId?: string | null,
): string => {
  const parts: string[] = [];
  const meta = event.metadata || {};
  const linkedType = String(event.linkedToType || '').trim();

  if (linkedType === 'מועמד' || resolveCandidateIdFromEvent(event)) {
    const name = String(event.contactName || '').trim();
    if (name) parts.push(name);
  }

  if (linkedType === 'איש קשר' || resolveContactIdFromEvent(event)) {
    const name = String(event.contactName || '').trim();
    if (name) parts.push(name);
  }

  if (companyLabel) parts.push(companyLabel);
  if (event.clientName && event.clientName !== companyLabel) parts.push(event.clientName);

  const metaJobTitle = normalizeJobTitle(meta.jobTitle as string | undefined);
  if (metaJobTitle) parts.push(metaJobTitle);
  const metaJobCompany =
    meta.jobCompany && String(meta.jobCompany).trim() && String(meta.jobCompany) !== '—'
      ? String(meta.jobCompany)
      : '';
  if (metaJobCompany) parts.push(metaJobCompany);

  const candidateId = resolveCandidateIdForDrawer(event, scopeCandidateId);
  if (candidateId) {
    const links = candidateJobLinksById[candidateId] || [];
    const link = pickJobLinkForEvent(links, event);
    if (link?.jobTitle) parts.push(link.jobTitle);
    if (link?.company && link.company !== '—') parts.push(link.company);
  }

  return parts.join(' ').toLowerCase();
};

const eventMatchesJournalSearch = (
  event: JournalEvent,
  query: string,
  companyLabel: string,
  candidateJobLinksById: Record<string, CandidateJobLink[]>,
  scopeCandidateId?: string | null,
): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return buildEventJournalSearchHaystack(
    event,
    companyLabel,
    candidateJobLinksById,
    scopeCandidateId,
  ).includes(q);
};

const GENERIC_STAGE_NAME_FRAGMENTS = ['שלב חדש', 'new stage', 'new step'];

const isGenericStageName = (name: string): boolean => {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return true;
  return GENERIC_STAGE_NAME_FRAGMENTS.some((fragment) => n === fragment.toLowerCase());
};

const collectEventStageLabels = (event: JournalEvent): string[] => {
  const labels: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    if (labels.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return;
    labels.push(trimmed);
  };
  push(event.stage);
  push(event.title);
  const updates = event.updates || [];
  if (updates.length > 0) {
    const latest = [...updates].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )[0];
    push(latest?.title);
  }
  return labels;
};

const scoreStageLabelMatch = (stageName: string, label: string): number => {
  const stage = String(stageName || '').trim().toLowerCase();
  const needle = String(label || '').trim().toLowerCase();
  if (!stage || !needle) return 0;
  if (isGenericStageName(stageName)) return 0;
  if (stage === needle) return 1000;
  if (stage.startsWith(needle) || needle.startsWith(stage)) return 500 + Math.min(stage.length, needle.length);
  if (stage.includes(needle) || needle.includes(stage)) {
    // Avoid matching short generic words like "חדש" inside "שלב חדש"
    if (needle.length <= 4) return 0;
    return Math.min(stage.length, needle.length);
  }
  return 0;
};

const matchStageForEvent = (
  event: JournalEvent,
  pipeline: PipelineDto,
  preferredStageId?: string | null,
) => {
  const stages = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!stages.length) return undefined;

  const preferredId = String(preferredStageId || '').trim();
  if (preferredId) {
    const byPreferred = stages.find((s) => s.id === preferredId);
    if (byPreferred) return byPreferred;
  }

  const meta = event.metadata;
  if (meta?.lastKanbanStageId) {
    const byKanban = stages.find((s) => s.id === String(meta.lastKanbanStageId));
    if (byKanban) return byKanban;
  }

  if (event.stageId) {
    const byId = stages.find((s) => s.id === event.stageId);
    if (byId) return byId;
  }

  const labels = collectEventStageLabels(event);
  for (const label of labels) {
    const exact = stages.find((s) => String(s.name || '').trim().toLowerCase() === label.toLowerCase());
    if (exact) return exact;
  }

  let bestStage: PipelineStageDto | undefined;
  let bestScore = 0;
  for (const stage of stages) {
    for (const label of labels) {
      const score = scoreStageLabelMatch(String(stage.name || ''), label);
      if (score > bestScore) {
        bestScore = score;
        bestStage = stage;
      }
    }
  }
  if (bestStage) return bestStage;

  const primaryLabel = String(event.stage || event.title || '').trim().toLowerCase();
  if (primaryLabel === 'חדש' || primaryLabel === 'new') {
    const firstNonGeneric = stages.find((s) => !isGenericStageName(String(s.name || '')));
    if (firstNonGeneric) return firstNonGeneric;
  }

  return stages.find((s) => !isGenericStageName(String(s.name || ''))) || stages[0];
};

const resolveActionPipelineContext = (
  event: JournalEvent,
  actionPipelineId: string | null,
  clientPipelines: PipelineDto[],
  candidatePipelines: PipelineDto[],
  preferredStageId?: string | null,
): ActionPipelineContext | null => {
  const build = (pipeline: PipelineDto, pipelineKind: 'client' | 'candidate'): ActionPipelineContext | null => {
    const stage = matchStageForEvent(event, pipeline, preferredStageId);
    if (!stage) return null;
    return { pipeline, pipelineKind, stage };
  };

  if (actionPipelineId) {
    const fromClient = clientPipelines.find((p) => p.id === actionPipelineId);
    if (fromClient) return build(fromClient, 'client');
    const fromCandidate = candidatePipelines.find((p) => p.id === actionPipelineId);
    if (fromCandidate) return build(fromCandidate, 'candidate');
  }

  if (event.processId) {
    const byClient = clientPipelines.find((p) => p.id === event.processId);
    if (byClient) return build(byClient, 'client');
    const byCandidate = candidatePipelines.find((p) => p.id === event.processId);
    if (byCandidate) return build(byCandidate, 'candidate');
  }

  const clientMatch = matchPipelineForEvent(event, clientPipelines);
  if (clientMatch) return build(clientMatch, 'client');

  const candidateMatch = matchPipelineForEvent(event, candidatePipelines);
  if (candidateMatch) return build(candidateMatch, 'candidate');

  if (clientPipelines[0]) return build(clientPipelines[0], 'client');
  if (candidatePipelines[0]) return build(candidatePipelines[0], 'candidate');
  return null;
};

const resolveStageChangeFromMoveTarget = (
  event: JournalEvent,
  moveTargetValue: string,
  clientPipelines: PipelineDto[],
  candidatePipelines: PipelineDto[] = [],
  actionPipelineId: string | null = null,
): { stageId: string; stageName: string; historyLabel: string; ctx: ActionPipelineContext | null } | null => {
  const trimmed = String(moveTargetValue || '').trim();
  if (!trimmed) return null;

  const ctx = resolveActionPipelineContext(
    event,
    actionPipelineId,
    clientPipelines,
    candidatePipelines,
    null,
  );
  if (!ctx) return null;

  const options = buildMoveTargetOptions(ctx.pipeline.stages || []);
  const selectedOption = options.find((o) => o.value === trimmed);
  const resolved = resolveMoveTarget(trimmed, ctx.pipeline.stages || []);
  if (resolved) {
    return {
      stageId: resolved.stageId,
      stageName: resolved.stageName,
      historyLabel: selectedOption?.label || resolved.outcomeName || resolved.stageName,
      ctx,
    };
  }

  const fromLabel = resolveStageIdFromMoveTargetLabel(trimmed, ctx.pipeline.stages || []);
  if (fromLabel) {
    const stage = ctx.pipeline.stages?.find((s) => s.id === fromLabel);
    return {
      stageId: fromLabel,
      stageName: String(stage?.name || trimmed).trim(),
      historyLabel: selectedOption?.label || stage?.name || trimmed,
      ctx,
    };
  }

  return null;
};

const syncKanbanFromEventStageChange = async (
  apiBase: string,
  event: JournalEvent,
  ctx: ActionPipelineContext,
  stageId: string,
  scopeOrganizationId?: string | null,
): Promise<void> => {
  const pipelineId = ctx.pipeline.id;
  if (!apiBase || !pipelineId || !stageId) return;

  if (ctx.pipelineKind === 'candidate') {
    const candidateId = resolveCandidateIdFromEvent(event);
    if (!candidateId) return;
    await patchCandidatePipelineStage(candidateId, { pipelineId, stageId });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hiro:candidate-pipeline-stage-moved', {
          detail: { candidateId, pipelineId, stageId },
        }),
      );
    }
    return;
  }

  const contactId = resolveContactIdFromEvent(event);
  if (contactId) {
    const res = await fetch(
      `${apiBase}/api/clients/${encodeURIComponent(event.clientId)}/contacts/${encodeURIComponent(contactId)}`,
      {
        method: 'PUT',
        headers: authHeaders(true),
        body: JSON.stringify({ processStage: stageId, pipelineId }),
      },
    );
    if (!res.ok) throw new Error('עדכון שלב איש קשר נכשל');
    return;
  }

  const orgId = String(event.organizationId || scopeOrganizationId || '').trim();
  if (!orgId) return;

  const linksRes = await fetch(
    `${apiBase}/api/clients/${encodeURIComponent(event.clientId)}/linked-organizations`,
    { headers: authHeaders(true), cache: 'no-store' },
  );
  if (!linksRes.ok) throw new Error('טעינת ארגונים מקושרים נכשלה');
  const linksRaw = await linksRes.json();
  const links = Array.isArray(linksRaw) ? linksRaw : [];
  const link = links.find(
    (row: Record<string, unknown>) => String(row.organizationId || '') === orgId,
  );
  const linkId = link?.id != null ? String(link.id) : '';
  if (!linkId) throw new Error('לא נמצא קישור ארגון לעדכון');

  const patchRes = await fetch(
    `${apiBase}/api/clients/${encodeURIComponent(event.clientId)}/organization-link/${encodeURIComponent(linkId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(true),
      body: JSON.stringify({ pipelineStage: stageId, pipelineId }),
    },
  );
  if (!patchRes.ok) throw new Error('עדכון שלב ארגון נכשל');
};

const getDynamicStatus = (status: string, dueDateStr: string | null) => {
  if (status === 'הושלם') return { label: 'הושלם', color: 'bg-green-100 text-green-700 border border-green-200' };
  if (status === 'בוטל') return { label: 'בוטל', color: 'bg-gray-100 text-gray-700 border border-gray-200' };

  if (!dueDateStr) {
    const label = status === 'עתידי' || !status ? 'עתידי' : status;
    const color =
      label === 'עתידי'
        ? 'bg-blue-50 text-blue-700 border border-blue-200'
        : 'bg-gray-100 text-gray-700 border border-gray-200';
    return { label, color };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateStr);
  if (Number.isNaN(dueDate.getTime())) {
    return { label: status || 'עתידי', color: 'bg-blue-50 text-blue-700 border border-blue-200' };
  }
  dueDate.setHours(0, 0, 0, 0);
  if (dueDate < today) return { label: 'באיחור', color: 'bg-red-100 text-red-700 border border-red-200' };
  if (dueDate.getTime() === today.getTime()) {
    return { label: 'להיום', color: 'bg-amber-100 text-amber-800 border border-amber-200' };
  }
  return { label: 'עתידי', color: 'bg-blue-50 text-blue-700 border border-blue-200' };
};

function patchEventFromActionResult(
  event: JournalEvent,
  actionResult: Record<string, unknown>,
): JournalEvent | null {
  const nextDueDate =
    actionResult.nextDueDate != null
      ? String(actionResult.nextDueDate).slice(0, 10)
      : actionResult.dueDate != null
        ? String(actionResult.dueDate).slice(0, 10)
        : null;
  const nextStatus =
    actionResult.nextStatus != null ? String(actionResult.nextStatus) : event.status;
  const nextStageName =
    actionResult.nextStageName != null ? String(actionResult.nextStageName) : event.stage;
  const nextStageId =
    actionResult.nextStageId != null ? String(actionResult.nextStageId) : event.stageId;
  if (!nextDueDate && nextStatus === event.status && nextStageId === event.stageId) return null;
  return {
    ...event,
    dueDate: nextDueDate || event.dueDate,
    status: nextStatus,
    stage: nextStageName || event.stage,
    stageId: nextStageId || event.stageId,
  };
}

function formatJournalDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return '';
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return String(dueDate);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

function journalEventKey(event: Pick<JournalEvent, 'id' | 'clientId'>): string {
  return `${event.clientId}-${event.id}`;
}

function statusUpdateEditKey(event: Pick<JournalEvent, 'id' | 'clientId'>, updateId: string): string {
  return `${event.clientId}:${event.id}:${updateId}`;
}

function dueDateMovedForward(
  previousDueDate: string | null | undefined,
  nextDueDate: string | null | undefined,
): boolean {
  const prev = String(previousDueDate || '').slice(0, 10);
  const next = String(nextDueDate || '').slice(0, 10);
  if (!prev || !next) return false;
  return next > prev;
}

const mapHistoryToUpdates = (
  history: unknown,
): Array<{ id: string; title: string; date: string; creator: string; comment?: string }> => {
  if (!Array.isArray(history)) return [];
  return history
    .map((h, i) => {
      if (!h || typeof h !== 'object') return null;
      const row = h as Record<string, unknown>;
      const title = String(row.summary || row.title || '').trim();
      if (!title) return null;
      const comment = row.comment != null ? String(row.comment).trim() : '';
      return {
        id: String(row.id || `h-${i}`),
        title,
        date: String(row.timestamp || row.date || ''),
        creator: String(row.user || row.creator || ''),
        ...(comment ? { comment } : {}),
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; date: string; creator: string; comment?: string }>;
};

const mapUpdatesField = (
  updates: unknown,
): Array<{ id: string; title: string; date: string; creator: string; comment?: string }> => {
  if (!Array.isArray(updates)) return [];
  return updates
    .map((u, i) => {
      if (!u || typeof u !== 'object') return null;
      const row = u as Record<string, unknown>;
      const title = String(row.title || row.summary || '').trim();
      if (!title) return null;
      const comment = row.comment != null ? String(row.comment).trim() : '';
      return {
        id: String(row.id || `u-${i}`),
        title,
        date: String(row.date || row.timestamp || ''),
        creator: String(row.creator || row.user || ''),
        ...(comment ? { comment } : {}),
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; date: string; creator: string; comment?: string }>;
};

type StatusUpdateRow = {
  id: string;
  title: string;
  date: string;
  creator: string;
  comment?: string;
};

const statusUpdateTimestamp = (update: StatusUpdateRow): number => {
  const ts = new Date(update.date).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const sortStatusUpdatesByDateDesc = (updates: StatusUpdateRow[]): StatusUpdateRow[] =>
  [...updates].sort((a, b) => statusUpdateTimestamp(b) - statusUpdateTimestamp(a));

const resolvePreferredStageIdForEvent = (
  event: JournalEvent,
  options?: {
    scopeJobLinkId?: string | null;
    defaultProcessStageId?: string | null;
  },
): string | null => {
  const stageId = String(event.stageId || '').trim();
  if (stageId) return stageId;
  const meta = event.metadata;
  if (meta?.lastKanbanStageId) return String(meta.lastKanbanStageId);
  const scopeJobLinkId = options?.scopeJobLinkId;
  const defaultProcessStageId = options?.defaultProcessStageId;
  if (
    scopeJobLinkId &&
    String(event.metadata?.jobCandidateId || '') === String(scopeJobLinkId) &&
    defaultProcessStageId
  ) {
    return String(defaultProcessStageId);
  }
  return null;
};

/** Prefer explicit updates; fall back to history. Merge if both exist. */
const resolveStatusUpdates = (raw: Record<string, unknown>) => {
  const fromUpdates = mapUpdatesField(raw.updates);
  const fromHistory = mapHistoryToUpdates(raw.history);
  if (!fromUpdates.length) return sortStatusUpdatesByDateDesc(fromHistory);
  if (!fromHistory.length) return sortStatusUpdatesByDateDesc(fromUpdates);
  // Merge by title+date key, updates first
  const seen = new Set(fromUpdates.map((u) => `${u.title}|${u.date}|${u.creator}`));
  const merged = [...fromUpdates];
  for (const h of fromHistory) {
    const key = `${h.title}|${h.date}|${h.creator}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(h);
    }
  }
  return sortStatusUpdatesByDateDesc(merged);
};

const normalizeRow = (raw: Record<string, unknown>): JournalEvent => {
  const linked = raw.linkedTo && typeof raw.linkedTo === 'object' ? (raw.linkedTo as Record<string, unknown>) : null;
  const types = Array.isArray(raw.type) ? (raw.type as string[]) : [];
  return {
    id: String(raw.id || ''),
    clientId: String(raw.clientId || ''),
    clientName: String(raw.clientName || ''),
    title: String(raw.title || 'אירוע'),
    description: String(raw.description || ''),
    date: String(raw.date || ''),
    creator: String(raw.creator || raw.coordinator || ''),
    dueDate: raw.dueDate ? String(raw.dueDate).slice(0, 10) : raw.date ? String(raw.date).slice(0, 10) : null,
    status: String(raw.status || 'עתידי'),
    isActive: raw.isActive !== false,
    contactId: raw.contactId
      ? String(raw.contactId)
      : linked?.id
        ? String(linked.id)
        : null,
    contactName: raw.contactName
      ? String(raw.contactName)
      : linked?.name
        ? String(linked.name)
        : null,
    linkedToType:
      raw.linkedToType != null
        ? String(raw.linkedToType)
        : linked?.type != null
          ? String(linked.type)
          : null,
    process: String(raw.process || types[0] || ''),
    processId: raw.processId ? String(raw.processId) : null,
    organizationId: raw.organizationId != null ? String(raw.organizationId) : null,
    stage: String(raw.stage || types[1] || ''),
    stageId: raw.stageId ? String(raw.stageId) : null,
    type: types,
    metadata:
      raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
    updates: resolveStatusUpdates(raw),
  };
};

const mapProcessJournalToEvents = (
  journal: ProcessJournalResponse,
  scopeCandidateId: string | null | undefined,
  scopeContactName: string | null | undefined,
  scopeJobCompany: string | null | undefined,
  fallbackClientId: string,
): JournalEvent[] => {
  const clientName = scopeJobCompany && scopeJobCompany !== '—' ? scopeJobCompany : 'לקוח';
  const cid = journal.clientId ? String(journal.clientId) : fallbackClientId;
  const profileOnlyStatuses = new Set(['השלמת פרטים חסרים', 'אישור הפרופיל על ידי המועמד']);
  return (journal.entries || [])
    .filter((entry) => !profileOnlyStatuses.has(String(entry.status || entry.title || '').trim()))
    .map((entry) =>
      normalizeRow({
      id: entry.id,
      clientId: cid,
      clientName,
      title: entry.title || entry.status,
      description: entry.description,
      date: entry.date,
      creator: entry.creator,
      dueDate: entry.dueDate,
      status: entry.status,
      isActive: entry.isActive !== false,
      contactId: scopeCandidateId || journal.candidateId || null,
      contactName: scopeContactName || null,
      process: Array.isArray(entry.tags) && entry.tags[0] ? entry.tags[0] : 'גיוס',
      stage: entry.status,
      type: entry.tags,
      metadata: {
        jobId: journal.jobId,
        jobCandidateId: journal.jobCandidateId,
        candidateId: journal.candidateId,
      },
      updates: entry.updates,
    }),
    );
};

const eventMatchesContact = (
  event: JournalEvent,
  contactId?: string | null,
  contactName?: string | null,
  candidateId?: string | null,
): boolean => {
  if (candidateId) {
    const fromMeta = resolveCandidateIdFromEvent(event);
    if (fromMeta && String(fromMeta) === String(candidateId)) return true;
    if (event.contactId && String(event.contactId) === String(candidateId)) return true;
  }
  if (!contactId && !contactName && !candidateId) return true;
  if (contactId && event.contactId && String(event.contactId) === String(contactId)) return true;
  if (contactName && event.contactName && String(event.contactName).includes(contactName)) return true;
  if (contactName) {
    const blob = `${event.title || ''} ${event.description || ''} ${event.creator || ''}`;
    if (blob.includes(contactName)) return true;
  }
  return false;
};

const eventMatchesOrganization = (
  event: JournalEvent,
  organizationId?: string | null,
  organizationName?: string | null,
): boolean => {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return true;
  if (String(event.organizationId || '') === orgId) return true;

  const orgName = String(organizationName || '').trim().toLowerCase();
  if (!orgName) return false;

  const linkedName = String(event.contactName || event.clientName || '').trim().toLowerCase();
  if (
    linkedName
    && (linkedName === orgName || linkedName.includes(orgName) || orgName.includes(linkedName))
  ) {
    return true;
  }

  const blob = `${event.title || ''} ${event.description || ''} ${event.process || ''}`.toLowerCase();
  return blob.includes(orgName);
};

const resolveEventCompanyLabel = (
  event: JournalEvent,
  orgNameById: Map<string, string>,
  preferOrganization: boolean,
): string => {
  const orgId = String(event.organizationId || '').trim();
  if (orgId) {
    const fromId = orgNameById.get(orgId);
    if (fromId) return fromId;
  }
  if (preferOrganization && event.linkedToType === 'לקוח' && event.contactName) {
    return event.contactName;
  }
  const clientName = String(event.clientName || '').trim();
  if (clientName) return clientName;
  return String(event.contactName || '').trim();
};

const resolveEventOrganizationRef = (
  event: JournalEvent,
  orgNameById: Map<string, string>,
  organizationOptions: Array<{ id: string; name: string; organizationId?: string | null }>,
): { organizationId: string; name: string } | null => {
  const orgId = String(event.organizationId || '').trim();
  const clientName = String(event.clientName || '').trim();
  const preferOrganization = organizationOptions.length > 0;
  const label = resolveEventCompanyLabel(event, orgNameById, preferOrganization).trim();
  if (orgId) {
    const name = orgNameById.get(orgId) || clientName || label;
    if (name) {
      return { organizationId: orgId, name };
    }
  }
  const needle = (clientName || label).toLowerCase();
  if (!needle) return null;
  const match = organizationOptions.find((opt) => {
    if (!opt.organizationId) return false;
    const name = String(opt.name || '').trim().toLowerCase();
    return name === needle || name.includes(needle) || needle.includes(name);
  });
  if (!match?.organizationId) return null;
  return {
    organizationId: String(match.organizationId),
    name: String(match.name || clientName || label).trim(),
  };
};

const pickBestProcessEvent = (rows: JournalEvent[]): JournalEvent | null => {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
  );
  return sorted.find((e) => e.isActive !== false) || sorted[0];
};

const findProcessEventForPipeline = (
  events: JournalEvent[],
  pipelineId: string,
  pipelines: EnrichedPipeline[],
  scopeContactId?: string | null,
  scopeContactName?: string | null,
  scopeCandidateId?: string | null,
  scopeOrganizationId?: string | null,
  scopeOrganizationName?: string | null,
): JournalEvent | null => {
  const pid = String(pipelineId || '').trim();
  if (!pid) return null;

  const scoped = events.filter((event) => {
    if (!eventMatchesContact(event, scopeContactId, scopeContactName, scopeCandidateId)) return false;
    if (
      scopeOrganizationId
      && !scopeContactId
      && !scopeCandidateId
      && !eventMatchesOrganization(event, scopeOrganizationId, scopeOrganizationName)
    ) {
      return false;
    }
    return true;
  });

  const byProcessId = scoped.filter((event) => String(event.processId || '') === pid);
  const byIdMatch = pickBestProcessEvent(byProcessId);
  if (byIdMatch) return byIdMatch;

  const pipeline = pipelines.find((p) => p.id === pid);
  const pipelineName = String(pipeline?.name || '').trim().toLowerCase();
  if (!pipelineName) return null;

  const byName = scoped.filter((event) => {
    const proc = String(event.process || '').trim().toLowerCase();
    if (!proc || !pipelineName) return false;
    return proc === pipelineName
      || pipelineName.startsWith(`${proc} (`)
      || pipelineName.startsWith(`${proc}(`)
      || proc.startsWith(`${pipelineName} (`)
      || proc.startsWith(`${pipelineName}(`);
  });
  return pickBestProcessEvent(byName);
};

const eventMatchesJobScope = (
  event: JournalEvent,
  jobId?: string | null,
  jobLinkId?: string | null,
  jobTitle?: string | null,
  jobCompany?: string | null,
): boolean => {
  if (!jobId && !jobLinkId && !jobTitle && !jobCompany) return true;
  const meta = event.metadata || {};
  if (jobId && meta.jobId != null && String(meta.jobId) === String(jobId)) return true;
  if (jobLinkId && meta.jobCandidateId != null && String(meta.jobCandidateId) === String(jobLinkId)) {
    return true;
  }
  const blob = `${event.title || ''} ${event.description || ''} ${event.process || ''}`.toLowerCase();
  const title = String(jobTitle || '').trim().toLowerCase();
  const company = String(jobCompany || '').trim().toLowerCase();
  if (title && title !== '—' && blob.includes(title)) return true;
  if (company && company !== '—' && blob.includes(company)) return true;
  return false;
};

/**
 * Sidebar "פעולות אפשריות" = stage.outcomes from Pipeline Settings
 * (same records configured under each stage in PipelineSettingsView).
 */
function resolveOutcomesForStage(stage: PipelineStageDto | undefined): ActionOutcome[] {
  if (!stage) return [];

  return (stage.outcomes || [])
    .map((o) => ({
      id: o.id,
      title: String(o.name || '').trim(),
      actionType: (o.actionType || 'stay') as ActionOutcome['actionType'],
      targetStageId: o.targetStageId,
      autoFollowupDays: o.autoFollowupDays,
      trigger: o.trigger,
      automations: o.automations,
    }))
    .filter((o) => o.title.length > 0);
}

/** Stage names and outcome labels for the "השלב הבא" edit dropdown. */
function resolveStagesForEvent(
  event: JournalEvent,
  clientPipelines: PipelineDto[],
  candidatePipelines: PipelineDto[] = [],
  actionPipelineId: string | null = null,
): Array<{ id: string; title: string }> {
  const ctx = resolveActionPipelineContext(
    event,
    actionPipelineId,
    clientPipelines,
    candidatePipelines,
    null,
  );
  if (!ctx) return [];
  return buildMoveTargetOptions(ctx.pipeline.stages || []).map((option) => ({
    id: option.value,
    title: option.label,
  }));
}

type ClientOption = { id: string; name: string; organizationId?: string | null };

type Props = {
  clientOptions?: ClientOption[];
  defaultClientId?: string | null;
  /** Linked org scope for tenant users (e.g. filtered company on clients page). */
  defaultOrganizationId?: string | null;
  defaultOrganizationName?: string | null;
  scopeOrganizationId?: string | null;
  scopeOrganizationName?: string | null;
  /** e.g. contacts-tab company filter label to scope new events */
  preferredOrganizationLabel?: string | null;
  /** When set, only events for this contact are shown (contact profile tab). */
  scopeContactId?: string | null;
  scopeContactName?: string | null;
  /** Match events by metadata.candidateId (candidate process modal). */
  scopeCandidateId?: string | null;
  scopeJobId?: string | null;
  scopeJobLinkId?: string | null;
  scopeJobTitle?: string | null;
  scopeJobCompany?: string | null;
  /** Hide the top filter bar (e.g. on contact profile). */
  hideFilters?: boolean;
  /** Always show description/history — no collapsed state (contact profile). */
  alwaysShowDetails?: boolean;
  /** Fit inside CandidateProcessManagementModal shell. */
  embeddedInModal?: boolean;
  defaultActionPipelineId?: string | null;
  defaultProcessStageId?: string | null;
  /** Contact Kanban placement — used to bootstrap missing process events on contact profile. */
  contactProcessPipelineId?: string | null;
  contactProcessStageId?: string | null;
  /** @deprecated Journal no longer auto-creates missing process events. */
  ensureContactProcessEvents?: boolean;
  /** @deprecated Journal no longer auto-creates missing process events. */
  ensureOrganizationProcessEvents?: boolean;
  autoSelectFirstEvent?: boolean;
  /** When true, load cross-client journal via /all-events (admin). Otherwise prefer single-client API. */
  crossClientJournal?: boolean;
  onEventsChanged?: () => void;
};

const ClientsEventsJournalTab: React.FC<Props> = ({
  clientOptions = [],
  defaultClientId = null,
  defaultOrganizationId = null,
  defaultOrganizationName = null,
  scopeOrganizationId = null,
  scopeOrganizationName = null,
  preferredOrganizationLabel = null,
  scopeContactId = null,
  scopeContactName = null,
  scopeCandidateId = null,
  scopeJobId = null,
  scopeJobLinkId = null,
  scopeJobTitle = null,
  scopeJobCompany = null,
  hideFilters = false,
  alwaysShowDetails = false,
  embeddedInModal = false,
  defaultActionPipelineId = null,
  defaultProcessStageId = null,
  contactProcessPipelineId = null,
  contactProcessStageId = null,
  ensureContactProcessEvents = false,
  ensureOrganizationProcessEvents = false,
  autoSelectFirstEvent = false,
  crossClientJournal = false,
  onEventsChanged,
}) => {
  const { user } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventModalScope, setEventModalScope] = useState<{
    clientId: string;
    organizationId: string;
    organizationName: string;
  } | null>(null);
  const [createClientId, setCreateClientId] = useState<string>(defaultClientId || clientOptions[0]?.id || '');
  const [createOrganizationId, setCreateOrganizationId] = useState<string>(
    defaultOrganizationId || scopeOrganizationId || clientOptions[0]?.organizationId || '',
  );

  useEffect(() => {
    if (defaultClientId) setCreateClientId(String(defaultClientId));
  }, [defaultClientId]);

  const tenantClientId = user?.clientId ? String(user.clientId) : '';
  const organizationOptions = useMemo(
    () => clientOptions.filter((opt) => opt.organizationId),
    [clientOptions],
  );

  const matchOrganizationOption = useCallback(
    (label: string | null | undefined) => {
      const needle = String(label || '').trim().toLowerCase();
      if (!needle) return null;
      return (
        organizationOptions.find((opt) => {
          const name = String(opt.name || '').trim().toLowerCase();
          return name === needle || name.includes(needle) || needle.includes(name);
        }) || null
      );
    },
    [organizationOptions],
  );

  const preferredOrganizationOption = useMemo(
    () => matchOrganizationOption(preferredOrganizationLabel),
    [matchOrganizationOption, preferredOrganizationLabel],
  );

  useEffect(() => {
    const nextOrg = String(
      preferredOrganizationOption?.organizationId || defaultOrganizationId || scopeOrganizationId || '',
    ).trim();
    if (nextOrg) setCreateOrganizationId(nextOrg);
  }, [preferredOrganizationOption, defaultOrganizationId, scopeOrganizationId]);

  useEffect(() => {
    if (
      createOrganizationId
      || preferredOrganizationOption?.organizationId
      || defaultOrganizationId
      || scopeOrganizationId
    ) {
      return;
    }
    const firstOrgOption = organizationOptions[0];
    if (firstOrgOption?.organizationId) {
      setCreateOrganizationId(String(firstOrgOption.organizationId));
      if (firstOrgOption.id) setCreateClientId(String(firstOrgOption.id));
    }
  }, [
    organizationOptions,
    createOrganizationId,
    preferredOrganizationOption,
    defaultOrganizationId,
    scopeOrganizationId,
  ]);

  const settingsClientId = useMemo(() => {
    if (user?.clientId) return String(user.clientId);
    return defaultClientId || createClientId || clientOptions[0]?.id || '';
  }, [user?.clientId, defaultClientId, createClientId, clientOptions]);

  const effectiveCreateClientId = useMemo(() => {
    const fromState = String(createClientId || '').trim();
    if (fromState) return fromState;
    const fromDefault = String(defaultClientId || '').trim();
    if (fromDefault) return fromDefault;
    const fromOptions = String(clientOptions[0]?.id || '').trim();
    if (fromOptions) return fromOptions;
    const fromEvent = String(events.find((event) => event.clientId)?.clientId || '').trim();
    if (fromEvent) return fromEvent;
    return '';
  }, [createClientId, defaultClientId, clientOptions, events]);

  const effectiveCreateOrganizationId = useMemo(() => {
    const fromState = String(createOrganizationId || '').trim();
    if (fromState) return fromState;
    const fromPreferred = String(preferredOrganizationOption?.organizationId || '').trim();
    if (fromPreferred) return fromPreferred;
    const fromScope = String(scopeOrganizationId || defaultOrganizationId || '').trim();
    if (fromScope) return fromScope;

    const scopeLabel =
      (preferredOrganizationLabel && preferredOrganizationLabel !== 'all'
        ? preferredOrganizationLabel
        : '') ||
      (scopeJobCompany && scopeJobCompany !== '—' ? scopeJobCompany : '') ||
      (scopeOrganizationName && scopeOrganizationName !== '—' ? scopeOrganizationName : '') ||
      (defaultOrganizationName && defaultOrganizationName !== '—' ? defaultOrganizationName : '') ||
      '';
    const byName = matchOrganizationOption(scopeLabel);
    if (byName?.organizationId) return String(byName.organizationId);

    const matchedOption = organizationOptions.find((opt) => opt.id === effectiveCreateClientId);
    return matchedOption?.organizationId ? String(matchedOption.organizationId) : '';
  }, [
    createOrganizationId,
    preferredOrganizationOption,
    scopeOrganizationId,
    defaultOrganizationId,
    preferredOrganizationLabel,
    scopeJobCompany,
    scopeOrganizationName,
    defaultOrganizationName,
    matchOrganizationOption,
    organizationOptions,
    effectiveCreateClientId,
  ]);

  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(new Set());
  const [selectedSystemEventIds, setSelectedSystemEventIds] = useState<Set<string>>(new Set());
  const [selectedStageOutcomeKeys, setSelectedStageOutcomeKeys] = useState<Set<string>>(new Set());
  const [actionPipelineId, setActionPipelineId] = useState<string | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedActiveStates, setSelectedActiveStates] = useState<Set<string>>(
    () => new Set(['פעיל', 'לא פעיל']),
  );
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc');
  const [entitySearchQuery, setEntitySearchQuery] = useState('');
  const [rescheduleHighlights, setRescheduleHighlights] = useState<
    Record<string, { label: string }>
  >({});
  const [exitingEventIds, setExitingEventIds] = useState<Set<string>>(() => new Set());
  const exitAnimationTimersRef = useRef<Record<string, number>>({});

  const flashEventReschedule = useCallback((eventKey: string, dueDate: string) => {
    const label = `נדחה ל-${formatJournalDueDate(dueDate)}`;
    setRescheduleHighlights((prev) => ({ ...prev, [eventKey]: { label } }));
    window.setTimeout(() => {
      setRescheduleHighlights((prev) => {
        if (!prev[eventKey]) return prev;
        const next = { ...prev };
        delete next[eventKey];
        return next;
      });
    }, 2400);
  }, []);

  const queueEventExitAnimation = useCallback((eventKey: string) => {
    setExitingEventIds((prev) => {
      if (prev.has(eventKey)) return prev;
      const next = new Set(prev);
      next.add(eventKey);
      return next;
    });
    const existing = exitAnimationTimersRef.current[eventKey];
    if (existing) window.clearTimeout(existing);
    exitAnimationTimersRef.current[eventKey] = window.setTimeout(() => {
      setExitingEventIds((prev) => {
        if (!prev.has(eventKey)) return prev;
        const next = new Set(prev);
        next.delete(eventKey);
        return next;
      });
      delete exitAnimationTimersRef.current[eventKey];
    }, 480);
  }, []);

  useEffect(() => {
    return () => {
      for (const key of Object.keys(exitAnimationTimersRef.current)) {
        window.clearTimeout(exitAnimationTimersRef.current[key]);
      }
    };
  }, []);

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isActiveDropdownOpen, setIsActiveDropdownOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [companyDropdownSearch, setCompanyDropdownSearch] = useState('');

  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editNextStageValue, setEditNextStageValue] = useState('');
  const [editAssigneeValue, setEditAssigneeValue] = useState('אני');
  const [editDueDateValue, setEditDueDateValue] = useState('');
  const [editIsActiveValue, setEditIsActiveValue] = useState(true);
  const [editStatusUpdates, setEditStatusUpdates] = useState<
    Array<{ id: string; title: string; date: string; creator: string; comment?: string }>
  >([]);
  const [editingStatusUpdateKey, setEditingStatusUpdateKey] = useState<string | null>(null);
  const [statusUpdateEditDraft, setStatusUpdateEditDraft] = useState<{ title: string; comment: string }>({
    title: '',
    comment: '',
  });
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>(['אני']);

  const [pipelinesByClient, setPipelinesByClient] = useState<Record<string, PipelineDto[]>>({});
  const [candidatePipelinesByClient, setCandidatePipelinesByClient] = useState<
    Record<string, PipelineDto[]>
  >({});
  const [systemEventGroups, setSystemEventGroups] = useState(SYSTEM_EVENT_GROUPS_FALLBACK);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [automationApproval, setAutomationApproval] = useState<{
    pipelineKind: 'client' | 'candidate';
    clientId: string;
    pipelineId: string;
    stageId: string;
    outcomeId: string;
    outcomeName: string;
    context: {
      clientEventId?: string;
      candidateId?: string;
    };
    pending: PendingAutomationRow[];
  } | null>(null);
  const [automationInfoView, setAutomationInfoView] = useState<
    { mode: 'outcome'; outcome: ActionOutcome } | { mode: 'stage' } | null
  >(null);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplateDto[]>([]);

  const [candidateDrawer, setCandidateDrawer] = useState<Candidate | null>(null);
  const [contactDrawer, setContactDrawer] = useState<Contact | null>(null);
  const [orgDrawerTarget, setOrgDrawerTarget] = useState<OrganizationPreviewDrawerTarget | null>(null);
  const [jobDrawer, setJobDrawer] = useState<JobDrawerJob | null>(null);
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(false);
  const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);
  const [isOrgDrawerOpen, setIsOrgDrawerOpen] = useState(false);
  const [isJobDrawerOpen, setIsJobDrawerOpen] = useState(false);
  const [candidateJobLinksById, setCandidateJobLinksById] = useState<Record<string, CandidateJobLink[]>>({});
  const [contactLookupRows, setContactLookupRows] = useState<ContactLookupRow[]>([]);
  const fetchedCandidateLinksRef = useRef<Set<string>>(new Set());
  const fetchingCandidateLinksRef = useRef<Set<string>>(new Set());

  const loadCandidateJobLinks = useCallback(async (candidateId: string) => {
    const cid = String(candidateId || '').trim();
    if (!cid) return;
    if (fetchedCandidateLinksRef.current.has(cid) || fetchingCandidateLinksRef.current.has(cid)) return;
    fetchingCandidateLinksRef.current.add(cid);
    try {
      const links = await fetchCandidateLinkedJobs(cid);
      fetchedCandidateLinksRef.current.add(cid);
      setCandidateJobLinksById((prev) => ({ ...prev, [cid]: links }));
    } catch {
      fetchedCandidateLinksRef.current.add(cid);
      setCandidateJobLinksById((prev) => ({ ...prev, [cid]: [] }));
    } finally {
      fetchingCandidateLinksRef.current.delete(cid);
    }
  }, []);

  const drawerOverlayZ = embeddedInModal ? 'z-[80]' : 'z-[60]';

  const openCandidateDrawer = useCallback((candidateId: string, name: string) => {
    setCandidateDrawer(buildCandidateDrawerStub(candidateId, name));
    setIsCandidateDrawerOpen(true);
  }, []);

  const openContactDrawer = useCallback(
    async (contactId: string, name: string, clientId: string, clientName = '') => {
      if (!contactId || !clientId) return;
      const stub = buildContactDrawerStub(contactId, name, clientId, clientName);
      setContactDrawer(stub);
      setIsContactDrawerOpen(true);
      const hydrated = await hydrateContactForDrawer(apiBase, clientId, contactId, stub);
      if (hydrated) setContactDrawer(hydrated);
    },
    [apiBase],
  );

  const openOrganizationDrawer = useCallback((ref: { organizationId: string; name: string }) => {
    if (!ref.organizationId) return;
    setOrgDrawerTarget({
      organizationId: ref.organizationId,
      name: ref.name,
    });
    setIsOrgDrawerOpen(true);
  }, []);

  const openJobDrawer = useCallback(
    async (jobId: string, title: string, client = '') => {
      if (!jobId) return;
      setJobDrawer(buildJobDrawerStub(jobId, title, client));
      setIsJobDrawerOpen(true);
      const hydrated = await hydrateJobForDrawer(apiBase, jobId, title, client);
      setJobDrawer(hydrated);
    },
    [apiBase],
  );

  const resolveEventJobMeta = useCallback(
    (event: JournalEvent) => {
      const meta = event.metadata || {};
      let jobId = meta.jobId ? String(meta.jobId) : null;
      let jobTitle = normalizeJobTitle(meta.jobTitle as string | undefined);
      let jobCompany =
        meta.jobCompany && String(meta.jobCompany).trim() && String(meta.jobCompany) !== '—'
          ? String(meta.jobCompany)
          : '';

      const candidateId = resolveCandidateIdForDrawer(event, scopeCandidateId);
      const candidateLinks = candidateId ? candidateJobLinksById[candidateId] || [] : [];
      const linkFromMeta = meta.jobCandidateId
        ? candidateLinks.find((link) => link.linkId === String(meta.jobCandidateId))
        : null;
      const linkFromCandidate = linkFromMeta || pickJobLinkForEvent(candidateLinks, event);

      if (linkFromCandidate) {
        if (!jobId && linkFromCandidate.jobId) jobId = linkFromCandidate.jobId;
        if (!jobTitle) jobTitle = normalizeJobTitle(linkFromCandidate.jobTitle);
        if (!jobCompany && linkFromCandidate.company && linkFromCandidate.company !== '—') {
          jobCompany = linkFromCandidate.company;
        }
      }

      if (embeddedInModal && scopeJobId) {
        if (!jobId) jobId = scopeJobId;
        if (!jobTitle) jobTitle = normalizeJobTitle(scopeJobTitle);
        if (!jobCompany && scopeJobCompany && scopeJobCompany !== '—') {
          jobCompany = scopeJobCompany;
        } else if (!jobCompany) {
          jobCompany = event.clientName || '';
        }
      }

      return { jobId, jobTitle, jobCompany };
    },
    [
      embeddedInModal,
      scopeJobId,
      scopeJobTitle,
      scopeJobCompany,
      scopeCandidateId,
      candidateJobLinksById,
    ],
  );

  /** Prefetch linked jobs only for modal scope or the currently selected event. */
  useEffect(() => {
    if (scopeCandidateId) {
      void loadCandidateJobLinks(scopeCandidateId);
      return;
    }
    if (!expandedEventId) return;
    const event = events.find((e) => e.id === expandedEventId);
    if (!event) return;
    const meta = event.metadata || {};
    if (meta.jobId) return;
    const candidateId = resolveCandidateIdFromEvent(event);
    if (!candidateId) return;
    void loadCandidateJobLinks(candidateId);
  }, [scopeCandidateId, expandedEventId, events, loadCandidateJobLinks]);

  useEffect(() => {
    const q = entitySearchQuery.trim();
    if (!q) return;
    const ids = new Set<string>();
    for (const event of events) {
      const cid = resolveCandidateIdForDrawer(event, scopeCandidateId);
      if (cid) ids.add(cid);
    }
    for (const cid of ids) {
      void loadCandidateJobLinks(cid);
    }
  }, [entitySearchQuery, events, scopeCandidateId, loadCandidateJobLinks]);

  useEffect(() => {
    fetchedCandidateLinksRef.current = new Set();
    fetchingCandidateLinksRef.current = new Set();
    setCandidateJobLinksById({});
  }, [crossClientJournal, defaultClientId, scopeContactId, scopeOrganizationId, scopeCandidateId]);

  const contactsLookupClientId = useMemo(
    () => String(user?.clientId || defaultClientId || createClientId || clientOptions[0]?.id || '').trim(),
    [user?.clientId, defaultClientId, createClientId, clientOptions],
  );

  useEffect(() => {
    if (!apiBase) return;
    let active = true;
    const url = crossClientJournal
      ? `${apiBase}/api/clients/all-contacts`
      : contactsLookupClientId
        ? `${apiBase}/api/clients/${encodeURIComponent(contactsLookupClientId)}/contacts`
        : '';
    if (!url) {
      setContactLookupRows([]);
      return;
    }
    fetch(url, { credentials: 'include', headers: authHeaders(), cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('contacts'))))
      .then((data) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setContactLookupRows(
          list
            .map((row: Record<string, unknown>) => ({
              id: String(row.id || ''),
              name: String(row.name || '').trim(),
              organizationId: row.organizationId ? String(row.organizationId) : null,
            }))
            .filter((row: ContactLookupRow) => row.id && row.name),
        );
      })
      .catch(() => {
        if (active) setContactLookupRows([]);
      });
    return () => {
      active = false;
    };
  }, [apiBase, crossClientJournal, contactsLookupClientId]);

  const contactLookups = useMemo(
    () => buildContactIdLookups(contactLookupRows),
    [contactLookupRows],
  );

  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const activeDropdownRef = useRef<HTMLDivElement>(null);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const mapEventsResponse = (
    rows: unknown,
    scopedClientId?: string,
    clientName?: string,
  ): JournalEvent[] =>
    (Array.isArray(rows) ? rows : []).map((r) => {
      const raw = r as Record<string, unknown>;
      if (raw.clientId) return normalizeRow(raw);
      return normalizeRow({
        ...raw,
        clientId: scopedClientId || '',
        clientName: clientName || 'לקוח',
      });
    });

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!apiBase) return;
    if (!opts?.silent) {
      setLoading(true);
      setError(null);
    }
    try {
      if (embeddedInModal && scopeJobLinkId) {
        const journal = await fetchJobLinkProcessJournal(scopeJobLinkId);
        const scopedClientId = defaultClientId || clientOptions[0]?.id || journal.clientId || '';
        setEvents(
          mapProcessJournalToEvents(
            journal,
            scopeCandidateId,
            scopeContactName,
            scopeJobCompany,
            scopedClientId ? String(scopedClientId) : '',
          ),
        );
        const resolvedCreateClientId = String(journal.clientId || scopedClientId || '').trim();
        if (resolvedCreateClientId) setCreateClientId(resolvedCreateClientId);
        return;
      }

      const scopedClientId = String(defaultClientId || clientOptions[0]?.id || '').trim();
      const scopedOrganizationId = String(scopeOrganizationId || '').trim();

      if (scopedClientId && !crossClientJournal) {
        const qs = new URLSearchParams({ summary: '1', limit: '1200' });
        if (scopedOrganizationId) qs.set('organizationId', scopedOrganizationId);
        const res = await fetch(
          `${apiBase}/api/clients/${encodeURIComponent(scopedClientId)}/events?${qs.toString()}`,
          {
            credentials: 'include',
            headers: authHeaders(),
            cache: 'no-store',
          },
        );
        if (!res.ok) throw new Error('טעינת אירועים נכשלה');
        const rows = await res.json();
        const clientName =
          scopeOrganizationName
          || clientOptions.find((c) => c.id === scopedClientId)?.name
          || scopeContactName
          || 'לקוח';
        setEvents(mapEventsResponse(rows, scopedClientId, clientName));
        return;
      }

      const allQs = new URLSearchParams({ summary: '1', limit: '800' });
      if (scopedClientId) allQs.set('clientId', scopedClientId);
      if (scopedOrganizationId) allQs.set('organizationId', scopedOrganizationId);
      const res = await fetch(`${apiBase}/api/clients/all-events?${allQs.toString()}`, {
        credentials: 'include',
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('טעינת אירועים נכשלה');
      const rows = await res.json();
      setEvents(mapEventsResponse(rows));
    } catch (e) {
      if (!opts?.silent) {
        setError((e as Error)?.message || 'שגיאה בטעינת אירועים');
        setEvents([]);
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [
    apiBase,
    defaultClientId,
    scopeOrganizationId,
    scopeOrganizationName,
    clientOptions,
    scopeContactName,
    embeddedInModal,
    scopeJobLinkId,
    scopeJobCompany,
    scopeCandidateId,
    crossClientJournal,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reloadJournal = () => {
      void load({ silent: true });
    };
    window.addEventListener('hiro:candidate-profile-approved', reloadJournal);
    window.addEventListener('hiro:candidate-missing-details-completed', reloadJournal);
    window.addEventListener('hiro:outbound-message-logged', reloadJournal);
    window.addEventListener('hiro:candidate-pipeline-stage-moved', reloadJournal);
    return () => {
      window.removeEventListener('hiro:candidate-profile-approved', reloadJournal);
      window.removeEventListener('hiro:candidate-missing-details-completed', reloadJournal);
      window.removeEventListener('hiro:outbound-message-logged', reloadJournal);
      window.removeEventListener('hiro:candidate-pipeline-stage-moved', reloadJournal);
    };
  }, [load]);

  const catalogClientIds = useMemo(() => {
    const ids = new Set<string>();
    if (settingsClientId) ids.add(settingsClientId);
    if (defaultClientId) ids.add(defaultClientId);
    if (createClientId) ids.add(createClientId);
    for (const opt of clientOptions.slice(0, 12)) {
      if (opt.id) ids.add(opt.id);
    }
    for (const ev of events) {
      if (ev.clientId) ids.add(ev.clientId);
    }
    return [...ids];
  }, [settingsClientId, defaultClientId, createClientId, clientOptions, events]);

  useEffect(() => {
    if (!catalogClientIds.length) return;
    let cancelled = false;
    setCatalogLoading(true);
    void Promise.all([
      Promise.all(
        catalogClientIds.map((cid) =>
          fetchPipelines(cid)
            .then((rows) => ({ cid, rows: Array.isArray(rows) ? rows : [] }))
            .catch(() => ({ cid, rows: [] as PipelineDto[] })),
        ),
      ),
      Promise.all(
        catalogClientIds.map((cid) =>
          fetchCandidatePipelines(cid)
            .then((rows) => ({ cid, rows: Array.isArray(rows) ? rows : [] }))
            .catch(() => ({ cid, rows: [] as PipelineDto[] })),
        ),
      ),
      apiBase
        ? fetchSystemEvents(apiBase, typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
            .then((rows) => buildSystemEventGroupsFromApiRows(rows))
            .catch(() => SYSTEM_EVENT_GROUPS_FALLBACK)
        : Promise.resolve(SYSTEM_EVENT_GROUPS_FALLBACK),
    ])
      .then(([clientRows, candidateRows, sysGroups]) => {
        if (cancelled) return;
        const clientMap: Record<string, PipelineDto[]> = {};
        const candidateMap: Record<string, PipelineDto[]> = {};
        for (const row of clientRows) clientMap[row.cid] = row.rows;
        for (const row of candidateRows) candidateMap[row.cid] = row.rows;
        setPipelinesByClient((prev) => ({ ...prev, ...clientMap }));
        setCandidatePipelinesByClient((prev) => ({ ...prev, ...candidateMap }));
        setSystemEventGroups(sysGroups.length > 0 ? sysGroups : SYSTEM_EVENT_GROUPS_FALLBACK);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogClientIds, apiBase]);

  useEffect(() => {
    if (!settingsClientId) {
      setMessageTemplates([]);
      return;
    }
    let cancelled = false;
    void fetchClientMessageTemplates(settingsClientId)
      .then((rows) => {
        if (!cancelled) setMessageTemplates(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setMessageTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsClientId]);

  const clientPipelinesCatalog = useMemo((): EnrichedPipeline[] => {
    const out: EnrichedPipeline[] = [];
    for (const [cid, rows] of Object.entries(pipelinesByClient)) {
      for (const p of rows as PipelineDto[]) out.push({ ...p, kind: 'client', clientId: cid });
    }
    return out;
  }, [pipelinesByClient]);

  const candidatePipelinesCatalog = useMemo((): EnrichedPipeline[] => {
    const out: EnrichedPipeline[] = [];
    for (const [cid, rows] of Object.entries(candidatePipelinesByClient)) {
      for (const p of rows as PipelineDto[]) out.push({ ...p, kind: 'candidate', clientId: cid });
    }
    return out;
  }, [candidatePipelinesByClient]);

  const allPipelinesCatalog = useMemo(
    () => [...clientPipelinesCatalog, ...candidatePipelinesCatalog],
    [clientPipelinesCatalog, candidatePipelinesCatalog],
  );

  const systemEventPipelineMatches = useMemo(
    () => buildSystemEventPipelineMatches(systemEventGroups, allPipelinesCatalog),
    [systemEventGroups, allPipelinesCatalog],
  );

  useEffect(() => {
    if (defaultClientId) setCreateClientId(defaultClientId);
    else if (!createClientId && clientOptions[0]?.id) setCreateClientId(clientOptions[0].id);
  }, [defaultClientId, clientOptions, createClientId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(t)) setIsStatusDropdownOpen(false);
      if (activeDropdownRef.current && !activeDropdownRef.current.contains(t)) setIsActiveDropdownOpen(false);
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(t)) {
        setIsCompanyDropdownOpen(false);
        setCompanyDropdownSearch('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === expandedEventId) || null,
    [events, expandedEventId],
  );

  // Load pipeline stages for the selected event's client (same source as PipelineSettingsView)
  useEffect(() => {
    if (!selectedEvent?.clientId) return;
    const cid = selectedEvent.clientId;
    let cancelled = false;
    setPipelinesLoading(true);
    void fetchPipelines(cid)
      .then((rows) => {
        if (!cancelled) setPipelinesByClient((prev) => ({ ...prev, [cid]: rows }));
      })
      .catch(() => {
        if (!cancelled) setPipelinesByClient((prev) => ({ ...prev, [cid]: [] }));
      })
      .finally(() => {
        if (!cancelled) setPipelinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.clientId, expandedEventId]);

  useEffect(() => {
    if (!editingDescriptionId) return;
    const event = events.find((e) => e.id === editingDescriptionId);
    if (event?.isActive === false) setEditingDescriptionId(null);
  }, [events, editingDescriptionId]);

  const selectedClientPipelines = useMemo(
    () => (selectedEvent?.clientId ? pipelinesByClient[selectedEvent.clientId] || [] : []),
    [selectedEvent?.clientId, pipelinesByClient],
  );

  const selectedCandidatePipelines = useMemo(
    () => (selectedEvent?.clientId ? candidatePipelinesByClient[selectedEvent.clientId] || [] : []),
    [selectedEvent?.clientId, candidatePipelinesByClient],
  );

  useEffect(() => {
    if (!selectedEvent) {
      setActionPipelineId(null);
      return;
    }
    const clientP = pipelinesByClient[selectedEvent.clientId] || [];
    const candP = candidatePipelinesByClient[selectedEvent.clientId] || [];

    const applyActionPipeline = (pipelineId: string) => {
      setActionPipelineId(pipelineId);
    };

    if (selectedEvent.processId) {
      if (
        candP.some((p) => p.id === selectedEvent.processId) ||
        clientP.some((p) => p.id === selectedEvent.processId)
      ) {
        applyActionPipeline(selectedEvent.processId);
        return;
      }
    }
    if (
      defaultActionPipelineId &&
      (candP.some((p) => p.id === defaultActionPipelineId) ||
        clientP.some((p) => p.id === defaultActionPipelineId))
    ) {
      applyActionPipeline(defaultActionPipelineId);
      return;
    }
    const preferredStageId = resolvePreferredStageIdForEvent(selectedEvent, {
      scopeJobLinkId,
      defaultProcessStageId,
    });
    const ctx = resolveActionPipelineContext(selectedEvent, null, clientP, candP, preferredStageId);
    if (ctx) {
      applyActionPipeline(ctx.pipeline.id);
    }
  }, [
    selectedEvent?.id,
    selectedEvent?.clientId,
    selectedEvent?.processId,
    selectedEvent?.stageId,
    selectedEvent?.stage,
    selectedEvent?.title,
    selectedEvent?.updates,
    pipelinesByClient,
    candidatePipelinesByClient,
    defaultActionPipelineId,
    scopeJobLinkId,
    defaultProcessStageId,
  ]);

  const preferredStageIdForActions = useMemo(
    () =>
      selectedEvent
        ? resolvePreferredStageIdForEvent(selectedEvent, { scopeJobLinkId, defaultProcessStageId })
        : null,
    [selectedEvent, scopeJobLinkId, defaultProcessStageId],
  );

  const actionPipelineContext = useMemo((): ActionPipelineContext | null => {
    if (!selectedEvent) return null;
    return resolveActionPipelineContext(
      selectedEvent,
      actionPipelineId,
      selectedClientPipelines,
      selectedCandidatePipelines,
      preferredStageIdForActions,
    );
  }, [
    selectedEvent,
    actionPipelineId,
    selectedClientPipelines,
    selectedCandidatePipelines,
    preferredStageIdForActions,
  ]);

  useEffect(() => {
    setAutomationInfoView(null);
  }, [selectedEvent?.id, preferredStageIdForActions]);

  const currentOutcomes = useMemo(() => {
    if (!actionPipelineContext?.stage) return [] as ActionOutcome[];
    const outcomes = resolveOutcomesForStage(actionPipelineContext.stage);
    if (!actionPipelineContext.stage.id) return outcomes;
    return filterOutcomesByStageSelection(
      outcomes,
      actionPipelineContext.stage.id,
      selectedStageOutcomeKeys,
    );
  }, [actionPipelineContext, selectedStageOutcomeKeys]);

  const currentStageLabel = useMemo(() => {
    if (!actionPipelineContext) return selectedEvent?.stage || '';
    return actionPipelineContext.stage.name || selectedEvent?.stage || '';
  }, [actionPipelineContext, selectedEvent?.stage]);

  const currentPipelineLabel = useMemo(() => {
    return actionPipelineContext?.pipeline.name || selectedEvent?.process || '';
  }, [actionPipelineContext, selectedEvent?.process]);

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of organizationOptions) {
      const orgId = String(opt.organizationId || '').trim();
      const name = String(opt.name || '').trim();
      if (orgId && name) map.set(orgId, name);
    }
    return map;
  }, [organizationOptions]);

  const preferOrganizationLabels = organizationOptions.length > 0;

  const resolveCompanyLabel = useCallback(
    (event: JournalEvent) => resolveEventCompanyLabel(event, orgNameById, preferOrganizationLabels),
    [orgNameById, preferOrganizationLabels],
  );

  const selectedEventOrganizationRef = useMemo(() => {
    if (!selectedEvent) return null;
    return resolveEventOrganizationRef(selectedEvent, orgNameById, organizationOptions);
  }, [selectedEvent, orgNameById, organizationOptions]);

  const allCompanies = useMemo(() => {
    const names = new Set<string>();
    if (preferOrganizationLabels) {
      for (const opt of organizationOptions) {
        const name = String(opt.name || '').trim();
        if (name) names.add(name);
      }
    }
    for (const event of events) {
      const label = resolveCompanyLabel(event);
      if (label) names.add(label);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'he'));
  }, [organizationOptions, events, preferOrganizationLabels, resolveCompanyLabel]);
  const filteredCompanies = useMemo(() => {
    const q = companyDropdownSearch.trim().toLowerCase();
    if (!q) return allCompanies;
    return allCompanies.filter((c) => c.toLowerCase().includes(q));
  }, [allCompanies, companyDropdownSearch]);
  const statusOptions = ['עתידי', 'להיום', 'באיחור', 'הושלם', 'בוטל'];
  const activeStateOptions = ['פעיל', 'לא פעיל'];

  const eventPassesFilters = useCallback(
    (event: JournalEvent) => {
      if (!eventMatchesContact(event, scopeContactId, scopeContactName, scopeCandidateId)) return false;
      if (
        scopeOrganizationId
        && !scopeContactId
        && !scopeCandidateId
        && !eventMatchesOrganization(event, scopeOrganizationId, scopeOrganizationName)
      ) {
        return false;
      }
      if (!embeddedInModal && !hideFilters) {
        if (
          !eventMatchesPipelineFilters(
            event,
            selectedPipelineIds,
            allPipelinesCatalog,
            selectedStageOutcomeKeys,
          )
        ) {
          return false;
        }
        if (selectedStatuses.size > 0) {
          const dynamicStatus = getDynamicStatus(event.status, event.dueDate).label;
          if (!selectedStatuses.has(dynamicStatus)) return false;
        }
        if (selectedActiveStates.size > 0) {
          const activeLabel = event.isActive !== false ? 'פעיל' : 'לא פעיל';
          if (!selectedActiveStates.has(activeLabel)) return false;
        }
        if (selectedCompanies.size > 0 && !selectedCompanies.has(resolveCompanyLabel(event))) return false;
        if (
          !eventMatchesSystemEventFilters(
            event,
            selectedSystemEventIds,
            systemEventGroups,
            systemEventPipelineMatches,
            allPipelinesCatalog,
          )
        ) {
          return false;
        }
        if (dateFrom && new Date(event.date) < new Date(dateFrom)) return false;
        if (dateTo && new Date(event.date) > new Date(`${dateTo}T23:59:59`)) return false;
        if (
          !eventMatchesJournalSearch(
            event,
            entitySearchQuery,
            resolveCompanyLabel(event),
            candidateJobLinksById,
            scopeCandidateId,
          )
        ) {
          return false;
        }
      }
      return true;
    },
    [
      scopeContactId,
      scopeContactName,
      scopeCandidateId,
      scopeOrganizationId,
      scopeOrganizationName,
      embeddedInModal,
      hideFilters,
      selectedPipelineIds,
      allPipelinesCatalog,
      selectedStageOutcomeKeys,
      selectedStatuses,
      selectedActiveStates,
      selectedCompanies,
      resolveCompanyLabel,
      selectedSystemEventIds,
      systemEventGroups,
      systemEventPipelineMatches,
      dateFrom,
      dateTo,
      entitySearchQuery,
      candidateJobLinksById,
    ],
  );

  const filteredEvents = useMemo(() => {
    const scoped = events.filter(eventPassesFilters);
    if (!scopeJobId && !scopeJobLinkId && !scopeJobTitle && !scopeJobCompany) return scoped;
    const jobScoped = scoped.filter((event) =>
      eventMatchesJobScope(event, scopeJobId, scopeJobLinkId, scopeJobTitle, scopeJobCompany),
    );
    return jobScoped.length > 0 ? jobScoped : scoped;
  }, [
    events,
    eventPassesFilters,
    scopeJobId,
    scopeJobLinkId,
    scopeJobTitle,
    scopeJobCompany,
  ]);

  const displayEvents = useMemo(() => {
    const dir = dateSortOrder === 'asc' ? 1 : -1;
    const visibleIds = new Set(filteredEvents.map((event) => journalEventKey(event)));
    const exitingExtras = [...exitingEventIds]
      .filter((key) => !visibleIds.has(key))
      .map((key) => events.find((event) => journalEventKey(event) === key))
      .filter((event): event is JournalEvent => Boolean(event));
    const merged = [...filteredEvents, ...exitingExtras];
    return merged.sort(
      (a, b) => dir * (new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()),
    );
  }, [filteredEvents, exitingEventIds, events, dateSortOrder]);

  const lastAutoSelectedPipelineRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !defaultActionPipelineId || !apiBase) return;

    setSelectedPipelineIds(new Set([defaultActionPipelineId]));

    const match = findProcessEventForPipeline(
      events,
      defaultActionPipelineId,
      allPipelinesCatalog,
      scopeContactId,
      scopeContactName,
      scopeCandidateId,
      scopeOrganizationId,
      scopeOrganizationName,
    );

    if (!match) return;

    const selectionKey = `${defaultActionPipelineId}:${match.id}`;
    if (lastAutoSelectedPipelineRef.current === selectionKey) return;
    lastAutoSelectedPipelineRef.current = selectionKey;
    setExpandedEventId(match.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`journal-event-${match.id}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }, [
    loading,
    defaultActionPipelineId,
    defaultClientId,
    clientOptions,
    events,
    allPipelinesCatalog,
    scopeContactId,
    scopeContactName,
    scopeCandidateId,
    scopeOrganizationId,
    scopeOrganizationName,
    apiBase,
  ]);

  useEffect(() => {
    if (defaultActionPipelineId) return;
    if (!autoSelectFirstEvent || expandedEventId || loading || !displayEvents.length) return;
    const preferred = displayEvents.find((e) => e.isActive !== false) || displayEvents[0];
    if (preferred) setExpandedEventId(preferred.id);
  }, [
    defaultActionPipelineId,
    autoSelectFirstEvent,
    displayEvents,
    expandedEventId,
    loading,
  ]);

  const prevDefaultActionPipelineRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevDefaultActionPipelineRef.current;
    prevDefaultActionPipelineRef.current = defaultActionPipelineId;
    if (prev && !defaultActionPipelineId) {
      lastAutoSelectedPipelineRef.current = null;
    }
  }, [defaultActionPipelineId]);

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const persistEventPatch = async (
    event: JournalEvent,
    patch: Record<string, unknown>,
  ): Promise<{ ok: true; row: JournalEvent } | { ok: false }> => {
    if (embeddedInModal && scopeJobLinkId) {
      try {
        const refreshed = await patchJobLinkProcessJournalEntry(scopeJobLinkId, event.id, {
          title: patch.title != null ? String(patch.title) : undefined,
          description: patch.description != null ? String(patch.description) : undefined,
          dueDate: patch.dueDate != null ? String(patch.dueDate).slice(0, 10) : undefined,
          dueTime: patch.dueTime != null ? String(patch.dueTime) : undefined,
          // Only when not sending full updates — otherwise backend would prepend a duplicate row.
          nextStageTitle:
            !Array.isArray(patch.updates) && patch.nextStageTitle != null
              ? String(patch.nextStageTitle)
              : undefined,
          creator: patch.creator != null ? String(patch.creator) : undefined,
          isActive: typeof patch.isActive === 'boolean' ? patch.isActive : undefined,
          updates: Array.isArray(patch.updates)
            ? (patch.updates as Array<{ id: string; title: string; date: string; creator: string; comment?: string }>)
            : undefined,
        });
        const mapped = mapProcessJournalToEvents(
          refreshed,
          scopeCandidateId,
          scopeContactName,
          scopeJobCompany,
          event.clientId || defaultClientId || refreshed.clientId || '',
        );
        const row = mapped.find((item) => item.id === event.id);
        if (!row) return { ok: false };
        return { ok: true, row };
      } catch {
        return { ok: false };
      }
    }
    if (!apiBase || !event.clientId) return { ok: false };
    const res = await fetch(
      `${apiBase}/api/clients/${encodeURIComponent(event.clientId)}/events/${encodeURIComponent(event.id)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) return { ok: false };
    try {
      const body = await res.json();
      return {
        ok: true,
        row: normalizeRow({
          ...(body as Record<string, unknown>),
          clientId: event.clientId,
          clientName: event.clientName,
        }),
      };
    } catch {
      return { ok: false };
    }
  };

  const handleLogOutcome = async (outcome: ActionOutcome) => {
    if (!selectedEvent || selectedEvent.isActive === false) return;
    if (!actionPipelineContext?.pipeline.id || !actionPipelineContext.stage.id) {
      alert('לא נמצא תהליך או שלb לתוצאה זו');
      return;
    }

    const { pipeline, pipelineKind, stage } = actionPipelineContext;
    const candidateId = resolveCandidateIdFromEvent(selectedEvent);
    if (pipelineKind === 'candidate' && !candidateId) {
      alert('לא נמצא מועמד מקושר לאירוע זה');
      return;
    }

    try {
      const result = await executePipelineOutcome({
        pipelineKind,
        clientId: selectedEvent.clientId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        outcomeId: outcome.id,
        context: {
          clientEventId: selectedEvent.id,
          ...(pipelineKind === 'candidate' && candidateId ? { candidateId } : {}),
          ...(scopeJobLinkId ? { jobCandidateId: scopeJobLinkId } : {}),
        },
        source: 'manual',
      });

      const patchedFromAction = patchEventFromActionResult(selectedEvent, result.actionResult);
      const updatedEvent =
        result.actionResult?.event && typeof result.actionResult.event === 'object'
          ? normalizeRow({
              ...(result.actionResult.event as Record<string, unknown>),
              clientId: selectedEvent.clientId,
              clientName: selectedEvent.clientName,
            })
          : patchedFromAction
            ? normalizeRow({
                ...patchedFromAction,
                clientId: selectedEvent.clientId,
                clientName: selectedEvent.clientName,
              })
            : null;

      const previousDueDate = selectedEvent.dueDate;
      const wasVisible = eventPassesFilters(selectedEvent);
      const eventKey = journalEventKey(selectedEvent);

      if (updatedEvent) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEvent.id && e.clientId === selectedEvent.clientId ? updatedEvent : e,
          ),
        );

        if (dueDateMovedForward(previousDueDate, updatedEvent.dueDate)) {
          flashEventReschedule(eventKey, String(updatedEvent.dueDate || '').slice(0, 10));
        }

        const stillVisible = eventPassesFilters(updatedEvent);
        if (wasVisible && !stillVisible) {
          queueEventExitAnimation(eventKey);
        }
      }

      if (
        pipelineKind === 'candidate' &&
        candidateId &&
        typeof window !== 'undefined'
      ) {
        const nextStageId =
          typeof result.actionResult?.nextStageId === 'string'
            ? result.actionResult.nextStageId
            : stage.id;
        window.dispatchEvent(
          new CustomEvent('hiro:candidate-pipeline-stage-moved', {
            detail: { candidateId, pipelineId: pipeline.id, stageId: nextStageId },
          }),
        );
      }

      const pending = pendingAutomationRows(result.automationResults);
      const errors = automationErrors(result.automationResults);
      const automationSummary = summarizeAutomationResults(result.automationResults);
      if (errors.length) {
        alert(errors.map((e) => e.message || 'שגיאת אוטומציה').join('\n'));
      } else if (pending.length) {
        setAutomationApproval({
          pipelineKind,
          clientId: selectedEvent.clientId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          outcomeId: outcome.id,
          outcomeName: outcome.title,
          context: {
            clientEventId: selectedEvent.id,
            ...(pipelineKind === 'candidate' && candidateId ? { candidateId } : {}),
          },
          pending,
        });
      } else if (automationSummary) {
        alert(`הפעולה בוצעה · ${automationSummary}`);
      }

      dispatchClientJournalUpdated({
        clientEventId: selectedEvent.id,
        clientId: selectedEvent.clientId,
      });
      void load({ silent: true });
      onEventsChanged?.();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'עדכון הסטטוס נכשלה');
      void load({ silent: true });
    }
  };

  const handleApproveAutomations = async (automationIds: string[]) => {
    if (!automationApproval) return;
    const result = await approvePipelineAutomations({
      pipelineKind: automationApproval.pipelineKind,
      clientId: automationApproval.clientId,
      pipelineId: automationApproval.pipelineId,
      stageId: automationApproval.stageId,
      outcomeId: automationApproval.outcomeId,
      context: automationApproval.context,
      automationIds,
    });
    const errors = automationErrors(result.automationResults);
    const automationSummary = summarizeAutomationResults(result.automationResults);
    if (errors.length) {
      alert(errors.map((e) => e.message || 'שגיאת אוטומציה').join('\n'));
    } else if (automationSummary) {
      alert(`הפעולה בוצעה · ${automationSummary}`);
    }
    await load();
    onEventsChanged?.();
  };

  const handleReactivateEvent = async (event: JournalEvent) => {
    if (event.isActive !== false) return;

    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId ? { ...e, isActive: true } : e,
      ),
    );

    const result = await persistEventPatch(event, { isActive: true });
    if (!result.ok) {
      alert('הפעלת האירוע מחדש נכשלה');
      await load();
      return;
    }
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId ? result.row : e,
      ),
    );
    onEventsChanged?.();
  };

  const handleEditDescription = (event: JournalEvent) => {
    if (event.isActive === false) return;
    setEditingStatusUpdateKey(null);
    setStatusUpdateEditDraft({ title: '', comment: '' });
    setEditingDescriptionId(event.id);
    setEditTitleValue(event.title || '');
    setEditDescriptionValue(event.description || '');
    setEditNextStageValue('');
    setEditAssigneeValue(event.creator || user?.name || 'אני');
    setEditDueDateValue(event.dueDate || '');
    setEditIsActiveValue(true);
    setEditStatusUpdates(
      sortStatusUpdatesByDateDesc(
        (event.updates || []).map((u) => ({
          id: u.id,
          title: u.title,
          date: u.date,
          creator: u.creator,
          comment: u.comment || '',
        })),
      ),
    );
    // Ensure pipelines (for השלב הבא options) are loaded for this client
    if (event.clientId && !pipelinesByClient[event.clientId]) {
      void fetchPipelines(event.clientId)
        .then((rows) => setPipelinesByClient((prev) => ({ ...prev, [event.clientId]: rows })))
        .catch(() => setPipelinesByClient((prev) => ({ ...prev, [event.clientId]: [] })));
    }
    void fetchStaffUsers(event.clientId)
      .then((rows) => {
        const names = rows
          .map((u) => String(u.name || u.email || '').trim())
          .filter(Boolean);
        const me = user?.name?.trim() || 'אני';
        setAssigneeOptions(Array.from(new Set([me, 'אני', ...names])));
      })
      .catch(() => {
        setAssigneeOptions([user?.name?.trim() || 'אני', 'אני'].filter(Boolean));
      });
  };

  const handleStartEditStatusUpdate = (
    event: JournalEvent,
    update: { id: string; title: string; comment?: string },
  ) => {
    if (event.isActive === false) return;
    setEditingStatusUpdateKey(statusUpdateEditKey(event, update.id));
    setStatusUpdateEditDraft({
      title: update.title || '',
      comment: update.comment || '',
    });
  };

  const handleCancelEditStatusUpdate = () => {
    setEditingStatusUpdateKey(null);
    setStatusUpdateEditDraft({ title: '', comment: '' });
  };

  const handleSaveStatusUpdateRow = async (
    event: JournalEvent,
    updateId: string,
  ) => {
    const trimmedTitle = statusUpdateEditDraft.title.trim();
    if (!trimmedTitle) {
      alert('יש להזין תיאור לעדכון');
      return;
    }
    const trimmedComment = statusUpdateEditDraft.comment.trim();
    const existing = (event.updates || []).find((u) => u.id === updateId);
    if (!existing) return;
    if (trimmedTitle === (existing.title || '').trim() && trimmedComment === (existing.comment || '').trim()) {
      handleCancelEditStatusUpdate();
      return;
    }

    const nextUpdates = sortStatusUpdatesByDateDesc(
      (event.updates || []).map((u) =>
        u.id === updateId
          ? { ...u, title: trimmedTitle, comment: trimmedComment || undefined }
          : u,
      ),
    );
    const history = nextUpdates.map((u) => ({
      user: u.creator,
      timestamp: u.date,
      summary: u.title,
      ...(u.comment ? { comment: u.comment } : {}),
    }));
    const patch = { updates: nextUpdates, history };

    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId ? { ...e, updates: nextUpdates } : e,
      ),
    );

    const result = await persistEventPatch(event, patch);
    if (!result.ok) {
      alert('שמירת העדכון נכשלה');
      await load({ silent: true });
      return;
    }
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId ? result.row : e,
      ),
    );
    handleCancelEditStatusUpdate();
    onEventsChanged?.();
  };

  const handleSaveDescription = async (event: JournalEvent) => {
    const actor = editAssigneeValue || user?.name || 'אני';
    const clientPipelines = pipelinesByClient[event.clientId] || [];
    const candidatePipelines = candidatePipelinesByClient[event.clientId] || [];
    const pipelineIdForEvent = event.id === selectedEvent?.id ? actionPipelineId : null;
    const trimmedTitle = editTitleValue.trim();
    const nextTitle = trimmedTitle || event.title;
    const titleChanged = trimmedTitle.length > 0 && trimmedTitle !== (event.title || '').trim();
    const stageChanged = Boolean(editNextStageValue.trim());
    const stageChange = stageChanged
      ? resolveStageChangeFromMoveTarget(
          event,
          editNextStageValue,
          clientPipelines,
          candidatePipelines,
          pipelineIdForEvent,
        )
      : null;
    const nextStageName = stageChange?.stageName || event.stage;
    const nextStageId = stageChange?.stageId || event.stageId;
    if (stageChanged && !stageChange) {
      alert('לא ניתן לזהות את השלב שנבחר. נסה לבחור שוב.');
      return;
    }
    const activityEntries: Array<{ id: string; title: string; date: string; creator: string; comment?: string }> = [];
    if (titleChanged) {
      activityEntries.push({
        id: `u-${Date.now()}-title`,
        title: `שינה את הכותרת מ-"${event.title}" ל-"${nextTitle}"`,
        date: new Date().toISOString(),
        creator: actor,
      });
    }
    if (stageChanged && stageChange) {
      activityEntries.push({
        id: `u-${Date.now()}`,
        title: stageChange.historyLabel,
        date: new Date().toISOString(),
        creator: actor,
      });
    }
    const sanitizedStatusUpdates = editStatusUpdates
      .map((u) => ({
        id: u.id,
        title: String(u.title || '').trim(),
        date: u.date || new Date().toISOString(),
        creator: String(u.creator || actor).trim() || actor,
        comment: String(u.comment || '').trim(),
      }))
      .filter((u) => u.title.length > 0);
    const nextUpdates = sortStatusUpdatesByDateDesc(
      activityEntries.length > 0
        ? [...activityEntries, ...sanitizedStatusUpdates]
        : sanitizedStatusUpdates,
    );
    const history = nextUpdates.map((u) => ({
      user: u.creator,
      timestamp: u.date,
      summary: u.title,
      ...(u.comment ? { comment: u.comment } : {}),
    }));
    const patch = {
      title: nextTitle,
      description: editDescriptionValue,
      coordinator: actor,
      creator: actor,
      dueDate: editDueDateValue || event.dueDate,
      isActive: editIsActiveValue,
      status: event.status,
      process: event.process,
      processId: event.processId,
      stage: nextStageName,
      stageId: nextStageId,
      ...(stageChanged && stageChange ? { nextStageTitle: stageChange.historyLabel } : {}),
      history,
      updates: nextUpdates,
    };

    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId
          ? {
              ...e,
              title: nextTitle,
              description: editDescriptionValue,
              creator: actor,
              dueDate: editDueDateValue || event.dueDate,
              isActive: editIsActiveValue,
              stage: nextStageName,
              stageId: nextStageId,
              updates: nextUpdates,
            }
          : e,
      ),
    );

    if (stageChanged && stageChange?.stageId && stageChange.ctx) {
      try {
        await syncKanbanFromEventStageChange(
          apiBase,
          event,
          stageChange.ctx,
          stageChange.stageId,
          scopeOrganizationId,
        );
      } catch (syncErr) {
        alert(syncErr instanceof Error ? syncErr.message : 'עדכון השלב בתהליך נכשל');
        await load();
        return;
      }
    }

    const result = await persistEventPatch(event, patch);
    if (!result.ok) {
      alert('שמירת האירוע נכשלה');
      await load();
      return;
    }
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId ? result.row : e,
      ),
    );
    setEditingDescriptionId(null);
    setEditTitleValue('');
    setEditNextStageValue('');
    setEditStatusUpdates([]);
    handleCancelEditStatusUpdate();
    onEventsChanged?.();
  };

  const handleCreateProcessEvent = async (data: ProcessEventSavePayload) => {
    const targetClientId = eventModalScope?.clientId || effectiveCreateClientId;
    const targetOrganizationId =
      eventModalScope?.organizationId || effectiveCreateOrganizationId || '';
    if (!apiBase || !targetClientId) throw new Error('יש לבחור לקוח');
    const typeParts = [data.processName, data.stageName].filter(Boolean);
    const slaDue = dueDateTimeAfterSla(
      data.slaValue ?? (data as { slaDays?: number }).slaDays ?? 0,
      normalizeSlaUnit(data.slaUnit),
    );
    const payload = {
      title: data.title,
      type: typeParts.length ? typeParts : ['תהליך'],
      date: new Date().toISOString(),
      description: data.description || '',
      coordinator: data.assignee || user?.name || 'אני',
      creator: data.assignee || user?.name || 'אני',
      status: 'עתידי',
      isActive: true,
      ...(targetOrganizationId ? { organizationId: targetOrganizationId } : {}),
      process: data.processName,
      processId: data.processId,
      stage: data.stageName,
      stageId: data.stageId,
      dueDate: slaDue.dueDate || null,
      dueTime: slaDue.dueTime,
      linkedTo: data.contactId || scopeContactId || scopeCandidateId
        ? {
            type: scopeCandidateId ? 'מועמד' : 'איש קשר',
            id: data.contactId || scopeContactId || scopeCandidateId,
            name: data.contactName || scopeContactName || '',
          }
        : { type: 'לקוח', name: data.clientName || '' },
      metadata: {
        ...(scopeCandidateId ? { candidateId: scopeCandidateId } : {}),
        ...(scopeJobId ? { jobId: scopeJobId } : {}),
        ...(scopeJobLinkId ? { jobCandidateId: scopeJobLinkId } : {}),
        ...(scopeJobTitle && scopeJobTitle !== '—' ? { jobTitle: scopeJobTitle } : {}),
        ...(scopeJobCompany && scopeJobCompany !== '—' ? { jobCompany: scopeJobCompany } : {}),
      },
      history: [
        {
          user: data.assignee || 'אני',
          timestamp: new Date().toISOString(),
          summary: 'יצר אירוע תהליכי',
        },
      ],
    };
    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(targetClientId)}/events`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || 'יצירת האירוע נכשלה');
    }
    await load();
    onEventsChanged?.();
  };

  const selectedCreateOption = useMemo(() => {
    if (effectiveCreateOrganizationId) {
      return clientOptions.find(
        (opt) => String(opt.organizationId || '') === effectiveCreateOrganizationId,
      );
    }
    if (organizationOptions.length) {
      return (
        organizationOptions.find((opt) => opt.id === effectiveCreateClientId)
        || organizationOptions[0]
      );
    }
    return (
      clientOptions.find((opt) => opt.id === effectiveCreateClientId && !opt.organizationId)
      || clientOptions.find((opt) => opt.id === effectiveCreateClientId)
    );
  }, [clientOptions, organizationOptions, effectiveCreateClientId, effectiveCreateOrganizationId]);

  const createOrganizationName =
    (scopeJobCompany && scopeJobCompany !== '—' ? scopeJobCompany : '') ||
    (preferredOrganizationOption?.name && preferredOrganizationOption.name !== '—'
      ? preferredOrganizationOption.name
      : '') ||
    (scopeOrganizationName && scopeOrganizationName !== '—' ? scopeOrganizationName : '') ||
    (defaultOrganizationName && defaultOrganizationName !== '—' ? defaultOrganizationName : '') ||
    selectedCreateOption?.name ||
    '';

  const createClientName = useMemo(() => {
    const orgLabel = createOrganizationName.trim();
    if (orgLabel) return orgLabel;
    if (
      tenantClientId
      && effectiveCreateClientId === tenantClientId
      && organizationOptions.length > 0
    ) {
      return '';
    }
    return createOrganizationName;
  }, [
    createOrganizationName,
    tenantClientId,
    effectiveCreateClientId,
    organizationOptions.length,
  ]);

  const openCreateEventModal = useCallback(() => {
    const preferredOption = matchOrganizationOption(preferredOrganizationLabel);
    const scopeLabel =
      (scopeJobCompany && scopeJobCompany !== '—' ? scopeJobCompany : '') ||
      (preferredOption?.name && preferredOption.name !== '—' ? preferredOption.name : '') ||
      (preferredOrganizationLabel && preferredOrganizationLabel !== 'all'
        ? preferredOrganizationLabel
        : '') ||
      (scopeOrganizationName && scopeOrganizationName !== '—' ? scopeOrganizationName : '') ||
      (defaultOrganizationName && defaultOrganizationName !== '—' ? defaultOrganizationName : '') ||
      selectedCreateOption?.name ||
      '';

    let resolvedOrgId = String(
      createOrganizationId
        || preferredOption?.organizationId
        || scopeOrganizationId
        || defaultOrganizationId
        || '',
    ).trim();

    if (!resolvedOrgId && scopeLabel) {
      const match = matchOrganizationOption(scopeLabel);
      if (match?.organizationId) resolvedOrgId = String(match.organizationId);
    }

    if (!resolvedOrgId) {
      resolvedOrgId = String(effectiveCreateOrganizationId || '').trim();
    }

    if (
      !resolvedOrgId
      && tenantClientId
      && organizationOptions.length === 1
      && organizationOptions[0]?.organizationId
    ) {
      resolvedOrgId = String(organizationOptions[0].organizationId);
    }

    const matchedOption =
      organizationOptions.find((opt) => String(opt.organizationId || '') === resolvedOrgId) ||
      preferredOption ||
      matchOrganizationOption(scopeLabel) ||
      selectedCreateOption;

    const resolvedClientId = String(
      matchedOption?.id || effectiveCreateClientId || tenantClientId || '',
    ).trim();
    const resolvedOrgName = String(
      (matchedOption?.organizationId ? matchedOption.name : '') || scopeLabel || '',
    ).trim();

    if (resolvedOrgId) setCreateOrganizationId(resolvedOrgId);
    if (resolvedClientId) setCreateClientId(resolvedClientId);

    setEventModalScope({
      clientId: resolvedClientId,
      organizationId: resolvedOrgId,
      organizationName: resolvedOrgName,
    });
    setIsEventModalOpen(true);
  }, [
    matchOrganizationOption,
    preferredOrganizationLabel,
    scopeJobCompany,
    scopeOrganizationName,
    defaultOrganizationName,
    selectedCreateOption,
    createOrganizationId,
    scopeOrganizationId,
    defaultOrganizationId,
    effectiveCreateOrganizationId,
    effectiveCreateClientId,
    tenantClientId,
    organizationOptions,
  ]);

  const closeCreateEventModal = useCallback(() => {
    setIsEventModalOpen(false);
    setEventModalScope(null);
  }, []);

  const createEventInitialData = useMemo(
    () =>
      defaultActionPipelineId && (scopeCandidateId || scopeContactId)
        ? { processId: defaultActionPipelineId }
        : null,
    [defaultActionPipelineId, scopeCandidateId, scopeContactId],
  );

  const modalClientPipelines = pipelinesByClient[settingsClientId] || [];
  const modalCandidatePipelines = candidatePipelinesByClient[settingsClientId] || [];
  const pipelinesForAutomationInfo = useMemo(
    () => [...modalClientPipelines, ...modalCandidatePipelines],
    [modalClientPipelines, modalCandidatePipelines],
  );

  const hasFilters =
    selectedPipelineIds.size > 0 ||
    selectedSystemEventIds.size > 0 ||
    selectedStageOutcomeKeys.size > 0 ||
    selectedStatuses.size > 0 ||
    selectedActiveStates.size !== activeStateOptions.length ||
    !activeStateOptions.every((s) => selectedActiveStates.has(s)) ||
    selectedCompanies.size > 0 ||
    !!entitySearchQuery.trim() ||
    !!dateFrom ||
    !!dateTo;

  return (
    <div
      className={
        embeddedInModal
          ? 'flex flex-col flex-1 min-h-0 h-full overflow-hidden'
          : 'bg-bg-subtle/30 rounded-2xl border border-border-default flex flex-col overflow-hidden min-h-[560px] md:overflow-visible'
      }
    >
      <div
        className={
          embeddedInModal
            ? 'flex flex-col flex-1 min-h-0 h-full overflow-hidden'
            : 'flex flex-col h-full bg-bg-default rounded-2xl border border-border-default overflow-hidden md:overflow-visible'
        }
      >
        {/* Filters */}
        {!hideFilters && !embeddedInModal ? (
        <div className="bg-bg-card p-4 border-b border-border-default flex flex-col gap-4 shadow-sm z-10 relative">
          <div className="w-full flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-muted">חיפוש באירועים</label>
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={entitySearchQuery}
                onChange={(e) => setEntitySearchQuery(e.target.value)}
                placeholder="מועמד, איש קשר, שם משרה, שם חברה…"
                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pr-9 pl-9 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
              {entitySearchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setEntitySearchQuery('')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text-default hover:bg-bg-hover"
                  title="נקה חיפוש"
                  aria-label="נקה חיפוש"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-text-muted">
              חיפוש לפי: מועמד · איש קשר · שם משרה · שם חברה
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 text-primary-700 font-bold ml-2">
            <FunnelIcon className="w-5 h-5" />
            <span>סינון אירועים:</span>
          </div>

          <ProcessManagementCatalogPanel
            variant="filters"
            clientPipelines={clientPipelinesCatalog}
            candidatePipelines={candidatePipelinesCatalog}
            systemEventGroups={systemEventGroups}
            selectedPipelineIds={selectedPipelineIds}
            onSelectedPipelineIdsChange={setSelectedPipelineIds}
            selectedSystemEventIds={selectedSystemEventIds}
            onSelectedSystemEventIdsChange={setSelectedSystemEventIds}
            selectedStageOutcomeKeys={selectedStageOutcomeKeys}
            onSelectedStageOutcomeKeysChange={setSelectedStageOutcomeKeys}
            disabled={catalogLoading}
          />

          <div className="flex flex-col gap-1 relative" ref={companyDropdownRef}>
            <label className="text-xs font-semibold text-text-muted">חברה (בחירה מרובה)</label>
            <button
              type="button"
              onClick={() => {
                setIsCompanyDropdownOpen((v) => {
                  if (v) setCompanyDropdownSearch('');
                  return !v;
                });
              }}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[150px]"
            >
              <span className="truncate">
                {selectedCompanies.size === 0 ? 'כל החברות' : `${selectedCompanies.size} חברות נבחרו`}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2" />
            </button>
            {isCompanyDropdownOpen ? (
              <div className="absolute top-full mt-1 right-0 w-56 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-72 overflow-y-auto">
                <input
                  type="search"
                  value={companyDropdownSearch}
                  onChange={(e) => setCompanyDropdownSearch(e.target.value)}
                  placeholder="חיפוש חברה…"
                  className="w-full mb-2 bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none sticky top-0"
                  autoFocus
                />
                {filteredCompanies.length === 0 ? (
                  <p className="text-xs text-text-muted px-2 py-3 text-center">לא נמצאו חברות</p>
                ) : (
                  filteredCompanies.map((c) => (
                    <label key={c} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCompanies.has(c)}
                        onChange={() => toggleSet(setSelectedCompanies, c)}
                        className="rounded border-border-default text-primary-600 w-4 h-4"
                      />
                      <span className="text-sm font-medium">{c}</span>
                    </label>
                  ))
                )}
                {selectedCompanies.size > 0 ? (
                  <div className="pt-2 mt-2 border-t border-border-subtle">
                    <button
                      type="button"
                      onClick={() => setSelectedCompanies(new Set())}
                      className="text-xs text-primary-600 font-semibold w-full text-right py-1"
                    >
                      נקה הכל
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 relative" ref={activeDropdownRef}>
            <label className="text-xs font-semibold text-text-muted">פעילות (בחירה מרובה)</label>
            <button
              type="button"
              onClick={() => setIsActiveDropdownOpen((v) => !v)}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[150px]"
            >
              <span className="truncate">
                {selectedActiveStates.size === 0
                  ? 'הכל'
                  : selectedActiveStates.size === activeStateOptions.length
                    ? 'פעיל + לא פעיל'
                    : [...selectedActiveStates].join(', ')}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2" />
            </button>
            {isActiveDropdownOpen ? (
              <div className="absolute top-full mt-1 right-0 w-48 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50">
                {activeStateOptions.map((s) => (
                  <label key={s} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedActiveStates.has(s)}
                      onChange={() => toggleSet(setSelectedActiveStates, s)}
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{s}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1 relative" ref={statusDropdownRef}>
            <label className="text-xs font-semibold text-text-muted">סטטוס</label>
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((v) => !v)}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[120px]"
            >
              <span className="truncate">
                {selectedStatuses.size === 0 ? 'הכל' : `${selectedStatuses.size} סטטוסים`}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2" />
            </button>
            {isStatusDropdownOpen ? (
              <div className="absolute top-full mt-1 right-0 w-48 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50">
                {statusOptions.map((s) => (
                  <label key={s} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(s)}
                      onChange={() => toggleSet(setSelectedStatuses, s)}
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{s}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-text-muted">מ-תאריך</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-text-muted">עד-תאריך</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSelectedPipelineIds(new Set());
                setSelectedSystemEventIds(new Set());
                setSelectedStageOutcomeKeys(new Set());
                setSelectedStatuses(new Set());
                setSelectedActiveStates(new Set(['פעיל', 'לא פעיל']));
                setSelectedCompanies(new Set());
                setDateFrom('');
                setDateTo('');
                setEntitySearchQuery('');
              }}
              className="text-sm font-semibold text-text-muted hover:text-red-600 flex items-center gap-1 mb-0.5"
            >
              <XMarkIcon className="w-4 h-4" /> נקה סינונים
            </button>
          ) : null}
          </div>
        </div>
        ) : null}

        <div
          className={`flex flex-col md:flex-row gap-6 p-4 flex-1 min-h-0 bg-bg-subtle ${
            embeddedInModal
              ? 'overflow-hidden md:items-stretch'
              : 'md:items-start md:overflow-visible overflow-hidden'
          }`}
        >
          {/* Events list */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl shadow-sm border border-border-default flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border-default flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
              <h3 className="font-bold text-text-default text-lg flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-primary-600" />
                יומן אירועים מערכתי
                <span className="text-sm font-normal text-text-muted bg-gray-200 px-2 rounded-full ml-2">
                  {filteredEvents.length} אירועים
                </span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDateSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  className="flex items-center gap-1.5 bg-bg-input border border-border-default rounded-xl px-3 py-2 text-sm font-semibold text-text-default hover:bg-bg-hover transition"
                  title={dateSortOrder === 'desc' ? 'מיון לפי תאריך: מהחדש לישן' : 'מיון לפי תאריך: מהישן לחדש'}
                >
                  {dateSortOrder === 'desc' ? (
                    <ChevronDownIcon className="w-4 h-4 text-primary-600" />
                  ) : (
                    <ChevronUpIcon className="w-4 h-4 text-primary-600" />
                  )}
                  <span>{dateSortOrder === 'desc' ? 'תאריך יורד' : 'תאריך עולה'}</span>
                </button>
                {clientOptions.length > 1 ? (
                  <select
                    value={
                      effectiveCreateOrganizationId
                        ? `org:${effectiveCreateOrganizationId}`
                        : effectiveCreateClientId
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw.startsWith('org:')) {
                        const orgId = raw.slice(4);
                        const opt = clientOptions.find(
                          (c) => String(c.organizationId || '') === orgId,
                        );
                        setCreateOrganizationId(orgId);
                        if (opt?.id) setCreateClientId(opt.id);
                      } else {
                        setCreateClientId(raw);
                        const opt = clientOptions.find((c) => c.id === raw && !c.organizationId)
                          || clientOptions.find((c) => c.id === raw);
                        setCreateOrganizationId(String(opt?.organizationId || ''));
                      }
                    }}
                    className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                  >
                    {clientOptions.map((c) => (
                      <option
                        key={c.organizationId ? `org-${c.organizationId}` : c.id}
                        value={c.organizationId ? `org:${c.organizationId}` : c.id}
                      >
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={openCreateEventModal}
                  disabled={!effectiveCreateClientId}
                  className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-700 transition shadow-sm hover:shadow disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                  אירוע חדש
                </button>
              </div>
            </div>

            <div
              className={`p-4 space-y-4 flex-1 min-h-0 bg-white ${
                embeddedInModal
                  ? 'overflow-y-scroll custom-scrollbar'
                  : 'overflow-y-auto custom-scrollbar'
              }`}
            >
              {error ? (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
              ) : null}
              {loading && events.length === 0 ? (
                <div className="text-center py-12 text-text-muted">טוען אירועים...</div>
              ) : displayEvents.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <FunnelIcon className="w-12 h-12 text-gray-300 mb-4" />
                  <h4 className="text-lg font-bold text-gray-700">לא נמצאו אירועים</h4>
                  <p className="text-gray-500">נסה לשנות את תנאי הסינון כדי לראות תוצאות.</p>
                </div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                {displayEvents.map((event) => {
                  const eventKey = journalEventKey(event);
                  const isExiting = exitingEventIds.has(eventKey);
                  const rescheduleHighlight = rescheduleHighlights[eventKey];
                  const isSelected = expandedEventId === event.id;
                  const isExpanded = alwaysShowDetails || isSelected;
                  const isInactive = event.isActive === false;
                  const candidateIdForDrawer = resolveCandidateIdForDrawer(event, scopeCandidateId);
                  const contactIdForDrawer = resolveContactIdForDrawer(
                    event,
                    scopeContactId,
                    scopeContactName,
                    contactLookups,
                  );
                  const showPersonBadge = shouldShowPersonBadge(event, contactLookups);
                  const { jobId, jobTitle, jobCompany } = resolveEventJobMeta(event);
                  const organizationRef = resolveEventOrganizationRef(
                    event,
                    orgNameById,
                    organizationOptions,
                  );
                  return (
                    <motion.div
                      key={eventKey}
                      layout
                      initial={{ opacity: 0.88, y: 10, scale: 0.99 }}
                      animate={
                        isExiting
                          ? { opacity: 0, x: -32, scale: 0.94 }
                          : { opacity: 1, y: 0, x: 0, scale: 1 }
                      }
                      transition={{
                        layout: { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 },
                        opacity: { duration: isExiting ? 0.38 : 0.22 },
                        x: { duration: 0.38, ease: [0.4, 0, 0.2, 1] },
                      }}
                    >
                    <div
                      id={`journal-event-${event.id}`}
                      className={`border-2 rounded-2xl p-4 transition-all duration-300 relative ${
                        alwaysShowDetails ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isInactive
                          ? 'border-gray-200 bg-gray-50/80 opacity-60 hover:opacity-75'
                          : isSelected
                            ? 'border-primary-500 shadow-md bg-primary-50/10'
                            : 'border-border-default hover:border-primary-300 hover:shadow-sm bg-white'
                      } ${rescheduleHighlight ? 'ring-2 ring-primary-300 shadow-lg shadow-primary-100/80' : ''}`}
                      onClick={() => {
                        if (alwaysShowDetails) {
                          setExpandedEventId(isSelected ? null : event.id);
                          return;
                        }
                        setExpandedEventId(isSelected ? null : event.id);
                      }}
                    >
                      {rescheduleHighlight ? (
                        <div className="absolute top-0 inset-x-0 z-10 flex justify-center pointer-events-none">
                          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary-600 text-white text-[11px] font-bold px-3 py-1 shadow-md">
                            <CalendarDaysIcon className="w-3.5 h-3.5" />
                            {rescheduleHighlight.label}
                          </span>
                        </div>
                      ) : null}
                      <div className={`flex justify-between items-start mb-3 ${rescheduleHighlight ? 'pt-7' : ''}`}>
                        <div className="flex items-start gap-3">
                          {!alwaysShowDetails ? (
                          <button
                            type="button"
                            className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                              isExpanded ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
                          </button>
                          ) : null}
                          <div className="flex-1 min-w-0">
                            {!isInactive && editingDescriptionId === event.id ? (
                              <input
                                type="text"
                                value={editTitleValue}
                                onChange={(e) => setEditTitleValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className={`w-full font-extrabold text-[17px] border border-primary-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white ${
                                  isSelected ? 'text-primary-800' : 'text-text-default'
                                }`}
                                placeholder="כותרת האירוע"
                                aria-label="כותרת האירוע"
                              />
                            ) : (
                              <h4
                                className={`font-extrabold text-[17px] transition-colors ${
                                  isInactive
                                    ? 'text-gray-500'
                                    : isSelected
                                      ? 'text-primary-800'
                                      : 'text-text-default'
                                }`}
                              >
                                {event.title}
                              </h4>
                            )}
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {!scopeContactId && !scopeOrganizationId && organizationRef?.name ? (
                                organizationRef.organizationId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openOrganizationDrawer(organizationRef);
                                    }}
                                    className="text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold hover:bg-indigo-100 hover:underline transition-colors"
                                    title="פתח דראוור ארגון"
                                  >
                                    <BuildingOffice2Icon className="w-3 h-3" />
                                    {organizationRef.name}
                                  </button>
                                ) : (
                                  <span className="text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                                    <BuildingOffice2Icon className="w-3 h-3" />
                                    {organizationRef.name}
                                  </span>
                                )
                              ) : null}
                              {showPersonBadge && event.contactName ? (
                                candidateIdForDrawer ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openCandidateDrawer(candidateIdForDrawer, event.contactName || '');
                                    }}
                                    className="text-[11px] bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold hover:bg-teal-100 hover:underline transition-colors"
                                    title="פתח דראוור מועמד"
                                  >
                                    <UserIcon className="w-3 h-3" />
                                    {event.contactName}
                                  </button>
                                ) : contactIdForDrawer && event.clientId ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void openContactDrawer(
                                        contactIdForDrawer,
                                        event.contactName || '',
                                        event.clientId,
                                        resolveCompanyLabel(event),
                                      );
                                    }}
                                    className="text-[11px] bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold hover:bg-teal-100 hover:underline transition-colors"
                                    title="פתח דראוור איש קשר"
                                  >
                                    <UserIcon className="w-3 h-3" />
                                    {event.contactName}
                                  </button>
                                ) : (
                                  <span className="text-[11px] bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                                    <UserIcon className="w-3 h-3" />
                                    {event.contactName}
                                  </span>
                                )
                              ) : null}
                              {jobId ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openJobDrawer(jobId, jobTitle || 'משרה', jobCompany);
                                  }}
                                  className="text-[11px] bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold hover:bg-purple-100 hover:underline transition-colors"
                                  title="פתח דראוור משרה"
                                >
                                  <BriefcaseIcon className="w-3 h-3" />
                                  {jobTitle || 'משרה'}
                                </button>
                              ) : null}
                              {event.stage ? (
                                <span className="text-[11px] bg-amber-50 border border-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                                  {event.stage}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {event.isActive === false ? (
                            <span className="text-[11px] px-3 py-1 rounded-full font-bold bg-gray-200 text-gray-700 border border-gray-300">
                              לא פעיל
                            </span>
                          ) : null}
                          <span
                            className={`text-[11px] px-3 py-1 rounded-full font-bold uppercase tracking-wider ${
                              getDynamicStatus(event.status, event.dueDate).color
                            }`}
                          >
                            {getDynamicStatus(event.status, event.dueDate).label}
                          </span>
                          {!isInactive && editingDescriptionId === event.id ? (
                            <label
                              className="text-[11px] font-semibold text-text-muted flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-primary-200"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              <span>יעד:</span>
                              <input
                                type="date"
                                value={editDueDateValue}
                                onChange={(e) => setEditDueDateValue(e.target.value)}
                                className="font-mono text-gray-700 border border-gray-200 rounded px-1 text-[11px]"
                              />
                            </label>
                          ) : event.dueDate ? (
                            <span className="text-[11px] font-semibold text-text-muted flex items-center gap-1 bg-white px-2 py-1 rounded-md border border-gray-100 shadow-sm">
                              <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              יעד:{' '}
                              <span className="font-mono text-gray-700">
                                {new Date(event.dueDate).toLocaleDateString('he-IL')}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className={
                          alwaysShowDetails
                            ? 'mt-4'
                            : `overflow-hidden transition-all duration-300 ${
                                isExpanded ? 'max-h-[3000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
                              }`
                        }
                      >
                        <div className="bg-white border border-border-default rounded-xl p-4 mb-4 shadow-sm group/desc relative">
                          {!isInactive && editingDescriptionId === event.id ? (
                            <div className="flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
                              <div>
                                <label className="block text-xs font-bold text-text-muted mb-1">כותרת האירוע</label>
                                <input
                                  type="text"
                                  value={editTitleValue}
                                  onChange={(e) => setEditTitleValue(e.target.value)}
                                  className="w-full text-[15px] font-bold text-text-default border border-primary-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                  placeholder="כותרת האירוע"
                                />
                              </div>
                              <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-text-muted mb-1">השלב הבא</label>
                                  <p className="text-[12px] text-text-muted mb-1.5">
                                    שלב נוכחי:{' '}
                                    <span className="font-bold text-amber-800">
                                      {resolveActionPipelineContext(
                                        event,
                                        event.id === selectedEvent?.id ? actionPipelineId : null,
                                        pipelinesByClient[event.clientId] || [],
                                        candidatePipelinesByClient[event.clientId] || [],
                                        resolvePreferredStageIdForEvent(event, {
                                          scopeJobLinkId,
                                          defaultProcessStageId,
                                        }),
                                      )?.stage.name ||
                                        event.stage ||
                                        '—'}
                                    </span>
                                  </p>
                                  <select
                                    value={editNextStageValue}
                                    onChange={(e) => setEditNextStageValue(e.target.value)}
                                    className="w-full text-[13px] border border-primary-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                  >
                                    <option value="">-- ללא שינוי שלב --</option>
                                    {resolveStagesForEvent(
                                      event,
                                      pipelinesByClient[event.clientId] || [],
                                      candidatePipelinesByClient[event.clientId] || [],
                                      event.id === selectedEvent?.id ? actionPipelineId : null,
                                    ).map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="w-full sm:w-1/3">
                                  <label className="block text-xs font-bold text-text-muted mb-1">לטיפול</label>
                                  <select
                                    value={editAssigneeValue}
                                    onChange={(e) => setEditAssigneeValue(e.target.value)}
                                    className="w-full text-[13px] border border-primary-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                  >
                                    {assigneeOptions.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                    {editAssigneeValue && !assigneeOptions.includes(editAssigneeValue) ? (
                                      <option value={editAssigneeValue}>{editAssigneeValue}</option>
                                    ) : null}
                                  </select>
                                </div>
                              </div>
                              <textarea
                                value={editDescriptionValue}
                                onChange={(e) => setEditDescriptionValue(e.target.value)}
                                className="w-full min-h-[120px] text-[14px] text-text-default border border-primary-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y"
                                placeholder="הזן תיאור..."
                              />
                              <label className="flex items-center gap-2 text-sm font-semibold text-text-default cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editIsActiveValue}
                                  onChange={(e) => setEditIsActiveValue(e.target.checked)}
                                  className="rounded border-border-default text-primary-600 w-4 h-4"
                                />
                                אירוע פעיל
                              </label>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDescriptionId(null);
                                    setEditTitleValue('');
                                    setEditStatusUpdates([]);
                                  }}
                                  className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <XMarkIcon className="w-4 h-4" /> ביטול
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleSaveDescription(event)}
                                  className="px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center gap-1"
                                >
                                  <CheckIcon className="w-4 h-4" /> שמור
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p
                                className={`text-[14px] whitespace-pre-wrap leading-relaxed font-medium pl-10 ${
                                  isInactive ? 'text-gray-500' : 'text-text-default'
                                }`}
                              >
                                {event.description || <span className="text-gray-400 italic">אין תיאור</span>}
                              </p>
                              {!isInactive ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditDescription(event);
                                  }}
                                  className="absolute top-3 left-3 w-8 h-8 rounded-full bg-gray-50 hover:bg-primary-50 flex items-center justify-center opacity-100 transition-all border border-gray-200 hover:border-primary-200 hover:text-primary-600 text-gray-400 shadow-sm z-10"
                                  title="ערוך אירוע"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleReactivateEvent(event);
                                  }}
                                  className="absolute top-3 left-3 px-3 py-1.5 rounded-lg bg-white hover:bg-primary-50 flex items-center justify-center gap-1.5 transition-all border border-gray-200 hover:border-primary-200 hover:text-primary-700 text-gray-600 shadow-sm z-10 text-xs font-bold"
                                  title="הפעל מחדש"
                                >
                                  <ArrowPathIcon className="w-4 h-4" />
                                  הפעל מחדש
                                </button>
                              )}
                            </>
                          )}
                        </div>

                        <div className="mb-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-2 mb-3 px-1">
                            <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                              היסטוריית סטטוסים
                            </h5>
                            {!isInactive && editingDescriptionId === event.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const actor = editAssigneeValue || user?.name || 'אני';
                                  setEditStatusUpdates((prev) => [
                                    {
                                      id: `u-${Date.now()}`,
                                      title: 'הערה',
                                      date: new Date().toISOString(),
                                      creator: actor,
                                      comment: '',
                                    },
                                    ...prev,
                                  ]);
                                }}
                                className="text-[11px] font-bold text-primary-600 hover:text-primary-700 hover:underline"
                              >
                                + הוסף הערה
                              </button>
                            ) : null}
                          </div>
                          {!isInactive && editingDescriptionId === event.id ? (
                            editStatusUpdates.length === 0 ? (
                              <div className="text-sm text-text-muted italic bg-gray-50 border border-dashed border-border-default rounded-lg p-3">
                                אין עדכוני סטטוס. לחץ &quot;הוסף הערה&quot; כדי להוסיף.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {editStatusUpdates.map((update) => (
                                  <div
                                    key={update.id}
                                    className="bg-gray-50 border border-primary-200 rounded-lg p-3 space-y-2"
                                  >
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="text"
                                        value={update.title}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setEditStatusUpdates((prev) =>
                                            prev.map((u) => (u.id === update.id ? { ...u, title: val } : u)),
                                          );
                                        }}
                                        className="flex-1 text-sm font-bold border border-border-default rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 outline-none bg-white"
                                        placeholder="תיאור עדכון / סטטוס"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditStatusUpdates((prev) => prev.filter((u) => u.id !== update.id));
                                        }}
                                        className="p-1.5 rounded-lg text-text-subtle hover:text-red-600 hover:bg-red-50 shrink-0"
                                        title="מחק עדכון"
                                      >
                                        <TrashIcon className="w-4 h-4" />
                                      </button>
                                    </div>
                                    <textarea
                                      value={update.comment || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setEditStatusUpdates((prev) =>
                                          prev.map((u) => (u.id === update.id ? { ...u, comment: val } : u)),
                                        );
                                      }}
                                      rows={2}
                                      className="w-full text-[13px] border border-border-default rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-primary-500 outline-none bg-white resize-y"
                                      placeholder="הערה / פירוט (אופציונלי)"
                                    />
                                    <p className="text-[10px] text-text-subtle">
                                      {update.creator || '—'}
                                      {update.date
                                        ? ` · ${new Date(update.date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`
                                        : ''}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )
                          ) : (event.updates || []).length === 0 ? (
                            <div className="text-sm text-text-muted italic bg-gray-50 border border-dashed border-border-default rounded-lg p-3">
                              אין עדכוני סטטוס עדיין. בחר פעולה מהפאנל או עדכן דרך עריכת התיאור.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {sortStatusUpdatesByDateDesc(event.updates || []).map((update) => {
                                const rowEditKey = statusUpdateEditKey(event, update.id);
                                const isEditingRow = editingStatusUpdateKey === rowEditKey;
                                return (
                                <div
                                  key={update.id}
                                  className={`bg-gray-50 border rounded-lg p-3 ${
                                    isEditingRow
                                      ? 'border-primary-200 space-y-2'
                                      : 'group border-border-subtle flex justify-between items-start gap-3'
                                  }`}
                                >
                                  {isEditingRow ? (
                                    <>
                                      <input
                                        type="text"
                                        value={statusUpdateEditDraft.title}
                                        onChange={(e) =>
                                          setStatusUpdateEditDraft((prev) => ({
                                            ...prev,
                                            title: e.target.value,
                                          }))
                                        }
                                        className="w-full text-sm font-bold border border-border-default rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-primary-500 outline-none bg-white"
                                        placeholder="תיאור עדכון / סטטוס"
                                      />
                                      <textarea
                                        value={statusUpdateEditDraft.comment}
                                        onChange={(e) =>
                                          setStatusUpdateEditDraft((prev) => ({
                                            ...prev,
                                            comment: e.target.value,
                                          }))
                                        }
                                        rows={2}
                                        className="w-full text-[13px] border border-border-default rounded-lg px-2.5 py-2 focus:ring-1 focus:ring-primary-500 outline-none bg-white resize-y"
                                        placeholder="הערה / פירוט (אופציונלי)"
                                      />
                                      <p className="text-[10px] text-text-subtle">
                                        {update.creator || '—'}
                                        {update.date
                                          ? ` · ${new Date(update.date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}`
                                          : ''}
                                      </p>
                                      <div className="flex justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={handleCancelEditStatusUpdate}
                                          className="px-3 py-1.5 text-sm font-semibold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                          <XMarkIcon className="w-4 h-4" /> ביטול
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => void handleSaveStatusUpdateRow(event, update.id)}
                                          className="px-3 py-1.5 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center gap-1"
                                        >
                                          <CheckIcon className="w-4 h-4" /> שמור
                                        </button>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-white border border-border-default flex items-center justify-center text-primary-600 shadow-sm shrink-0">
                                          <CheckCircleIcon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-sm font-bold text-text-default">{update.title}</p>
                                          {update.comment ? (
                                            <p className="text-[13px] text-text-default mt-1 whitespace-pre-wrap leading-relaxed">
                                              {update.comment}
                                            </p>
                                          ) : null}
                                          <p className="text-[11px] text-text-muted mt-0.5">
                                            עודכן ע&quot;י: {update.creator || '—'}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {!isInactive ? (
                                          <button
                                            type="button"
                                            onClick={() => handleStartEditStatusUpdate(event, update)}
                                            className="w-8 h-8 rounded-lg bg-white border border-border-subtle hover:border-primary-200 hover:bg-primary-50 flex items-center justify-center text-gray-400 hover:text-primary-600 transition-all shadow-sm opacity-0 group-hover:opacity-100 focus:opacity-100"
                                            title="ערוך עדכון זה"
                                          >
                                            <PencilIcon className="w-4 h-4" />
                                          </button>
                                        ) : null}
                                        <div className="text-[11px] font-bold text-text-muted bg-white px-2 py-1 rounded-md border border-border-subtle shadow-sm flex items-center gap-1.5">
                                          <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                                          {update.date
                                            ? new Date(update.date).toLocaleString('he-IL', {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                              })
                                            : '—'}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div
                          className="flex flex-wrap items-center gap-6 text-xs text-text-muted border-t border-border-subtle pt-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">
                            <ClockIcon className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold">
                              נוצר:{' '}
                              <span className="font-mono text-gray-700">
                                {event.date ? new Date(event.date).toLocaleString('he-IL') : '—'}
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">
                            <CalendarIcon className="w-4 h-4 text-gray-400" />
                            <span className="font-semibold">
                              יעד לביצוע:
                              {editingDescriptionId === event.id ? (
                                <input
                                  type="date"
                                  value={editDueDateValue}
                                  onChange={(e) => setEditDueDateValue(e.target.value)}
                                  className="font-mono text-gray-700 ml-2 border border-gray-200 rounded px-1"
                                />
                              ) : (
                                <span className="font-mono text-gray-700">
                                  {' '}
                                  {event.dueDate ? new Date(event.dueDate).toLocaleDateString('he-IL') : '-'}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded shadow-sm border border-gray-100">
                            <div className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-[10px]">
                              {(event.creator || '?').charAt(0)}
                            </div>
                            <span className="font-semibold">
                              נפתח ע&quot;י: <span className="text-gray-700">{event.creator || '—'}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Outcomes panel — from PipelineSettings stage.outcomes */}
          <div
            className={`w-full md:w-72 shrink-0 min-h-0 bg-white rounded-2xl shadow-sm border border-border-default flex flex-col overflow-hidden ${
              embeddedInModal
                ? 'md:self-stretch'
                : 'self-start md:sticky md:top-4 md:max-h-[calc(100vh-5rem)] z-10'
            }`}
          >
            <div className="p-4 border-b border-border-default bg-primary-600 text-white">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5 opacity-90 shrink-0" />
                    פעולות אפשריות
                  </h3>
                  <p className="text-xs text-primary-100 mt-1 opacity-90">
                    {selectedEvent ? (
                      <>
                        לאירוע: {selectedEvent.title}
                        {selectedEventOrganizationRef?.name ? (
                          <>
                            <br />
                            {selectedEventOrganizationRef.organizationId ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOrganizationDrawer(selectedEventOrganizationRef);
                                }}
                                className="inline-flex items-center gap-1 mt-0.5 font-bold hover:underline text-left"
                                title="פתח דראוור ארגון"
                              >
                                <BuildingOffice2Icon className="w-3.5 h-3.5 shrink-0 opacity-90" />
                                {selectedEventOrganizationRef.name}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 mt-0.5 font-bold">
                                <BuildingOffice2Icon className="w-3.5 h-3.5 shrink-0 opacity-90" />
                                {selectedEventOrganizationRef.name}
                              </span>
                            )}
                          </>
                        ) : null}
                        {currentStageLabel ? (
                          <>
                            <br />
                            שלב: {currentStageLabel}
                          </>
                        ) : null}
                      </>
                    ) : (
                      'בחר אירוע כדי לראות פעולות'
                    )}
                  </p>
                </div>
                {selectedEvent && selectedEvent.isActive !== false ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAutomationInfoView({ mode: 'stage' });
                    }}
                    className="shrink-0 w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 flex items-center justify-center transition-colors"
                    title="מידע על פעולות ואוטומציות לשלב"
                    aria-label="מידע על פעולות ואוטומציות לשלב"
                  >
                    <InformationCircleIcon className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className={`p-3 flex-1 min-h-0 bg-gray-50/30 ${
                embeddedInModal
                  ? 'overflow-y-scroll custom-scrollbar'
                  : 'overflow-y-auto custom-scrollbar'
              }`}
            >
              {!selectedEvent ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <ClockIcon className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">
                    לחץ על אחד מהאירועים ברשימה כדי להציג ולעדכן סטטוס מתאים.
                  </p>
                </div>
              ) : selectedEvent?.isActive === false ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <ClockIcon className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">אירוע לא פעיל</p>
                  <p className="text-xs text-text-muted mt-1 mb-4">לא ניתן לבצע פעולות עד שהאירוע יופעל מחדש.</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleReactivateEvent(selectedEvent);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition shadow-sm"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    הפעל מחדש
                  </button>
                </div>
              ) : pipelinesLoading &&
                !pipelinesByClient[selectedEvent.clientId] &&
                !candidatePipelinesByClient[selectedEvent.clientId] ? (
                <div className="text-center py-8 text-sm text-text-muted">טוען פעולות מתהליך העבודה...</div>
              ) : (
                <div
                  key={`${selectedEvent.id}-${preferredStageIdForActions || ''}-${currentStageLabel}`}
                  className="space-y-2"
                >
                  <div className="mb-4 pb-2 border-b border-border-default">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                      תוצאות לשלב
                    </h4>
                    <p className="text-sm font-semibold text-text-default">
                      {currentStageLabel || '—'}
                      <span className="text-text-muted font-normal">
                        {' '}
                        · {currentPipelineLabel || processLabel(selectedEvent.process)}
                      </span>
                    </p>
                  </div>
                  {currentOutcomes.length === 0 ? (
                    <div className="px-1 space-y-3">
                      <p className="text-sm text-text-muted leading-relaxed">
                        {isGenericStageName(String(currentStageLabel || '')) ? (
                          <>
                            המערכת זיהתה בטעות את השלב «{currentStageLabel}» (ברירת מחדל).
                            מומלץ למחוק אותו מההגדרות ולהוסיף <strong>תוצאות אינטראקציה</strong> לשלבים
                            הקיימים (01, 02…).
                          </>
                        ) : (
                          <>
                            לשלב <strong className="text-text-default">{currentStageLabel}</strong> לא הוגדרו
                            תוצאות. פתח/י את השלב בהגדרות → לחץ על החץ → «הוסף תוצאה».
                          </>
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAutomationInfoView({ mode: 'stage' });
                        }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-sm font-bold hover:bg-blue-100 transition-colors"
                      >
                        <InformationCircleIcon className="w-5 h-5 shrink-0" />
                        מה אפשר לעשות בשלב זה?
                      </button>
                    </div>
                  ) : (
                    currentOutcomes.map((outcome) => (
                      <div
                        key={outcome.id}
                        className="flex items-start w-full rounded-xl overflow-hidden shadow-sm bg-white hover:bg-primary-50 border border-transparent hover:border-primary-100 transition-all group"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleLogOutcome(outcome);
                          }}
                          className="flex-1 min-w-0 text-right px-4 py-3 text-[13px] font-bold text-gray-700 group-hover:text-primary-800 transition-colors flex items-start justify-between gap-3 bg-transparent border-0"
                        >
                          <span className="flex flex-col items-start gap-0.5 min-w-0 flex-1">
                            <span className="w-full leading-snug break-words whitespace-normal">
                              {outcome.title}
                            </span>
                            <span className="w-full text-[10px] font-medium text-text-muted leading-snug break-words whitespace-normal">
                              {outcomeActionSubtitle(
                                outcome,
                                actionPipelineContext?.pipeline.stages || [],
                              )}
                            </span>
                          </span>
                          <div className="w-6 h-6 rounded-full bg-gray-50 group-hover:bg-primary-100 flex items-center justify-center transition-colors shrink-0 mt-0.5">
                            <CheckCircleIcon className="w-4 h-4 text-gray-300 group-hover:text-primary-600 transition-colors" />
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAutomationInfoView({ mode: 'outcome', outcome });
                          }}
                          className="shrink-0 px-2.5 pt-3.5 pb-3 border-0 bg-transparent text-blue-600 hover:text-blue-700 transition-colors flex items-center justify-center self-start"
                          title="מה יקרה בפעולה זו?"
                          aria-label={`מידע על אוטומציות — ${outcome.title}`}
                        >
                          <InformationCircleIcon className="w-5 h-5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {effectiveCreateClientId ? (
        <ProcessEventModal
          key={`${eventModalScope?.clientId || effectiveCreateClientId}:${eventModalScope?.organizationId || effectiveCreateOrganizationId}:${eventModalScope?.organizationName || createOrganizationName}`}
          isOpen={isEventModalOpen}
          onClose={closeCreateEventModal}
          onSave={handleCreateProcessEvent}
          clientId={eventModalScope?.clientId || effectiveCreateClientId}
          organizationId={eventModalScope?.organizationId || effectiveCreateOrganizationId || null}
          organizationName={eventModalScope?.organizationName || createOrganizationName || undefined}
          clientName={eventModalScope?.organizationName || createOrganizationName}
          contactId={scopeContactId || scopeCandidateId || undefined}
          contactName={scopeContactName || undefined}
          pipelineKind={scopeCandidateId ? 'candidate' : 'client'}
          pipelineClientId={settingsClientId}
          clientPipelines={modalClientPipelines}
          candidatePipelines={modalCandidatePipelines}
          linkedEntityName={scopeCandidateId ? scopeContactName || undefined : undefined}
          initialData={createEventInitialData}
        />
      ) : null}

      <AutomationApprovalModal
        isOpen={Boolean(automationApproval?.pending.length)}
        outcomeName={automationApproval?.outcomeName}
        pending={automationApproval?.pending || []}
        onClose={() => setAutomationApproval(null)}
        onApprove={handleApproveAutomations}
      />

      <OutcomeAutomationsInfoModal
        isOpen={Boolean(automationInfoView)}
        outcome={automationInfoView?.mode === 'outcome' ? automationInfoView.outcome : null}
        stageOutcomes={automationInfoView?.mode === 'stage' ? currentOutcomes : null}
        stageLabel={currentStageLabel}
        pipelineLabel={currentPipelineLabel || (selectedEvent ? processLabel(selectedEvent.process) : null)}
        pipelineKind={actionPipelineContext?.pipelineKind ?? null}
        stages={actionPipelineContext?.pipeline.stages || []}
        templates={messageTemplates}
        pipelines={pipelinesForAutomationInfo}
        onClose={() => setAutomationInfoView(null)}
        overlayZIndexClass={embeddedInModal ? 'z-[10100]' : 'z-[10100]'}
      />

      <CandidateSummaryDrawer
        candidate={candidateDrawer}
        isOpen={isCandidateDrawerOpen && Boolean(candidateDrawer)}
        onClose={() => setIsCandidateDrawerOpen(false)}
        isFavorite={false}
        onToggleFavorite={() => {}}
        overlayZIndexClass={drawerOverlayZ}
      />
      <ContactDrawer
        isOpen={isContactDrawerOpen && Boolean(contactDrawer)}
        onClose={() => setIsContactDrawerOpen(false)}
        contact={contactDrawer}
        processOptions={[]}
        onStartProcess={() => {}}
        openMessageModal={() => {}}
      />
      <OrganizationPreviewDrawer
        target={orgDrawerTarget}
        isOpen={isOrgDrawerOpen && Boolean(orgDrawerTarget)}
        onClose={() => {
          setIsOrgDrawerOpen(false);
          setOrgDrawerTarget(null);
        }}
        tenantClientId={tenantClientId}
        overlayZIndexClass={drawerOverlayZ}
      />
      <JobDetailsDrawer
        job={jobDrawer}
        isOpen={isJobDrawerOpen && Boolean(jobDrawer)}
        onClose={() => setIsJobDrawerOpen(false)}
        overlayZIndexClass={drawerOverlayZ}
      />
    </div>
  );
};

export default ClientsEventsJournalTab;
