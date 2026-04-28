
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { 
    PlusIcon, ClockIcon, UserIcon, PencilIcon, SparklesIcon, TrashIcon, 
    CalendarIcon, TableCellsIcon, Squares2X2Icon, ChatBubbleBottomCenterTextIcon,
    LinkIcon, Cog6ToothIcon, EllipsisVerticalIcon, BriefcaseIcon, BuildingOffice2Icon,
    UserGroupIcon, ChevronDownIcon
} from './Icons';
import EventFormModal from './EventFormModal';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { fetchEventTypes, filterEventTypesForContext, LEGACY_MANUAL_EVENT_TYPE_NAMES } from '../services/eventTypesApi';
import { eventTypeChipClasses, normalizeEventTypes } from '../utils/eventTypeChips';
import { hebrewDescriptionChangeLine, hebrewLinkedListChangeLine } from '../utils/eventHistoryText';
import {
  mergeJournalAndAudit,
  filterAuditByDateRange,
  sortMergedByColumn,
  type MergedRow,
} from '../utils/mergeJournalAndAudit';
import { fetchAuditLogsByEntity, type AuditLogEntry } from '../services/auditLogsApi';

// --- TYPES ---
interface HistoryEntry {
  user: string;
  timestamp: string;
  summary: string;
}

export type EventType = string;
export type EventStatus = 'עתידי' | 'הושלם' | 'בוטל';
export interface Event {
  id: string | number;
  /** One or more types tagged on this event. Always normalized to string[] on read. */
  type: EventType[];
  date: string;
  coordinator: string;
  /** Staff user UUID when the event was created/updated by a logged-in user. */
  coordinatorUserId?: string;
  status: EventStatus;
  linkedTo: { type: string; name: string }[];
  description: string;
  notes?: string;
  history?: HistoryEntry[];
}

export const normalizeCandidateEventRow = (row: Record<string, unknown>): Event => {
  let linked: { type: string; name: string }[] = [];
  const raw = row.linkedTo;
  if (Array.isArray(raw)) {
    linked = raw as { type: string; name: string }[];
  } else if (raw && typeof raw === 'object' && raw !== null && 'name' in (raw as object)) {
    linked = [raw as { type: string; name: string }];
  }
  const types = normalizeEventTypes(row.type);
  const base: Event = {
    id: row.id as string | number,
    type: types.length ? types : ['פגישה'],
    date: String(row.date || new Date().toISOString()),
    coordinator: String(row.coordinator || 'מערכת'),
    status: (row.status as EventStatus) || 'עתידי',
    linkedTo: linked,
    description: String(row.description || ''),
    notes: row.notes != null ? String(row.notes) : undefined,
    history: Array.isArray(row.history) ? (row.history as HistoryEntry[]) : [],
  };
  if (row.coordinatorUserId != null && String(row.coordinatorUserId).trim() !== '') {
    base.coordinatorUserId = String(row.coordinatorUserId);
  }
  return base;
};

const getEventFetchHeaders = (withJson: boolean): Record<string, string> => {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (withJson) h['Content-Type'] = 'application/json';
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
};

type EventsFilterMultiselectProps = {
    options: string[];
    value: string[];
    onChange: (next: string[]) => void;
    triggerId: string;
};

