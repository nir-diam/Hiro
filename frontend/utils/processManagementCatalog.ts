import type { PipelineDto, PipelineStageDto, StageOutcomeDto } from '../services/pipelinesApi';

export type PipelineKind = 'client' | 'candidate';

export type EnrichedPipeline = PipelineDto & {
  kind: PipelineKind;
  clientId: string;
};

export type StageOutcomeOption = {
  key: string;
  label: string;
  groupLabel: string;
  kind: 'stage' | 'outcome';
  pipelineId: string;
  stageId: string;
  outcomeId?: string;
  outcome?: StageOutcomeDto;
  stage?: PipelineStageDto;
};

export type SystemEventOption = {
  value: string;
  label: string;
  groupLabel: string;
};

export type SystemEventCatalogEntry = {
  /** Stable key: triggerName::eventName */
  value: string;
  /** Display name within the trigger group */
  label: string;
  triggerName: string;
  eventName: string;
  rowIds: string[];
};

export type SystemEventCatalogGroup = {
  label: string;
  events: SystemEventCatalogEntry[];
};

export type SystemEventPipelineMatch = {
  pipelineId: string;
  stageId: string;
  outcomeId: string;
};

const LEGACY_SYSTEM_EVENT_KEYS: Record<string, string> = {
  candidate_confirmed_profile: 'מועמד.אישור הפרופיל על ידי המועמד',
  candidate_confirmed_interview: 'מועמד.אישר_הגעה_לראיון',
  candidate_canceled_interview: 'מועמד.ביטל_הגעה_לראיון',
  candidate_requested_reschedule: 'מועמד.ביקש_לשנות_מועד',
  form_completed_onboarding: 'טופס.קליטה_הושלם',
  form_completed_tech_test: 'טופס.מבחן_מקצועי_הוגש',
  bg_check_passed: 'בדיקת_רקע.עבר_בהצלחה',
  hris_sync_completed: 'מערכת_HR.סנכרון_הושלם',
  staff_email_sent: 'דיוור ודיווח.נשלח מייל',
  email_sent: 'דיוור ודיווח.נשלח מייל',
  proposal_sent: 'דיוור ודיווח.הצעת מחיר',
  proposal: 'דיוור ודיווח.הצעת מחיר',
};

/** Catalog/API may use a short label while journal rows store the long form. */
export const PROPOSAL_SYSTEM_EVENT_NAMES = new Set(['נשלחה הצעת מחיר', 'הצעת מחיר']);

export function isProposalSystemEventName(name: string): boolean {
  return PROPOSAL_SYSTEM_EVENT_NAMES.has(String(name || '').trim());
}

export function isProposalSystemEventEntry(entry: SystemEventCatalogEntry): boolean {
  return String(entry.triggerName || '').trim() === 'דיוור ודיווח'
    && isProposalSystemEventName(entry.eventName);
}

function proposalSystemEventNamesMatch(storedEventName: string, entry: SystemEventCatalogEntry): boolean {
  const stored = String(storedEventName || '').trim();
  if (!stored) return false;
  if (stored === entry.eventName) return true;
  return isProposalSystemEventEntry(entry) && isProposalSystemEventName(stored);
}

export const systemEventCompositeKey = (triggerName: string, eventName: string) =>
  `${String(triggerName || '').trim()}::${String(eventName || '').trim()}`;

/** One catalog row for proposal sends regardless of short/long eventName in DB. */
export function canonicalSystemEventCompositeKey(triggerName: string, eventName: string): string {
  const trigger = String(triggerName || '').trim();
  const name = String(eventName || '').trim();
  if (trigger === 'דיוור ודיווח' && isProposalSystemEventName(name)) {
    return systemEventCompositeKey(trigger, 'הצעת מחיר');
  }
  return systemEventCompositeKey(trigger, name);
}

