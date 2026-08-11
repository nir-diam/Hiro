import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
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
} from './Icons';
import ProcessEventModal, { type ProcessEventSavePayload } from './ProcessEventModal';
import ProcessManagementCatalogPanel from './ProcessManagementCatalogPanel';
import { authHeaders } from '../utils/authHeaders';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { fetchCandidatePipelines } from '../services/candidatePipelinesApi';
import { fetchStaffUsers } from '../services/usersApi';
import { fetchSystemEvents } from '../services/systemEventsApi';
import {
  eventMatchesPipelineFilters,
  filterOutcomesByStageSelection,
  type EnrichedPipeline,
} from '../utils/processManagementCatalog';
import { applyOutcomeDueDate, outcomeActionSubtitle, summarizeAutomationResults } from '../utils/processOutcomeSla';
import { executePipelineOutcome } from '../services/pipelineOutcomesApi';
import {
  buildMoveTargetOptions,
  resolveStageIdFromMoveTargetLabel,
} from '../utils/pipelineMoveTargets';
import { useAuth } from '../context/AuthContext';

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
  isActive?: boolean;
  process: string;
  processId?: string | null;
  stage: string;
  stageId?: string | null;
  type?: string[];
  updates: Array<{ id: string; title: string; date: string; creator: string }>;
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

