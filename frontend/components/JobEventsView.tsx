
import React, { useState, useMemo } from 'react';
import { 
    PlusIcon, ClockIcon, UserIcon, PencilIcon, SparklesIcon, TrashIcon, 
    CalendarIcon, TableCellsIcon, Squares2X2Icon, ChatBubbleBottomCenterTextIcon 
} from './Icons';
import AddJobEventModal from './AddJobEventModal';

// --- TYPES ---
interface EventHistory {
    updatedBy: string;
    updatedAt: string;
    change: string;
}

export interface JobEvent {
    id: number;
    type: 'note' | 'job_edit' | 'candidate_add' | 'candidate_status' | 'system';
    user: string;
    description: string;
    timestamp: string;
    history?: EventHistory[];
}

// --- MOCK DATA ---
export const mockJobEvents: JobEvent[] = [
    { 
        id: 1, 
        type: 'note', 
        user: 'דנה', 
        description: 'הלקוח ביקש להוסיף דגש על ניסיון בניהול צוותים גדולים. עדכנתי את התיאור בהתאם.', 
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        history: [
            { updatedBy: 'דנה', updatedAt: new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString(), change: 'עריכת תוכן ההערה' }
        ]
    },
    { 
        id: 2, 
        type: 'job_edit', 
        user: 'מערכת', 
        description: 'דרישות המשרה עודכנו על ידי הלקוח. הדרישה לניסיון קודם ב-SAP הוסרה.', 
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() 
    },
    { 
        id: 3, 
        type: 'note', 
        user: 'אביב לוי', 
        description: 'הוסיף הערה: "הלקוח מבקש להאיץ את תהליך הגיוס. נא לתעדף מועמדים עם זמינות מיידית."', 
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() 
    },
    { 
        id: 4, 
        type: 'candidate_add', 
        user: 'מערכת', 
        description: 'נוסף מועמד חדש "מאיה כהן" למשרה ממקור גיוס AllJobs.', 
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString() 
    },
    { 
        id: 5, 
        type: 'candidate_status', 
        user: 'יעל שחר', 
        description: 'שינוי סטטוס למועמד "גדעון שפירא" מ-ראיון ל-הצעת שכר.', 
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() 
    },
];

const eventTypeOptions = ['הכל', 'סטטוס מועמד', 'עריכת משרה', 'הערה', 'הוספת מועמד'];
const coordinatorOptions = ['הכל', 'דנה כהן', 'אביב לוי', 'מערכת', 'אני', 'Hiro AI'];

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

interface JobEventsViewProps {
    externalEvents?: any[];
    onAddEvent?: (event: any) => void;
}

