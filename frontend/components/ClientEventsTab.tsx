import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, EllipsisVerticalIcon, CalendarIcon, LinkIcon, Squares2X2Icon, TableCellsIcon, TrashIcon, PencilIcon, ClockIcon, Cog6ToothIcon } from './Icons';
import EventFormModal, { type Event as EventFormEvent } from './EventFormModal';
import { EventsFilterMultiselect } from './EventsFilterMultiselect';
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

const AUDIT_LOG_FILTER_LABEL = 'יומן ביקורת';
const AUDIT_ACTION_HE: Record<string, string> = {
    create: 'יצירה',
    update: 'עדכון',
    delete: 'מחיקה',
    login: 'התחברות',
    export: 'ייצוא',
    system: 'מערכת',
};

// --- TYPES ---
interface HistoryEntry {
  user: string;
  timestamp: string;
  summary: string;
}

export type EventType = string;
export type EventStatus = 'עתידי' | 'הושלם' | 'בוטל';
export interface Event {
  id: string;
  /** One or more types tagged on this event. Always normalized to string[] on read. */
  type: EventType[];
  title: string;
  date: string;
  coordinator: string;
  status: EventStatus;
  linkedTo: { type: string; name: string } | null;
  description: string;
  history?: HistoryEntry[];
}

interface ClientEventsTabProps {
    clientId: string;
    clientName: string;
}

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

const allColumns = [
    { id: 'type', header: 'סוג אירוע' },
    { id: 'title', header: 'תיאור' },
    { id: 'date', header: 'תאריך ושעה' },
    { id: 'coordinator', header: 'נוצר ע"י' },
    { id: 'status', header: 'סטטוס' },
];

const defaultVisibleColumns = allColumns.map(c => c.id);

const normalizeEvent = (row: any): Event => ({
    id: String(row.id),
    type: normalizeEventTypes(row.type),
    title: row.title,
    date: row.date,
    coordinator: row.coordinator,
    status: row.status,
    linkedTo: row.linkedTo ?? null,
    description: row.description || '',
    history: Array.isArray(row.history) ? row.history : [],
});