const SYSTEM_EVENT_GROUPS_FALLBACK: Array<{ label: string; events: Array<{ value: string; label: string }> }> = [
  {
    label: 'פורטל מועמד',
    events: [{ value: 'candidate_confirmed_profile', label: 'מועמד.אישר_את_הפרופיל' }],
  },
  {
    label: 'אישורי הגעה',
    events: [
      { value: 'candidate_confirmed_interview', label: 'מועמד.אישר_הגעה_לראיון' },
      { value: 'candidate_canceled_interview', label: 'מועמד.ביטל_הגעה_לראיון' },
      { value: 'candidate_requested_reschedule', label: 'מועמד.ביקש_לשנות_מועד' },
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

const matchStageForEvent = (event: JournalEvent, pipeline: PipelineDto) => {
  const stages = [...(pipeline.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!stages.length) return undefined;

  const stageName = String(event.stage || '').trim().toLowerCase();
  const byName = stageName
    ? stages.find((s) => String(s.name || '').trim().toLowerCase() === stageName)
    : undefined;

  if (event.stageId) {
    const byId = stages.find((s) => s.id === event.stageId);
    // Prefer explicit stage label when stageId is stale after manual edits
    if (byName && (!byId || byId.id !== byName.id)) return byName;
    if (byId) return byId;
  }

  if (byName) return byName;
  if (stageName) {
    const partial = stages.find((s) => {
      const n = String(s.name || '').trim().toLowerCase();
      return n.includes(stageName) || stageName.includes(n);
    });
    if (partial) return partial;
  }
  // Fall back to first stage so configured outcomes still surface for new events
  return stages[0];
};

const resolveStageIdForEvent = (
  event: JournalEvent,
  stageName: string,
  pipelines: PipelineDto[],
): string | null => {
  const trimmed = String(stageName || '').trim();
  if (!trimmed) return event.stageId || null;
  const pipeline = matchPipelineForEvent(event, pipelines);
  if (!pipeline) return event.stageId || null;
  const resolved = resolveStageIdFromMoveTargetLabel(trimmed, pipeline.stages || []);
  if (resolved) return resolved;
  return event.stageId || null;
};

const getDynamicStatus = (status: string, dueDateStr: string | null) => {
  if (status === 'הושלם') return { label: 'הושלם', color: 'bg-green-100 text-green-700 border border-green-200' };
  if (status === 'בוטל') return { label: 'בוטל', color: 'bg-gray-100 text-gray-700 border border-gray-200' };

  if (!dueDateStr) {
    const label = status === 'עתידי' || !status ? 'עתידי' : status;
    const color =
      label === 'עתידי'
        ? 'bg-blue-100 text-blue-700 border border-blue-200'
        : 'bg-gray-100 text-gray-700 border border-gray-200';
    return { label, color };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateStr);
  if (Number.isNaN(dueDate.getTime())) {
    return { label: status || 'עתידי', color: 'bg-gray-100 text-gray-700 border border-gray-200' };
  }
  dueDate.setHours(0, 0, 0, 0);
  if (dueDate < today) return { label: 'באיחור', color: 'bg-red-100 text-red-700 border border-red-200' };
  if (dueDate.getTime() === today.getTime()) {
    return { label: 'להיום', color: 'bg-amber-100 text-amber-700 border border-amber-200' };
  }
  return { label: 'עתידי', color: 'bg-blue-100 text-blue-700 border border-blue-200' };
};

const mapHistoryToUpdates = (
  history: unknown,
): Array<{ id: string; title: string; date: string; creator: string }> => {
  if (!Array.isArray(history)) return [];
  return history
    .map((h, i) => {
      if (!h || typeof h !== 'object') return null;
      const row = h as Record<string, unknown>;
      const title = String(row.summary || row.title || '').trim();
      if (!title) return null;
      return {
        id: String(row.id || `h-${i}`),
        title,
        date: String(row.timestamp || row.date || ''),
        creator: String(row.user || row.creator || ''),
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; date: string; creator: string }>;
};

const mapUpdatesField = (
  updates: unknown,
): Array<{ id: string; title: string; date: string; creator: string }> => {
  if (!Array.isArray(updates)) return [];
  return updates
    .map((u, i) => {
      if (!u || typeof u !== 'object') return null;
      const row = u as Record<string, unknown>;
      const title = String(row.title || row.summary || '').trim();
      if (!title) return null;
      return {
        id: String(row.id || `u-${i}`),
        title,
        date: String(row.date || row.timestamp || ''),
        creator: String(row.creator || row.user || ''),
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; date: string; creator: string }>;
};

/** Prefer explicit updates; fall back to history. Merge if both exist. */
const resolveStatusUpdates = (raw: Record<string, unknown>) => {
  const fromUpdates = mapUpdatesField(raw.updates);
  const fromHistory = mapHistoryToUpdates(raw.history);
  if (!fromUpdates.length) return fromHistory;
  if (!fromHistory.length) return fromUpdates;
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
  return merged;
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
    process: String(raw.process || types[0] || ''),
    processId: raw.processId ? String(raw.processId) : null,
    stage: String(raw.stage || types[1] || ''),
    stageId: raw.stageId ? String(raw.stageId) : null,
    type: types,
    updates: resolveStatusUpdates(raw),
  };
};

const eventMatchesContact = (
  event: JournalEvent,
  contactId?: string | null,
  contactName?: string | null,
): boolean => {
  if (!contactId && !contactName) return true;
  if (contactId && event.contactId && String(event.contactId) === String(contactId)) return true;
  if (contactName && event.contactName && String(event.contactName).includes(contactName)) return true;
  if (contactName) {
    const blob = `${event.title || ''} ${event.description || ''} ${event.creator || ''}`;
    if (blob.includes(contactName)) return true;
  }
  return false;
};

/**
 * Sidebar "פעולות אפשריות" = stage.outcomes from Pipeline Settings
 * (same records configured under each stage in PipelineSettingsView).
 */
function resolveOutcomesForEvent(event: JournalEvent, pipelines: PipelineDto[]): ActionOutcome[] {
  const pipeline = matchPipelineForEvent(event, pipelines);
  if (!pipeline) return [];
  const stage = matchStageForEvent(event, pipeline);
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
  pipelines: PipelineDto[],
): Array<{ id: string; title: string }> {
  const pipeline = matchPipelineForEvent(event, pipelines);
  if (!pipeline) return [];
  return buildMoveTargetOptions(pipeline.stages || []).map((option) => ({
    id: option.value,
    title: option.label,
  }));
}

type Props = {
  clientOptions?: Array<{ id: string; name: string }>;
  defaultClientId?: string | null;
  /** When set, only events for this contact are shown (contact profile tab). */
  scopeContactId?: string | null;
  scopeContactName?: string | null;
  /** Hide the top filter bar (e.g. on contact profile). */
  hideFilters?: boolean;
  /** Always show description/history — no collapsed state (contact profile). */
  alwaysShowDetails?: boolean;
};

const ClientsEventsJournalTab: React.FC<Props> = ({
  clientOptions = [],
  defaultClientId = null,
  scopeContactId = null,
  scopeContactName = null,
  hideFilters = false,
  alwaysShowDetails = false,
}) => {
  const { user } = useAuth();
  const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [createClientId, setCreateClientId] = useState<string>(defaultClientId || clientOptions[0]?.id || '');

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

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isActiveDropdownOpen, setIsActiveDropdownOpen] = useState(false);
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);

  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editNextStageValue, setEditNextStageValue] = useState('');
  const [editAssigneeValue, setEditAssigneeValue] = useState('אני');
  const [editDueDateValue, setEditDueDateValue] = useState('');
  const [editIsActiveValue, setEditIsActiveValue] = useState(true);
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>(['אני']);

  const [pipelinesByClient, setPipelinesByClient] = useState<Record<string, PipelineDto[]>>({});
  const [candidatePipelinesByClient, setCandidatePipelinesByClient] = useState<
    Record<string, PipelineDto[]>
  >({});
  const [systemEventGroups, setSystemEventGroups] = useState(SYSTEM_EVENT_GROUPS_FALLBACK);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);

  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const activeDropdownRef = useRef<HTMLDivElement>(null);
  const companyDropdownRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    setError(null);
    try {
      const scopedClientId = defaultClientId || clientOptions[0]?.id || '';
      if (scopedClientId && (scopeContactId || scopeContactName)) {
        const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(scopedClientId)}/events`, {
          credentials: 'include',
          headers: authHeaders(),
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('טעינת אירועים נכשלה');
        const rows = await res.json();
        const clientName =
          clientOptions.find((c) => c.id === scopedClientId)?.name ||
          scopeContactName ||
          'לקוח';
        setEvents(
          (Array.isArray(rows) ? rows : []).map((r) =>
            normalizeRow({
              ...(r as Record<string, unknown>),
              clientId: scopedClientId,
              clientName,
            }),
          ),
        );
        return;
      }

      const res = await fetch(`${apiBase}/api/clients/all-events`, {
        credentials: 'include',
        headers: authHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('טעינת אירועים נכשלה');
      const rows = await res.json();
      setEvents((Array.isArray(rows) ? rows : []).map((r) => normalizeRow(r as Record<string, unknown>)));
    } catch (e) {
      setError((e as Error)?.message || 'שגיאה בטעינת אירועים');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, defaultClientId, clientOptions, scopeContactId, scopeContactName]);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogClientIds = useMemo(() => {
    const ids = new Set<string>();
    if (defaultClientId) ids.add(defaultClientId);
    if (createClientId) ids.add(createClientId);
    for (const opt of clientOptions.slice(0, 12)) {
      if (opt.id) ids.add(opt.id);
    }
    for (const ev of events) {
      if (ev.clientId) ids.add(ev.clientId);
    }
    return [...ids];
  }, [defaultClientId, createClientId, clientOptions, events]);

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
            .then((rows) => {
              const active = rows.filter((r) => r.isActive);
              const grouped = new Map<string, typeof rows>();
              for (const row of active) {
                const key = row.triggerName || 'אירועים';
                if (!grouped.has(key)) grouped.set(key, []);
                grouped.get(key)!.push(row);
              }
              return Array.from(grouped.entries()).map(([label, evs]) => ({
                label,
                events: evs.map((ev) => ({
                  value: ev.id,
                  label: `${ev.triggerName}.${ev.eventName}`,
                })),
              }));
            })
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

  useEffect(() => {
    if (defaultClientId) setCreateClientId(defaultClientId);
    else if (!createClientId && clientOptions[0]?.id) setCreateClientId(clientOptions[0].id);
  }, [defaultClientId, clientOptions, createClientId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(t)) setIsStatusDropdownOpen(false);
      if (activeDropdownRef.current && !activeDropdownRef.current.contains(t)) setIsActiveDropdownOpen(false);
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(t)) setIsCompanyDropdownOpen(false);
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

  const currentOutcomes = useMemo(() => {
    if (!selectedEvent) return [] as ActionOutcome[];
    const outcomes = resolveOutcomesForEvent(selectedEvent, pipelinesByClient[selectedEvent.clientId] || []);
    const pipeline = matchPipelineForEvent(selectedEvent, pipelinesByClient[selectedEvent.clientId] || []);
    const stage = pipeline ? matchStageForEvent(selectedEvent, pipeline) : undefined;
    if (!stage?.id) return outcomes;
    return filterOutcomesByStageSelection(outcomes, stage.id, selectedStageOutcomeKeys);
  }, [selectedEvent, pipelinesByClient, selectedStageOutcomeKeys]);

  const currentStageLabel = useMemo(() => {
    if (!selectedEvent) return '';
    const pipeline = matchPipelineForEvent(
      selectedEvent,
      pipelinesByClient[selectedEvent.clientId] || [],
    );
    if (!pipeline) return selectedEvent.stage || '';
    const stage = matchStageForEvent(selectedEvent, pipeline);
    return stage?.name || selectedEvent.stage || '';
  }, [selectedEvent, pipelinesByClient]);

  const allCompanies = useMemo(
    () => Array.from(new Set(events.map((e) => e.clientName).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'he')),
    [events],
  );
  const statusOptions = ['עתידי', 'להיום', 'באיחור', 'הושלם', 'בוטל'];
  const activeStateOptions = ['פעיל', 'לא פעיל'];

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (!eventMatchesContact(event, scopeContactId, scopeContactName)) return false;
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
      if (selectedCompanies.size > 0 && !selectedCompanies.has(event.clientName)) return false;
      if (dateFrom && new Date(event.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(event.date) > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [
    events,
    scopeContactId,
    scopeContactName,
    selectedPipelineIds,
    selectedStageOutcomeKeys,
    allPipelinesCatalog,
    selectedStatuses,
    selectedActiveStates,
    selectedCompanies,
    dateFrom,
    dateTo,
  ]);

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
    const pipelines = pipelinesByClient[selectedEvent.clientId] || [];
    const pipeline = matchPipelineForEvent(selectedEvent, pipelines);
    const currentStage = pipeline ? matchStageForEvent(selectedEvent, pipeline) : undefined;
    if (!pipeline?.id || !currentStage?.id) {
      alert('לא נמצא תהליך או שלb לתוצאה זו');
      return;
    }

    try {
      const result = await executePipelineOutcome({
        pipelineKind: 'client',
        clientId: selectedEvent.clientId,
        pipelineId: pipeline.id,
        stageId: currentStage.id,
        outcomeId: outcome.id,
        context: { clientEventId: selectedEvent.id },
        source: 'manual',
      });

      const updatedEvent =
        result.actionResult?.event && typeof result.actionResult.event === 'object'
          ? normalizeRow({
              ...(result.actionResult.event as Record<string, unknown>),
              clientId: selectedEvent.clientId,
              clientName: selectedEvent.clientName,
            })
          : null;

      if (updatedEvent) {
        setEvents((prev) =>
          prev.map((e) =>
            e.id === selectedEvent.id && e.clientId === selectedEvent.clientId ? updatedEvent : e,
          ),
        );
      }

      const pending = (result.automationResults || []).filter((r) => r.status === 'pending_approval');
      const errors = (result.automationResults || []).filter((r) => r.status === 'error');
      const automationSummary = summarizeAutomationResults(result.automationResults);
      if (errors.length) {
        alert(errors.map((e) => e.message || 'שגיאת אוטומציה').join('\n'));
      } else if (pending.length) {
        alert(`${pending.length} אוטומציות ממתינות לאישור ידני`);
      } else if (automationSummary) {
        alert(`הפעולה בוצעה · ${automationSummary}`);
      }

      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'עדכון הסטטוס נכשלה');
      await load();
    }
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
  };

  const handleEditDescription = (event: JournalEvent) => {
    if (event.isActive === false) return;
    setEditingDescriptionId(event.id);
    setEditDescriptionValue(event.description || '');
    setEditNextStageValue('');
    setEditAssigneeValue(event.creator || user?.name || 'אני');
    setEditDueDateValue(event.dueDate || '');
    setEditIsActiveValue(true);
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

  const handleSaveDescription = async (event: JournalEvent) => {
    const actor = editAssigneeValue || user?.name || 'אני';
    const pipelines = pipelinesByClient[event.clientId] || [];
    const stageChanged = Boolean(editNextStageValue.trim());
    const nextStageName = stageChanged ? editNextStageValue.trim() : event.stage;
    const nextStageId = stageChanged
      ? resolveStageIdForEvent(event, nextStageName, pipelines)
      : event.stageId;
    const nextUpdates = stageChanged
      ? [
          {
            id: `u-${Date.now()}`,
            title: editNextStageValue.trim(),
            date: new Date().toISOString(),
            creator: actor,
          },
          ...event.updates,
        ]
      : event.updates;
    const history = nextUpdates.map((u) => ({
      user: u.creator,
      timestamp: u.date,
      summary: u.title,
    }));
    const patch = {
      title: event.title,
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
      history,
      updates: nextUpdates,
    };

    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id && e.clientId === event.clientId
          ? {
              ...e,
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
    setEditNextStageValue('');
  };

  const handleCreateProcessEvent = async (data: ProcessEventSavePayload) => {
    if (!apiBase || !createClientId) throw new Error('יש לבחור לקוח');
    const typeParts = [data.processName, data.stageName].filter(Boolean);
    const payload = {
      title: data.title,
      type: typeParts.length ? typeParts : ['תהליך'],
      date: new Date().toISOString(),
      description: data.description || '',
      coordinator: data.assignee || user?.name || 'אני',
      creator: data.assignee || user?.name || 'אני',
      status: 'עתידי',
      isActive: true,
      process: data.processName,
      processId: data.processId,
      stage: data.stageName,
      stageId: data.stageId,
      dueDate: new Date(Date.now() + (data.slaDays || 0) * 86400000).toISOString().slice(0, 10),
      linkedTo: data.contactId || scopeContactId
        ? {
            type: 'איש קשר',
            id: data.contactId || scopeContactId,
            name: data.contactName || scopeContactName || '',
          }
        : { type: 'לקוח', name: data.clientName || '' },
      history: [
        {
          user: data.assignee || 'אני',
          timestamp: new Date().toISOString(),
          summary: 'יצר אירוע תהליכי',
        },
      ],
    };
    const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(createClientId)}/events`, {
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
  };

  const createClientName =
    clientOptions.find((c) => c.id === createClientId)?.name ||
    events.find((e) => e.clientId === createClientId)?.clientName ||
    '';

  const hasFilters =
    selectedPipelineIds.size > 0 ||
    selectedSystemEventIds.size > 0 ||
    selectedStageOutcomeKeys.size > 0 ||
    selectedStatuses.size > 0 ||
    selectedActiveStates.size !== activeStateOptions.length ||
    !activeStateOptions.every((s) => selectedActiveStates.has(s)) ||
    selectedCompanies.size > 0 ||
    !!dateFrom ||
    !!dateTo;

  return (
    <div className="bg-bg-subtle/30 rounded-2xl border border-border-default flex flex-col overflow-hidden min-h-[560px]">
      <div className="flex flex-col h-full bg-bg-default rounded-2xl border border-border-default overflow-hidden">
        {/* Filters */}
        {!hideFilters ? (
        <div className="bg-bg-card p-4 border-b border-border-default flex flex-wrap items-end gap-4 shadow-sm z-10 relative">
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
              onClick={() => setIsCompanyDropdownOpen((v) => !v)}
              className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none flex items-center justify-between min-w-[150px]"
            >
              <span className="truncate">
                {selectedCompanies.size === 0 ? 'כל החברות' : `${selectedCompanies.size} חברות נבחרו`}
              </span>
              <ChevronDownIcon className="w-4 h-4 text-text-muted ml-2" />
            </button>
            {isCompanyDropdownOpen ? (
              <div className="absolute top-full mt-1 right-0 w-56 bg-white border border-border-default shadow-xl rounded-xl p-2 z-50 max-h-64 overflow-y-auto">
                {allCompanies.map((c) => (
                  <label key={c} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCompanies.has(c)}
                      onChange={() => toggleSet(setSelectedCompanies, c)}
                      className="rounded border-border-default text-primary-600 w-4 h-4"
                    />
                    <span className="text-sm font-medium">{c}</span>
                  </label>
                ))}
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
              }}
              className="text-sm font-semibold text-text-muted hover:text-red-600 flex items-center gap-1 mb-0.5"
            >
              <XMarkIcon className="w-4 h-4" /> נקה סינונים
            </button>
          ) : null}
        </div>
        ) : null}

        <div className="flex flex-col md:flex-row gap-6 p-4 flex-1 overflow-hidden bg-bg-subtle">
          {/* Events list */}
          <div className="flex-1 bg-white rounded-2xl shadow-sm border border-border-default flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border-default flex flex-wrap justify-between items-center gap-3 bg-gray-50/50">
              <h3 className="font-bold text-text-default text-lg flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-primary-600" />
                יומן אירועים מערכתי
                <span className="text-sm font-normal text-text-muted bg-gray-200 px-2 rounded-full ml-2">
                  {filteredEvents.length} אירועים
                </span>
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {clientOptions.length > 1 ? (
                  <select
                    value={createClientId}
                    onChange={(e) => setCreateClientId(e.target.value)}
                    className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                  >
                    {clientOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(true)}
                  disabled={!createClientId}
                  className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-primary-700 transition shadow-sm hover:shadow disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                  אירוע חדש
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1 bg-white">
              {error ? (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
              ) : null}
              {loading ? (
                <div className="text-center py-12 text-text-muted">טוען אירועים...</div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center">
                  <FunnelIcon className="w-12 h-12 text-gray-300 mb-4" />
                  <h4 className="text-lg font-bold text-gray-700">לא נמצאו אירועים</h4>
                  <p className="text-gray-500">נסה לשנות את תנאי הסינון כדי לראות תוצאות.</p>
                </div>
              ) : (
                filteredEvents.map((event) => {
                  const isSelected = expandedEventId === event.id;
                  const isExpanded = alwaysShowDetails || isSelected;
                  const isInactive = event.isActive === false;
                  return (
                    <div
                      key={`${event.clientId}-${event.id}`}
                      className={`border-2 rounded-2xl p-4 transition-all duration-300 ${
                        alwaysShowDetails ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isInactive
                          ? 'border-gray-200 bg-gray-50/80 opacity-60 hover:opacity-75'
                          : isSelected
                            ? 'border-primary-500 shadow-md bg-primary-50/10'
                            : 'border-border-default hover:border-primary-300 hover:shadow-sm bg-white'
                      }`}
                      onClick={() => {
                        if (alwaysShowDetails) {
                          setExpandedEventId(isSelected ? null : event.id);
                          return;
                        }
                        setExpandedEventId(isSelected ? null : event.id);
                      }}
                    >
                      <div className="flex justify-between items-start mb-3">
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
                          <div>
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
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              {!scopeContactId && event.clientName ? (
                                <span className="text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                                  <BuildingOffice2Icon className="w-3 h-3" />
                                  {event.clientName}
                                </span>
                              ) : null}
                              {event.contactName ? (
                                <span className="text-[11px] bg-teal-50 border border-teal-100 text-teal-700 px-2 py-0.5 rounded flex items-center gap-1 font-bold">
                                  <UserIcon className="w-3 h-3" />
                                  {event.contactName}
                                </span>
                              ) : null}
                              {event.process ? (
                                <span className="text-[11px] bg-purple-50 border border-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">
                                  {processLabel(event.process)}
                                </span>
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
                              <div className="flex flex-col sm:flex-row gap-3">
                                <div className="flex-1">
                                  <label className="block text-xs font-bold text-text-muted mb-1">השלב הבא</label>
                                  <p className="text-[12px] text-text-muted mb-1.5">
                                    שלב נוכחי:{' '}
                                    <span className="font-bold text-amber-800">
                                      {matchStageForEvent(event, pipelinesByClient[event.clientId] || [])?.name ||
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
                                    ).map((o) => (
                                      <option key={o.id} value={o.title}>
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
                                  onClick={() => setEditingDescriptionId(null)}
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
                                  title="ערוך תיאור"
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
                          <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 px-1">
                            היסטוריית סטטוסים
                          </h5>
                          {(event.updates || []).length === 0 ? (
                            <div className="text-sm text-text-muted italic bg-gray-50 border border-dashed border-border-default rounded-lg p-3">
                              אין עדכוני סטטוס עדיין. בחר פעולה מהפאנל או עדכן דרך עריכת התיאור.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {(event.updates || []).map((update) => (
                                <div
                                  key={update.id}
                                  className="bg-gray-50 border border-border-subtle rounded-lg p-3 flex justify-between items-center"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white border border-border-default flex items-center justify-center text-primary-600 shadow-sm">
                                      <CheckCircleIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-text-default">{update.title}</p>
                                      <p className="text-[11px] text-text-muted mt-0.5">
                                        עודכן ע&quot;י: {update.creator || '—'}
                                      </p>
                                    </div>
                                  </div>
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
                              ))}
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
                  );
                })
              )}
            </div>
          </div>

          {/* Outcomes panel — from PipelineSettings stage.outcomes */}
          <div className="w-full md:w-72 shrink-0 bg-white rounded-2xl shadow-sm border border-border-default flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border-default bg-primary-600 text-white">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 opacity-90" />
                פעולות אפשריות
              </h3>
              <p className="text-xs text-primary-100 mt-1 opacity-90">
                {selectedEvent ? `לאירוע: ${selectedEvent.title}` : 'בחר אירוע כדי לראות פעולות'}
              </p>
            </div>

            <div className="p-3 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/30">
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
              ) : pipelinesLoading && !pipelinesByClient[selectedEvent.clientId] ? (
                <div className="text-center py-8 text-sm text-text-muted">טוען פעולות מתהליך העבודה...</div>
              ) : (
                <div className="space-y-2">
                  <ProcessManagementCatalogPanel
                    variant="sidebar"
                    clientPipelines={
                      selectedEvent?.clientId
                        ? clientPipelinesCatalog.filter((p) => p.clientId === selectedEvent.clientId)
                        : clientPipelinesCatalog
                    }
                    candidatePipelines={
                      selectedEvent?.clientId
                        ? candidatePipelinesCatalog.filter((p) => p.clientId === selectedEvent.clientId)
                        : candidatePipelinesCatalog
                    }
                    systemEventGroups={systemEventGroups}
                    selectedPipelineIds={selectedPipelineIds}
                    onSelectedPipelineIdsChange={setSelectedPipelineIds}
                    selectedSystemEventIds={selectedSystemEventIds}
                    onSelectedSystemEventIdsChange={setSelectedSystemEventIds}
                    selectedStageOutcomeKeys={selectedStageOutcomeKeys}
                    onSelectedStageOutcomeKeysChange={setSelectedStageOutcomeKeys}
                    actionPipelineId={actionPipelineId}
                    onActionPipelineIdChange={setActionPipelineId}
                    disabled={selectedEvent?.isActive === false}
                  />
                  <div className="mb-4 pb-2 border-b border-border-default">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                      תוצאות לשלב
                    </h4>
                    <p className="text-sm font-semibold text-text-default">
                      {currentStageLabel || '—'}
                      <span className="text-text-muted font-normal">
                        {' '}
                        · {processLabel(selectedEvent.process)}
                      </span>
                    </p>
                  </div>
                  {currentOutcomes.length === 0 ? (
                    <p className="text-sm text-text-muted px-1">
                      אין תוצאות מוגדרות לשלב זה. הוסף אותן ב־הגדרות → תהליכי עבודה → תוצאות לשלב.
                    </p>
                  ) : (
                    currentOutcomes.map((outcome) => (
                      <button
                        key={outcome.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleLogOutcome(outcome);
                        }}
                        className="w-full text-right px-4 py-3 text-[13px] font-bold text-gray-700 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-100 rounded-xl transition-all flex items-center justify-between group shadow-sm bg-white"
                      >
                        <span className="flex flex-col items-start gap-0.5">
                          <span>{outcome.title}</span>
                          <span className="text-[10px] font-medium text-text-muted">
                            {outcomeActionSubtitle(
                              outcome,
                              pipelinesByClient[selectedEvent?.clientId || '']?.flatMap((p) => p.stages || []) || [],
                            )}
                          </span>
                        </span>
                        <div className="w-6 h-6 rounded-full bg-gray-50 group-hover:bg-primary-100 flex items-center justify-center transition-colors shrink-0">
                          <CheckCircleIcon className="w-4 h-4 text-gray-300 group-hover:text-primary-600 transition-colors" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {createClientId ? (
        <ProcessEventModal
          isOpen={isEventModalOpen}
          onClose={() => setIsEventModalOpen(false)}
          onSave={handleCreateProcessEvent}
          clientId={createClientId}
          clientName={createClientName}
          contactId={scopeContactId || undefined}
          contactName={scopeContactName || undefined}
        />
      ) : null}
    </div>
  );
};

export default ClientsEventsJournalTab;
