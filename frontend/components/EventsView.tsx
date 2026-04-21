
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    PlusIcon, ClockIcon, UserIcon, PencilIcon, SparklesIcon, TrashIcon, 
    CalendarIcon, TableCellsIcon, Squares2X2Icon, ChatBubbleBottomCenterTextIcon,
    LinkIcon, Cog6ToothIcon, EllipsisVerticalIcon, BriefcaseIcon, BuildingOffice2Icon,
    XMarkIcon, UserGroupIcon
} from './Icons';
import EventFormModal from './EventFormModal';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';

// --- TYPES ---
interface HistoryEntry {
  user: string;
  timestamp: string;
  summary: string;
}

export type EventType = 'ראיון' | 'פגישה' | 'תזכורת' | 'משימת מערכת';
export type EventStatus = 'עתידי' | 'הושלם' | 'בוטל';
export interface Event {
  id: string | number;
  type: EventType;
  date: string;
  coordinator: string;
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
  return {
    id: row.id as string | number,
    type: row.type as EventType,
    date: String(row.date || new Date().toISOString()),
    coordinator: String(row.coordinator || 'מערכת'),
    status: (row.status as EventStatus) || 'עתידי',
    linkedTo: linked,
    description: String(row.description || ''),
    notes: row.notes != null ? String(row.notes) : undefined,
    history: Array.isArray(row.history) ? (row.history as HistoryEntry[]) : [],
  };
};

// --- MOCK DATA ---
export const initialEventsData: Event[] = [
  { id: 1, type: 'ראיון', date: '2025-08-15T10:00:00', coordinator: 'דנה כהן', status: 'עתידי', linkedTo: [{ type: 'מועמד', name: 'גדעון שפירא' }], description: 'ראיון למשרת מפתח Fullstack ב-Wix. לבדוק ניסיון ב-React ו-Node.js.', history: [{ user: 'דנה כהן', timestamp: '2025-08-14T10:00:00', summary: 'יצר את האירוע' }] },
  { id: 2, type: 'פגישה', date: '2025-08-14T16:30:00', coordinator: 'אביב לוי', status: 'הושלם', linkedTo: [{ type: 'צוות', name: 'גיוס טכנולוגי' }], description: 'סקירת מועמדים פתוחים, תכנון משימות לשבוע הבא.', history: [{ user: 'אביב לוי', timestamp: '2025-08-14T16:00:00', summary: 'יצר את האירוע' }] },
  { id: 3, type: 'תזכורת', date: '2025-08-16T09:00:00', coordinator: 'יעל שחר', status: 'עתידי', linkedTo: [{ type: 'מועמד', name: 'יאיר כהן' }], description: 'לשלוח מייל ללקוח לקבלת משוב על הראיון.', history: [{ user: 'יעל שחר', timestamp: '2025-08-15T09:00:00', summary: 'יצר את האירוע' }] },
  { id: 4, type: 'משימת מערכת', date: '2025-08-14T11:22:00', coordinator: 'מערכת', status: 'הושלם', linkedTo: [], description: '3 קורות חיים חדשים למשרת "אנליסט נתונים" נוספו למערכת.', history: [{ user: 'מערכת', timestamp: '2025-08-14T11:22:00', summary: 'אירוע מערכת אוטומטי' }] },
  { id: 5, type: 'ראיון', date: '2025-08-18T14:00:00', coordinator: 'דנה כהן', status: 'עתידי', linkedTo: [{ type: 'מועמד', name: 'שרית לוי' }], description: 'ראיון התאמה תרבותית למשרת מנהל/ת מוצר.', history: [{ user: 'דנה כהן', timestamp: '2025-08-17T14:00:00', summary: 'יצר את האירוע' }] },
];