/** Merge API catalog rows with built-in fallback entries (e.g. before DB migration). */
export function mergeSystemEventCatalogGroups(
  primary: SystemEventCatalogGroup[],
  supplemental: SystemEventCatalogGroup[],
): SystemEventCatalogGroup[] {
  const byTrigger = new Map<string, Map<string, SystemEventCatalogEntry>>();
  const ingest = (groups: SystemEventCatalogGroup[]) => {
    for (const group of groups) {
      const trigger = String(group.label || '').trim() || 'אירועים';
      if (!byTrigger.has(trigger)) byTrigger.set(trigger, new Map());
      const bucket = byTrigger.get(trigger)!;
      for (const entry of group.events) {
        const value = entry.value.includes('::')
          ? canonicalSystemEventCompositeKey(
              entry.value.split('::')[0] || entry.triggerName,
              entry.value.split('::').slice(1).join('::') || entry.eventName,
            )
          : canonicalSystemEventCompositeKey(entry.triggerName, entry.eventName);
        const existing = bucket.get(value);
        if (!existing) {
          bucket.set(value, { ...entry, value, rowIds: [...entry.rowIds] });
          continue;
        }
        for (const id of entry.rowIds) {
          if (id && !existing.rowIds.includes(id)) existing.rowIds.push(id);
        }
      }
    }
  };
  ingest(primary);
  ingest(supplemental);
  return Array.from(byTrigger.entries()).map(([label, eventsMap]) => ({
    label,
    events: Array.from(eventsMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'he')),
  }));
}

export function buildSystemEventGroupsFromApiRows(
  rows: Array<{ id: string; isActive?: boolean; triggerName: string; eventName: string }>,
): SystemEventCatalogGroup[] {
  const byTrigger = new Map<string, Map<string, SystemEventCatalogEntry>>();
  for (const row of rows) {
    if (row.isActive === false) continue;
    const triggerName = String(row.triggerName || 'אירועים').trim();
    const eventName = String(row.eventName || '').trim();
    if (!eventName) continue;
    const value = canonicalSystemEventCompositeKey(triggerName, eventName);
    const label =
      triggerName === 'דיוור ודיווח' && isProposalSystemEventName(eventName)
        ? 'הצעת מחיר'
        : eventName;
    if (!byTrigger.has(triggerName)) byTrigger.set(triggerName, new Map());
    const bucket = byTrigger.get(triggerName)!;
    if (!bucket.has(value)) {
      bucket.set(value, { value, label, triggerName, eventName: label, rowIds: [] });
    }
    const id = String(row.id || '').trim();
    if (id) bucket.get(value)!.rowIds.push(id);
  }
  return Array.from(byTrigger.entries()).map(([label, eventsMap]) => ({
    label,
    events: Array.from(eventsMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'he'),
    ),
  }));
}

function parseLegacySystemEventLabel(label: string): { triggerName: string; eventName: string } | null {
  const dot = label.indexOf('.');
  if (dot <= 0) return null;
  return {
    triggerName: label.slice(0, dot),
    eventName: label.slice(dot + 1),
  };
}

function legacyEntryFromKey(key: string): SystemEventCatalogEntry | null {
  const legacyLabel = LEGACY_SYSTEM_EVENT_KEYS[key];
  if (!legacyLabel) return null;
  const parsed = parseLegacySystemEventLabel(legacyLabel);
  if (!parsed) return null;
  return {
    value: key,
    label: parsed.eventName,
    triggerName: parsed.triggerName,
    eventName: parsed.eventName,
    rowIds: [],
  };
}

export function resolveSystemEventEntry(
  selectedKey: string,
  groups: SystemEventCatalogGroup[],
): SystemEventCatalogEntry | null {
  const key = String(selectedKey || '').trim();
  if (!key) return null;
  for (const group of groups) {
    for (const entry of group.events) {
      if (entry.value === key) return entry;
      if (entry.rowIds.includes(key)) return entry;
    }
  }
  const legacy = legacyEntryFromKey(key);
  if (legacy) return legacy;
  if (key.includes('::')) {
    const [triggerName, eventName] = key.split('::');
    if (triggerName && eventName) {
      return {
        value: key,
        label: eventName,
        triggerName,
        eventName,
        rowIds: [],
      };
    }
  }
  return null;
}

/** Map stored UUID/composite/legacy keys to catalog option value for selects. */
export function resolveSystemEventSelectValue(
  storedId: string | undefined | null,
  groups: SystemEventCatalogGroup[],
): string {
  const raw = String(storedId || '').trim();
  if (!raw) return '';
  const entry = resolveSystemEventEntry(raw, groups);
  return entry?.value || raw;
}

