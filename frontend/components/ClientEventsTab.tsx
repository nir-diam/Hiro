import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, EllipsisVerticalIcon, CalendarIcon, LinkIcon, Squares2X2Icon, TableCellsIcon, TrashIcon, PencilIcon, ClockIcon, Cog6ToothIcon } from './Icons';
import EventFormModal from './EventFormModal';

// --- TYPES ---
interface HistoryEntry {
  user: string;
  timestamp: string;
  summary: string;
}

export type EventType = 'ראיון' | 'פגישה' | 'תזכורת' | 'משימת מערכת';
export type EventStatus = 'עתידי' | 'הושלם' | 'בוטל';
export interface Event {
  id: number;
  type: EventType;
  title: string;
  date: string;
  coordinator: string;
  status: EventStatus;
  linkedTo: { type: string; name: string } | null;
  description: string;
  history?: HistoryEntry[];
}

// --- MOCK DATA ---
const initialClientEventsData: Event[] = [
    { id: 101, type: 'פגישה', title: 'פגישת היכרות עם מנהל גיוס חדש', date: '2025-08-10T11:00:00', coordinator: 'אביב לוי', status: 'הושלם', linkedTo: { type: 'לקוח', name: 'גטר גרופ' }, description: 'פגישה עם ישראל ישראלי, המנהל החדש.', history: [
        { user: 'אביב לוי', timestamp: '2025-08-10T11:00:00', summary: 'יצר את האירוע' }
    ]},
    { id: 102, type: 'תזכורת', title: 'לשלוח סיכום פגישה', date: '2025-08-10T14:00:00', coordinator: 'אביב לוי', status: 'הושלם', linkedTo: null, description: 'לשלוח לאבי לוי את סיכום הפגישה עם גטר גרופ.', history: [
        { user: 'אביב לוי', timestamp: '2025-08-10T14:00:00', summary: 'יצר את האירוע' }
    ]},
    { id: 103, type: 'פגישה', title: 'פגישת סטטוס רבעונית', date: '2025-09-22T10:00:00', coordinator: 'אביב לוי', status: 'עתידי', linkedTo: { type: 'לקוח', name: 'גטר גרופ' }, description: 'סקירת הפעילות ברבעון Q3 ותכנון Q4.', history: [
        { user: 'אביב לוי', timestamp: '2025-09-20T15:00:00', summary: 'יצר את האירוע' }
    ]},
    {
        id: 104,
        type: 'משימת מערכת',
        title: 'בדיקת חוזה התקשרות שנתי',
        date: '2025-09-25T12:00:00',
        coordinator: 'דנה כהן',
        status: 'עתידי',
        linkedTo: null,
        description: 'לוודא שכל הסעיפים החדשים נכללים בחוזה לפני שליחה לחתימה.',
        history: [ { user: 'דנה כהן', timestamp: '2025-09-23T10:00:00', summary: 'יצר את האירוע' } ]
    },
    {
        id: 105,
        type: 'פגישה',
        title: 'פגישת תכנון גיוס למשרות חדשות',
        date: '2025-10-05T15:00:00',
        coordinator: 'אביב לוי',
        status: 'עתידי',
        linkedTo: { type: 'לקוח', name: 'גטר גרופ' },
        description: 'פגישה עם ישראל ישראלי לדון במשרות החדשות שנפתחו בתחום הלוגיסטיקה.',
        history: [ { user: 'אביב לוי', timestamp: '2025-09-28T11:00:00', summary: 'יצר את האירוע' } ]
    },
    {
        id: 106,
        type: 'משימת מערכת',
        title: 'עדכון פרטי איש קשר',
        date: '2025-08-11T16:00:00',
        coordinator: 'מערכת',
        status: 'הושלם',
        linkedTo: null,
        description: 'פרטי הקשר של דנה כהן עודכנו במערכת.',
         history: [ { user: 'מערכת', timestamp: '2025-08-11T16:00:00', summary: 'אירוע אוטומטי' } ]
    }
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

const allColumns = [
    { id: 'type', header: 'סוג אירוע' },
    { id: 'title', header: 'תיאור' },
    { id: 'date', header: 'תאריך ושעה' },
    { id: 'coordinator', header: 'נוצר ע"י' },
    { id: 'status', header: 'סטטוס' },
];

const defaultVisibleColumns = allColumns.map(c => c.id);

const eventTypeOptions = ['הכל', 'פגישה', 'ראיון', 'תזכורת', 'משימת מערכת'];
const coordinatorOptions = ['הכל', 'דנה כהן', 'אביב לוי', 'יעל שחר', 'אני', 'מערכת'];


const ClientEventsTab: React.FC = () => {
    const [events, setEvents] = useState<Event[]>(initialClientEventsData);
    const [filters, setFilters] = useState({
        eventType: 'הכל',
        coordinator: 'הכל',
        fromDate: '',
        toDate: '',
    });
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [historyVisibleEventId, setHistoryVisibleEventId] = useState<number | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

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

    const toggleRow = (id: number) => {
        setExpandedRowId(prevId => (prevId === id ? null : id));
        if (expandedRowId !== id) {
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

    const handleDeleteEvent = (eventId: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את האירוע?')) {
            setEvents(events.filter(e => e.id !== eventId));
        }
        setOpenMenuId(null);
    };

     const handleSaveEvent = (eventData: Omit<Event, 'id' | 'status' | 'linkedTo'> & { id?: number }) => {
        if (eventData.id) {
            setEvents(events.map(e => {
                if (e.id === eventData.id) {
                    const oldEvent = e;
                    const changes: string[] = [];
                    if (oldEvent.title !== eventData.title) changes.push(`שינה את הכותרת מ-"${oldEvent.title}" ל-"${eventData.title}"`);
                    if (oldEvent.type !== eventData.type) changes.push(`שינה את סוג האירוע מ-"${oldEvent.type}" ל-"${eventData.type}"`);
                    const oldDateStr = new Date(oldEvent.date).toLocaleString('he-IL');
                    const newDateStr = new Date(eventData.date).toLocaleString('he-IL');
                    if (oldDateStr !== newDateStr) changes.push(`שינה את התאריך מ-${oldDateStr} ל-${newDateStr}`);
                    if (oldEvent.description !== eventData.description) changes.push('עדכן את התיאור');
                    
                    const newHistoryEntry = changes.length > 0 ? { user: 'אני', timestamp: new Date().toISOString(), summary: changes.join(', ') } : null;
                    const updatedHistory = newHistoryEntry ? [newHistoryEntry, ...(oldEvent.history || [])] : oldEvent.history;

                    return { ...oldEvent, ...eventData, coordinator: 'אני', history: updatedHistory } as Event;
                }
                return e;
            }));
        } else {
            const newEvent: Event = {
                id: Date.now(),
                title: eventData.title,
                type: eventData.type,
                date: eventData.date,
                description: eventData.description || '',
                coordinator: 'אני', 
                status: 'עתידי',
                linkedTo: { type: 'לקוח', name: 'גטר גרופ' },
                history: [{ user: 'אני', timestamp: new Date().toISOString(), summary: 'יצר את האירוע' }]
            };
            setEvents([newEvent, ...events]);
        }
        setIsModalOpen(false);
    };
    
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
            if (filters.coordinator !== 'הכל' && event.coordinator !== filters.coordinator) return false; // use event.coordinator
            if (filters.eventType !== 'הכל' && event.type !== filters.eventType) return false;
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
            case 'type': return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventTypeStyles[event.type].bg} ${eventTypeStyles[event.type].text}`}>{event.type}</span>;
            case 'title': return <span className="font-semibold text-text-default">{event.title}</span>;
            case 'date': return <span className="flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-text-subtle"/> {new Date(event.date).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>;
            case 'status': return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>;
            default: return (event as any)[columnId] || '-';
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                <div className="p-4 bg-bg-subtle rounded-xl border border-border-default w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">סוג אירוע</label>
                            <select name="eventType" value={filters.eventType} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm">{eventTypeOptions.map(opt => <option key={opt}>{opt}</option>)}</select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">רכז</label>
                            <select name="coordinator" value={filters.coordinator} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm">{coordinatorOptions.map(opt => <option key={opt}>{opt}</option>)}</select>
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
            {sortedAndFilteredEvents.length > 0 ? (
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
                        {sortedAndFilteredEvents.map(event => (
                            <React.Fragment key={event.id}>
                                <tr onClick={() => toggleRow(event.id)} className="hover:bg-bg-hover cursor-pointer group">
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
                                        <p><span className="font-bold">תיאור מלא:</span> {event.description || "אין תיאור זמין."}</p>
                                        <div className="mt-4"><button onClick={(e) => { e.stopPropagation(); setHistoryVisibleEventId(prev => prev === event.id ? null : event.id); }} className="flex items-center gap-2 text-xs font-semibold hover:text-primary-600"><ClockIcon className="w-4 h-4" /><span>היסטוריית שינויים</span></button>
                                            {historyVisibleEventId === event.id && (<div className="mt-2 pt-2 border-t space-y-2 text-xs text-text-subtle">{event.history?.map((entry, index) => (<p key={index} className="flex items-start gap-2"><span className="font-semibold text-text-muted">{entry.user}:</span><span>{entry.summary}</span><span className="flex-shrink-0">&bull; {formatRelativeTime(entry.timestamp)}</span></p>)) || <p>אין היסטוריית שינויים.</p>}</div>)}
                                        </div>
                                    </td></tr>
                                )}
                            </React.Fragment>
                        ))}
                        </tbody>
                    </table>
                </div>
                ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedAndFilteredEvents.map(event => (
                        <div key={event.id} onClick={() => toggleRow(event.id)} className={`bg-bg-card rounded-lg shadow-sm border-r-4 ${eventTypeStyles[event.type].border} p-4 flex flex-col justify-between cursor-pointer`}>
                            <div>
                                <div className="flex justify-between items-start">
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventTypeStyles[event.type].bg} ${eventTypeStyles[event.type].text}`}>{event.type}</span>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${eventStatusStyles[event.status].bg} ${eventStatusStyles[event.status].text}`}>{event.status}</span>
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
                    ))}
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
                onSave={handleSaveEvent}
                event={editingEvent}
                context="client"
            />
        </div>
    );
};

export default ClientEventsTab;