const ClientEventsTab: React.FC<ClientEventsTabProps> = ({ clientId, clientName }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [events, setEvents] = useState<Event[]>([]);
    const [entityAuditItems, setEntityAuditItems] = useState<AuditLogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [clientEventTypeNames, setClientEventTypeNames] = useState<string[]>([]);
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
    
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    const eventTypeFilterOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const n of clientEventTypeNames) {
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
            for (const t of e.type || []) {
                if (t && !seen.has(t)) {
                    seen.add(t);
                    out.push(t);
                }
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
    }, [clientEventTypeNames, events, entityAuditItems]);

    const coordinatorOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const e of events) {
            const c = e.coordinator;
            if (c && !seen.has(c)) {
                seen.add(c);
                out.push(c);
            }
        }
        return out;
    }, [events]);

    const eventTypeMultiOptions = useMemo(
        () => eventTypeFilterOptions.filter((o) => o !== 'הכל'),
        [eventTypeFilterOptions],
    );
    const coordinatorMultiOptions = useMemo(
        () => coordinatorOptions.filter((o) => o !== 'הכל'),
        [coordinatorOptions],
    );

    useEffect(() => {
        if (!apiBase) {
            setClientEventTypeNames([]);
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        let cancelled = false;
        fetchEventTypes(apiBase, token)
            .then((rows) => {
                if (cancelled) return;
                const names = filterEventTypesForContext(rows, 'client')
                    .map((r) => r.name)
                    .filter((n) => n.trim() !== '');
                setClientEventTypeNames(names);
            })
            .catch(() => {
                if (!cancelled) setClientEventTypeNames([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

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

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const mergeRowKey = (row: MergedRow<Event>) =>
        row.kind === 'journal' ? row.event.id : `audit:${row.entry.id}`;

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

    const handleCreateEvent = () => {
        setEditingEvent(null);
        setIsModalOpen(true);
    };

    const handleEditEvent = (event: Event) => {
        setEditingEvent(event);
        setIsModalOpen(true);
        setOpenMenuId(null);
    };

    const handleDeleteEvent = async (eventId: string) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את האירוע?')) {
            setEvents(events.filter(e => e.id !== eventId));
            if (apiBase && clientId) {
                await fetch(`${apiBase}/api/clients/${clientId}/events/${eventId}`, { method: 'DELETE' }).catch(() => null);
            }
        }
        setOpenMenuId(null);
    };

     const handleSaveEvent = async (
        eventData: Omit<Event, 'id' | 'status' | 'linkedTo'> & { id?: string; linkedTo?: { type: string; name: string }[] },
    ) => {
        if (!apiBase || !clientId) return;
        const newLinks = eventData.linkedTo ?? [];
        const newLinkedSingle = newLinks[0] ?? null;

        if (eventData.id) {
            const oldEvent = events.find((e) => e.id === eventData.id);
            const changes: string[] = [];
            if (oldEvent && oldEvent.title !== eventData.title) {
                changes.push(`שינה את הכותרת מ-"${oldEvent.title}" ל-"${eventData.title}"`);
            }
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
                const linkLine = hebrewLinkedListChangeLine(
                    oldEvent.linkedTo ? [oldEvent.linkedTo] : [],
                    newLinks,
                );
                if (linkLine) changes.push(linkLine);
            }
            const ts = new Date().toISOString();
            const newEntries: HistoryEntry[] = changes.map((summary) => ({
                user: 'אני',
                timestamp: ts,
                summary,
            }));
            const updatedHistory =
                newEntries.length > 0 ? [...newEntries, ...(oldEvent?.history || [])] : oldEvent?.history || [];

            const payload = {
                title: eventData.title,
                type: eventData.type,
                date: eventData.date,
                description: eventData.description || '',
                coordinator: 'אני',
                status: oldEvent?.status ?? 'עתידי',
                linkedTo: newLinkedSingle,
                history: updatedHistory,
            };
            const res = await fetch(`${apiBase}/api/clients/${clientId}/events/${eventData.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const updated = normalizeEvent(await res.json());
                setEvents(events.map((e) => (e.id === updated.id ? updated : e)));
            }
        } else {
            const payload = {
                title: eventData.title,
                type: eventData.type,
                date: eventData.date,
                description: eventData.description || '',
                coordinator: 'אני',
                status: 'עתידי' as const,
                linkedTo: newLinkedSingle ?? { type: 'לקוח', name: clientName },
                history: [{ user: 'אני', timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }],
            };
            const res = await fetch(`${apiBase}/api/clients/${clientId}/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const created = normalizeEvent(await res.json());
                setEvents([created, ...events]);
            }
        }
        setIsModalOpen(false);
    };

    useEffect(() => {
        if (!apiBase || !clientId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/clients/${clientId}/events`)
            .then(r => { if (!r.ok) throw new Error('Failed to load events'); return r.json(); })
            .then(data => {
                if (!active) return;
                const list = Array.isArray(data) ? data : (data?.data ?? []);
                setEvents(list.map(normalizeEvent));
            })
            .catch((e: any) => { if (!active) return; setError(e?.message || 'Failed to load events'); setEvents([]); })
            .finally(() => { if (active) setIsLoading(false); });
        return () => { active = false; };
    }, [apiBase, clientId]);

    useEffect(() => {
        if (!apiBase || !clientId) {
            setEntityAuditItems([]);
            return;
        }
        let cancelled = false;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetchAuditLogsByEntity(apiBase, token, 'client', clientId, { page: 1, pageSize: 500 })
            .then((r) => {
                if (!cancelled) setEntityAuditItems(r.items);
            })
            .catch(() => {
                if (!cancelled) setEntityAuditItems([]);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, clientId]);
    
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
            const eventDate = new Date(event.date); // Use event.date
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
                const aVal = (a as any)[sortConfig.key];
                const bVal = (b as any)[sortConfig.key];
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
                default:
                    return '';
            }
        }
        const ev = row.event;
        switch (columnKey) {
            case 'type':
                return (ev.type || []).join(' ');
            case 'title':
                return ev.title || '';
            case 'date':
                return ev.date;
            case 'coordinator':
                return ev.coordinator || '';
            case 'status':
                return ev.status || '';
            default:
                return String((ev as unknown as Record<string, unknown>)[columnKey] ?? '');
        }
    }, []);

    const displayedRows = useMemo(() => {
        let auditFiltered = filterAuditByDateRange(entityAuditItems, filters.fromDate, filters.toDate);

        if (filters.coordinator.length > 0) {
            auditFiltered = auditFiltered.filter((e) => {
                const who = String(e.user.name || '').trim() || String(e.user.email || '').trim();
                return who && filters.coordinator.includes(who);
            });
        }

        if (filters.eventType.length > 0) {
            const sel = new Set(filters.eventType);
            auditFiltered = auditFiltered.filter((entry) => {
                const actionHe = AUDIT_ACTION_HE[entry.action] || entry.action;
                if (sel.has(AUDIT_LOG_FILTER_LABEL)) return true;
                if (sel.has(actionHe)) return true;
                if (entry.action && sel.has(entry.action)) return true;
                return false;
            });
        }

        const merged = mergeJournalAndAudit<Event>(
            sortedAndFilteredEvents,
            (e: Event) => new Date(e.date).getTime(),
            auditFiltered,
        );
        if (!sortConfig) return merged;
        return sortMergedByColumn(merged, sortConfig.key, sortConfig.direction, getMergedSortValue);
    }, [
        sortedAndFilteredEvents,
        entityAuditItems,
        filters.fromDate,
        filters.toDate,
        filters.coordinator,
        filters.eventType,
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

    const renderCell = (event: Event, columnId: string) => {
        switch (columnId) {
            case 'type': {
                const types = event.type || [];
                if (types.length === 0) return null;
                return (
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
                );
            }
            case 'title': return <span className="font-semibold text-text-default">{event.title}</span>;
            case 'date': return <span className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-text-subtle"/> {new Date(event.date).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
            case 'status': return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>;
            default: return (event as any)[columnId] || '-';
        }
    };

    const renderAuditCell = (entry: AuditLogEntry, columnId: string) => {
        switch (columnId) {
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
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="p-4 bg-bg-subtle rounded-xl border border-border-default w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label htmlFor="client-events-filter-type" className="block text-xs font-semibold text-text-muted mb-1">
                                סוג אירוע
                            </label>
                            <EventsFilterMultiselect
                                triggerId="client-events-filter-type"
                                options={eventTypeMultiOptions}
                                value={filters.eventType}
                                onChange={(eventType) => setFilters((prev) => ({ ...prev, eventType }))}
                            />
                        </div>
                        <div>
                            <label htmlFor="client-events-filter-coordinator" className="block text-xs font-semibold text-text-muted mb-1">
                                רכז
                            </label>
                            <EventsFilterMultiselect
                                triggerId="client-events-filter-coordinator"
                                options={coordinatorMultiOptions}
                                value={filters.coordinator}
                                onChange={(coordinator) => setFilters((prev) => ({ ...prev, coordinator }))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">מתאריך</label>
                            <input type="date" name="fromDate" value={filters.fromDate} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">עד תאריך</label>
                            <input type="date" name="toDate" value={filters.toDate} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm" />
                        </div>
                        <button onClick={handleCreateEvent} className="w-full bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm flex items-center justify-center gap-2">
                            <PlusIcon className="w-5 h-5"/>
                            <span>הוספת אירוע</span>
                        </button>
                    </div>
                </div>
            </header>
            
            <div className="flex items-center justify-end gap-2 mb-4">
                <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                    <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                    <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
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
                                <th className="p-4 text-center">פעולות</th>
                                <th className="p-4 sticky left-0 bg-bg-subtle w-16">
                                     <div className="relative" ref={settingsRef}>
                                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                        {isSettingsOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
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
                            if (row.kind === 'audit') {
                                const a = row.entry;
                                return (
                                    <React.Fragment key={rKey}>
                                        <tr
                                            onClick={() => toggleMergedRow(row)}
                                            className="hover:bg-bg-hover cursor-pointer group bg-slate-50/50"
                                        >
                                            {visibleColumns.map((colId) => (
                                                <td key={colId} className="p-4 text-text-muted">
                                                    {renderAuditCell(a, colId)}
                                                </td>
                                            ))}
                                            <td className="p-4 text-center text-text-subtle text-xs">ביקורת</td>
                                            <td className="p-4 sticky left-0 bg-bg-card w-16" />
                                        </tr>
                                        {expandedRowId === rKey && (
                                            <tr className="bg-slate-50/80">
                                                <td colSpan={visibleColumns.length + 2} className="px-8 py-4 text-sm text-text-muted">
                                                    <p className="font-bold text-text-default mb-1">יומן ביקורת מערכת</p>
                                                    <p>
                                                        <span className="font-bold">תיאור:</span> {a.description || '—'}
                                                    </p>
                                                    <p className="text-xs text-text-subtle mt-2">
                                                        {new Date(a.timestamp).toLocaleString('he-IL')} • {formatRelativeTime(a.timestamp)}
                                                    </p>
                                                    {a.changes && a.changes.length > 0 && (
                                                        <ul className="mt-2 text-xs space-y-1 pr-2 border-r-2 border-border-default">
                                                            {a.changes.map((c, i) => (
                                                                <li key={i}>
                                                                    <span className="font-medium">{c.field}:</span> {String(c.oldValue ?? '—')} →{' '}
                                                                    {String(c.newValue ?? '—')}
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
                                    {visibleColumns.map(colId => <td key={colId} className="p-4 text-text-muted">{renderCell(event, colId)}</td>)}
                                    <td className="p-4 text-center">
                                        <div onClick={(e) => e.stopPropagation()} className="relative inline-block" ref={openMenuId === event.id ? menuRef : null}>
                                            <button onClick={() => setOpenMenuId(openMenuId === event.id ? null : event.id)} className="p-2 rounded-full hover:bg-bg-hover text-text-muted"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                            {openMenuId === event.id && (
                                                <div className="absolute left-0 mt-2 w-40 bg-bg-card rounded-lg shadow-xl border border-border-default z-10"><button onClick={() => handleEditEvent(event)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/> ערוך</button><button onClick={() => handleDeleteEvent(event.id)} className="w-full text-right flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><TrashIcon className="w-4 h-4"/> מחק</button></div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16"></td>
                                </tr>
                                {expandedRowId === event.id && (
                                    <tr className="bg-primary-50/20"><td colSpan={visibleColumns.length + 2} className="px-8 py-4 text-sm text-text-muted">
                                        <div className="mt-4"><button onClick={(e) => { e.stopPropagation(); setHistoryVisibleEventId(prev => prev === event.id ? null : event.id); }} className="flex items-center gap-2 text-xs font-semibold hover:text-primary-600"><ClockIcon className="w-4 h-4" /><span>היסטוריית שינויים</span></button>
                                            {historyVisibleEventId === event.id && (
                                                <div className="mt-2 pt-2 border-t space-y-2 text-xs text-text-subtle">
                                                    {event.history?.map((entry, index) => (
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
                                                    )) || <p>אין היסטוריית שינויים.</p>}
                                                </div>
                                            )}
                                        </div>
                                    </td></tr>
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
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800">יומן ביקורת</span>
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800">
                                                {AUDIT_ACTION_HE[a.action] || a.action}
                                            </span>
                                        </div>
                                        <p className={`text-xs text-text-muted my-2 ${expandedRowId === rKey ? '' : 'line-clamp-3'}`}>{a.description || '—'}</p>
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
                            key={event.id}
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
                                <h3 className="font-bold text-text-default my-2">{event.title}</h3>
                                <p className={`text-xs text-text-muted mb-2 transition-all duration-300 ${expandedRowId === event.id ? '' : 'line-clamp-2'}`}>{event.description}</p>
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
                    <h3 className="text-xl font-bold text-text-default">אין אירועים להצגה</h3>
                    <p className="mt-2 text-text-muted">נסה לשנות את תנאי החיפוש.</p>
                </div>
            )}
            </main>

            <EventFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={(form) =>
                    void handleSaveEvent({
                        id: form.id as string | undefined,
                        type: form.type,
                        date: form.date,
                        description: form.description,
                        coordinator: form.coordinator,
                        title: form.description,
                        linkedTo: form.linkedTo,
                    })
                }
                event={
                    editingEvent
                        ? ({
                              id: editingEvent.id,
                              type: editingEvent.type,
                              date: editingEvent.date,
                              coordinator: editingEvent.coordinator,
                              status: editingEvent.status,
                              description: editingEvent.description || editingEvent.title || '',
                              linkedTo: editingEvent.linkedTo ? [editingEvent.linkedTo] : [],
                          } satisfies EventFormEvent)
                        : null
                }
                context="client"
            />
        </div>
    );
};

export default ClientEventsTab;