function outcomeTriggerMatchesSystemEvent(
  trigger: { type?: string; systemEventId?: string } | undefined,
  entry: SystemEventCatalogEntry,
): boolean {
  if (!trigger || trigger.type !== 'system_event' || !trigger.systemEventId) return false;
  const configured = String(trigger.systemEventId);
  if (entry.rowIds.includes(configured)) return true;
  if (configured === entry.value) return true;
  if (configured === systemEventCompositeKey(entry.triggerName, entry.eventName)) return true;
  const legacyLabel = LEGACY_SYSTEM_EVENT_KEYS[configured];
  if (legacyLabel && legacyLabel === `${entry.triggerName}.${entry.eventName}`) return true;
  return false;
}

export function buildSystemEventPipelineMatches(
  groups: SystemEventCatalogGroup[],
  pipelines: EnrichedPipeline[],
): Map<string, SystemEventPipelineMatch[]> {
  const map = new Map<string, SystemEventPipelineMatch[]>();
  for (const group of groups) {
    for (const entry of group.events) {
      const matches: SystemEventPipelineMatch[] = [];
      for (const pipeline of pipelines) {
        for (const stage of pipeline.stages || []) {
          for (const outcome of stage.outcomes || []) {
            if (!outcomeTriggerMatchesSystemEvent(outcome.trigger, entry)) continue;
            matches.push({
              pipelineId: pipeline.id,
              stageId: stage.id,
              outcomeId: outcome.id,
            });
          }
        }
      }
      map.set(entry.value, matches);
    }
  }
  return map;
}

function eventTextHaystack(event: {
  title?: string;
  description?: string;
  updates?: Array<{ title?: string }>;
}): string {
  return [
    event.title,
    event.description,
    ...(event.updates || []).map((u) => u.title),
  ]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function metadataMatchesSystemEvent(
  metadata: Record<string, unknown> | undefined,
  entry: SystemEventCatalogEntry,
): boolean {
  if (!metadata) return false;
  const sys = metadata.systemEvent;
  if (sys && typeof sys === 'object' && !Array.isArray(sys)) {
    const row = sys as Record<string, unknown>;
    const rowId = String(row.rowId || '').trim();
    if (rowId && entry.rowIds.includes(rowId)) return true;
    const triggerName = String(row.triggerName || '').trim();
    const eventName = String(row.eventName || '').trim();
    if (triggerName === entry.triggerName && proposalSystemEventNamesMatch(eventName, entry)) {
      return true;
    }
  }
  const rowId = String(metadata.systemEventRowId || '').trim();
  if (rowId && entry.rowIds.includes(rowId)) return true;
  return false;
}

function pipelinePlacementMatchesSystemEvent(
  event: {
    processId?: string | null;
    stageId?: string | null;
    stage?: string;
  },
  matches: SystemEventPipelineMatch[],
  pipelines: EnrichedPipeline[],
): boolean {
  const pid = event.processId ? String(event.processId) : '';
  if (!pid || matches.length === 0) return false;
  const sid = event.stageId ? String(event.stageId) : '';
  const stageName = String(event.stage || '').trim().toLowerCase();
  for (const match of matches) {
    if (match.pipelineId !== pid) continue;
    if (sid && match.stageId === sid) return true;
    if (!sid && stageName) {
      const pipeline = pipelines.find((p) => p.id === pid);
      const stage = (pipeline?.stages || []).find((s) => s.id === match.stageId);
      if (stage && String(stage.name || '').trim().toLowerCase() === stageName) return true;
    }
    if (!sid && !stageName) return true;
  }
  return false;
}

function isOutboundProposalEvent(event: {
  title?: string;
  description?: string;
  type?: string[];
  metadata?: Record<string, unknown>;
}): boolean {
  const meta = event.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta) && meta.outboundProposal === true) {
    return true;
  }
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const names = meta.proposalTemplateNames;
    if (Array.isArray(names) && names.some((name) => String(name || '').trim())) return true;
    const attachments = meta.attachments;
    if (Array.isArray(attachments)) {
      const hasProposalAttachment = attachments.some((row) => {
        if (!row || typeof row !== 'object') return false;
        const filename = String((row as Record<string, unknown>).filename || '').trim();
        return /הצעת\s*מחיר|proposal/i.test(filename);
      });
      if (hasProposalAttachment) return true;
    }
    const sys = meta.systemEvent;
    if (sys && typeof sys === 'object' && !Array.isArray(sys)) {
      const row = sys as Record<string, unknown>;
      if (isProposalSystemEventName(String(row.eventName || '').trim())) return true;
    }
  }
  const types = Array.isArray(event.type) ? event.type : [];
  if (types.some((t) => {
    const v = String(t || '').trim().toLowerCase();
    return v === 'proposal' || v === 'הצעת מחיר';
  })) {
    return true;
  }
  const title = String(event.title || '').trim();
  if (title.startsWith('נשלחה הצעת מחיר') || title.startsWith('הצעת מחיר:')) return true;
  return /תבניות הצעת מחיר:/i.test(String(event.description || ''));
}

