
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    PlusIcon, ClockIcon, PencilIcon, TrashIcon,
    CalendarIcon, TableCellsIcon, Squares2X2Icon,
    EllipsisVerticalIcon, Cog6ToothIcon,
} from './Icons';
import { EventsFilterMultiselect } from './EventsFilterMultiselect';
import AddJobEventModal from './AddJobEventModal';
import { useLanguage } from '../context/LanguageContext';
import { eventTypeChipClasses } from '../utils/eventTypeChips';
import { hebrewDescriptionChangeLine, hebrewLinkedListChangeLine } from '../utils/eventHistoryText';
import {
  mergeJournalAndAudit,
  filterAuditByDateRange,
  sortMergedByColumn,
  type MergedRow,
} from '../utils/mergeJournalAndAudit';
import { fetchAuditLogsByEntity, type AuditLogEntry } from '../services/auditLogsApi';

/** Audit type filter — must match multiselect options and audit row rendering. */
const AUDIT_LOG_FILTER_LABEL = 'יומן ביקורת';
const AUDIT_ACTION_HE: Record<string, string> = {
    create: 'יצירה',
    update: 'עדכון',
    delete: 'מחיקה',
    login: 'התחברות',
    export: 'ייצוא',
    system: 'מערכת',
};

const JOB_EVENT_TYPE_LABELS = ['סטטוס מועמד', 'עריכת משרה', 'הערה', 'הוספת מועמד', 'מערכת'];

// --- TYPES ---
export type JobEventStatus = 'עתידי' | 'הושלם' | 'בוטל';

interface JobHistoryEntry {
    user: string;
    timestamp: string;
    summary: string;
}

/** Legacy shape from older saves */
interface LegacyJobHistory {
    updatedBy: string;
    updatedAt: string;
    change: string;
}

/** Job journal row; matches API shape (types as Hebrew labels). */
export interface JobEvent {
    id: string;
    /** Primary Hebrew type label (first of API type[]). */
    type: string;
    user: string;
    description: string;
    timestamp: string;
    status: JobEventStatus;
    history?: (JobHistoryEntry | LegacyJobHistory)[];
    linkedTo?: { type: string; name: string }[];
}

export const mockJobEvents: JobEvent[] = [];

const eventStatusStyles: { [key in JobEventStatus]: { bg: string; text: string } } = {
    עתידי: { bg: 'bg-secondary-100', text: 'text-secondary-800' },
    הושלם: { bg: 'bg-accent-100', text: 'text-accent-800' },
    בוטל: { bg: 'bg-red-100', text: 'text-red-800' },
};

export const getJobEventApiHeaders = (json: boolean): Record<string, string> => {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
};