const JobEventsView: React.FC<JobEventsViewProps> = ({ externalEvents, onAddEvent }) => {
    const [localEvents, setLocalEvents] = useState<JobEvent[]>(mockJobEvents);
    const jobEvents = externalEvents || localEvents;
    
    const [viewMode, setViewMode] = useState<'timeline' | 'cards'>('timeline');
    const [eventFilters, setEventFilters] = useState({
        eventType: 'הכל',
        coordinator: 'הכל',
        fromDate: '',
        toDate: '',
    });
    
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<JobEvent | null>(null);
    const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);

    const handleEventFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEventFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenCreate = () => {
        setEditingEvent(null);
        setIsEventModalOpen(true);
    };

    const handleOpenEdit = (event: JobEvent) => {
        setEditingEvent(event);
        setIsEventModalOpen(true);
    };

    const handleSaveEvent = (eventData: { eventType: string, notes: string }) => {
        if (editingEvent) {
            // Update Existing
            const updatedEvent: JobEvent = {
                ...editingEvent,
                type: 'note', // For simplicity in this demo, user edits usually become notes
                description: eventData.notes,
                history: [
                    ...(editingEvent.history || []),
                    { updatedBy: 'אני', updatedAt: new Date().toISOString(), change: 'עריכת תוכן' }
                ]
            };
            
            if (onAddEvent) {
                // External handler
            } else {
                setLocalEvents(prev => prev.map(e => e.id === editingEvent.id ? updatedEvent : e));
            }
        } else {
            // Create New
            const newEvent: JobEvent = {
                id: Date.now(),
                type: 'note',
                user: 'אני',
                description: eventData.notes,
                timestamp: new Date().toISOString(),
                history: []
            };
            
            if (onAddEvent) {
                onAddEvent(newEvent);
            } else {
                setLocalEvents(prev => [newEvent, ...prev]);
            }
        }
        setIsEventModalOpen(false);
        setEditingEvent(null);
    };

    const handleDeleteEvent = (id: number) => {
        if(window.confirm("האם למחוק אירוע זה?")) {
             setLocalEvents(prev => prev.filter(e => e.id !== id));
        }
    }

    const filteredEvents = useMemo(() => {
        return jobEvents.filter(event => {
            const eventDate = new Date(event.timestamp);
            const fromDate = eventFilters.fromDate ? new Date(eventFilters.fromDate) : null;
            const toDate = eventFilters.toDate ? new Date(eventFilters.toDate) : null;

            if (fromDate && eventDate < fromDate) return false;
            if (toDate && eventDate > toDate) return false;
            if (eventFilters.coordinator !== 'הכל' && event.user !== eventFilters.coordinator) return false;
            return true;
        });
    }, [jobEvents, eventFilters]);

    return (
        <div className="bg-bg-card rounded-2xl h-full flex flex-col p-4 sm:p-6 space-y-6">
            <header className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                    <h3 className="text-xl font-bold text-text-default">יומן אירועי משרה</h3>
                    <p className="text-sm text-text-muted">תיעוד אוטומטי וידני של פעולות במשרה</p>
                </div>
                
                <div className="flex items-center gap-3">
                     <div className="flex items-center bg-bg-subtle p-1 rounded-lg border border-border-default">
                        <button onClick={() => setViewMode('timeline')} title="תצוגת ציר זמן" className={`p-2 rounded-md transition-all ${viewMode === 'timeline' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}>
                            <TableCellsIcon className="w-5 h-5"/>
                        </button>
                        <button onClick={() => setViewMode('cards')} title="תצוגת כרטיסיות" className={`p-2 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}>
                            <Squares2X2Icon className="w-5 h-5"/>
                        </button>
                    </div>

                    <button 
                        onClick={handleOpenCreate} 
                        className="bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2 text-sm whitespace-nowrap"
                    >
                        <PlusIcon className="w-5 h-5"/>
                        <span>הוספת אירוע</span>
                    </button>
                </div>
            </header>

            {/* Filter Toolbar */}
            <div className="p-4 bg-bg-subtle/50 rounded-xl border border-border-default">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">סוג אירוע</label>
                        <select name="eventType" value={eventFilters.eventType} onChange={handleEventFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none">
                            {eventTypeOptions.map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">רכז</label>
                        <select name="coordinator" value={eventFilters.coordinator} onChange={handleEventFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none">
                            {coordinatorOptions.map(opt => <option key={opt}>{opt}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">מתאריך</label>
                        <input type="date" name="fromDate" value={eventFilters.fromDate} onChange={handleEventFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">עד תאריך</label>
                        <input type="date" name="toDate" value={eventFilters.toDate} onChange={handleEventFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none" />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto pr-2 pl-2 custom-scrollbar">
                {viewMode === 'timeline' ? (
                    // --- TIMELINE VIEW ---
                    <div className="relative border-r-2 border-border-subtle pr-8 space-y-8 pb-10">
                        {filteredEvents.map((event) => {
                            const isAI = event.user === 'Hiro AI';
                            const colors = getEventColor(event.type);
                            const hasHistory = event.history && event.history.length > 0;
                            const showHistory = expandedHistoryId === event.id;

                            return (
                                <div key={event.id} className="relative group">
                                    {/* Timeline Dot */}
                                    <div className={`absolute top-5 -right-[41px] w-4 h-4 rounded-full ring-4 ring-bg-card shadow-sm transition-all z-10 ${isAI ? 'bg-purple-500 scale-110' : 'bg-primary-500'} group-hover:scale-125`}></div>
                                    
                                    <div className={`p-5 rounded-2xl border transition-all duration-300 relative bg-bg-card border-border-default hover:border-primary-200 hover:shadow-md ${isAI ? 'bg-purple-50/20' : ''}`}>
                                        <div className="flex items-start gap-4">
                                            <div className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full border ${colors}`}>
                                                {getIconForEventType(event.type, event.user)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-sm font-bold ${isAI ? 'text-purple-700' : 'text-text-default'}`}>
                                                            {event.user} {isAI && '✨'}
                                                        </span>
                                                        <span className="text-xs text-text-subtle">•</span>
                                                        <span className="text-xs font-medium text-text-muted">
                                                            {new Date(event.timestamp).toLocaleString('he-IL', { dateStyle: 'long', timeStyle: 'short' })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                         {hasHistory && (
                                                            <button 
                                                                className={`p-1.5 rounded-full transition-colors ${showHistory ? 'bg-primary-100 text-primary-700' : 'hover:bg-bg-subtle text-text-subtle'}`}
                                                                title="היסטוריית שינויים"
                                                                onClick={() => setExpandedHistoryId(showHistory ? null : event.id)}
                                                            >
                                                                <ClockIcon className="w-4 h-4"/>
                                                            </button>
                                                         )}
                                                         <button 
                                                            className="p-1.5 hover:bg-bg-subtle rounded-full text-text-subtle hover:text-primary-600 transition-colors" 
                                                            title="ערוך" 
                                                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(event); }}
                                                        >
                                                            <PencilIcon className="w-4 h-4"/>
                                                        </button>
                                                        <button 
                                                            className="p-1.5 hover:bg-red-50 rounded-full text-text-subtle hover:text-red-500 transition-colors" 
                                                            title="מחק" 
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                                                        >
                                                            <TrashIcon className="w-4 h-4"/>
                                                        </button>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-text-default leading-relaxed whitespace-pre-wrap">
                                                    {event.description}
                                                </p>
                                                
                                                {/* History Dropdown */}
                                                {showHistory && (
                                                    <div className="mt-3 pt-3 border-t border-border-subtle bg-bg-subtle/30 rounded-lg p-3 space-y-2 animate-fade-in">
                                                        <p className="text-xs font-bold text-text-muted mb-1">היסטוריית שינויים:</p>
                                                        {event.history?.map((hist, idx) => (
                                                            <div key={idx} className="flex justify-between text-xs text-text-subtle">
                                                                <span>{hist.change} ({hist.updatedBy})</span>
                                                                <span>{new Date(hist.updatedAt).toLocaleString('he-IL')}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // --- CARDS VIEW ---
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredEvents.map((event) => {
                            const isAI = event.user === 'Hiro AI';
                             const colors = getEventColor(event.type);
                             
                            return (
                                <div key={event.id} className="bg-bg-card border border-border-default rounded-xl p-4 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between h-full">
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-8 h-8 flex items-center justify-center rounded-lg border ${colors}`}>
                                                    {getIconForEventType(event.type, event.user)}
                                                </div>
                                                <div>
                                                    <div className={`text-sm font-bold ${isAI ? 'text-purple-700' : 'text-text-default'}`}>
                                                        {event.user}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {new Date(event.timestamp).toLocaleDateString('he-IL')}
                                                    </div>
                                                </div>
                                            </div>
                                             <button 
                                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-bg-subtle rounded-full text-text-subtle transition-opacity"
                                                onClick={() => handleOpenEdit(event)}
                                            >
                                                <PencilIcon className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                        <p className="text-sm text-text-default leading-relaxed mb-4 line-clamp-4">
                                            {event.description}
                                        </p>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-text-subtle border-t border-border-subtle pt-2 mt-auto">
                                        <span>{new Date(event.timestamp).toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</span>
                                        {event.history && event.history.length > 0 && (
                                            <span className="flex items-center gap-1" title="נערך">
                                                <ClockIcon className="w-3 h-3" /> נערך
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            <AddJobEventModal 
                isOpen={isEventModalOpen}
                onClose={() => setIsEventModalOpen(false)}
                onSave={handleSaveEvent}
                eventToEdit={editingEvent}
            />
        </div>
    );
};

export default JobEventsView;