function outboundStaffEmailMatchesSystemEvent(
  event: {
    title?: string;
    description?: string;
    process?: string;
    type?: string[];
    metadata?: Record<string, unknown>;
  },
  entry: SystemEventCatalogEntry,
): boolean {
  if (entry.eventName !== 'נשלח מייל') return false;
  if (isOutboundProposalEvent(event)) return false;
  const meta = event.metadata;
  const isOutbound =
    meta && typeof meta === 'object' && !Array.isArray(meta) && meta.outboundMessage === true;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    if (isOutbound) {
      const channel = String(meta.channel || '').trim().toLowerCase();
      if (channel === 'email' || channel === 'mail' || channel.includes('email') || channel === 'מייל') {
        return true;
      }
    }
    const sys = meta.systemEvent;
    if (sys && typeof sys === 'object' && !Array.isArray(sys)) {
      const row = sys as Record<string, unknown>;
      if (
        String(row.triggerName || '').trim() === entry.triggerName
        && String(row.eventName || '').trim() === entry.eventName
      ) {
        return true;
      }
    }
  }
  const types = Array.isArray(event.type) ? event.type : [];
  const hasEmailType = types.some((t) => {
    const v = String(t || '').trim().toLowerCase();
    return v === 'email' || v === 'mail' || v === 'מייל';
  });
  if (hasEmailType && isOutbound) return true;
  const proc = String(event.process || '').trim().toLowerCase();
  if ((proc === 'email' || proc === 'mail' || proc === 'מייל') && isOutbound) return true;
  const title = String(event.title || '').trim();
  if (title.startsWith('נשלח מייל')) return true;
  const desc = String(event.description || '');
  if (/^ערוץ:\s*(מייל|email)\b/im.test(desc)) return true;
  return false;
}

function outboundProposalMatchesSystemEvent(
  event: {
    title?: string;
    description?: string;
    type?: string[];
    metadata?: Record<string, unknown>;
  },
  entry: SystemEventCatalogEntry,
): boolean {
  if (!isProposalSystemEventEntry(entry)) return false;
  if (!isOutboundProposalEvent(event)) return false;
  const meta = event.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const sys = meta.systemEvent;
    if (sys && typeof sys === 'object' && !Array.isArray(sys)) {
      const row = sys as Record<string, unknown>;
      if (
        String(row.triggerName || '').trim() === entry.triggerName
        && proposalSystemEventNamesMatch(String(row.eventName || '').trim(), entry)
      ) {
        return true;
      }
    }
  }
  const title = String(event.title || '').trim();
  if (title.startsWith('נשלחה הצעת מחיר') || title.startsWith('הצעת מחיר:')) return true;
  const desc = String(event.description || '');
  if (/תבניות הצעת מחיר:/i.test(desc)) return true;
  return false;
}

function textMatchesSystemEvent(
  event: {
    title?: string;
    description?: string;
    updates?: Array<{ title?: string }>;
  },
  entry: SystemEventCatalogEntry,
): boolean {
  const hay = eventTextHaystack(event);
  if (!hay) return false;
  const needles = [
    entry.eventName,
    `${entry.triggerName}.${entry.eventName}`,
    systemEventCompositeKey(entry.triggerName, entry.eventName),
  ]
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean);
  return needles.some((needle) => hay.includes(needle));
}