const eventTypeStyles: { [key in EventType]: { bg: string; text: string; border: string; } } = {
  'ראיון': { bg: 'bg-secondary-100', text: 'text-secondary-800', border: 'border-secondary-500' },
  'פגישה': { bg: 'bg-primary-100', text: 'text-primary-800', border: 'border-primary-500' },
  'תזכורת': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-500' },
  'משימת מערכת': { bg: 'bg-gray-200', text: 'text-gray-800', border: 'border-gray-500' },
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

const eventTypeOptions = ['הכל', 'פגישה', 'ראיון', 'תזכורת', 'משימת מערכת'];
const COORDINATOR_PRESET = ['דנה כהן', 'אביב לוי', 'יעל שחר', 'אני', 'מערכת'];

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
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const resolvedCandidateId =
        candidateId && String(candidateId).trim() && String(candidateId) !== 'undefined'
            ? String(candidateId)
            : '';
    const hasPersistedCandidate = Boolean(resolvedCandidateId);
    const [remoteEvents, setRemoteEvents] = useState<Event[]>([]);
    const [eventsLoadError, setEventsLoadError] = useState<string | null>(null);
    const [isLoadingEvents, setIsLoadingEvents] = useState(false);

    const events = hasPersistedCandidate ? remoteEvents : [];
    const setEvents = setRemoteEvents;

    const coordinatorOptions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = ['הכל'];
        for (const c of COORDINATOR_PRESET) {
            if (!seen.has(c)) {
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
    }, [events]);
    const [filters, setFilters] = useState({
        eventType: 'הכל',
        coordinator: 'הכל',
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

    const toggleRow = (id: string | number) => {
        const key = eventIdStr(id);
        setExpandedRowId((prevId) => (prevId === key ? null : key));
        if (expandedRowId !== key) {
            setHistoryVisibleEventId(null);
        }
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

    const handleDeleteEvent = (eventId: string | number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את האירוע?')) {
            const key = eventIdStr(eventId);
            setEvents(events.filter((e) => eventIdStr(e.id) !== key));
            if (hasPersistedCandidate && apiBase) {
                void fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
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
                if (oldEvent && oldEvent.type !== eventData.type) {
                    changes.push(`שינה את סוג האירוע מ-"${oldEvent.type}" ל-"${eventData.type}"`);
                }
                if (oldEvent) {
                    const oldDateStr = new Date(oldEvent.date).toLocaleString('he-IL');
                    const newDateStr = new Date(eventData.date).toLocaleString('he-IL');
                    if (oldDateStr !== newDateStr) {
                        changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                    }
                    if (oldEvent.description !== eventData.description) changes.push('עדכן את התיאור');
                }
                const newHistoryEntry =
                    changes.length > 0
                        ? { user: 'אני', timestamp: new Date().toISOString(), summary: changes.join(', ') }
                        : null;
                const updatedHistory = newHistoryEntry
                    ? [newHistoryEntry, ...(oldEvent?.history || [])]
                    : oldEvent?.history || [];

                const res = await fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events/${encodeURIComponent(idKey)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: eventData.type,
                        date: eventData.date,
                        description: eventData.description || '',
                        coordinator: 'אני',
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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: eventData.type,
                        date: eventData.date,
                        description: eventData.description || '',
                        coordinator: 'אני',
                        status: 'עתידי',
                        linkedTo: defaultLinked(),
                        history: [{ user: 'אני', timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }],
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
                    if (oldEvent.type !== eventData.type) {
                        changes.push(`שינה את סוג האירוע מ-"${oldEvent.type}" ל-"${eventData.type}"`);
                    }
                    const oldDateStr = new Date(oldEvent.date).toLocaleString('he-IL');
                    const newDateStr = new Date(eventData.date).toLocaleString('he-IL');
                    if (oldDateStr !== newDateStr) {
                        changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                    }
                    if (oldEvent.description !== eventData.description) changes.push('עדכן את התיאור');

                    const newHistoryEntry =
                        changes.length > 0
                            ? { user: 'אני', timestamp: new Date().toISOString(), summary: changes.join(', ') }
                            : null;
                    const updatedHistory = newHistoryEntry
                        ? [newHistoryEntry, ...(oldEvent.history || [])]
                        : oldEvent.history;

                    return { ...oldEvent, ...eventData, coordinator: 'אני', history: updatedHistory } as Event;
                }),
            );
        } else {
            const newEvent: Event = {
                id: Date.now(),
                type: eventData.type,
                date: eventData.date,
                description: eventData.description || '',
                coordinator: 'אני',
                status: 'עתידי',
                linkedTo: defaultLinked(),
                history: [{ user: 'אני', timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }],
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
        fetch(`${apiBase}/api/candidates/${resolvedCandidateId}/events`)
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
            if (filters.coordinator !== 'הכל' && event.coordinator !== filters.coordinator) return false;
            if (filters.eventType !== 'הכל' && event.type !== filters.eventType) return false;
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
            case 'type': return <span className={`text-[10px] sm:text-xs font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-full ${eventTypeStyles[event.type].bg} ${eventTypeStyles[event.type].text} border border-current/10 shadow-sm`}>{event.type}</span>;
            case 'title': 
                return (
                    <div className="flex flex-col gap-0.5 max-w-[400px]">
                         <div className={`text-[13px] text-text-muted leading-relaxed transition-all duration-300 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                             {event.description || event.type}
                         </div>
                    </div>
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
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('job_events.filter_type')}</label>
                            <select name="eventType" value={filters.eventType} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none">
                                {eventTypeOptions.map(opt => <option key={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">{t('job_events.filter_recruiter')}</label>
                            <select name="coordinator" value={filters.coordinator} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none">
                                {coordinatorOptions.map(opt => <option key={opt}>{opt}</option>)}
                            </select>
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
            {sortedAndFilteredEvents.length > 0 ? (
                viewMode === 'table' ? (
                <div className="overflow-x-auto sm:border sm:border-border-default sm:rounded-lg">
                    <table className="w-full text-sm text-right min-w-0 sm:min-w-[800px]">
                        <thead className="hidden sm:table-header-group text-xs text-text-muted uppercase bg-bg-subtle">
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
                        {sortedAndFilteredEvents.map(event => {
                            const evKey = eventIdStr(event.id);
                            const isExpanded = expandedRowId === evKey;
                            return (
                                <React.Fragment key={evKey}>
                                    <tr 
                                        onClick={() => toggleRow(event.id)} 
                                        className={`
                                            hover:bg-bg-hover cursor-pointer transition-all duration-300
                                            flex flex-col sm:table-row p-3 sm:p-0 relative group
                                            ${isExpanded ? 'bg-primary-50/10 sm:border-b-0' : 'border-b border-border-subtle'}
                                        `}
                                    >
                                        <div className="sm:hidden flex items-start justify-between gap-3">
                                            <div className="flex-1 flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    {renderCell(event, 'type')}
                                                    <span className="text-[10px] text-text-muted font-mono">{formatRelativeTime(event.date)}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5 max-w-[400px]">
                                                    <div className={`text-[12px] sm:text-[13px] text-text-muted transition-all duration-300 mt-0.5 ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                                                        {event.description || event.type}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 mt-1 text-text-subtle font-medium">
                                                    <div className="text-[10px] flex items-center gap-1">
                                                        <ClockIcon className="w-3 h-3"/>
                                                        {new Date(event.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className="text-[10px] flex items-center gap-1">
                                                        <UserIcon className="w-3 h-3 opacity-60"/>
                                                        {event.coordinator}
                                                    </div>
                                                    {event.linkedTo && event.linkedTo.length > 0 && (
                                                        <div className="text-[10px] flex items-center flex-wrap gap-x-2 gap-y-1">
                                                            {event.linkedTo.map((link, idx) => (
                                                                <div key={idx} className="text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded flex items-center flex-row-reverse gap-1 border border-primary-100">
                                                                    {getLinkIcon(link.type)}
                                                                    {link.name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-center gap-2">
                                                <div className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text} shadow-sm border border-current/10`}>
                                                    {event.status}
                                                </div>
                                                <div onClick={(e) => e.stopPropagation()} className="relative inline-block" ref={openMenuId === evKey ? menuRef : null}>
                                                    <button type="button" onClick={() => setOpenMenuId(openMenuId === evKey ? null : evKey)} className="p-2 rounded-xl hover:bg-bg-hover text-text-muted transition-colors">
                                                        <EllipsisVerticalIcon className="w-5 h-5"/>
                                                    </button>
                                                    {openMenuId === evKey && (
                                                        <div className="absolute left-0 mt-2 w-44 bg-bg-card rounded-2xl shadow-2xl border border-border-default z-20 animate-in fade-in zoom-in-95 duration-150 p-1 text-right">
                                                            <button type="button" onClick={() => handleEditEvent(event)} className="w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg-hover rounded-xl text-text-default font-semibold">
                                                                <PencilIcon className="w-4 h-4 opacity-70"/> ערוך
                                                            </button>
                                                            <button type="button" onClick={() => { setOpenMenuId(null); setHistoryVisibleEventId(evKey); }} className="w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg-hover rounded-xl text-text-default font-semibold">
                                                                <ClockIcon className="w-4 h-4 opacity-70"/> היסטוריית שינויים
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {visibleColumns.map(colId => (
                                            <td key={colId} className="hidden sm:table-cell p-4 text-text-muted border-b border-border-subtle group-hover:bg-bg-hover transition-colors">
                                                {renderCell(event, colId, false, isExpanded)}
                                            </td>
                                        ))}
                                        <td className="hidden sm:table-cell p-4 text-center border-b border-border-subtle group-hover:bg-bg-hover transition-colors">
                                            <div onClick={(e) => e.stopPropagation()} className="relative inline-block" ref={openMenuId === evKey ? menuRef : null}>
                                                <button type="button" onClick={() => setOpenMenuId(openMenuId === evKey ? null : evKey)} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                                {openMenuId === evKey && (
                                                    <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-44 bg-bg-card rounded-2xl shadow-2xl border border-border-default z-20 animate-in fade-in zoom-in-95 duration-150 p-1 text-right">
                                                        <button type="button" onClick={() => handleEditEvent(event)} className="w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg-hover rounded-xl text-text-default font-semibold"><PencilIcon className="w-4 h-4 opacity-70"/> ערוך</button>
                                                        <button type="button" onClick={() => { setOpenMenuId(null); setHistoryVisibleEventId(evKey); }} className="w-full text-right flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-bg-hover rounded-xl text-text-default font-semibold"><ClockIcon className="w-4 h-4 opacity-70"/> היסטוריית שינויים</button>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16 border-b border-border-subtle transition-colors" />
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedAndFilteredEvents.map(event => (
                        <div key={eventIdStr(event.id)} onClick={() => toggleRow(event.id)} className={`bg-bg-card rounded-lg shadow-sm border-r-4 ${eventTypeStyles[event.type].border} p-4 flex flex-col justify-between cursor-pointer`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventTypeStyles[event.type].bg} ${eventTypeStyles[event.type].text}`}>{event.type}</span>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>
                                </div>
                                <p className={`text-[13px] text-text-muted my-3 transition-all duration-300 ${expandedRowId === eventIdStr(event.id) ? '' : 'line-clamp-2'}`}>{event.description || event.type}</p>
                                
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
                                </div>
                            </div>
                        </div>
                    ))}
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

            {/* History Modal */}
            <AnimatePresence>
                {historyVisibleEventId && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4" 
                        onClick={() => setHistoryVisibleEventId(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, opacity: 0 }} 
                            animate={{ scale: 1, opacity: 1 }} 
                            exit={{ scale: 0.95, opacity: 0 }} 
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-default bg-gray-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                                        <ClockIcon className="w-4 h-4 text-primary-600"/>
                                    </div>
                                    <h3 className="font-bold text-[15px] tracking-tight text-text-default">היסטוריית שינויים</h3>
                                </div>
                                <button onClick={() => setHistoryVisibleEventId(null)} className="p-2 rounded-xl hover:bg-gray-200 text-gray-500 transition-colors">
                                    <XMarkIcon className="w-5 h-5"/>
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto space-y-7 relative">
                                {events.find(e => eventIdStr(e.id) === historyVisibleEventId)?.history?.map((entry, index, arr) => (
                                    <div key={index} className="flex gap-5 relative group">
                                        {index !== arr.length - 1 && <div className="absolute top-7 right-[9px] w-[2px] h-[calc(100%+12px)] bg-gray-100"></div>}
                                        <div className="w-[20px] h-[20px] rounded-full border-[4px] border-primary-500 bg-white shadow-sm mt-0.5 flex-shrink-0 z-10" />
                                        <div className="flex-1 pb-2">
                                            <div className="flex justify-between items-start mb-1.5 leading-none">
                                                <span className="font-extrabold text-[14px] text-text-default">{entry.user}</span>
                                                <span className="text-[12px] text-text-subtle font-semibold whitespace-nowrap ml-2 opacity-80">{formatRelativeTime(entry.timestamp)}</span>
                                            </div>
                                            <p className="text-[13px] text-text-muted leading-relaxed font-medium">{entry.summary}</p>
                                        </div>
                                    </div>
                                ))}
                                {(!events.find(e => eventIdStr(e.id) === historyVisibleEventId)?.history || events.find(e => eventIdStr(e.id) === historyVisibleEventId)?.history?.length === 0) && (
                                    <div className="text-center py-10 flex flex-col items-center">
                                         <ClockIcon className="w-10 h-10 text-gray-300 mb-3" />
                                         <span className="text-gray-500 text-sm font-semibold">אין היסטוריית שינויים.</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

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
