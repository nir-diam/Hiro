import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  XMarkIcon,
  PlusIcon,
  ClockIcon,
  CalendarIcon,
  UserIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilIcon,
  ArrowPathIcon,
} from './Icons';
import EventFormModal from './EventFormModal';
import { type Event } from './EventsView';
import { useAuth } from '../context/AuthContext';
import {
  fetchCandidatePipelines,
  patchCandidatePipelineStage,
  type PipelineDto,
  type PipelineStageDto,
  type StageOutcomeDto,
} from '../services/candidatePipelinesApi';
import {
  type CandidateJobLink,
  type ProcessJournalEntry,
  patchCandidateJobLinkStatus,
  fetchJobLinkProcessJournal,
  patchJobLinkProcessJournalEntry,
} from '../utils/candidateLinkedJobs';
import { fetchStaffUsers, type StaffUserDto } from '../services/usersApi';
import {
  applyOutcomeDueDate,
  dueDateAfterDaysFromToday,
  outcomeActionSubtitle,
  summarizeAutomationResults,
} from '../utils/processOutcomeSla';
import { executePipelineOutcome } from '../services/pipelineOutcomesApi';
import { fetchSystemEvents } from '../services/systemEventsApi';
import ProcessManagementCatalogPanel from './ProcessManagementCatalogPanel';
import {
  filterOutcomesByStageSelection,
  type EnrichedPipeline,
} from '../utils/processManagementCatalog';
import {
  buildMoveTargetOptions,
  resolveStageIdFromMoveTargetLabel,
} from '../utils/pipelineMoveTargets';

export type ProcessModalJob = CandidateJobLink;

interface CandidateProcessManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidateId: string;
  candidateName: string;
  job: ProcessModalJob;
  onJobUpdated: (job: ProcessModalJob) => void;
  clientId?: string | null;
  candidatePipelineId?: string | null;
  pipelineStageId?: string | null;
  onPipelineStageChanged?: (pipelineId: string, stageId: string, stageName: string) => void;
}

const getEventFetchHeaders = (withJson: boolean): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (withJson) h['Content-Type'] = 'application/json';
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

function formatEventDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('he-IL');
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('he-IL');
}

function staffDisplayName(user: StaffUserDto): string {
  const name = user.name && String(user.name).trim();
  if (name) return name;
  const email = user.email && String(user.email).trim();
  if (email) return email;
  return 'משתמש';
}

function formatDueDate(entry: ProcessJournalEntry): string {
  if (!entry.dueDate) return '—';
  const d = new Date(entry.dueDate);
  if (Number.isNaN(d.getTime())) return entry.dueDate;
  return d.toLocaleDateString('he-IL');
}

function matchStageByName(stages: PipelineStageDto[], name: string): PipelineStageDto | undefined {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return undefined;
  const exact = stages.find((s) => String(s.name || '').trim().toLowerCase() === normalized);
  if (exact) return exact;
  return stages.find((s) => {
    const stageName = String(s.name || '').trim().toLowerCase();
    return stageName.includes(normalized) || normalized.includes(stageName);
  });
}

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
    ],
  },
];