export function eventMatchesSystemEventFilters(
  event: {
    processId?: string | null;
    stageId?: string | null;
    stage?: string;
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
    updates?: Array<{ title?: string }>;
  },
  selectedKeys: Set<string>,
  groups: SystemEventCatalogGroup[],
  pipelineMatches: Map<string, SystemEventPipelineMatch[]>,
  pipelines: EnrichedPipeline[],
): boolean {
  if (selectedKeys.size === 0) return true;
  for (const key of selectedKeys) {
    const entry = resolveSystemEventEntry(key, groups);
    if (!entry) continue;
    if (metadataMatchesSystemEvent(event.metadata, entry)) return true;
    if (outboundStaffEmailMatchesSystemEvent(event, entry)) return true;
    if (outboundProposalMatchesSystemEvent(event, entry)) return true;
    const matches = pipelineMatches.get(entry.value) || [];
    if (pipelinePlacementMatchesSystemEvent(event, matches, pipelines)) return true;
    if (textMatchesSystemEvent(event, entry)) return true;
  }
  return false;
}

export const pipelineNameKey = (pipeline: Pick<EnrichedPipeline, 'kind' | 'name'>) =>
  `${pipeline.kind}:${String(pipeline.name || '').trim().toLowerCase()}`;

/** One entry per pipeline template name (avoids duplicates across tenants/clients). */
export function dedupeEnrichedPipelinesByName(pipelines: EnrichedPipeline[]): EnrichedPipeline[] {
  const map = new Map<string, EnrichedPipeline>();
  for (const pipeline of pipelines) {
    const key = pipelineNameKey(pipeline);
    if (!map.has(key)) map.set(key, pipeline);
  }
  return Array.from(map.values());
}

export function siblingPipelineIds(
  pipeline: EnrichedPipeline,
  allPipelines: EnrichedPipeline[],
): string[] {
  const key = pipelineNameKey(pipeline);
  return allPipelines.filter((row) => pipelineNameKey(row) === key).map((row) => row.id);
}

export function isPipelineGroupSelected(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): boolean {
  if (selectedPipelineIds.size === 0) return false;
  return siblingPipelineIds(pipeline, allPipelines).some((id) => selectedPipelineIds.has(id));
}

