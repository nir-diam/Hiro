import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { XMarkIcon } from './Icons';
import SlaDurationInput from './SlaDurationInput';
import { FormMultiSelect } from './FormMultiSelect';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { fetchCandidatePipelines } from '../services/candidatePipelinesApi';
import { fetchStaffUsers } from '../services/usersApi';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import { normalizeSlaUnit, slaFieldLabel, type SlaUnit } from '../utils/slaDuration';
import {
  resolvePipelineDefaultAssigneeNames,
  resolvePipelineDefaultAssigneeUserIds,
} from '../utils/pipelineDefaultAssignees';

const ASSIGNEE_LIST_SPLIT_RE = /[,;|\n]+/;

const parseAssigneeList = (raw: string | null | undefined): string[] => {
  const parts = String(raw || '')
    .split(ASSIGNEE_LIST_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? Array.from(new Set(parts)) : [];
};

const formatAssigneeList = (names: string[]): string => {
  const unique = Array.from(new Set(names.map((name) => String(name || '').trim()).filter(Boolean)));
  return unique.join(', ');
};

type PipelineWithKind = PipelineDto & { kind: 'client' | 'candidate' };

export type ProcessEventSavePayload = {
  title: string;
  processId: string;
  processName: string;
  stageId: string;
  stageName: string;
  contactId?: string | null;
  contactName: string;
  clientName: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
  slaValue: number;
  slaUnit: SlaUnit;
  /** @deprecated use slaValue */
  slaDays?: number;
  description: string;
};

type ContactOption = { id: string; name: string };

function shouldApplyPipelineDefaultAssignee(
  initialAssignee: string | null | undefined,
  currentValues: string[],
  loggedInAssigneeName: string,
): boolean {
  if (parseAssigneeList(initialAssignee).length > 0) return false;
  if (currentValues.length === 0) return true;
  if (currentValues.length === 1) {
    const only = currentValues[0];
    if (only === loggedInAssigneeName || only === 'אני') return true;
  }
  return false;
}

interface ProcessEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Return `false` to keep the modal open (e.g. duplicate-process confirmation). */
  onSave: (eventData: ProcessEventSavePayload) => void | Promise<void | false>;
  clientId: string;
  /** Linked organization under a tenant client — scopes contact list */
  organizationId?: string | null;
  /** Pending linked org (metadata.organizationTmpId) — scopes contact list when organizationId is absent */
  organizationTmpId?: string | null;
  /** Display label for organization/client (preferred over clientName when org-scoped) */
  organizationName?: string;
  clientName?: string;
  /** Pre-select contact when opened from contact profile */
  contactId?: string | null;
  contactName?: string;
  initialData?: Partial<ProcessEventSavePayload> | null;
  /** Client work pipelines (default) vs candidate recruitment pipelines */
  pipelineKind?: 'client' | 'candidate';
  /** Tenant client id for pipeline catalog (defaults to clientId) */
  pipelineClientId?: string;
  /** Pre-loaded pipelines from settings (same source as PipelineSettingsView) */
  clientPipelines?: PipelineDto[];
  candidatePipelines?: PipelineDto[];
  /** Read-only linked entity shown instead of contact picker (e.g. candidate name) */
  linkedEntityName?: string;
  linkedEntityLabel?: string;
  /** When true, never load unscoped contacts — only org-filtered list (org / contact profile). */
  restrictContactsToOrganization?: boolean;
}