function mapStageOutcomes(stage: PipelineStageDto | null | undefined): ActionOutcome[] {
  if (!stage?.outcomes?.length) return [];
  return stage.outcomes
    .map((o: StageOutcomeDto) => ({
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

const CandidateProcessManagementModal: React.FC<CandidateProcessManagementModalProps> = ({
  isOpen,
  onClose,
  candidateId,
  candidateName,
  job,
  onJobUpdated,
  clientId: clientIdProp,
  candidatePipelineId: candidatePipelineIdProp,
  pipelineStageId: pipelineStageIdProp,
  onPipelineStageChanged,
}) => {
  const { user } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const clientId =
    (clientIdProp && String(clientIdProp).trim()) ||
    (user?.clientId && String(user.clientId).trim()) ||
    '';
  const actorDisplayName =
    (user?.name && String(user.name).trim()) ||
    (user?.email && String(user.email).trim()) ||
    'משתמש';

  const [journalEntries, setJournalEntries] = useState<ProcessJournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [candidatePipelines, setCandidatePipelines] = useState<PipelineDto[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(false);
  const [currentPipelineId, setCurrentPipelineId] = useState<string | null>(
    candidatePipelineIdProp ? String(candidatePipelineIdProp).trim() || null : null,
  );
  const [currentStageId, setCurrentStageId] = useState<string | null>(
    pipelineStageIdProp ? String(pipelineStageIdProp).trim() || null : null,
  );
  const [stageSaving, setStageSaving] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [automationNotice, setAutomationNotice] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [localJob, setLocalJob] = useState(job);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editDescriptionValue, setEditDescriptionValue] = useState('');
  const [editNextStageValue, setEditNextStageValue] = useState('');
  const [editDueDateValue, setEditDueDateValue] = useState('');
  const [editCreatorValue, setEditCreatorValue] = useState('');
  const [editIsActiveValue, setEditIsActiveValue] = useState(true);
  const [showInactiveEntries, setShowInactiveEntries] = useState(true);
  const [staffUsers, setStaffUsers] = useState<StaffUserDto[]>([]);
  const [entrySaving, setEntrySaving] = useState(false);
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(new Set());
  const [selectedSystemEventIds, setSelectedSystemEventIds] = useState<Set<string>>(new Set());
  const [selectedStageOutcomeKeys, setSelectedStageOutcomeKeys] = useState<Set<string>>(new Set());
  const [actionPipelineId, setActionPipelineId] = useState<string | null>(null);
  const [systemEventGroups, setSystemEventGroups] = useState(SYSTEM_EVENT_GROUPS_FALLBACK);
  const dueDateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalJob(job);
  }, [job]);

  useEffect(() => {
    setCurrentPipelineId(candidatePipelineIdProp ? String(candidatePipelineIdProp).trim() || null : null);
    setCurrentStageId(pipelineStageIdProp ? String(pipelineStageIdProp).trim() || null : null);
  }, [candidatePipelineIdProp, pipelineStageIdProp, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setEditingEntryId(null);
    }
  }, [isOpen]);

  const applyJournalResponse = useCallback(
    (data: Awaited<ReturnType<typeof fetchJobLinkProcessJournal>>) => {
      setJournalEntries(Array.isArray(data.entries) ? data.entries : []);
      if (data.workflowMeta) {
        setLocalJob((prev) => ({
          ...prev,
          status: data.currentStatus || prev.status,
          internalNote: data.workflowMeta.internalNote ?? prev.internalNote,
          dueDate: data.workflowMeta.dueDate ?? prev.dueDate,
          dueTime: data.workflowMeta.dueTime ?? prev.dueTime,
          inviteCandidate: Boolean(data.workflowMeta.inviteCandidate),
          inviteClient: Boolean(data.workflowMeta.inviteClient),
        }));
      }
    },
    [],
  );

  const loadJournal = useCallback(async () => {
    if (!localJob.linkId) return;
    setJournalLoading(true);
    setJournalError(null);
    try {
      const data = await fetchJobLinkProcessJournal(localJob.linkId);
      applyJournalResponse(data);
    } catch (e: unknown) {
      setJournalError(e instanceof Error ? e.message : 'שגיאה');
      setJournalEntries([]);
    } finally {
      setJournalLoading(false);
    }
  }, [localJob.linkId, applyJournalResponse]);

  useEffect(() => {
    if (!isOpen) return;
    void loadJournal();
  }, [isOpen, loadJournal]);

  useEffect(() => {
    if (!isOpen || !clientId) {
      if (!isOpen) setCandidatePipelines([]);
      return;
    }
    let cancelled = false;
    setPipelinesLoading(true);
    void fetchCandidatePipelines(clientId)
      .then((rows) => {
        if (!cancelled) setCandidatePipelines(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setCandidatePipelines([]);
      })
      .finally(() => {
        if (!cancelled) setPipelinesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  useEffect(() => {
    if (!isOpen || !clientId) {
      if (!isOpen) setStaffUsers([]);
      return;
    }
    let cancelled = false;
    void fetchStaffUsers(clientId)
      .then((rows) => {
        if (!cancelled) setStaffUsers(Array.isArray(rows) ? rows.filter((u) => u.isActive !== false) : []);
      })
      .catch(() => {
        if (!cancelled) setStaffUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId]);

  useEffect(() => {
    if (!isOpen || !apiBase) return;
    let cancelled = false;
    void fetchSystemEvents(apiBase, typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null)
      .then((rows) => {
        if (cancelled) return;
        const active = rows.filter((r) => r.isActive);
        const grouped = new Map<string, typeof rows>();
        for (const row of active) {
          const key = row.triggerName || 'אירועים';
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(row);
        }
        const fromApi = Array.from(grouped.entries()).map(([label, evs]) => ({
          label,
          events: evs.map((ev) => ({
            value: ev.id,
            label: `${ev.triggerName}.${ev.eventName}`,
          })),
        }));
        setSystemEventGroups(fromApi.length > 0 ? fromApi : SYSTEM_EVENT_GROUPS_FALLBACK);
      })
      .catch(() => {
        if (!cancelled) setSystemEventGroups(SYSTEM_EVENT_GROUPS_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiBase]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPipelineIds(new Set());
      setSelectedSystemEventIds(new Set());
      setSelectedStageOutcomeKeys(new Set());
      setActionPipelineId(null);
    }
  }, [isOpen]);

  const candidatePipelinesCatalog = useMemo((): EnrichedPipeline[] => {
    if (!clientId) return [];
    return candidatePipelines.map((p) => ({ ...p, kind: 'candidate' as const, clientId }));
  }, [candidatePipelines, clientId]);

  const newestEntryId = journalEntries[0]?.id ?? null;

  const visibleJournalEntries = useMemo(() => {
    if (showInactiveEntries) return journalEntries;
    return journalEntries.filter((entry) => entry.isActive !== false);
  }, [journalEntries, showInactiveEntries]);

  const creatorOptions = useMemo(() => {
    const labels = new Set<string>(['מערכת', actorDisplayName]);
    for (const u of staffUsers) {
      labels.add(staffDisplayName(u));
    }
    if (editCreatorValue.trim()) labels.add(editCreatorValue.trim());
    return [...labels].sort((a, b) => a.localeCompare(b, 'he'));
  }, [staffUsers, editCreatorValue, actorDisplayName]);

  const activePipeline = useMemo((): PipelineDto | null => {
    if (!candidatePipelines.length) return null;
    if (actionPipelineId) {
      const byAction = candidatePipelines.find((p) => p.id === actionPipelineId);
      if (byAction) return byAction;
    }
    if (currentPipelineId) {
      const found = candidatePipelines.find((p) => p.id === currentPipelineId);
      if (found) return found;
    }
    return candidatePipelines[0] ?? null;
  }, [candidatePipelines, currentPipelineId, actionPipelineId]);

  useEffect(() => {
    if (!isOpen || !activePipeline?.id) return;
    if (!actionPipelineId) {
      setActionPipelineId(activePipeline.id);
      setSelectedPipelineIds(new Set([activePipeline.id]));
    }
  }, [isOpen, activePipeline?.id, actionPipelineId]);

  const pipelineStages = useMemo((): PipelineStageDto[] => {
    if (!activePipeline?.stages?.length) return [];
    return [...activePipeline.stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [activePipeline]);

  const currentStage = useMemo(
    () => pipelineStages.find((s) => s.id === currentStageId) ?? null,
    [pipelineStages, currentStageId],
  );

  useEffect(() => {
    if (currentStageId || !localJob.status?.trim() || !pipelineStages.length) return;
    const byName = pipelineStages.find((s) => String(s.name || '').trim() === localJob.status.trim());
    if (byName) setCurrentStageId(byName.id);
  }, [currentStageId, localJob.status, pipelineStages]);

  useEffect(() => {
    if (!isOpen) return;
    if (journalEntries.length) {
      setExpandedEntryId(journalEntries[0].id);
    } else {
      setExpandedEntryId(null);
    }
  }, [isOpen, journalEntries]);

  useEffect(() => {
    if (!editingEntryId) return;
    const entry = journalEntries.find((e) => e.id === editingEntryId);
    if (entry?.isActive === false) setEditingEntryId(null);
  }, [journalEntries, editingEntryId]);

  const selectedEntry = useMemo(
    () => journalEntries.find((e) => e.id === expandedEntryId) ?? journalEntries[0] ?? null,
    [journalEntries, expandedEntryId],
  );

  const contextStatusName = useMemo(() => {
    const fromEntry = selectedEntry?.status || selectedEntry?.title;
    return String(fromEntry || localJob.status || '').trim();
  }, [selectedEntry, localJob.status]);

  const contextStage = useMemo((): PipelineStageDto | null => {
    if (!pipelineStages.length) return null;
    if (currentStageId) {
      const byId = pipelineStages.find((s) => s.id === currentStageId);
      if (byId) return byId;
    }
    if (contextStatusName) {
      const byName = matchStageByName(pipelineStages, contextStatusName);
      if (byName) return byName;
    }
    return pipelineStages[0] ?? null;
  }, [pipelineStages, currentStageId, contextStatusName]);

  const currentOutcomes = useMemo(() => {
    const outcomes = mapStageOutcomes(contextStage);
    if (!contextStage?.id) return outcomes;
    return filterOutcomesByStageSelection(outcomes, contextStage.id, selectedStageOutcomeKeys);
  }, [contextStage, selectedStageOutcomeKeys]);

  const nextStageOptions = useMemo(() => {
    return buildMoveTargetOptions(pipelineStages).map((option) => option.label);
  }, [pipelineStages]);

  const handleOutcomeClick = async (outcome: ActionOutcome) => {
    if (stageSaving || !activePipeline || !clientId || selectedEntry?.isActive === false) return;
    const stageId = contextStage?.id || currentStageId;
    if (!stageId) {
      setStageError('לא נמצא שלb נוכחי');
      return;
    }
    setStageError(null);
    setAutomationNotice(null);
    setStageSaving(outcome.id);
    try {
      const result = await executePipelineOutcome({
        pipelineKind: 'candidate',
        clientId,
        pipelineId: activePipeline.id,
        stageId,
        outcomeId: outcome.id,
        context: {
          jobCandidateId: localJob.linkId,
          candidateId,
        },
        source: 'manual',
      });

      const action = result.actionResult || {};
      const nextStageId = typeof action.nextStageId === 'string' ? action.nextStageId : currentStageId;
      const nextStageName =
        typeof action.nextStageName === 'string' ? action.nextStageName : localJob.status;
      const note = typeof action.note === 'string' ? action.note : outcome.title;
      const dueDate = typeof action.dueDate === 'string' ? action.dueDate : localJob.dueDate || null;

      if (nextStageId && nextStageId !== currentStageId) {
        setCurrentPipelineId(activePipeline.id);
        setCurrentStageId(nextStageId);
        onPipelineStageChanged?.(activePipeline.id, nextStageId, String(nextStageName || '').trim());
      }

      const pending = (result.automationResults || []).filter((r) => r.status === 'pending_approval');
      const errors = (result.automationResults || []).filter((r) => r.status === 'error');
      const automationSummary = summarizeAutomationResults(result.automationResults);
      if (errors.length) {
        setStageError(errors.map((e) => e.message || 'שגיאת אוטומציה').join(' · '));
        setAutomationNotice(null);
      } else if (pending.length) {
        setStageError(`${pending.length} אוטומציות ממתינות לאישור ידני`);
        setAutomationNotice(null);
      } else if (automationSummary) {
        setStageError(null);
        setAutomationNotice(automationSummary);
      } else {
        setAutomationNotice(null);
      }

      await loadJournal();
      const refreshed = await fetchJobLinkProcessJournal(localJob.linkId);
      applyJournalResponse(refreshed);
      const updated: ProcessModalJob = {
        ...localJob,
        status: refreshed.currentStatus || String(nextStageName || localJob.status).trim(),
        internalNote: refreshed.workflowMeta?.internalNote ?? note,
        dueDate: refreshed.workflowMeta?.dueDate ?? dueDate ?? '',
        lastUpdated: new Date().toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      };
      setLocalJob(updated);
      onJobUpdated(updated);
    } catch (e: unknown) {
      setStageError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setStageSaving(null);
    }
  };

  const handleStageClick = async (stage: PipelineStageDto) => {
    if (stageSaving || !activePipeline || selectedEntry?.isActive === false) return;
    setStageError(null);
    setStageSaving(stage.id);
    try {
      const stageName = String(stage.name || '').trim();
      const note = localJob.internalNote?.trim() || `עודכן שלב ל-${stageName}`;
      const slaDays = Math.max(0, Number(stage.slaLimit) || 0);
      const nextDueDate = slaDays > 0 ? dueDateAfterDaysFromToday(slaDays) : localJob.dueDate || null;
      await patchCandidatePipelineStage(candidateId, {
        pipelineId: activePipeline.id,
        stageId: stage.id,
      });
      await patchCandidateJobLinkStatus(localJob.linkId, {
        status: stageName,
        internalNote: note,
        dueDate: nextDueDate,
        dueTime: localJob.dueTime || null,
        inviteCandidate: localJob.inviteCandidate,
        inviteClient: localJob.inviteClient,
        forceAppendStatus: true,
      });
      setCurrentPipelineId(activePipeline.id);
      setCurrentStageId(stage.id);
      onPipelineStageChanged?.(activePipeline.id, stage.id, stageName);
      const updated: ProcessModalJob = {
        ...localJob,
        status: stageName,
        internalNote: note,
        dueDate: nextDueDate || '',
        lastUpdated: new Date().toLocaleDateString('he-IL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      };
      setLocalJob(updated);
      onJobUpdated(updated);
      await loadJournal();
    } catch (e: unknown) {
      setStageError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setStageSaving(null);
    }
  };

  const handleSaveEvent = async (
    eventData: Omit<Event, 'id' | 'status'> & { id?: string | number },
  ) => {
    if (!apiBase || !candidateId) return;
    const defaultLinked = [
      { type: 'משרה', name: localJob.jobTitle },
      ...(localJob.company && localJob.company !== '—' ? [{ type: 'לקוח', name: localJob.company }] : []),
    ];
    const description = eventData.description?.trim() || '';
    const res = await fetch(`${apiBase}/api/candidates/${encodeURIComponent(candidateId)}/events`, {
      method: 'POST',
      headers: getEventFetchHeaders(true),
      body: JSON.stringify({
        type: eventData.type,
        date: eventData.date,
        description,
        status: 'עתידי',
        linkedTo: eventData.linkedTo?.length ? eventData.linkedTo : defaultLinked,
        history: [{ user: actorDisplayName, timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }],
      }),
    });
    if (res.ok && description) {
      await patchCandidateJobLinkStatus(localJob.linkId, {
        status: localJob.status,
        internalNote: description,
        dueDate: localJob.dueDate || null,
        dueTime: localJob.dueTime || null,
        inviteCandidate: localJob.inviteCandidate,
        inviteClient: localJob.inviteClient,
      });
      await loadJournal();
    }
    setIsEventModalOpen(false);
  };

  const handleReactivateEntry = async (entry: ProcessJournalEntry) => {
    if (!localJob.linkId || entry.isActive !== false) return;
    setEntrySaving(true);
    setStageError(null);
    try {
      const data = await patchJobLinkProcessJournalEntry(localJob.linkId, entry.id, {
        isActive: true,
        creator: actorDisplayName,
      });
      applyJournalResponse(data);
      setExpandedEntryId(entry.id);
      setEditingEntryId(null);
    } catch (e: unknown) {
      setStageError(e instanceof Error ? e.message : 'הפעלת האירוע מחדש נכשלה');
    } finally {
      setEntrySaving(false);
    }
  };

  const handleEditEntry = (entry: ProcessJournalEntry) => {
    if (entry.id !== newestEntryId || entry.isActive === false) return;
    setEditingEntryId(entry.id);
    setEditDescriptionValue(entry.description || '');
    setEditNextStageValue('');
    setEditDueDateValue(entry.dueDate ? entry.dueDate.slice(0, 10) : '');
    setEditCreatorValue(entry.creator || actorDisplayName);
    setEditIsActiveValue(true);
    setExpandedEntryId(entry.id);
  };

  const openDueDatePicker = (entry: ProcessJournalEntry) => {
    if (entry.id !== newestEntryId || entry.isActive === false) return;
    if (editingEntryId !== entry.id) {
      handleEditEntry(entry);
    }
    window.setTimeout(() => {
      const input = dueDateInputRef.current;
      if (!input) return;
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    }, 0);
  };

  const handleSaveEntry = async (entry: ProcessJournalEntry) => {
    if (!localJob.linkId) return;
    setEntrySaving(true);
    setStageError(null);
    try {
      const nextStage = editNextStageValue.trim();
      const patchPayload = {
        description: editDescriptionValue,
        dueDate: editDueDateValue || entry.dueDate || null,
        creator: editCreatorValue.trim() || entry.creator || null,
        isActive: editIsActiveValue,
      };
      let data: Awaited<ReturnType<typeof fetchJobLinkProcessJournal>>;
      if (nextStage) {
        await patchCandidateJobLinkStatus(localJob.linkId, {
          status: nextStage,
          internalNote: editDescriptionValue,
          dueDate: editDueDateValue || entry.dueDate || null,
          dueTime: localJob.dueTime || null,
          inviteCandidate: localJob.inviteCandidate,
          inviteClient: localJob.inviteClient,
          forceAppendStatus: true,
        });
        const matchedStageId = resolveStageIdFromMoveTargetLabel(nextStage, pipelineStages);
        const matchedStage = matchedStageId
          ? pipelineStages.find((s) => s.id === matchedStageId)
          : matchStageByName(pipelineStages, nextStage);
        if (matchedStage) {
          setCurrentStageId(matchedStage.id);
          if (activePipeline) {
            onPipelineStageChanged?.(activePipeline.id, matchedStage.id, nextStage);
          }
        }
        data = await fetchJobLinkProcessJournal(localJob.linkId);
        if (editDescriptionValue.trim() || editDueDateValue || editCreatorValue.trim()) {
          data = await patchJobLinkProcessJournalEntry(localJob.linkId, data.entries[0]?.id || entry.id, {
            ...patchPayload,
          });
        }
      } else {
        data = await patchJobLinkProcessJournalEntry(localJob.linkId, entry.id, patchPayload);
      }
      applyJournalResponse(data);
      setEditingEntryId(null);
      const updatedJob: ProcessModalJob = {
        ...localJob,
        status: data.currentStatus || localJob.status,
        internalNote: data.workflowMeta?.internalNote ?? editDescriptionValue,
        dueDate: data.workflowMeta?.dueDate ?? editDueDateValue,
      };
      setLocalJob(updatedJob);
      onJobUpdated(updatedJob);
    } catch (e: unknown) {
      setStageError(e instanceof Error ? e.message : 'שמירת האירוע נכשלה');
    } finally {
      setEntrySaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-bg-card w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
          <header className="p-5 border-b border-border-default flex items-center justify-between bg-white relative z-10">
            <div>
              <h2 className="text-xl font-bold text-text-default flex items-center gap-2">
                <ClockIcon className="w-6 h-6 text-primary-600" />
                ניהול תהליך גיוס - {candidateName}
              </h2>
              <p className="text-sm text-text-muted mt-0.5">
                {localJob.jobTitle} · {localJob.company}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsEventModalOpen(true)}
                className="bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition shadow-sm flex items-center gap-2"
              >
                <PlusIcon className="w-5 h-5" />
                <span>אירוע חדש</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors border border-transparent hover:border-border-default"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </header>

          <div className="flex flex-col md:flex-row gap-6 p-6 h-full overflow-hidden bg-bg-subtle/30">
            <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl shadow-sm border border-border-default p-5 h-full overflow-hidden relative">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-text-default flex items-center gap-2">
                  <ClockIcon className="w-5 h-5 text-gray-400" />
                  יומן אירועים מערכתי
                  <span className="bg-gray-100 text-gray-600 text-xs py-0.5 px-2 rounded-full mr-2">
                    {visibleJournalEntries.length} אירועים
                  </span>
                </h3>
                <label className="flex items-center gap-2 text-xs font-semibold text-text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInactiveEntries}
                    onChange={(e) => setShowInactiveEntries(e.target.checked)}
                    className="rounded border-border-default text-primary-600 w-4 h-4"
                  />
                  הצג לא פעילים
                </label>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                {journalError ? (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{journalError}</div>
                ) : null}
                {journalLoading ? (
                  <div className="text-center py-12 text-text-muted">טוען אירועים...</div>
                ) : visibleJournalEntries.length === 0 ? (
                  <div className="text-center py-12 text-text-muted">
                    <p className="font-semibold">אין אירועים לתהליך זה</p>
                    <p className="text-sm mt-1">בחר סטטוס מ&quot;פעולות אפשריות&quot; או הוסף אירוע חדש.</p>
                  </div>
                ) : (
                  visibleJournalEntries.map((entry, idx) => {
                    const isExpanded = entry.id === expandedEntryId;
                    const isLast = idx === visibleJournalEntries.length - 1;
                    const isNewest = entry.id === newestEntryId;
                    const isInactive = entry.isActive === false;
                    const isEditing = !isInactive && editingEntryId === entry.id;
                    const displayedDueDate =
                      isEditing && editDueDateValue
                        ? formatDueDate({ ...entry, dueDate: editDueDateValue })
                        : formatDueDate(entry);
                    return (
                      <div key={entry.id} className="relative group pl-4">
                        {!isLast ? (
                          <div className="absolute top-8 bottom-[-24px] right-[27px] w-px bg-border-default group-last:bg-transparent" />
                        ) : null}
                        <div
                          className={`relative border-2 rounded-2xl transition-all duration-300 cursor-pointer shadow-sm ${
                            isInactive
                              ? 'bg-gray-50/80 border-gray-200 opacity-60 hover:opacity-75'
                              : isExpanded
                                ? 'bg-white border-primary-500 shadow-primary-500/10 hover:shadow-md'
                                : 'bg-white border-border-default hover:border-primary-300 hover:shadow-md'
                          }`}
                          onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                        >
                          <div
                            className={`p-4 flex flex-wrap gap-3 justify-between items-center rounded-t-xl ${
                              isInactive ? 'bg-gray-100/60' : 'bg-gray-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 shrink-0 ${
                                  isInactive ? 'bg-gray-200 text-gray-500' : 'bg-primary-100 text-primary-700'
                                }`}
                              >
                                {isExpanded ? (
                                  <ChevronUpIcon className="w-5 h-5" />
                                ) : (
                                  <ChevronDownIcon className="w-5 h-5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <h4
                                  className={`text-base font-bold transition-colors ${
                                    isInactive
                                      ? 'text-gray-500'
                                      : isExpanded
                                        ? 'text-primary-700'
                                        : 'text-text-default'
                                  }`}
                                >
                                  {entry.title}
                                </h4>
                                {entry.isActive === false ? (
                                  <span className="text-[10px] font-bold bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded border border-gray-300 mt-1 inline-block">
                                    לא פעיל
                                  </span>
                                ) : null}
                                {entry.tags?.length ? (
                                  <div className="flex gap-2 mt-1 flex-wrap">
                                    {entry.tags.map((t) => (
                                      <span
                                        key={t}
                                        className="text-[10px] font-bold bg-primary-50 text-primary-700 px-1.5 py-0.5 rounded border border-primary-100"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-semibold text-text-muted shrink-0">
                              {isNewest && !isInactive ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditEntry(entry);
                                  }}
                                  className="w-8 h-8 rounded-full bg-white hover:bg-primary-50 flex items-center justify-center border border-gray-200 hover:border-primary-200 text-gray-500 hover:text-primary-600 shadow-sm"
                                  title="ערוך אירוע"
                                  aria-label="ערוך אירוע"
                                >
                                  <PencilIcon className="w-4 h-4" />
                                </button>
                              ) : null}
                              <div className="flex items-center gap-1.5">
                                <UserIcon className="w-4 h-4 text-gray-400" />
                                {isEditing ? editCreatorValue || entry.creator || 'מערכת' : entry.creator || 'מערכת'}
                              </div>
                              <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-border-subtle">
                                <CalendarIcon className="w-4 h-4 text-gray-400" />
                                <span className="font-mono">{formatEventDate(entry.date)}</span>
                              </div>
                            </div>
                          </div>

                          <div
                            className={`transition-all duration-300 ease-in-out overflow-hidden ${
                              isExpanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
                            }`}
                          >
                            <div className="p-5 border-t border-border-default/50">
                              {isEditing ? (
                                <div className="space-y-3 mb-5" onClick={(e) => e.stopPropagation()}>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">השלב הבא</label>
                                    <p className="text-[12px] text-text-muted mb-1.5">
                                      שלב נוכחי:{' '}
                                      <span className="font-bold text-amber-800">
                                        {contextStage?.name || localJob.status || '—'}
                                      </span>
                                    </p>
                                    <select
                                      value={editNextStageValue}
                                      onChange={(e) => setEditNextStageValue(e.target.value)}
                                      className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                                    >
                                      <option value="">ללא שינוי שלב</option>
                                      {nextStageOptions.map((name) => (
                                        <option key={name} value={name}>
                                          {name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">אחראי</label>
                                    <select
                                      value={editCreatorValue}
                                      onChange={(e) => setEditCreatorValue(e.target.value)}
                                      className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                                    >
                                      {creatorOptions.map((name) => (
                                        <option key={name} value={name}>
                                          {name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-text-muted mb-1">תיאור / הערות</label>
                                    <textarea
                                      value={editDescriptionValue}
                                      onChange={(e) => setEditDescriptionValue(e.target.value)}
                                      className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm min-h-[100px]"
                                    />
                                  </div>
                                  <label className="flex items-center gap-2 text-sm font-semibold text-text-default cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editIsActiveValue}
                                      onChange={(e) => setEditIsActiveValue(e.target.checked)}
                                      className="rounded border-border-default text-primary-600 w-4 h-4"
                                    />
                                    אירוע פעיל
                                  </label>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={entrySaving}
                                      onClick={() => void handleSaveEntry(entry)}
                                      className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 disabled:opacity-60"
                                    >
                                      {entrySaving ? 'שומר...' : 'שמור'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={entrySaving}
                                      onClick={() => setEditingEntryId(null)}
                                      className="px-4 py-2 rounded-lg border border-border-default text-sm font-bold hover:bg-bg-hover"
                                    >
                                      ביטול
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mb-5 relative">
                                  <p
                                    className={`text-sm whitespace-pre-wrap leading-relaxed rounded-xl p-4 border border-gray-100 ${
                                      isInactive
                                        ? 'text-gray-500 bg-gray-50/80'
                                        : 'text-text-default bg-gray-50/80'
                                    }`}
                                  >
                                    {entry.description || (
                                      <span className="text-gray-400 italic">אין תיאור</span>
                                    )}
                                  </p>
                                  {isInactive ? (
                                    <button
                                      type="button"
                                      disabled={entrySaving}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleReactivateEntry(entry);
                                      }}
                                      className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition shadow-sm disabled:opacity-60"
                                    >
                                      <ArrowPathIcon className="w-4 h-4" />
                                      {entrySaving ? 'מפעיל...' : 'הפעל מחדש'}
                                    </button>
                                  ) : null}
                                </div>
                              )}

                              <div className="mb-5" onClick={(e) => e.stopPropagation()}>
                                <h5 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                                  היסטוריית סטטוסים
                                </h5>
                                {entry.updates.length === 0 ? (
                                  <div className="text-sm text-text-muted italic bg-gray-50 border border-dashed border-border-default rounded-lg p-3">
                                    אין עדכוני סטטוס נוספים. בחר שלב מ&quot;פעולות אפשריות&quot; או ערוך את האירוע.
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {entry.updates.map((update) => (
                                      <div
                                        key={update.id}
                                        className="flex justify-between items-start p-3 bg-white border border-border-subtle rounded-xl hover:border-primary-200 transition-colors shadow-sm"
                                      >
                                        <div className="flex gap-3">
                                          <div className="w-8 h-8 rounded-full bg-blue-50 flex flex-shrink-0 items-center justify-center border border-blue-100">
                                            <CheckCircleIcon className="w-4 h-4 text-blue-500" />
                                          </div>
                                          <div>
                                            <p className="text-sm font-bold text-text-default">{update.title}</p>
                                            <p className="text-[11px] text-text-muted mt-0.5">
                                              עודכן ע&quot;י: {update.creator || '—'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-[11px] font-bold text-text-muted bg-gray-50 px-2 py-1 rounded-md border border-border-subtle flex items-center gap-1.5">
                                          <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                                          {formatDateTime(update.date)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted border-t border-border-subtle pt-4">
                                <div className="flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg shadow-sm border border-gray-100">
                                  <ClockIcon className="w-4 h-4 text-gray-400" />
                                  <span className="font-semibold">
                                    נוצר:{' '}
                                    <span className="font-mono text-gray-700">{formatDateTime(entry.date)}</span>
                                  </span>
                                </div>
                                <div
                                  className={`relative flex items-center gap-2 bg-white px-2 py-1.5 rounded-lg shadow-sm border border-gray-100 ${
                                    isNewest && !isInactive
                                      ? 'cursor-pointer hover:border-primary-200 hover:bg-primary-50/30 transition-colors'
                                      : ''
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isNewest && !isInactive) openDueDatePicker(entry);
                                  }}
                                  title={isNewest && !isInactive ? 'לחץ לשינוי תאריך יעד' : undefined}
                                  role={isNewest && !isInactive ? 'button' : undefined}
                                >
                                  <CalendarIcon className="w-4 h-4 text-gray-400" />
                                  <span className="font-semibold">
                                    יעד:{' '}
                                    <span className="font-mono text-gray-700">{displayedDueDate}</span>
                                  </span>
                                  {isNewest && !isInactive && isExpanded ? (
                                    <input
                                      ref={dueDateInputRef}
                                      type="date"
                                      value={
                                        isEditing
                                          ? editDueDateValue
                                          : entry.dueDate
                                            ? entry.dueDate.slice(0, 10)
                                            : ''
                                      }
                                      onChange={(e) => {
                                        if (!isEditing) handleEditEntry(entry);
                                        setEditDueDateValue(e.target.value);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                      aria-label="תאריך יעד"
                                    />
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="w-full md:w-80 shrink-0 bg-white rounded-2xl shadow-sm border border-border-default flex flex-col overflow-hidden h-full">
              <div className="p-5 border-b border-border-default bg-primary-600 text-white shadow-sm z-10 relative">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <CheckCircleIcon className="w-6 h-6 opacity-90 text-primary-200" />
                  פעולות אפשריות
                </h3>
                <p className="text-xs text-primary-100 mt-1 opacity-90 line-clamp-1">
                  {selectedEntry
                    ? `לאירוע: ${selectedEntry.title}`
                    : contextStage
                      ? `שלב: ${contextStage.name}`
                      : activePipeline
                        ? activePipeline.name
                        : 'תהליכי מועמדים'}
                </p>
              </div>

              <div className="p-4 overflow-y-auto custom-scrollbar flex-1 bg-gray-50/50">
                {stageError ? (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">{stageError}</div>
                ) : null}
                {automationNotice ? (
                  <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 mb-3">
                    {automationNotice}
                  </div>
                ) : null}
                {pipelinesLoading ? (
                  <div className="text-center py-8 text-text-muted text-sm">טוען תהליכי מועמדים...</div>
                ) : selectedEntry?.isActive === false ? (
                  <div className="text-center py-8 px-4">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <ClockIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm font-semibold text-gray-500">אירוע לא פעיל</p>
                    <p className="text-xs text-text-muted mt-1 mb-4">לא ניתן לבצע פעולות עד שהאירוע יופעל מחדש.</p>
                    <button
                      type="button"
                      disabled={entrySaving}
                      onClick={() => void handleReactivateEntry(selectedEntry)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition shadow-sm disabled:opacity-60"
                    >
                      <ArrowPathIcon className="w-4 h-4" />
                      {entrySaving ? 'מפעיל...' : 'הפעל מחדש'}
                    </button>
                  </div>
                ) : !activePipeline || pipelineStages.length === 0 ? (
                  <div className="text-center py-8 text-text-muted text-sm px-2">
                    לא הוגדרו תהליכי מועמדים. הגדר אותם בהגדרות → תהליכי מועמדים.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <ProcessManagementCatalogPanel
                      variant="sidebar"
                      clientPipelines={[]}
                      candidatePipelines={candidatePipelinesCatalog}
                      systemEventGroups={systemEventGroups}
                      selectedPipelineIds={selectedPipelineIds}
                      onSelectedPipelineIdsChange={(next) => {
                        setSelectedPipelineIds(next);
                        const first = [...next][0] || null;
                        setActionPipelineId(first);
                        if (first) {
                          setCurrentPipelineId(first);
                          const pipe = candidatePipelines.find((p) => p.id === first);
                          const firstStage = [...(pipe?.stages || [])].sort(
                            (a, b) => (a.order ?? 0) - (b.order ?? 0),
                          )[0];
                          if (firstStage) setCurrentStageId(firstStage.id);
                        }
                      }}
                      selectedSystemEventIds={selectedSystemEventIds}
                      onSelectedSystemEventIdsChange={setSelectedSystemEventIds}
                      selectedStageOutcomeKeys={selectedStageOutcomeKeys}
                      onSelectedStageOutcomeKeysChange={setSelectedStageOutcomeKeys}
                      actionPipelineId={actionPipelineId}
                      onActionPipelineIdChange={setActionPipelineId}
                      disabled={selectedEntry?.isActive === false}
                    />
                    <div className="mb-2 pb-2 border-b border-border-default">
                      <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
                        תוצאות לשלב
                      </h4>
                      <p className="text-sm font-semibold text-text-default">
                        {contextStage?.name || contextStatusName || '—'}
                        {activePipeline?.name ? (
                          <span className="text-text-muted font-normal"> · {activePipeline.name}</span>
                        ) : null}
                      </p>
                    </div>

                    {currentOutcomes.length === 0 ? (
                      <p className="text-sm text-text-muted px-1 mb-4">
                        אין תוצאות מוגדרות לשלב זה. הוסף אותן ב־הגדרות → תהליכי מועמדים → תוצאות לשלב.
                      </p>
                    ) : (
                      <div className="space-y-2 mb-4">
                        {currentOutcomes.map((outcome) => {
                          const isSaving = stageSaving === outcome.id;
                          return (
                            <button
                              key={outcome.id}
                              type="button"
                              disabled={Boolean(stageSaving)}
                              onClick={() => void handleOutcomeClick(outcome)}
                              className="w-full text-right px-4 py-3 text-[13px] font-bold text-gray-700 hover:text-primary-800 hover:bg-primary-50 border border-transparent hover:border-primary-100 rounded-xl transition-all flex items-center justify-between group shadow-sm bg-white disabled:opacity-60"
                            >
                              <span className="flex flex-col items-start gap-0.5">
                                <span>{outcome.title}</span>
                                <span className="text-[10px] font-medium text-text-muted">
                                  {outcomeActionSubtitle(outcome, pipelineStages)}
                                </span>
                              </span>
                              <div className="w-6 h-6 rounded-full bg-gray-50 group-hover:bg-primary-100 flex items-center justify-center transition-colors shrink-0">
                                {isSaving ? (
                                  <svg className="animate-spin h-4 w-4 text-primary-600" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path
                                      className="opacity-75"
                                      fill="currentColor"
                                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                ) : (
                                  <CheckCircleIcon className="w-4 h-4 text-gray-300 group-hover:text-primary-600 transition-colors" />
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div className="space-y-2 pt-2 border-t border-border-default">
                      <div className="pb-2 flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-primary-500 rounded-full" />
                        <h4 className="text-xs font-black text-text-muted uppercase tracking-wider">
                          מעבר ישיר לשלב
                        </h4>
                      </div>
                      {pipelineStages.map((stage) => {
                        const isCurrent = stage.id === (contextStage?.id || currentStageId);
                        const isSaving = stageSaving === stage.id;
                        return (
                          <button
                            key={stage.id}
                            type="button"
                            disabled={Boolean(stageSaving)}
                            onClick={() => void handleStageClick(stage)}
                            className={`w-full text-right px-4 py-3.5 text-sm font-bold border rounded-xl transition-all flex items-center justify-between group shadow-[0_1px_2px_rgba(0,0,0,0.02)] mb-2 relative overflow-hidden ${
                              isCurrent
                                ? 'bg-primary-50 text-primary-800 border-primary-200'
                                : 'text-gray-700 hover:text-primary-800 hover:bg-primary-50 border-transparent hover:border-primary-200 bg-white'
                            } disabled:opacity-60`}
                          >
                            {!isCurrent ? (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                            ) : null}
                            <span>{stage.name}</span>
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                                isCurrent ? 'bg-primary-100' : 'bg-gray-50 group-hover:bg-primary-100'
                              }`}
                            >
                              {isSaving ? (
                                <svg className="animate-spin h-4 w-4 text-primary-600" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <CheckCircleIcon
                                  className={`w-4 h-4 transition-colors ${
                                    isCurrent ? 'text-primary-600' : 'text-gray-300 group-hover:text-primary-600'
                                  }`}
                                />
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <EventFormModal
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleSaveEvent}
        event={{
          id: '',
          type: ['ראיון'],
          date: new Date().toISOString(),
          coordinator: actorDisplayName,
          status: 'עתידי',
          linkedTo: [
            { type: 'משרה', name: localJob.jobTitle },
            ...(localJob.company && localJob.company !== '—' ? [{ type: 'לקוח', name: localJob.company }] : []),
          ],
          description: localJob.internalNote || '',
        }}
        context="candidate"
      />
    </>
  );
};

export default CandidateProcessManagementModal;