const EventsFilterMultiselect: React.FC<EventsFilterMultiselectProps> = ({
    options,
    value,
    onChange,
    triggerId,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const summary =
        value.length === 0 ? 'הכל' : value.length === 1 ? value[0] : `${value.length} נבחרו`;

    const toggle = (opt: string) => {
        if (value.includes(opt)) {
            onChange(value.filter((x) => x !== opt));
        } else {
            onChange([...value, opt]);
        }
    };

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                id={triggerId}
                onClick={() => setOpen((o) => !o)}
                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm text-right flex items-center justify-between gap-2 min-h-[38px] focus:ring-2 focus:ring-primary-500/20 outline-none cursor-pointer"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <span className="truncate flex-1 min-w-0">{summary}</span>
                <ChevronDownIcon
                    className={`w-4 h-4 flex-shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <div
                    className="absolute z-40 mt-1 w-full min-w-0 max-h-48 overflow-y-auto bg-bg-card border border-border-default rounded-lg shadow-lg py-1.5"
                    role="listbox"
                    dir="rtl"
                >
                    {options.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-text-muted">אין אפשרויות</div>
                    ) : (
                        options.map((opt) => (
                            <label
                                key={opt}
                                className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-hover"
                            >
                                <input
                                    type="checkbox"
                                    checked={value.includes(opt)}
                                    onChange={() => toggle(opt)}
                                    className="rounded border-border-default text-primary-600 focus:ring-primary-500/30 shrink-0"
                                />
                                <span className="flex-1 min-w-0 truncate">{opt}</span>
                            </label>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

const eventStatusStyles: { [key in EventStatus]: { bg: string; text: string; } } = {
  'עתידי': { bg: 'bg-secondary-100', text: 'text-secondary-800' },
  'הושלם': { bg: 'bg-accent-100', text: 'text-accent-800' },
  'בוטל': { bg: 'bg-red-100', text: 'text-red-800' },
};

function formatRelativeTime(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return 'ממש עכשיו';
    if (minutes < 60) return `לפני ${minutes} דקות`;
    if (hours < 24) return `לפני ${hours} שעות`;
    if (days === 1) return 'אתמול';
    if (days < 7) return `לפני ${days} ימים`;
    
    return new Date(dateString).toLocaleDateString('he-IL');
}

interface EventsViewProps {
    candidateId?: string;
    candidateName?: string;
    events?: Event[];
    setEvents?: React.Dispatch<React.SetStateAction<Event[]>>;
}

const EventsView: React.FC<EventsViewProps> = ({
    candidateId,
    candidateName = '',
}) => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const clientIdForCandidate = user?.clientId && String(user.clientId).trim() ? String(user.clientId) : '';
    const actorDisplayName =
        (user?.name && String(user.name).trim()) ||
        (user?.email && String(user.email).trim()) ||
        'משתמש';
    const resolvedCandidateId =
        candidateId && String(candidateId).trim() && String(candidateId) !== 'undefined'
            ? String(candidateId)
            : '';
    const hasPersistedCandidate = Boolean(resolvedCandidateId);
    const [remoteEvents, setRemoteEvents] = useState<Event[]>([]);
    const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);
    const [entityAuditItems, setEntityAuditItems] = useState<AuditLogEntry[]>([]);
    const [candidateEventTypeNames, setCandidateEventTypeNames] = useState<string[]>([]);
    const [clientStaffCoordinatorLabels, setClientStaffCoordinatorLabels] = useState<string[]>([]);

    const events = hasPersistedCandidate ? remoteEvents : [];
    const setEvents = setRemoteEvents;

    /** Staff of the current tenant (same client the candidate is managed under for logged-in recruiters). */
    useEffect(() => {
        if (!apiBase || !clientIdForCandidate || !hasPersistedCandidate) {
            setClientStaffCoordinatorLabels([]);
            return;
        }
        let cancelled = false;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = { Accept: 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        fetch(
            `${apiBase}/api/clients/${encodeURIComponent(clientIdForCandidate)}/staff-users`,
            { credentials: 'include', headers, cache: 'no-store' },
        )
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => {
                if (cancelled) return;
                const list: string[] = [];
                const seen = new Set<string>();
                for (const row of Array.isArray(rows) ? rows : []) {
                    const r = row as { name?: string; email?: string; isActive?: boolean };
                    if (r.isActive === false) continue;
                    const label = String(r.name || '').trim() || String(r.email || '').trim();
                    if (label && !seen.has(label)) {
                        seen.add(label);
                        list.push(label);
                    }
                }
                setClientStaffCoordinatorLabels(list);
            })
            .catch(() => {
                if (!cancelled) setClientStaffCoordinatorLabels([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, clientIdForCandidate, hasPersistedCandidate]);

    const coordinatorOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const c of clientStaffCoordinatorLabels) {
            if (c && !seen.has(c)) {
                seen.add(c);
                out.push(c);
            }
        }
        for (const e of events) {
            const c = e.coordinator;
            if (c && !seen.has(c)) {
                seen.add(c);
                out.push(c);
            }
        }
        return out;
    }, [clientStaffCoordinatorLabels, events]);

    const eventTypeFilterOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const n of candidateEventTypeNames) {
            if (n && !seen.has(n)) {
                seen.add(n);
                out.push(n);
            }
        }
        for (const n of LEGACY_MANUAL_EVENT_TYPE_NAMES) {
            if (!seen.has(n)) {
                seen.add(n);
                out.push(n);
            }
        }
        for (const e of events) {
            for (const t of e.type) {
                if (t && !seen.has(t)) {
                    seen.add(t);
                    out.push(t);
                }
            }
        }
        return out;
    }, [candidateEventTypeNames, events]);

    const eventTypeMultiOptions = useMemo(
        () => eventTypeFilterOptions.filter((o) => o !== 'הכל'),
        [eventTypeFilterOptions],
    );
    const coordinatorMultiOptions = useMemo(
        () => coordinatorOptions.filter((o) => o !== 'הכל'),
        [coordinatorOptions],
    );

    const [filters, setFilters] = useState({
        eventType: [] as string[],
        coordinator: [] as string[],
        fromDate: '',
        toDate: '',
    });
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [historyVisibleEventId, setHistoryVisibleEventId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    // Column configuration using translations
    const allColumns = useMemo(() => [
        { id: 'type', header: t('events_view.col_type') },
        { id: 'title', header: t('events_view.col_title') },
        { id: 'date', header: t('events_view.col_date') },
        { id: 'coordinator', header: t('events_view.col_coordinator') },
        { id: 'status', header: t('events_view.col_status') },
        { id: 'linkedTo', header: t('events_view.col_linkedTo') },
    ], [t]);
    
    const defaultVisibleColumns = useMemo(() => allColumns.map(c => c.id), [allColumns]);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    // Update visible columns if language changes
    useEffect(() => {
        setVisibleColumns(prev => {
             // Keep IDs, just re-render to update labels via allColumns which is a dependency
             return prev; 
        });
    }, [t]);

    useEffect(() => {
        if (!apiBase || !hasPersistedCandidate) {
            setCandidateEventTypeNames([]);
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        let cancelled = false;
        fetchEventTypes(apiBase, token)
            .then((rows) => {
                if (cancelled) return;
                const names = filterEventTypesForContext(rows, 'candidate')
                    .map((r) => r.name)
                    .filter((n) => n.trim() !== '');
                setCandidateEventTypeNames(names);
            })
            .catch(() => {
                if (!cancelled) setCandidateEventTypeNames([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, hasPersistedCandidate]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };
    
    const getIconForEventType = (type: string, user: string) => {
        if (user === 'Hiro AI') return <SparklesIcon className="w-5 h-5" />;
        switch (type) {
            case 'candidate_status':
            case 'candidate_add':
                return <UserIcon className="w-5 h-5" />;
            case 'job_edit':
                return <PencilIcon className="w-5 h-5" />;
            case 'note':
                return <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />;
            case 'system':
            default:
                return <ClockIcon className="w-5 h-5" />;
        }
    };

    const getEventColor = (type: string) => {
        switch (type) {
            case 'candidate_status': return 'bg-blue-100 text-blue-600 border-blue-200';
            case 'job_edit': return 'bg-orange-100 text-orange-600 border-orange-200';
            case 'note': return 'bg-yellow-100 text-yellow-600 border-yellow-200';
            case 'system': return 'bg-gray-100 text-gray-600 border-gray-200';
            default: return 'bg-primary-100 text-primary-600 border-primary-200';
        }
    };


    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const eventIdStr = (id: string | number) => String(id);

    const handleCreateEvent = () => {
        setEditingEvent(null);
        setIsModalOpen(true);
    };

    const handleEditEvent = (event: Event) => {
        setEditingEvent(event);
        setIsModalOpen(true);
        setOpenMenuId(null);
    };

    const handleDeleteEvent = (eventId: string | number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את האירוע?')) {
            const key = eventIdStr(eventId);
            setEvents(events.filter((e) => eventIdStr(e.id) !== key));
            if (hasPersistedCandidate && apiBase) {
                void fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
                    headers: getEventFetchHeaders(false),
                }).catch(() => null);
            }
        }
        setOpenMenuId(null);
    };

    const handleSaveEvent = async (eventData: Omit<Event, 'id' | 'status'> & { id?: string | number }) => {
        if (!hasPersistedCandidate) {
            setIsModalOpen(false);
            return;
        }

        const defaultLinked = (): { type: string; name: string }[] => {
            if (eventData.linkedTo && eventData.linkedTo.length > 0) return eventData.linkedTo;
            const name = candidateName.trim() || 'מועמד';
            return [{ type: 'מועמד', name }];
        };

        if (apiBase) {
            if (eventData.id != null) {
                const idKey = eventIdStr(eventData.id);
                const oldEvent = events.find((e) => eventIdStr(e.id) === idKey);
                const changes: string[] = [];
                const oldTypeKey = (oldEvent?.type ?? []).join(' / ');
                const newTypeKey = (eventData.type ?? []).join(' / ');
                if (oldEvent && oldTypeKey !== newTypeKey) {
                    changes.push(`שינה את סוג האירוע מ-"${oldTypeKey}" ל-"${newTypeKey}"`);
                }
                if (oldEvent) {
                    const oldDateStr = new Date(oldEvent.date).toLocaleString('he-IL');
                    const newDateStr = new Date(eventData.date).toLocaleString('he-IL');
                    if (oldDateStr !== newDateStr) {
                        changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                    }
                    if (oldEvent.description !== eventData.description) {
                        changes.push(hebrewDescriptionChangeLine(oldEvent.description, eventData.description || ''));
                    }
                    const linkLine = hebrewLinkedListChangeLine(oldEvent.linkedTo, eventData.linkedTo ?? []);
                    if (linkLine) changes.push(linkLine);
                }
                const ts = new Date().toISOString();
                const newHistoryEntries: HistoryEntry[] = changes.map((summary) => ({
                    user: actorDisplayName,
                    timestamp: ts,
                    summary,
                }));
                const updatedHistory =
                    newHistoryEntries.length > 0 ? [...newHistoryEntries, ...(oldEvent?.history || [])] : oldEvent?.history || [];

                const res = await fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events/${encodeURIComponent(idKey)}`, {
                    method: 'PUT',
                    headers: getEventFetchHeaders(true),
                    body: JSON.stringify({
                        type: eventData.type,
                        date: eventData.date,
                        description: eventData.description || '',
                        linkedTo: eventData.linkedTo,
                        history: updatedHistory,
                        status: oldEvent?.status ?? 'עתידי',
                    }),
                });
                if (res.ok) {
                    const updated = normalizeCandidateEventRow((await res.json()) as Record<string, unknown>);
                    setEvents(events.map((e) => (eventIdStr(e.id) === idKey ? updated : e)));
                }
            } else {
                const res = await fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events`, {
                    method: 'POST',
                    headers: getEventFetchHeaders(true),
                    body: JSON.stringify({
                        type: eventData.type,
                        date: eventData.date,
                        description: eventData.description || '',
                        status: 'עתידי',
                        linkedTo: defaultLinked(),
                        history: [
                            { user: actorDisplayName, timestamp: new Date().toISOString(), summary: 'יצר את האירוע' },
                        ],
                    }),
                });
                if (res.ok) {
                    const created = normalizeCandidateEventRow((await res.json()) as Record<string, unknown>);
                    setEvents([created, ...events]);
                }
            }
            setIsModalOpen(false);
            return;
        }

        if (eventData.id != null) {
            const idKey = eventIdStr(eventData.id);
            setEvents(
                events.map((e) => {
                    if (eventIdStr(e.id) !== idKey) return e;
                    const oldEvent = e;
                    const changes: string[] = [];
                    const oldTypeKey = (oldEvent.type ?? []).join(' / ');
                    const newTypeKey = (eventData.type ?? []).join(' / ');
                    if (oldTypeKey !== newTypeKey) {
                        changes.push(`שינה את סוג האירוע מ-"${oldTypeKey}" ל-"${newTypeKey}"`);
                    }
                    const oldDateStr = new Date(oldEvent.date).toLocaleString('he-IL');
                    const newDateStr = new Date(eventData.date).toLocaleString('he-IL');
                    if (oldDateStr !== newDateStr) {
                        changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                    }
                    if (oldEvent.description !== eventData.description) {
                        changes.push(hebrewDescriptionChangeLine(oldEvent.description, eventData.description || ''));
                    }
                    const linkLine = hebrewLinkedListChangeLine(oldEvent.linkedTo, eventData.linkedTo ?? []);
                    if (linkLine) changes.push(linkLine);

                    const ts2 = new Date().toISOString();
                    const newHistoryEntries2: HistoryEntry[] = changes.map((summary) => ({
                        user: actorDisplayName,
                        timestamp: ts2,
                        summary,
                    }));
                    const updatedHistory =
                        newHistoryEntries2.length > 0
                            ? [...newHistoryEntries2, ...(oldEvent.history || [])]
                            : oldEvent.history;

                    return { ...oldEvent, ...eventData, coordinator: actorDisplayName, history: updatedHistory } as Event;
                }),
            );
        } else {
            const newEvent: Event = {
                id: Date.now(),
                type: eventData.type,
                date: eventData.date,
                description: eventData.description || '',
                coordinator: actorDisplayName,
                status: 'עתידי',
                linkedTo: defaultLinked(),
                history: [{ user: actorDisplayName, timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }],
            };
            setEvents([newEvent, ...events]);
        }
        setIsModalOpen(false);
    };

    useEffect(() => {
        if (!hasPersistedCandidate || !apiBase) return;
        let active = true;
        setIsLoadingEvents(true);
        setEventsLoadError(null);
        fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events`, {
            headers: getEventFetchHeaders(false),
            cache: 'no-store',
        })
            .then((r) => {
                if (!r.ok) throw new Error('load');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : [];
                setRemoteEvents(list.map((row) => normalizeCandidateEventRow(row as Record<string, unknown>)));
            })
            .catch(() => {
                if (!active) return;
                setEventsLoadError(t('events_view.load_error'));
                setRemoteEvents([]);
            })
            .finally(() => {
                if (active) setIsLoadingEvents(false);
            });
        return () => {
            active = false;
        };
    }, [hasPersistedCandidate, apiBase, resolvedCandidateId, t]);

    useEffect(() => {
        if (!apiBase || !hasPersistedCandidate || !resolvedCandidateId) {
            setEntityAuditItems([]);
            return;
        }
        let cancelled = false;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetchAuditLogsByEntity(apiBase, token, 'candidate', resolvedCandidateId, { page: 1, pageSize: 500 })
            .then((r) => {
                if (!cancelled) setEntityAuditItems(r.items);
            })
            .catch(() => {
                if (!cancelled) setEntityAuditItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, hasPersistedCandidate, resolvedCandidateId]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenuId(null);
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setIsSettingsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const sortedAndFilteredEvents = useMemo(() => {
        let filtered = events.filter(event => {
            const eventDate = new Date(event.date);
            const fromDate = filters.fromDate ? new Date(filters.fromDate) : null;
            const toDate = filters.toDate ? new Date(filters.toDate) : null;

            if (fromDate && eventDate < fromDate) return false;
            if (toDate && eventDate > toDate) return false;
            if (filters.coordinator.length > 0 && !filters.coordinator.includes(event.coordinator)) {
                return false;
            }
            if (
                filters.eventType.length > 0 &&
                !(event.type || []).some((t) => filters.eventType.includes(t))
            ) {
                return false;
            }
            return true;
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                const pick = (ev: Event, key: string) =>
                    key === 'title'
                        ? (ev.description || ev.type)
                        : (ev as unknown as Record<string, unknown>)[key];
                const aVal = String(pick(a, sortConfig.key) ?? '');
                const bVal = String(pick(b, sortConfig.key) ?? '');
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [events, filters, sortConfig]);

    const getMergedSortValue = useCallback((row: MergedRow<Event>, columnKey: string): string => {
        if (row.kind === 'audit') {
            const e = row.entry;
            switch (columnKey) {
                case 'type':
                    return `ביקורת ${e.action}`;
                case 'title':
                    return e.description;
                case 'date':
                    return e.timestamp;
                case 'coordinator':
                    return e.user.name || e.user.email || '';
                case 'status':
                    return e.level;
                case 'linkedTo':
                    return '';
                default:
                    return '';
            }
        }
        const ev = row.event;
        switch (columnKey) {
            case 'type':
                return (ev.type || []).join(' ');
            case 'title':
                return String(ev.description || '');
            case 'date':
                return ev.date;
            case 'coordinator':
                return ev.coordinator || '';
            case 'status':
                return ev.status || '';
            case 'linkedTo':
                return (ev.linkedTo || []).map((l) => `${l.type}:${l.name}`).join(' ');
            default:
                return '';
        }
    }, []);

    const displayedRows = useMemo(() => {
        const auditFiltered = filterAuditByDateRange(entityAuditItems, filters.fromDate, filters.toDate);
        const merged = mergeJournalAndAudit(
            sortedAndFilteredEvents,
            (e) => new Date(e.date).getTime(),
            auditFiltered,
        );
        if (!sortConfig) return merged;
        return sortMergedByColumn(merged, sortConfig.key, sortConfig.direction, getMergedSortValue);
    }, [
        sortedAndFilteredEvents,
        entityAuditItems,
        filters.fromDate,
        filters.toDate,
        sortConfig,
        getMergedSortValue,
    ]);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };

    const handleDragStart = (index: number, colId: string) => { dragItemIndex.current = index; setDraggingColumn(colId); };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };
    const handleDragEnd = () => { dragItemIndex.current = null; setDraggingColumn(null); };

    const getLinkIcon = (type: string) => {
        switch(type) {
            case 'משרה': return <BriefcaseIcon className="w-3.5 h-3.5" />;
            case 'לקוח': return <BuildingOffice2Icon className="w-3.5 h-3.5" />;
            case 'מועמד': return <UserIcon className="w-3.5 h-3.5" />;
            case 'צוות': return <UserGroupIcon className="w-3.5 h-3.5" />;
            default: return <LinkIcon className="w-3.5 h-3.5" />;
        }
    };

    const renderCell = (event: Event, columnId: string, isMobile: boolean = false, isExpanded: boolean = false) => {
        switch (columnId) {
            case 'type': {
                const types = event.type || [];
                if (types.length === 0) return null;
                return (
                    <div className="flex flex-wrap gap-1">
                        {types.map((t) => {
                            const chip = eventTypeChipClasses(t);
                            return (
                                <span
                                    key={t}
                                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${chip.bg} ${chip.text}`}
                                >
                                    {t}
                                </span>
                            );
                        })}
                    </div>
                );
            }
            case 'title':
                return (
                    <span className={`font-semibold text-text-default ${isMobile || !isExpanded ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}>
                        {event.description || (event.type || []).join(' / ')}
                    </span>
                );
            case 'date': return <span className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-text-subtle"/> {new Date(event.date).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
            case 'status': return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>;
            case 'linkedTo': 
                if (!event.linkedTo || event.linkedTo.length === 0) return <span className="text-text-subtle">-</span>;
                return (
                    <div className="flex flex-wrap items-center gap-2">
                        {event.linkedTo.map((link, idx) => (
                            <a key={idx} href="#" onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-primary-600 bg-primary-50 px-2 py-1 flex-row-reverse border border-primary-100 rounded-md hover:bg-primary-100 hover:border-primary-200 transition-colors text-xs">
                                {getLinkIcon(link.type)}
                                {link.name}
                            </a>
                        ))}
                    </div>
                );
            default: return (event as any)[columnId] || '-';
        }
    };

    const auditActionHe: Record<string, string> = {
        create: 'יצירה',
        update: 'עדכון',
        delete: 'מחיקה',
        login: 'התחברות',
        export: 'ייצוא',
        system: 'מערכת',
    };

    const renderAuditCell = (entry: AuditLogEntry, columnId: string) => {
        switch (columnId) {
            case 'type':
                return (
                    <div className="flex flex-wrap gap-1">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            יומן ביקורת
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            {auditActionHe[entry.action] || entry.action}
                        </span>
                    </div>
                );
            case 'title':
                return (
                    <span className="font-semibold text-text-default line-clamp-2 break-words">
                        {entry.description || '—'}
                    </span>
                );
            case 'date':
                return (
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-text-subtle" />
                        {new Date(entry.timestamp).toLocaleString('he-IL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                );
            case 'coordinator':
                return <span>{entry.user.name || entry.user.email || '—'}</span>;
            case 'status':
                return (
                    <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                            entry.level === 'error' || entry.level === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : entry.level === 'warning'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                        }`}
                    >
                        {entry.level}
                    </span>
                );
            case 'linkedTo':
                return <span className="text-text-subtle">—</span>;
            default:
                return '—';
        }
    };

    const mergeRowKey = (row: MergedRow<Event>) =>
        row.kind === 'journal' ? eventIdStr(row.event.id) : `audit:${row.entry.id}`;

    const toggleMergedRow = (row: MergedRow<Event>) => {
        const key = mergeRowKey(row);
        setExpandedRowId((prev) => {
            if (prev === key) {
                setHistoryVisibleEventId(null);
                return null;
            }
            setHistoryVisibleEventId(null);
            return key;
        });
    };

    if (!hasPersistedCandidate) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 border border-border-default">
                <div className="text-center py-16 text-text-muted">{t('events_view.need_save_candidate')}</div>
            </div>
        );
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 border border-border-default">
            {eventsLoadError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-3 py-2">{eventsLoadError}</div>
            )}
            {isLoadingEvents && (
                <div className="text-xs text-text-subtle mb-2">{t('events_view.loading')}</div>
            )}
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="p-4 bg-bg-subtle rounded-xl border border-border-default w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label htmlFor="filter-event-type" className="block text-xs font-semibold text-text-muted mb-1">
                                {t('job_events.filter_type')}
                            </label>
                            <EventsFilterMultiselect
                                triggerId="filter-event-type"
                                options={eventTypeMultiOptions}
                                value={filters.eventType}
                                onChange={(eventType) => setFilters((prev) => ({ ...prev, eventType }))}
                            />
                        </div>
                        <div>
                            <label htmlFor="filter-coordinator" className="block text-xs font-semibold text-text-muted mb-1">
                                {t('job_events.filter_recruiter')}
                            </label>
                            <EventsFilterMultiselect
                                triggerId="filter-coordinator"
                                options={coordinatorMultiOptions}
                                value={filters.coordinator}
                                onChange={(coordinator) => setFilters((prev) => ({ ...prev, coordinator }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('job_events.filter_from')}</label>
                            <input type="date" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('job_events.filter_to')}</label>
                            <input type="date" name="toDate" value={filters.toDate} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none" />
                        </div>
                        <button onClick={handleCreateEvent} className="w-full bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm flex items-center justify-center gap-2">
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('events_view.create_event')}</span>
                        </button>
                    </div>
                </div>
            </header>
            
            <div className="flex items-center justify-end gap-2 mb-4">
                <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                    <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`} title={t('job_events.view_timeline')}><TableCellsIcon className="w-5 h-5"/></button>
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`} title={t('job_events.view_cards')}><Squares2X2Icon className="w-5 h-5"/></button>
                </div>
            </div>
            
            <main className="flex-1 overflow-y-auto">
            {displayedRows.length > 0 ? (
                viewMode === 'table' ? (
                <div className="overflow-x-auto border border-border-default rounded-lg">
                    <table className="w-full text-sm text-right min-w-[800px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                                {visibleColumns.map((colId, index) => {
                                    const col = allColumns.find(c => c.id === colId);
                                    if (!col) return null;
                                    return (
                                        <th key={col.id} draggable onDragStart={() => handleDragStart(index, col.id)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDrop={handleDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestSort(col.id)} className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingColumn === col.id ? 'dragging' : ''}`}>
                                            <div className="flex items-center gap-1">{col.header} {getSortIndicator(col.id)}</div>
                                        </th>
                                    );
                                })}
                                <th className="p-4 text-center">{t('clients.col_actions')}</th>
                                <th className="p-4 sticky left-0 bg-bg-subtle w-16">
                                     <div className="relative" ref={settingsRef}>
                                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title={t('candidates.customize_columns')} className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                        {isSettingsOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                            <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                            <div className="space-y-2 max-h-60 overflow-y-auto">{allColumns.map(c => (<label key={c.id} className="flex items-center gap-2 text-sm font-normal text-text-default"><input type="checkbox" checked={visibleColumns.includes(c.id)} onChange={() => handleColumnToggle(c.id)} className="w-4 h-4 text-primary-600" />{c.header}</label>))}</div>
                                        </div>
                                        )}
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {displayedRows.map((row) => {
                            const rKey = mergeRowKey(row);
                            const isExpanded = expandedRowId === rKey;
                            if (row.kind === 'audit') {
                                const a = row.entry;
                                return (
                                    <React.Fragment key={rKey}>
                                        <tr
                                            onClick={() => toggleMergedRow(row)}
                                            className="hover:bg-bg-hover cursor-pointer group bg-slate-50/50"
                                        >
                                            {visibleColumns.map((colId) => (
                                                <td
                                                    key={colId}
                                                    className="p-4 text-text-muted border-b border-border-subtle group-hover:bg-bg-hover transition-colors"
                                                >
                                                    {renderAuditCell(a, colId)}
                                                </td>
                                            ))}
                                            <td className="p-4 text-center border-b border-border-subtle text-text-subtle text-xs">
                                                ביקורת
                                            </td>
                                            <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16 border-b border-border-subtle" />
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-slate-50/80">
                                                <td
                                                    colSpan={visibleColumns.length + 2}
                                                    className="px-8 py-4 text-sm text-text-muted border-b border-border-subtle"
                                                >
                                                    <p className="font-bold text-text-default mb-1">יומן ביקורת מערכת</p>
                                                    <p>
                                                        <span className="font-bold">תיאור:</span> {a.description || '—'}
                                                    </p>
                                                    <p className="text-xs text-text-subtle mt-2">
                                                        {new Date(a.timestamp).toLocaleString('he-IL')} •{' '}
                                                        {formatRelativeTime(a.timestamp)}
                                                    </p>
                                                    {a.changes && a.changes.length > 0 && (
                                                        <ul className="mt-2 text-xs space-y-1 pr-2 border-r-2 border-border-default">
                                                            {a.changes.map((c, i) => (
                                                                <li key={i}>
                                                                    <span className="font-medium">{c.field}:</span>{' '}
                                                                    {String(c.oldValue ?? '—')} → {String(c.newValue ?? '—')}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            }
                            const event = row.event;
                            const evKey = eventIdStr(event.id);
                            return (
                                <React.Fragment key={evKey}>
                                    <tr onClick={() => toggleMergedRow(row)} className="hover:bg-bg-hover cursor-pointer group">
                                        {visibleColumns.map(colId => (
                                            <td key={colId} className="p-4 text-text-muted border-b border-border-subtle group-hover:bg-bg-hover transition-colors">
                                                {renderCell(event, colId, false, isExpanded)}
                                            </td>
                                        ))}
                                        <td className="p-4 text-center border-b border-border-subtle group-hover:bg-bg-hover transition-colors">
                                            <div onClick={(e) => e.stopPropagation()} className="relative inline-block" ref={openMenuId === evKey ? menuRef : null}>
                                                <button type="button" onClick={() => setOpenMenuId(openMenuId === evKey ? null : evKey)} className="p-2 rounded-full hover:bg-bg-hover text-text-muted"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                                {openMenuId === evKey && (
                                                    <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10 text-right">
                                                        <button type="button" onClick={() => handleEditEvent(event)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> ערוך</button>
                                                        <button type="button" onClick={() => handleDeleteEvent(event.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> מחק</button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16 border-b border-border-subtle" />
                                    </tr>
                                    {isExpanded && (
                                        <tr className="bg-primary-50/20">
                                            <td colSpan={visibleColumns.length + 2} className="px-8 py-4 text-sm text-text-muted border-b border-border-subtle">
                                               
                                                <div className="mt-4">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setHistoryVisibleEventId((prev) => (prev === evKey ? null : evKey)); }}
                                                        className="flex items-center gap-2 text-xs font-semibold hover:text-primary-600"
                                                    >
                                                        <ClockIcon className="w-4 h-4" />
                                                        <span>היסטוריית שינויים</span>
                                                    </button>
                                                    {historyVisibleEventId === evKey && (
                                                        <div className="mt-2 pt-2 border-t space-y-2 text-xs text-text-subtle">
                                                            {event.history && event.history.length > 0 ? (
                                                                event.history.map((entry, index) => (
                                                                    <p key={index} className="flex items-start gap-2 text-start">
                                                                        <span className="font-semibold text-text-muted shrink-0">
                                                                            {entry.user}:
                                                                        </span>
                                                                        <span className="min-w-0">
                                                                            <span className="break-words">{entry.summary}</span>
                                                                            <span className="whitespace-nowrap">
                                                                                {' '}
                                                                                • {formatRelativeTime(entry.timestamp)}
                                                                            </span>
                                                                        </span>
                                                                    </p>
                                                                ))
                                                            ) : (
                                                                <p>אין היסטוריית שינויים.</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayedRows.map((row) => {
                        if (row.kind === 'audit') {
                            const a = row.entry;
                            const rKey = mergeRowKey(row);
                            return (
                                <div
                                    key={rKey}
                                    onClick={() => toggleMergedRow(row)}
                                    className="bg-bg-card rounded-lg shadow-sm border-r-4 border-slate-300 p-4 flex flex-col justify-between cursor-pointer"
                                >
                                    <div>
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800">
                                                יומן ביקורת
                                            </span>
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
                                                {auditActionHe[a.action] || a.action}
                                            </span>
                                        </div>
                                        <p className={`text-[13px] text-text-muted my-3 ${expandedRowId === rKey ? '' : 'line-clamp-3'}`}>
                                            {a.description || '—'}
                                        </p>
                                        <p className="text-xs text-text-muted flex items-center gap-1.5">
                                            <CalendarIcon className="w-4 h-4 text-text-subtle" />
                                            {new Date(a.timestamp).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                                        </p>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-border-default text-xs text-text-muted">
                                        {a.user.name || a.user.email || '—'}
                                    </div>
                                </div>
                            );
                        }
                        const event = row.event;
                        const types = event.type || [];
                        const primaryType = types[0] ?? '';
                        const primaryChip = eventTypeChipClasses(primaryType);
                        return (
                        <div
                            key={eventIdStr(event.id)}
                            onClick={() => toggleMergedRow(row)}
                            className={`bg-bg-card rounded-lg shadow-sm border-r-4 ${primaryChip.border} p-4 flex flex-col justify-between cursor-pointer`}
                        >
                            <div>
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex flex-wrap gap-1">
                                        {types.map((t) => {
                                            const chip = eventTypeChipClasses(t);
                                            return (
                                                <span key={t} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${chip.bg} ${chip.text}`}>
                                                    {t}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>
                                </div>
                                <p className={`text-[13px] text-text-muted my-3 transition-all duration-300 ${expandedRowId === eventIdStr(event.id) ? '' : 'line-clamp-2'}`}>{event.description || types.join(' / ')}</p>
                                
                                {event.linkedTo && event.linkedTo.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {event.linkedTo.map((link, idx) => (
                                            <div key={idx} className="flex items-center gap-1.5 text-primary-600 bg-primary-50 px-2 py-1 rounded-md border border-primary-100 text-[11px] font-medium">
                                                {getLinkIcon(link.type)}
                                                {link.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <p className="text-xs text-text-muted flex items-center gap-1.5"><CalendarIcon className="w-4 h-4 text-text-subtle"/> {new Date(event.date).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
                            </div>
                            <div className="flex justify-between items-center mt-4 pt-3 border-t border-border-default">
                                <span className="text-xs text-text-muted">נוצר ע"י: {event.coordinator}</span>
                                <div className="flex gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); handleEditEvent(event); }} className="p-1.5 rounded-full hover:bg-bg-hover text-text-muted"><PencilIcon className="w-4 h-4"/></button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }} className="p-1.5 rounded-full hover:bg-red-100 text-red-500"><TrashIcon className="w-4 h-4"/></button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
                )
            ) : (
                <div className="text-center py-16 flex flex-col items-center">
                    <CalendarIcon className="w-16 h-16 text-text-subtle mb-4"/>
                    <h3 className="text-xl font-bold text-text-default">{t('job_events.no_events')}</h3>
                    <p className="mt-2 text-text-muted">{t('job_events.try_filters')}</p>
                </div>
            )}
            </main>

            <EventFormModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveEvent}
                event={editingEvent}
                context="candidate"
            />
        </div>
    );
};

export default EventsView;