const ProcessEventModal: React.FC<ProcessEventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  clientId,
  organizationId = null,
  organizationTmpId = null,
  organizationName = '',
  clientName = '',
  contactId = null,
  contactName = '',
  initialData = null,
  pipelineKind = 'client',
  pipelineClientId,
  clientPipelines: clientPipelinesProp,
  candidatePipelines: candidatePipelinesProp,
  linkedEntityName = '',
  linkedEntityLabel = 'מועמד',
  restrictContactsToOrganization = false,
}) => {
  const { user } = useAuth();
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [clientPipelines, setClientPipelines] = useState<PipelineDto[]>([]);
  const [candidatePipelines, setCandidatePipelines] = useState<PipelineDto[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [assigneeOptions, setAssigneeOptions] = useState<string[]>(['אני']);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedOrganizationName, setFetchedOrganizationName] = useState('');
  const defaultAssigneeName = useMemo(
    () => user?.name?.trim() || 'אני',
    [user?.name],
  );
  const staffClientId = pipelineClientId || clientId;

  const displayClientName = useMemo(() => {
    const fromOrgProp = String(organizationName || '').trim();
    if (fromOrgProp) return fromOrgProp;
    const fromFetch = String(fetchedOrganizationName || '').trim();
    if (fromFetch) return fromFetch;
    if (organizationId) return '';
    const plainClient = String(clientName || '').trim();
    return plainClient;
  }, [organizationName, fetchedOrganizationName, clientName, organizationId]);

  const contactsOrganizationId = String(organizationId || '').trim();
  const contactsOrganizationTmpId = contactsOrganizationId
    ? ''
    : String(organizationTmpId || '').trim();

  const isOrganizationScoped = Boolean(
    contactsOrganizationId
    || contactsOrganizationTmpId
    || String(organizationName || '').trim(),
  );

  useEffect(() => {
    if (!isOpen || !organizationId || !apiBase) {
      setFetchedOrganizationName('');
      return;
    }
    if (organizationName) {
      setFetchedOrganizationName('');
      return;
    }
    let cancelled = false;
    void fetch(`${apiBase}/api/organizations/${encodeURIComponent(String(organizationId))}`, {
      credentials: 'include',
      headers: authHeaders(),
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const name = String(data.name || data.displayName || '').trim();
        if (name) setFetchedOrganizationName(name);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, organizationName, apiBase]);

  const [formData, setFormData] = useState({
    title: '',
    processId: '',
    stageId: '',
    contactId: contactId || '',
    contactName: contactName || '',
    clientName: clientName || '',
    assigneeValues: [defaultAssigneeName],
    priority: 'medium' as 'high' | 'medium' | 'low',
    slaValue: 3,
    slaUnit: 'days' as SlaUnit,
    description: '',
  });

  const modalOpenSessionRef = useRef(false);
  /** When staff list loads after process change, apply pipeline default assignees for this process. */
  const pendingAssigneeProcessIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      modalOpenSessionRef.current = false;
      return;
    }
    if (modalOpenSessionRef.current) return;
    modalOpenSessionRef.current = true;
    pendingAssigneeProcessIdRef.current = null;
    setFormData({
      title: initialData?.title || '',
      processId: initialData?.processId || '',
      stageId: initialData?.stageId || '',
      contactId: initialData?.contactId || contactId || '',
      contactName: initialData?.contactName || contactName || '',
      clientName: isOrganizationScoped
        ? displayClientName
        : displayClientName || '',
      assigneeValues: (() => {
        const parsed = parseAssigneeList(initialData?.assignee);
        return parsed.length > 0 ? parsed : [defaultAssigneeName];
      })(),
      priority: initialData?.priority || 'medium',
      slaValue: initialData?.slaValue ?? initialData?.slaDays ?? 3,
      slaUnit: normalizeSlaUnit(initialData?.slaUnit),
      description: initialData?.description || '',
    });
    setError(null);
  }, [
    isOpen,
    initialData,
    displayClientName,
    contactId,
    contactName,
    isOrganizationScoped,
    defaultAssigneeName,
  ]);

  useEffect(() => {
    if (!isOpen || !staffClientId) {
      setAssigneeOptions([defaultAssigneeName, 'אני'].filter(Boolean));
      return;
    }
    let cancelled = false;
    void fetchStaffUsers(staffClientId)
      .then((rows) => {
        if (cancelled) return;
        const names = rows
          .map((u) => String(u.name || u.email || '').trim())
          .filter(Boolean);
        setAssigneeOptions((prev) =>
          Array.from(new Set([defaultAssigneeName, 'אני', ...names, ...prev])),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAssigneeOptions(Array.from(new Set([defaultAssigneeName, 'אני'].filter(Boolean))));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, staffClientId, defaultAssigneeName]);

  useEffect(() => {
    if (!isOpen) return;
    setFormData((prev) => {
      const nextClientName = isOrganizationScoped ? displayClientName : displayClientName || prev.clientName;
      if (prev.clientName === nextClientName) return prev;
      return { ...prev, clientName: nextClientName };
    });
  }, [isOpen, displayClientName, isOrganizationScoped]);

  const [staffAssigneeUsers, setStaffAssigneeUsers] = useState<ContactOption[]>([]);

  const assigneesForPipeline = useCallback(
    (pipeline: PipelineDto | undefined): string[] => {
      const fromPipeline = resolvePipelineDefaultAssigneeNames(pipeline, staffAssigneeUsers);
      if (fromPipeline.length) return fromPipeline;
      return [defaultAssigneeName];
    },
    [staffAssigneeUsers, defaultAssigneeName],
  );

  const applyPipelineDefaults = useCallback(
    (client: PipelineDto[], candidate: PipelineDto[], cts: ContactOption[], staff: ContactOption[]) => {
      const allFlat: PipelineWithKind[] = [
        ...candidate.map((p) => ({ ...p, kind: 'candidate' as const })),
        ...client.map((p) => ({ ...p, kind: 'client' as const })),
      ];
      const defaultPool =
        pipelineKind === 'candidate' && candidate.length
          ? candidate
          : client.length
            ? client
            : candidate;
      setFormData((prev) => {
        const processId =
          (prev.processId && allFlat.some((p) => p.id === prev.processId) ? prev.processId : '') ||
          defaultPool[0]?.id ||
          allFlat[0]?.id ||
          '';
        const pipeline = allFlat.find((p) => p.id === processId) || allFlat[0];
        const stageId =
          prev.stageId && pipeline?.stages?.some((s) => s.id === prev.stageId)
            ? prev.stageId
            : pipeline?.stages?.[0]?.id || '';
        let nextContactId = prev.contactId;
        let nextContactName = prev.contactName;
        if (pipelineKind === 'candidate') {
          nextContactId = '';
          nextContactName = linkedEntityName || prev.contactName || contactName || '';
        } else {
          const explicitId = contactId || initialData?.contactId || prev.contactId;
          if (explicitId) {
            nextContactId = explicitId;
            const match = cts.find((c) => c.id === explicitId);
            if (match) nextContactName = match.name;
          } else if (nextContactId) {
            const match = cts.find((c) => c.id === nextContactId);
            if (match) nextContactName = match.name;
          } else if (nextContactName) {
            const match = cts.find((c) => c.name === nextContactName);
            if (match) nextContactId = match.id;
          }
        }
        let assigneeValues = prev.assigneeValues;
        if (pipeline?.kind === pipelineKind) {
          const initialAssignees = parseAssigneeList(initialData?.assignee);
          if (initialAssignees.length === 0) {
            const defaultAssignees = resolvePipelineDefaultAssigneeNames(pipeline, staff);
            assigneeValues = defaultAssignees.length ? defaultAssignees : [defaultAssigneeName];
            if (resolvePipelineDefaultAssigneeUserIds(pipeline).length && !staff.length) {
              pendingAssigneeProcessIdRef.current = processId;
            }
          } else if (
            shouldApplyPipelineDefaultAssignee(
              initialData?.assignee,
              prev.assigneeValues,
              defaultAssigneeName,
            )
          ) {
            const defaultAssignees = resolvePipelineDefaultAssigneeNames(pipeline, staff);
            if (defaultAssignees.length) assigneeValues = defaultAssignees;
          }
        }
        return {
          ...prev,
          processId,
          stageId,
          contactId: nextContactId,
          contactName: nextContactName,
          assigneeValues,
          clientName: isOrganizationScoped ? displayClientName : displayClientName || prev.clientName,
        };
      });
    },
    [
      pipelineKind,
      linkedEntityName,
      contactName,
      contactId,
      initialData?.contactId,
      initialData?.assignee,
      displayClientName,
      isOrganizationScoped,
      defaultAssigneeName,
    ],
  );

  useEffect(() => {
    if (!isOpen) {
      setContacts([]);
      return;
    }
    const settingsClientId = pipelineClientId || clientId;
    if (!settingsClientId || !apiBase) return;

    let cancelled = false;

    if (clientPipelinesProp !== undefined) {
      setClientPipelines(clientPipelinesProp);
    }
    if (candidatePipelinesProp !== undefined) {
      setCandidatePipelines(candidatePipelinesProp);
    }

    const contactsQuery = (() => {
      if (contactsOrganizationId) {
        return `?organizationId=${encodeURIComponent(contactsOrganizationId)}`;
      }
      if (contactsOrganizationTmpId) {
        return `?organizationTmpId=${encodeURIComponent(contactsOrganizationTmpId)}`;
      }
      return '';
    })();

    const loadContacts = (): Promise<ContactOption[]> => {
      if (pipelineKind === 'candidate') return Promise.resolve([] as ContactOption[]);
      if (restrictContactsToOrganization && !contactsQuery) {
        return Promise.resolve([] as ContactOption[]);
      }
      return fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts${contactsQuery}`, {
            credentials: 'include',
            headers: authHeaders(),
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
              const list = Array.isArray(data) ? data : data?.data ?? [];
              return list
                .map((c: { id?: string; name?: string }) => ({
                  id: String(c.id || ''),
                  name: String(c.name || '').trim(),
                }))
                .filter((c: ContactOption) => c.id && c.name)
                .sort((a, b) =>
                  a.name.localeCompare(b.name, 'he', { sensitivity: 'base' }),
                );
            })
            .catch(() => [] as ContactOption[]);
    };

    const loadStaffAssignees = (): Promise<ContactOption[]> =>
      fetchStaffUsers(staffClientId)
        .then((rows) =>
          rows
            .filter((u) => u.isActive !== false)
            .map((u) => ({
              id: String(u.id || ''),
              name: String(u.name || u.email || '').trim(),
            }))
            .filter((u) => u.id && u.name),
        )
        .catch(() => [] as ContactOption[]);

    setLoadingMeta(true);
    setError(null);

    const pipelinesPromise = Promise.all([
      fetchPipelines(settingsClientId).catch(
        () => (clientPipelinesProp !== undefined ? clientPipelinesProp : []) as PipelineDto[],
      ),
      fetchCandidatePipelines(settingsClientId).catch(
        () =>
          (candidatePipelinesProp !== undefined ? candidatePipelinesProp : []) as PipelineDto[],
      ),
    ]).then(([client, candidate]) => ({ client, candidate }));

    Promise.all([pipelinesPromise, loadContacts(), loadStaffAssignees()])
      .then(([pipelineGroups, cts, staff]) => {
        if (cancelled) return;
        const client = pipelineGroups.client;
        const candidate = pipelineGroups.candidate;
        setClientPipelines(client);
        setCandidatePipelines(candidate);
        setContacts(cts);
        setStaffAssigneeUsers(staff);
        applyPipelineDefaults(client, candidate, cts, staff);
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    clientId,
    organizationId,
    organizationTmpId,
    contactsOrganizationId,
    contactsOrganizationTmpId,
    restrictContactsToOrganization,
    apiBase,
    pipelineKind,
    pipelineClientId,
    staffClientId,
    clientPipelinesProp,
    candidatePipelinesProp,
    applyPipelineDefaults,
  ]);

  const allPipelines = useMemo<PipelineWithKind[]>(
    () => [
      ...candidatePipelines.map((p) => ({ ...p, kind: 'candidate' as const })),
      ...clientPipelines.map((p) => ({ ...p, kind: 'client' as const })),
    ],
    [clientPipelines, candidatePipelines],
  );

  useEffect(() => {
    const pendingProcessId = pendingAssigneeProcessIdRef.current;
    if (!isOpen || !pendingProcessId || !staffAssigneeUsers.length) {
      return;
    }
    const pipeline = allPipelines.find((p) => p.id === pendingProcessId);
    if (!pipeline || pipeline.kind !== pipelineKind) {
      pendingAssigneeProcessIdRef.current = null;
      return;
    }
    if (!resolvePipelineDefaultAssigneeUserIds(pipeline).length) {
      pendingAssigneeProcessIdRef.current = null;
      return;
    }
    const names = assigneesForPipeline(pipeline);
    pendingAssigneeProcessIdRef.current = null;
    setFormData((prev) =>
      prev.processId !== pendingProcessId ? prev : { ...prev, assigneeValues: names },
    );
  }, [
    isOpen,
    pipelineKind,
    staffAssigneeUsers,
    allPipelines,
    assigneesForPipeline,
  ]);

  if (!isOpen) return null;

  const activePipeline =
    allPipelines.find((p) => p.id === formData.processId) || allPipelines[0];
  const stages = activePipeline?.stages || [];

  const applyStageSlaDefaults = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return {};
    return {
      slaValue: stage.slaLimit ?? 0,
      slaUnit: normalizeSlaUnit(stage.slaLimitUnit),
    };
  };

  const slaUnit = normalizeSlaUnit(formData.slaUnit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    const pipeline = allPipelines.find((p) => p.id === formData.processId);
    const stage = stages.find((s) => s.id === formData.stageId) || stages[0];
    setSaving(true);
    setError(null);
    try {
      const saveResult = await onSave({
        title: formData.title.trim(),
        processId: pipeline?.id || formData.processId,
        processName: pipeline?.name || '',
        stageId: stage?.id || formData.stageId,
        stageName: stage?.name || '',
        contactId: formData.contactId || null,
        contactName: formData.contactName,
        clientName: formData.clientName || displayClientName,
        assignee: formatAssigneeList(formData.assigneeValues) || defaultAssigneeName,
        priority: formData.priority,
        slaValue: formData.slaValue,
        slaUnit,
        description: formData.description,
      });
      if (saveResult !== false) onClose();
    } catch (err) {
      setError((err as Error)?.message || 'שגיאה בשמירת האירוע');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[10080] flex items-center justify-center p-4 sm:p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card w-full max-w-[900px] max-h-[90vh] rounded-3xl shadow-2xl border border-border-default overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border-default/50 relative flex-shrink-0">
          <h3 className="font-black text-xl text-text-default text-center w-full">יצירת אירוע תהליכי חדש</h3>
          <button
            type="button"
            onClick={onClose}
            className="absolute left-6 p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form onSubmit={(e) => void handleSubmit(e)} className="p-6 sm:p-8 flex flex-col h-full">
            {error ? (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}
            {loadingMeta ? (
              <div className="text-center text-text-muted py-6">טוען תהליכים ואנשי קשר...</div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
              <div className="lg:col-span-7 space-y-5 order-2 lg:order-1">
                <div>
                  <label className="block text-sm font-bold text-text-default mb-2">כותרת האירוע</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm"
                    placeholder="למשל: תיאום פגישת היכרות..."
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">תהליך</label>
                    <select
                      value={formData.processId}
                      onChange={(e) => {
                        const newProcess = e.target.value;
                        const newPipeline = allPipelines.find((p) => p.id === newProcess);
                        const nextStageId = newPipeline?.stages?.[0]?.id || '';
                        const nextStages = newPipeline?.stages || [];
                        const stage = nextStages.find((s) => s.id === nextStageId);
                        let nextAssigneeValues = formData.assigneeValues;
                        if (newPipeline?.kind === pipelineKind) {
                          const pipelineDefaultIds = resolvePipelineDefaultAssigneeUserIds(
                            newPipeline,
                          );
                          if (pipelineDefaultIds.length && !staffAssigneeUsers.length) {
                            pendingAssigneeProcessIdRef.current = newProcess;
                          } else {
                            pendingAssigneeProcessIdRef.current = null;
                          }
                          nextAssigneeValues = assigneesForPipeline(newPipeline);
                        }
                        setFormData({
                          ...formData,
                          processId: newProcess,
                          stageId: nextStageId,
                          assigneeValues: nextAssigneeValues,
                          slaValue: stage?.slaLimit ?? formData.slaValue,
                          slaUnit: normalizeSlaUnit(stage?.slaLimitUnit ?? formData.slaUnit),
                        });
                      }}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                      disabled={!allPipelines.length}
                    >
                      {allPipelines.length === 0 ? (
                        <option value="">אין תהליכים מוגדרים</option>
                      ) : (
                        allPipelines.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">סטטוס (שלב)</label>
                    <select
                      value={formData.stageId}
                      onChange={(e) => {
                        const nextStageId = e.target.value;
                        setFormData({
                          ...formData,
                          stageId: nextStageId,
                          ...applyStageSlaDefaults(nextStageId),
                        });
                      }}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                      disabled={!stages.length}
                    >
                      {stages.length === 0 ? (
                        <option value="">אין שלבים</option>
                      ) : (
                        stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">חברה/לקוח</label>
                    <input
                      type="text"
                      value={formData.clientName}
                      readOnly
                      className="w-full bg-bg-subtle border border-border-default rounded-xl p-3.5 text-sm text-text-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">
                      {pipelineKind === 'candidate' ? linkedEntityLabel : 'איש קשר'}
                    </label>
                    {pipelineKind === 'candidate' ? (
                      <input
                        type="text"
                        value={formData.contactName || linkedEntityName}
                        readOnly
                        className="w-full bg-bg-subtle border border-border-default rounded-xl p-3.5 text-sm text-text-muted"
                      />
                    ) : (
                      <select
                        value={formData.contactId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const match = contacts.find((c) => c.id === id);
                          setFormData({
                            ...formData,
                            contactId: id,
                            contactName: match?.name || '',
                          });
                        }}
                        className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                      >
                        <option value="">-- בחר איש קשר --</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <FormMultiSelect
                      label="לטיפול"
                      options={assigneeOptions.map((name) => ({ value: name, label: name }))}
                      value={formData.assigneeValues}
                      onChange={(assigneeValues) => setFormData({ ...formData, assigneeValues })}
                      placeholder="בחר אנשים לטיפול"
                      searchable
                      searchPlaceholder="חיפוש שם…"
                      dropdownClassName="right-0 left-auto w-max min-w-[18rem] sm:min-w-[22rem] max-w-[min(28rem,calc(100vw-2rem))]"
                      className="[&>span]:text-sm [&>span]:font-bold [&>span]:text-text-default [&>span]:mb-2 [&>div]:rounded-xl [&>div]:p-3.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">דחיפות</label>
                    <select
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: e.target.value as 'high' | 'medium' | 'low',
                        })
                      }
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                    >
                      <option value="high">גבוהה (דחוף)</option>
                      <option value="medium">בינונית (רגיל)</option>
                      <option value="low">נמוכה (רקע)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">
                      {slaFieldLabel(slaUnit)}
                    </label>
                    <SlaDurationInput
                      value={formData.slaValue}
                      unit={slaUnit}
                      onValueChange={(slaValue) => setFormData({ ...formData, slaValue })}
                      onUnitChange={(nextUnit) => setFormData({ ...formData, slaUnit: nextUnit })}
                      className="bg-bg-input border-border-default rounded-xl p-3.5 shadow-sm"
                      inputClassName="text-start px-2"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col order-1 lg:order-2 min-h-[200px]">
                <label className="block text-sm font-bold text-text-default mb-2">תיאור והערות</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="flex-1 w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm resize-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm min-h-[250px]"
                  placeholder="פרטים נוספים לגבי האירוע התהליכי..."
                />
              </div>
            </div>

            <div className="flex justify-center gap-4 pt-6 mt-8 border-t border-border-default/50">
              <button
                type="submit"
                disabled={saving || !formData.title.trim()}
                className="w-full max-w-[200px] bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-md disabled:opacity-50 text-base"
              >
                {saving ? 'שומר...' : 'פתח אירוע'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full max-w-[200px] py-3.5 px-6 font-bold text-text-default hover:bg-bg-subtle rounded-xl transition-all border border-transparent hover:border-border-default text-base"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProcessEventModal;