/** Map GET /api/jobs/:id/events row to UI model */
export const normalizeJobEventFromApi = (row: Record<string, unknown>): JobEvent => {
    const types = Array.isArray(row.type) ? (row.type as string[]).filter(Boolean) : [];
    const primary = types[0] || 'הערה';
    const linked = Array.isArray(row.linkedTo) ? (row.linkedTo as { type: string; name: string }[]) : [];
    return {
        id: String(row.id ?? ''),
        type: primary,
        user: String(row.coordinator || ''),
        description: String(row.description || ''),
        timestamp: String(row.date || new Date().toISOString()),
        status: (row.status as JobEventStatus) || 'עתידי',
        history: Array.isArray(row.history) ? (row.history as JobHistoryEntry[]) : [],
        linkedTo: linked.length ? linked : undefined,
    };
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

const normalizeHistoryEntry = (h: JobHistoryEntry | LegacyJobHistory): JobHistoryEntry => {
    if ('summary' in h && 'user' in h && h.user) {
        return h as JobHistoryEntry;
    }
    const l = h as LegacyJobHistory;
    return { user: l.updatedBy, timestamp: l.updatedAt, summary: l.change };
};

interface JobEventsViewProps {
    /** When set, events are loaded/saved via `GET|POST|PUT|DELETE /api/jobs/:jobId/events`. */
    jobId?: string;
    externalEvents?: JobEvent[];
    onAddEvent?: (event: JobEvent) => void;
    /** Increment to refetch events (e.g. after AI creates an event elsewhere). */
    eventsRefreshKey?: number;
}

const allColumns = [
    { id: 'type', header: 'סוג אירוע' },
    { id: 'title', header: 'תיאור' },
    { id: 'date', header: 'תאריך ושעה' },
    { id: 'coordinator', header: 'נוצר ע"י' },
    { id: 'status', header: 'סטטוס' },
];

const defaultVisibleColumns = allColumns.map((c) => c.id);

const JobEventsView: React.FC<JobEventsViewProps> = ({
    jobId,
    externalEvents,
    onAddEvent,
    eventsRefreshKey = 0,
}) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [localEvents, setLocalEvents] = useState<JobEvent[]>(mockJobEvents);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [entityAuditItems, setEntityAuditItems] = useState<AuditLogEntry[]>([]);
    const [eventSaveSubmitting, setEventSaveSubmitting] = useState(false);

    useEffect(() => {
        if (!jobId || !apiBase) return;
        let cancelled = false;
        setLoadError(null);
        fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/events`, { headers: getJobEventApiHeaders(false) })
            .then((r) => {
                if (!r.ok) throw new Error('load');
                return r.json();
            })
            .then((data: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(data) ? data : [];
                setLocalEvents(list.map((row) => normalizeJobEventFromApi(row as Record<string, unknown>)));
            })
            .catch(() => {
                if (!cancelled) {
                    setLoadError('טעינת האירועים נכשלה');
                    setLocalEvents([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [jobId, apiBase, eventsRefreshKey]);

    useEffect(() => {
        if (!apiBase || !jobId) {
            setEntityAuditItems([]);
            return;
        }
        let cancelled = false;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetchAuditLogsByEntity(apiBase, token, 'job', jobId, { page: 1, pageSize: 500 })
            .then((r) => {
                if (!cancelled) setEntityAuditItems(r.items);
            })
            .catch(() => {
                if (!cancelled) setEntityAuditItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, jobId, eventsRefreshKey]);

    const sourceEvents = jobId ? localEvents : externalEvents !== undefined ? externalEvents : localEvents;
    const jobEvents = sourceEvents.map((e) => ({
        ...e,
        status: e.status || 'עתידי',
    }));

    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [eventFilters, setEventFilters] = useState({
        eventType: [] as string[],
        coordinator: [] as string[],
        fromDate: '',
        toDate: '',
    });

    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<JobEvent | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [historyVisibleEventId, setHistoryVisibleEventId] = useState<string | null>(null);

    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    const coordinatorOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const e of jobEvents) {
            if (e.user && !seen.has(e.user)) {
                seen.add(e.user);
                out.push(e.user);
            }
        }
        return out;
    }, [jobEvents]);

    const eventTypeFilterOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const t of JOB_EVENT_TYPE_LABELS) {
            if (t && !seen.has(t)) {
                seen.add(t);
                out.push(t);
            }
        }
        for (const e of jobEvents) {
            if (e.type && !seen.has(e.type)) {
                seen.add(e.type);
                out.push(e.type);
            }
        }
        if (!seen.has(AUDIT_LOG_FILTER_LABEL)) {
            seen.add(AUDIT_LOG_FILTER_LABEL);
            out.push(AUDIT_LOG_FILTER_LABEL);
        }
        for (const he of Object.values(AUDIT_ACTION_HE)) {
            if (he && !seen.has(he)) {
                seen.add(he);
                out.push(he);
            }
        }
        for (const row of entityAuditItems) {
            const raw = String(row.action || '').trim();
            const he = AUDIT_ACTION_HE[raw] || raw;
            if (he && !seen.has(he)) {
                seen.add(he);
                out.push(he);
            }
        }
        return out;
    }, [jobEvents, entityAuditItems]);

    const eventTypeMultiOptions = useMemo(
        () => eventTypeFilterOptions.filter((o) => o !== 'הכל'),
        [eventTypeFilterOptions],
    );
    const coordinatorMultiOptions = useMemo(
        () => coordinatorOptions.filter((o) => o !== 'הכל'),
        [coordinatorOptions],
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenuId(null);
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setIsSettingsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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

    const handleEventFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEventFilters((prev) => ({ ...prev, [name]: value }));
    };

    const handleOpenCreate = () => {
        setEditingEvent(null);
        setIsEventModalOpen(true);
    };

    const handleOpenEdit = (event: JobEvent) => {
        setEditingEvent(event);
        setIsEventModalOpen(true);
        setOpenMenuId(null);
    };

    const handleSaveEvent = async (eventData: {
        eventType: string;
        notes: string;
        date?: string;
        linkedTo?: { type: string; name: string }[];
    }) => {
        const linkBlock =
            eventData.linkedTo && eventData.linkedTo.length
                ? eventData.linkedTo.map((l) => `${l.type}: ${l.name}`).join('\n')
                : '';
        const fullDescription = [eventData.notes, linkBlock].filter(Boolean).join('\n\n');
        const whenIso = eventData.date || new Date().toISOString();
        const validLinks = eventData.linkedTo?.filter((l) => l.name.trim() !== '') ?? [];

        const newHist = (summary: string): JobHistoryEntry => ({
            user: 'אני',
            timestamp: new Date().toISOString(),
            summary,
        });

        setEventSaveSubmitting(true);
        try {
            if (jobId && apiBase) {
                if (editingEvent) {
                    const oldEvent = editingEvent;
                    const changes: string[] = [];
                    if (oldEvent.type !== eventData.eventType) {
                        changes.push(`שינה את סוג האירוע מ-"${oldEvent.type}" ל-"${eventData.eventType}"`);
                    }
                    if (oldEvent) {
                        const oldDateStr = new Date(oldEvent.timestamp).toLocaleString('he-IL');
                        const newDateStr = new Date(whenIso).toLocaleString('he-IL');
                        if (oldDateStr !== newDateStr) {
                            changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                        }
                        if (oldEvent.description !== fullDescription) {
                            changes.push(hebrewDescriptionChangeLine(oldEvent.description, fullDescription));
                        }
                        const linkLine = hebrewLinkedListChangeLine(
                            oldEvent.linkedTo,
                            validLinks,
                        );
                        if (linkLine) changes.push(linkLine);
                    }
                    const historyTs = new Date().toISOString();
                    const newHistoryBatch: JobHistoryEntry[] = changes.map((summary) => ({
                        user: 'אני',
                        timestamp: historyTs,
                        summary,
                    }));
                    const historyMerged =
                        newHistoryBatch.length > 0
                            ? [...newHistoryBatch, ...(oldEvent.history || []).map(normalizeHistoryEntry)]
                            : (oldEvent.history || []).map(normalizeHistoryEntry);

                    const res = await fetch(
                        `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/events/${encodeURIComponent(editingEvent.id)}`,
                        {
                            method: 'PUT',
                            headers: getJobEventApiHeaders(true),
                            body: JSON.stringify({
                                type: [eventData.eventType],
                                date: whenIso,
                                description: fullDescription,
                                linkedTo: validLinks,
                                status: oldEvent.status || 'עתידי',
                                history: historyMerged,
                            }),
                        },
                    );
                    if (!res.ok) throw new Error('update');
                    const row = (await res.json()) as Record<string, unknown>;
                    const updated = normalizeJobEventFromApi(row);
                    setLocalEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                    onAddEvent?.(updated);
                } else {
                    const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}/events`, {
                        method: 'POST',
                        headers: getJobEventApiHeaders(true),
                        body: JSON.stringify({
                            type: [eventData.eventType],
                            date: whenIso,
                            description: fullDescription,
                            linkedTo: validLinks,
                            status: 'עתידי',
                            history: [newHist('יצר את האירוע')],
                        }),
                    });
                    if (!res.ok) throw new Error('create');
                    const row = (await res.json()) as Record<string, unknown>;
                    const created = normalizeJobEventFromApi(row);
                    setLocalEvents((prev) => [created, ...prev]);
                    onAddEvent?.(created);
                }
            } else if (editingEvent) {
                const oldE = editingEvent;
                const localChanges: string[] = [];
                if (oldE.type !== eventData.eventType) {
                    localChanges.push(`שינה את סוג האירוע מ-"${oldE.type}" ל-"${eventData.eventType}"`);
                }
                const oldD = new Date(oldE.timestamp).toLocaleString('he-IL');
                const newD = new Date(whenIso).toLocaleString('he-IL');
                if (oldD !== newD) {
                    localChanges.push(`שינה את התאריך מ-${oldD} ל-${newD}`);
                }
                if (oldE.description !== fullDescription) {
                    localChanges.push(hebrewDescriptionChangeLine(oldE.description, fullDescription));
                }
                const localLinkLine = hebrewLinkedListChangeLine(oldE.linkedTo, validLinks);
                if (localLinkLine) localChanges.push(localLinkLine);
                const localTs = new Date().toISOString();
                const localBatch: JobHistoryEntry[] =
                    localChanges.length > 0
                        ? localChanges.map((summary) => ({ user: 'אני', timestamp: localTs, summary }))
                        : [{ user: 'אני', timestamp: localTs, summary: 'עריכת תוכן' }];
                const updatedEvent: JobEvent = {
                    ...editingEvent,
                    type: eventData.eventType,
                    description: fullDescription,
                    timestamp: whenIso,
                    status: editingEvent.status || 'עתידי',
                    linkedTo: validLinks.length ? validLinks : undefined,
                    history: [...localBatch, ...(editingEvent.history || []).map(normalizeHistoryEntry)],
                };
                onAddEvent?.(updatedEvent);
                setLocalEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? updatedEvent : e)));
            } else {
                const newEvent: JobEvent = {
                    id: String(Date.now()),
                    type: eventData.eventType,
                    user: 'אני',
                    description: fullDescription,
                    timestamp: whenIso,
                    status: 'עתידי',
                    linkedTo: validLinks.length ? validLinks : undefined,
                    history: [newHist('יצר את האירוע')],
                };
                onAddEvent?.(newEvent);
                setLocalEvents((prev) => [newEvent, ...prev]);
            }
            setIsEventModalOpen(false);
            setEditingEvent(null);
        } catch {
            window.alert('שמירת האירוע נכשלה. נסה שוב.');
        } finally {
            setEventSaveSubmitting(false);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm('האם למחוק אירוע זה?')) {
            return;
        }
        setOpenMenuId(null);
        if (jobId && apiBase) {
            try {
                const res = await fetch(
                    `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/events/${encodeURIComponent(id)}`,
                    { method: 'DELETE', headers: getJobEventApiHeaders(false) },
                );
                if (!res.ok) throw new Error('delete');
                setLocalEvents((prev) => prev.filter((e) => e.id !== id));
            } catch {
                window.alert('מחיקה נכשלה.');
            }
        } else {
            setLocalEvents((prev) => prev.filter((e) => e.id !== id));
        }
    };

    const mergeRowKey = (row: MergedRow<JobEvent>) =>
        row.kind === 'journal' ? row.event.id : `audit:${row.entry.id}`;

    const toggleMergedRow = (row: MergedRow<JobEvent>) => {
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

    const filteredEvents = useMemo(() => {
        return jobEvents.filter((event) => {
            const eventDate = new Date(event.timestamp);
            const fromDate = eventFilters.fromDate ? new Date(eventFilters.fromDate) : null;
            const toDate = eventFilters.toDate ? new Date(eventFilters.toDate) : null;

            if (fromDate && eventDate < fromDate) return false;
            if (toDate && eventDate > toDate) return false;
            if (eventFilters.coordinator.length > 0 && !eventFilters.coordinator.includes(event.user)) {
                return false;
            }
            if (
                eventFilters.eventType.length > 0 &&
                !eventFilters.eventType.includes(event.type)
            ) {
                return false;
            }
            return true;
        });
    }, [jobEvents, eventFilters]);

    const sortedAndFilteredEvents = useMemo(() => {
        let list = [...filteredEvents];
        if (sortConfig !== null) {
            list.sort((a, b) => {
                const pick = (ev: JobEvent, key: string) => {
                    if (key === 'title') return ev.description;
                    if (key === 'date') return ev.timestamp;
                    if (key === 'type') return ev.type;
                    if (key === 'coordinator') return ev.user;
                    if (key === 'status') return ev.status;
                    return (ev as unknown as Record<string, string>)[key];
                };
                const aVal = String(pick(a, sortConfig.key) ?? '');
                const bVal = String(pick(b, sortConfig.key) ?? '');
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return list;
    }, [filteredEvents, sortConfig]);

    const getMergedSortValue = useCallback((row: MergedRow<JobEvent>, columnKey: string): string => {
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
                default:
                    return '';
            }
        }
        const ev = row.event;
        switch (columnKey) {
            case 'type':
                return ev.type || '';
            case 'title':
                return ev.description || '';
            case 'date':
                return ev.timestamp;
            case 'coordinator':
                return ev.user || '';
            case 'status':
                return ev.status || '';
            default:
                return '';
        }
    }, []);

    const displayedRows = useMemo(() => {
        let auditFiltered = jobId
            ? filterAuditByDateRange(entityAuditItems, eventFilters.fromDate, eventFilters.toDate)
            : [];

        if (jobId && eventFilters.coordinator.length > 0) {
            auditFiltered = auditFiltered.filter((e) => {
                const who = String(e.user.name || '').trim() || String(e.user.email || '').trim();
                return who && eventFilters.coordinator.includes(who);
            });
        }

        if (jobId && eventFilters.eventType.length > 0) {
            const sel = new Set(eventFilters.eventType);
            auditFiltered = auditFiltered.filter((entry) => {
                const actionHe = AUDIT_ACTION_HE[entry.action] || entry.action;
                if (sel.has(AUDIT_LOG_FILTER_LABEL)) return true;
                if (sel.has(actionHe)) return true;
                if (entry.action && sel.has(entry.action)) return true;
                return false;
            });
        }

        const merged = mergeJournalAndAudit<JobEvent>(
            sortedAndFilteredEvents,
            (e: JobEvent) => new Date(e.timestamp).getTime(),
            auditFiltered,
        );
        if (!sortConfig) return merged;
        return sortMergedByColumn(merged, sortConfig.key, sortConfig.direction, getMergedSortValue);
    }, [
        sortedAndFilteredEvents,
        entityAuditItems,
        eventFilters.fromDate,
        eventFilters.toDate,
        eventFilters.coordinator,
        eventFilters.eventType,
        jobId,
        sortConfig,
        getMergedSortValue,
    ]);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns((prev) => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter((id) => id !== columnId) : prev;
            }
            const newCols = [...prev, columnId];
            newCols.sort((a, b) => allColumns.findIndex((c) => c.id === a) - allColumns.findIndex((c) => c.id === b));
            return newCols;
        });
    };

    const handleDragStart = (index: number, colId: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };
    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    const renderCell = (event: JobEvent, colId: string, isExpanded: boolean) => {
        const label = event.type || 'הערה';
        const chip = eventTypeChipClasses(label);
        switch (colId) {
            case 'type':
                return (
                    <div className="flex flex-wrap gap-1">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${chip.bg} ${chip.text}`}>
                            {label}
                        </span>
                    </div>
                );
            case 'title':
                return (
                    <span
                        className={`font-semibold text-text-default ${!isExpanded ? 'line-clamp-2' : 'whitespace-pre-wrap'}`}
                    >
                        {event.description || label}
                    </span>
                );
            case 'date':
                return (
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-text-subtle" />
                        {new Date(event.timestamp).toLocaleString('he-IL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </span>
                );
            case 'coordinator':
                return event.user;
            case 'status':
                return (
                    <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status || 'עתידי'].bg} ${eventStatusStyles[event.status || 'עתידי'].text}`}
                    >
                        {event.status || 'עתידי'}
                    </span>
                );
            default:
                return '-';
        }
    };

    const renderAuditCell = (entry: AuditLogEntry, colId: string) => {
        switch (colId) {
            case 'type':
                return (
                    <div className="flex flex-wrap gap-1">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {AUDIT_LOG_FILTER_LABEL}
                        </span>
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            {AUDIT_ACTION_HE[entry.action] || entry.action}
                        </span>
                    </div>
                );
            case 'title':
                return (
                    <span className="font-semibold text-text-default line-clamp-2 break-words">{entry.description || '—'}</span>
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
            default:
                return '—';
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl h-full flex flex-col p-4 sm:p-6 space-y-6">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-text-default">{t('job_events.title')}</h3>
                    <p className="text-sm text-text-muted">{t('job_events.subtitle')}</p>
                    {loadError && (
                        <p className="text-sm text-red-600 mt-1" role="alert">
                            {loadError}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg border border-border-default">
                        <button
                            type="button"
                            onClick={() => setViewMode('table')}
                            title={t('job_events.view_timeline')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                        >
                            <TableCellsIcon className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            title={t('job_events.view_cards')}
                            className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                        >
                            <Squares2X2Icon className="w-5 h-5" />
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                        <PlusIcon className="w-5 h-5" />
                        <span>{t('job_events.add_event')}</span>
                    </button>
                </div>
            </header>

            <div className="p-4 bg-bg-subtle/50 rounded-xl border border-border-default">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label
                            htmlFor="job-events-filter-event-type"
                            className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide"
                        >
                            {t('job_events.filter_type')}
                        </label>
                        <EventsFilterMultiselect
                            triggerId="job-events-filter-event-type"
                            options={eventTypeMultiOptions}
                            value={eventFilters.eventType}
                            onChange={(eventType) => setEventFilters((prev) => ({ ...prev, eventType }))}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="job-events-filter-coordinator"
                            className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide"
                        >
                            {t('job_events.filter_recruiter')}
                        </label>
                        <EventsFilterMultiselect
                            triggerId="job-events-filter-coordinator"
                            options={coordinatorMultiOptions}
                            value={eventFilters.coordinator}
                            onChange={(coordinator) => setEventFilters((prev) => ({ ...prev, coordinator }))}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">
                            {t('job_events.filter_from')}
                        </label>
                        <input
                            type="date"
                            name="fromDate"
                            value={eventFilters.fromDate}
                            onChange={handleEventFilterChange}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">
                            {t('job_events.filter_to')}
                        </label>
                        <input
                            type="date"
                            name="toDate"
                            value={eventFilters.toDate}
                            onChange={handleEventFilterChange}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none"
                        />
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto pr-2 pl-2 custom-scrollbar">
                {displayedRows.length > 0 ? (
                    viewMode === 'table' ? (
                        <div className="overflow-x-auto border border-border-default rounded-lg">
                            <table className="w-full text-sm text-right min-w-[800px]">
                                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                    <tr>
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumns.find((c) => c.id === colId);
                                            if (!col) return null;
                                            return (
                                                <th
                                                    key={col.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id)}
                                                    onDragEnter={() => handleDragEnter(index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDrop={handleDragEnd}
                                                    onDragOver={(e) => e.preventDefault()}
                                                    onClick={() => requestSort(col.id)}
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingColumn === col.id ? 'dragging' : ''}`}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {col.header} {getSortIndicator(col.id)}
                                                    </div>
                                                </th>
                                            );
                                        })}
                                        <th className="p-4 text-center">פעולות</th>
                                        <th className="p-4 sticky left-0 bg-bg-subtle w-16">
                                            <div className="relative" ref={settingsRef}>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                                    title="התאם עמודות"
                                                    className="p-2 hover:bg-bg-hover rounded-full"
                                                >
                                                    <Cog6ToothIcon className="w-5 h-5" />
                                                </button>
                                                {isSettingsOpen && (
                                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                        <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                                            {allColumns.map((c) => (
                                                                <label key={c.id} className="flex items-center gap-2 text-sm font-normal text-text-default">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={visibleColumns.includes(c.id)}
                                                                        onChange={() => handleColumnToggle(c.id)}
                                                                        className="w-4 h-4 text-primary-600"
                                                                    />
                                                                    {c.header}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {displayedRows.map((row) => {
                                        const rKey = mergeRowKey(row);
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
                                                        <td className="p-4 sticky left-0 bg-bg-card w-16 border-b border-border-subtle" />
                                                    </tr>
                                                    {expandedRowId === rKey && (
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
                                        return (
                                            <React.Fragment key={event.id}>
                                                <tr onClick={() => toggleMergedRow(row)} className="hover:bg-bg-hover cursor-pointer group">
                                                    {visibleColumns.map((colId) => (
                                                        <td
                                                            key={colId}
                                                            className="p-4 text-text-muted border-b border-border-subtle group-hover:bg-bg-hover transition-colors"
                                                        >
                                                            {renderCell(event, colId, expandedRowId === event.id)}
                                                        </td>
                                                    ))}
                                                    <td className="p-4 text-center border-b border-border-subtle group-hover:bg-bg-hover transition-colors">
                                                        <div
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="relative inline-block"
                                                            ref={openMenuId === event.id ? menuRef : null}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => setOpenMenuId(openMenuId === event.id ? null : event.id)}
                                                                className="p-2 rounded-full hover:bg-bg-hover text-text-muted"
                                                            >
                                                                <EllipsisVerticalIcon className="w-5 h-5" />
                                                            </button>
                                                            {openMenuId === event.id && (
                                                                <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10 text-right">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleOpenEdit(event)}
                                                                        className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-hover"
                                                                    >
                                                                        <PencilIcon className="w-4 h-4" /> ערוך
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteEvent(event.id)}
                                                                        className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                                                    >
                                                                        <TrashIcon className="w-4 h-4" /> מחק
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16 border-b border-border-subtle" />
                                                </tr>
                                                {expandedRowId === event.id && (
                                                    <tr className="bg-primary-50/20">
                                                        <td colSpan={visibleColumns.length + 2} className="px-8 py-4 text-sm text-text-muted border-b border-border-subtle">
                                                            <div className="mt-4">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setHistoryVisibleEventId((prev) =>
                                                                            prev === event.id ? null : event.id
                                                                        );
                                                                    }}
                                                                    className="flex items-center gap-2 text-xs font-semibold hover:text-primary-600"
                                                                >
                                                                    <ClockIcon className="w-4 h-4" />
                                                                    <span>היסטוריית שינויים</span>
                                                                </button>
                                                                {historyVisibleEventId === event.id && (
                                                                    <div className="mt-2 pt-2 border-t space-y-2 text-xs text-text-subtle">
                                                                        {event.history && event.history.length > 0 ? (
                                                                            event.history.map((h, index) => {
                                                                                const entry = normalizeHistoryEntry(h);
                                                                                return (
                                                                                    <p
                                                                                        key={index}
                                                                                        className="flex items-start gap-2 text-start"
                                                                                    >
                                                                                        <span className="font-semibold text-text-muted shrink-0">
                                                                                            {entry.user}:
                                                                                        </span>
                                                                                        <span className="min-w-0">
                                                                                            <span className="break-words">
                                                                                                {entry.summary}
                                                                                            </span>
                                                                                            <span className="whitespace-nowrap">
                                                                                                {' '}
                                                                                                • {formatRelativeTime(entry.timestamp)}
                                                                                            </span>
                                                                                        </span>
                                                                                    </p>
                                                                                );
                                                                            })
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
                                                        {AUDIT_ACTION_HE[a.action] || a.action}
                                                    </span>
                                                </div>
                                                <p
                                                    className={`text-xs text-text-muted my-2 transition-all duration-300 ${expandedRowId === rKey ? '' : 'line-clamp-2'}`}
                                                >
                                                    {a.description || '—'}
                                                </p>
                                                <p className="text-xs text-text-muted flex items-center gap-1.5">
                                                    <CalendarIcon className="w-4 h-4 text-text-subtle" />
                                                    {new Date(a.timestamp).toLocaleString('he-IL', {
                                                        dateStyle: 'short',
                                                        timeStyle: 'short',
                                                    })}
                                                </p>
                                            </div>
                                            <div className="mt-3 pt-3 border-t border-border-default text-xs text-text-muted">
                                                {a.user.name || a.user.email || '—'}
                                            </div>
                                        </div>
                                    );
                                }
                                const event = row.event;
                                const label = event.type || 'הערה';
                                const primaryChip = eventTypeChipClasses(label);
                                return (
                                    <div
                                        key={event.id}
                                        onClick={() => toggleMergedRow(row)}
                                        className={`bg-bg-card rounded-lg shadow-sm border-r-4 ${primaryChip.border} p-4 flex flex-col justify-between cursor-pointer`}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex flex-wrap gap-1">
                                                    <span
                                                        className={`text-xs font-semibold px-2.5 py-1 rounded-full ${primaryChip.bg} ${primaryChip.text}`}
                                                    >
                                                        {label}
                                                    </span>
                                                </div>
                                                <span
                                                    className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${eventStatusStyles[event.status || 'עתידי'].bg} ${eventStatusStyles[event.status || 'עתידי'].text}`}
                                                >
                                                    {event.status || 'עתידי'}
                                                </span>
                                            </div>
                                            <p
                                                className={`text-xs text-text-muted my-2 transition-all duration-300 ${expandedRowId === event.id ? '' : 'line-clamp-2'}`}
                                            >
                                                {event.description}
                                            </p>
                                            <p className="text-xs text-text-muted flex items-center gap-1.5">
                                                <CalendarIcon className="w-4 h-4 text-text-subtle" />
                                                {new Date(event.timestamp).toLocaleString('he-IL', {
                                                    dateStyle: 'short',
                                                    timeStyle: 'short',
                                                })}
                                            </p>
                                        </div>
                                        <div className="flex justify-between items-center mt-4 pt-3 border-t border-border-default">
                                            <span className="text-xs text-text-muted">נוצר ע&quot;י: {event.user}</span>
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenEdit(event);
                                                    }}
                                                    className="p-1.5 rounded-full hover:bg-bg-hover text-text-muted"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteEvent(event.id);
                                                    }}
                                                    className="p-1.5 rounded-full hover:bg-red-100 text-red-500"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    <div className="text-center py-16 flex flex-col items-center">
                        <CalendarIcon className="w-16 h-16 text-text-subtle mb-4" />
                        <h3 className="text-xl font-bold text-text-default">{t('job_events.no_events')}</h3>
                        <p className="mt-2 text-text-muted">{t('job_events.try_filters')}</p>
                    </div>
                )}
            </main>

            <AddJobEventModal
                isOpen={isEventModalOpen}
                onClose={() => setIsEventModalOpen(false)}
                onSave={handleSaveEvent}
                isSubmitting={eventSaveSubmitting}
                eventToEdit={
                    editingEvent
                        ? {
                              id: editingEvent.id,
                              type: editingEvent.type,
                              description: editingEvent.description,
                              date: editingEvent.timestamp,
                          }
                        : null
                }
            />
        </div>
    );
};

export default JobEventsView;