export function togglePipelineGroupSelection(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): Set<string> {
  const siblings = siblingPipelineIds(pipeline, allPipelines);
  const anySelected = siblings.some((id) => selectedPipelineIds.has(id));
  const next = new Set(selectedPipelineIds);
  for (const id of siblings) {
    if (anySelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function countSelectedPipelineGroups(
  selectedPipelineIds: Set<string>,
  allPipelines: EnrichedPipeline[],
): number {
  return dedupeEnrichedPipelinesByName(allPipelines).filter((pipeline) =>
    isPipelineGroupSelected(pipeline, selectedPipelineIds, allPipelines),
  ).length;
}

export const stageOutcomeKey = (pipelineId: string, stageId: string, outcomeId?: string) =>
  outcomeId ? `outcome:${pipelineId}:${stageId}:${outcomeId}` : `stage:${pipelineId}:${stageId}`;

export const parseStageOutcomeKey = (key: string) => {
  const parts = String(key || '').split(':');
  if (parts[0] === 'stage' && parts.length >= 3) {
    return { kind: 'stage' as const, pipelineId: parts[1], stageId: parts[2] };
  }
  if (parts[0] === 'outcome' && parts.length >= 4) {
    return {
      kind: 'outcome' as const,
      pipelineId: parts[1],
      stageId: parts[2],
      outcomeId: parts[3],
    };
  }
  return null;
};

function pipelineMatchesSelection(
  pipeline: EnrichedPipeline,
  selectedPipelineIds: Set<string>,
  selectionPool: EnrichedPipeline[],
): boolean {
  if (selectedPipelineIds.size === 0) return true;
  if (selectedPipelineIds.has(pipeline.id)) return true;
  return siblingPipelineIds(pipeline, selectionPool).some((id) => selectedPipelineIds.has(id));
}

export function buildStageOutcomeOptions(
  pipelines: EnrichedPipeline[],
  selectedPipelineIds: Set<string>,
  selectionPool: EnrichedPipeline[] = pipelines,
): StageOutcomeOption[] {
  const out: StageOutcomeOption[] = [];
  for (const pipeline of pipelines) {
    if (!pipelineMatchesSelection(pipeline, selectedPipelineIds, selectionPool)) continue;
    const kindLabel = pipeline.kind === 'candidate' ? 'מועמדים' : 'לקוחות';
    const stages = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const stage of stages) {
      out.push({
        key: stageOutcomeKey(pipeline.id, stage.id),
        label: stage.name,
        groupLabel: `${kindLabel} · ${pipeline.name}`,
        kind: 'stage',
        pipelineId: pipeline.id,
        stageId: stage.id,
        stage,
      });
      for (const outcome of stage.outcomes || []) {
        const title = String(outcome.name || '').trim();
        if (!title) continue;
        out.push({
          key: stageOutcomeKey(pipeline.id, stage.id, outcome.id),
          label: title,
          groupLabel: `${pipeline.name} · ${stage.name}`,
          kind: 'outcome',
          pipelineId: pipeline.id,
          stageId: stage.id,
          outcomeId: outcome.id,
          outcome,
          stage,
        });
      }
    }
  }
  return out;
}

export function flattenSystemEventGroups(
  groups: Array<{ label: string; events: Array<{ value: string; label: string }> }> | SystemEventCatalogGroup[],
): SystemEventOption[] {
  return groups.flatMap((group) =>
    group.events.map((ev) => ({
      value: ev.value,
      label: ev.label,
      groupLabel: group.label,
    })),
  );
}

/** Legacy events may store a short process label while pipelines use "Name (English)". */
export function processNameMatchesPipeline(proc: string, pipelineName: string): boolean {
  if (!proc || !pipelineName) return false;
  if (proc === pipelineName) return true;
  if (pipelineName.startsWith(`${proc} (`) || pipelineName.startsWith(`${proc}(`)) return true;
  if (proc.startsWith(`${pipelineName} (`) || proc.startsWith(`${pipelineName}(`)) return true;
  return false;
}

export function eventMatchesPipelineFilters(
  event: { processId?: string | null; process?: string; stageId?: string | null; stage?: string },
  selectedPipelineIds: Set<string>,
  pipelines: EnrichedPipeline[],
  selectedStageOutcomeKeys: Set<string>,
): boolean {
  if (selectedPipelineIds.size > 0) {
    const pid = event.processId ? String(event.processId) : '';
    if (pid) {
      if (!selectedPipelineIds.has(pid)) return false;
    } else {
      const proc = String(event.process || '').trim().toLowerCase();
      if (!proc) return false;
      const matchedBySelection = pipelines.some(
        (p) =>
          isPipelineGroupSelected(p, selectedPipelineIds, pipelines) &&
          processNameMatchesPipeline(proc, String(p.name || '').trim().toLowerCase()),
      );
      if (!matchedBySelection) return false;
    }
  }

  if (selectedStageOutcomeKeys.size > 0) {
    const selectedStageIds = new Set<string>();
    for (const key of selectedStageOutcomeKeys) {
      const parsed = parseStageOutcomeKey(key);
      if (parsed?.stageId) selectedStageIds.add(parsed.stageId);
    }
    const stageId = event.stageId ? String(event.stageId) : '';
    const stageName = String(event.stage || '').trim().toLowerCase();
    if (selectedStageIds.size > 0) {
      if (stageId && selectedStageIds.has(stageId)) return true;
      const pipelinesForStages = pipelines.filter(
        (p) => selectedPipelineIds.size === 0 || selectedPipelineIds.has(p.id),
      );
      const nameMatch = pipelinesForStages.some((p) =>
        (p.stages || []).some(
          (s) =>
            selectedStageIds.has(s.id) &&
            String(s.name || '').trim().toLowerCase() === stageName,
        ),
      );
      if (!nameMatch) return false;
    }
  }

  return true;
}

export function filterOutcomesByStageSelection<T extends { id: string }>(
  outcomes: T[],
  stageId: string,
  selectedStageOutcomeKeys: Set<string>,
): T[] {
  if (selectedStageOutcomeKeys.size === 0) return outcomes;
  const selectedOutcomeIds = new Set<string>();
  let stageSelected = false;
  for (const key of selectedStageOutcomeKeys) {
    const parsed = parseStageOutcomeKey(key);
    if (!parsed) continue;
    if (parsed.stageId === stageId && parsed.kind === 'stage') stageSelected = true;
    if (parsed.stageId === stageId && parsed.kind === 'outcome' && parsed.outcomeId) {
      selectedOutcomeIds.add(parsed.outcomeId);
    }
  }
  if (selectedOutcomeIds.size > 0) {
    return outcomes.filter((o) => selectedOutcomeIds.has(o.id));
  }
  if (stageSelected) return outcomes;
  return outcomes;
}
