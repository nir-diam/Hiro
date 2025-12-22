
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ClipboardDocumentListIcon, ChatBubbleOvalLeftEllipsisIcon, InformationCircleIcon, ArchiveBoxIcon, 
    CheckCircleIcon, MagnifyingGlassIcon, ArrowLeftIcon, ArrowUturnLeftIcon, ChevronDownIcon, XMarkIcon,
    ClockIcon, UserGroupIcon
} from './Icons';

// --- TYPES ---
type NotificationType = 'task' | 'message' | 'system';
type NotificationStatus = 'New' | 'In Progress' | 'Done';

interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  content: string;
  timestamp: string; // Creation date
  dueDate?: string; // Due date for tasks
  isRead: boolean;
  sender: string;
  recipient: string;
  status: NotificationStatus;
  category: 'כללי' | 'גיוס' | 'מכירות';
  urgency?: 'נמוכה' | 'בינונית' | 'גבוהה';
  linkedCandidateId?: number;
  linkedClient?: string;
}

// --- MOCK DATA ---
export const notificationsData: Notification[] = [
  { 
      id: 1, 
      type: 'task', 
      title: 'משימה בחריגה: ליצור קשר עם UPS', 
      content: 'עברו יומיים מאז שהלקוח ביקש עדכון על משרת המחסנאי.', 
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), 
      dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Overdue by 1 day
      isRead: false, 
      sender: 'מערכת', 
      recipient: 'גילעד', 
      status: 'New', 
      category: 'גיוס', 
      urgency: 'גבוהה', 
      linkedClient: 'UPS' 
  },
  { 
      id: 2, 
      type: 'task', 
      title: 'משימה להיום: ראיון טלפוני', 
      content: 'ביצוע סינון טלפוני למועמדת מאיה כהן.', 
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), 
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Due today in 2 hours
      isRead: false, 
      sender: 'מערכת', 
      recipient: 'עצמי', 
      status: 'New', 
      category: 'גיוס' 
  },
  { 
      id: 3, 
      type: 'message', 
      title: 'תזכורת: פגישה עם דנה', 
      content: 'פגישת סיכום שבוע עם צוות הגיוס היום ב-16:30.', 
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(), 
      isRead: false, 
      sender: 'דנה כהן', 
      recipient: 'עצמי', 
      status: 'New', 
      category: 'כללי' 
  },
  { 
      id: 4, 
      type: 'system', 
      title: 'עדכון מערכת', 
      content: '3 קורות חיים חדשים התקבלו מ-AllJobs למשרת "אנליסט נתונים".', 
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), 
      isRead: true, 
      sender: 'מערכת', 
      recipient: 'כולם', 
      status: 'Done', 
      category: 'גיוס' 
  },
  { 
      id: 5, 
      type: 'task', 
      title: 'משימה עתידית: הכנת דוחות', 
      content: 'להכין דוח גיוס חודשי לישיבת הנהלה.', 
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), 
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // Due in 4 days
      isRead: true, 
      sender: 'אביב לוי', 
      recipient: 'אביב לוי', 
      status: 'New', 
      category: 'גיוס', 
      urgency: 'בינונית' 
  },
  { 
      id: 6, 
      type: 'message', 
      title: 'הודעה מדנה כהן', 
      content: 'המועמד גדעון שפירא אישר הגעה לראיון מחר.', 
      timestamp: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), 
      isRead: true, 
      sender: 'דנה כהן', 
      recipient: 'עצמי', 
      status: 'Done', 
      category: 'גיוס', 
      linkedCandidateId: 1 
  },
];

const notificationStyles: { [key in NotificationType]: { icon: React.ReactNode; bg: string; text: string; } } = {
    task: { icon: <ClipboardDocumentListIcon className="w-5 h-5" />, bg: 'bg-primary-100', text: 'text-primary-600' },
    message: { icon: <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5" />, bg: 'bg-secondary-100', text: 'text-secondary-600' },
    system: { icon: <InformationCircleIcon className="w-5 h-5" />, bg: 'bg-accent-100', text: 'text-accent-600' },
};

function formatRelativeTime(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('he-IL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(',', '');
}

// Calculate task status based on due date
function getTaskUrgencyState(dueDateStr?: string): 'overdue' | 'soon' | 'future' | 'none' {
    if (!dueDateStr) return 'none';
    
    const now = new Date();
    const due = new Date(dueDateStr);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffMs < 0) return 'overdue';
    if (diffHours <= 48) return 'soon';
    return 'future';
}

function formatDueDate(dueDateStr?: string) {
    if (!dueDateStr) return '';
    const urgency = getTaskUrgencyState(dueDateStr);
    const date = new Date(dueDateStr);
    
    if (urgency === 'overdue') {
        const diffTime = Math.abs(new Date().getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        return `באיחור של ${diffDays} ימים`;
    }
    
    if (urgency === 'soon') {
        const today = new Date();
        if (date.getDate() === today.getDate()) {
            return `היום ב-${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
        }
        return 'מחר';
    }

    return date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
}

interface NotificationCenterProps {
    onOpenCandidateSummary: (candidateId: number) => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onOpenCandidateSummary }) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>(notificationsData);
    const [archivedNotifications, setArchivedNotifications] = useState<Notification[]>([]);
    const [activeTab, setActiveTab] = useState<'all' | 'tasks' | 'unread' | 'archived'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
    const [selectedNotifications, setSelectedNotifications] = useState<number[]>([]);
    const [isAssignMenuOpen, setIsAssignMenuOpen] = useState(false);
    const [tempSelectedAgents, setTempSelectedAgents] = useState<string[]>([]);
    const assignMenuRef = useRef<HTMLDivElement>(null);
    
    const initialAdvancedFilters = {
        sender: '', recipient: '', status: '', category: '', fromDate: '', toDate: '', linkedClient: ''
    };
    const [advancedFilters, setAdvancedFilters] = useState(initialAdvancedFilters);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (assignMenuRef.current && !assignMenuRef.current.contains(event.target as Node)) {
                setIsAssignMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
    const openTasksCount = useMemo(() => notifications.filter(n => n.type === 'task' && n.status !== 'Done').length, [notifications]);

    const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setAdvancedFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const filterOptions = useMemo(() => ({
        senders: [...new Set(notificationsData.map(n => n.sender))],
        recipients: [...new Set(notificationsData.map(n => n.recipient))],
        statuses: [...new Set(notificationsData.map(n => n.status))],
        categories: [...new Set(notificationsData.map(n => n.category))],
        linkedClients: [...new Set(notificationsData.map(n => n.linkedClient).filter(Boolean))] as string[],
    }), []);

    const filteredNotifications = useMemo(() => {
        let listToFilter = activeTab === 'archived' ? archivedNotifications : notifications;
        
        if (activeTab === 'unread') {
            listToFilter = listToFilter.filter(n => !n.isRead);
        }
        if (activeTab === 'tasks') {
            listToFilter = listToFilter.filter(n => n.type === 'task' && n.status !== 'Done');
        }

        const search = searchTerm.toLowerCase();
        
        return listToFilter
            .filter(n => 
                n.title.toLowerCase().includes(search) ||
                n.content.toLowerCase().includes(search) ||
                (n.recipient && n.recipient.toLowerCase().includes(search))
            )
            .filter(n => {
                const { sender, recipient, status, category, fromDate, toDate, linkedClient } = advancedFilters;
                if (sender && n.sender !== sender) return false;
                if (recipient && n.recipient !== recipient) return false;
                if (status && n.status !== status) return false;
                if (category && n.category !== category) return false;
                if (linkedClient && n.linkedClient !== linkedClient) return false;

                const notificationDate = new Date(n.timestamp);
                if (fromDate && notificationDate < new Date(fromDate)) return false;
                if (toDate && notificationDate > new Date(new Date(toDate).setHours(23, 59, 59, 999))) return false;
                
                return true;
            });
    }, [activeTab, searchTerm, notifications, archivedNotifications, advancedFilters, filterOptions]);

    const handleToggleSelect = (id: number) => {
        setSelectedNotifications(prev => 
            prev.includes(id) 
                ? prev.filter(selectedId => selectedId !== id)
                : [...prev, id]
        );
    };
    
    const areAllVisibleSelected = useMemo(() => 
        filteredNotifications.length > 0 && 
        filteredNotifications.every(n => selectedNotifications.includes(n.id)), 
        [filteredNotifications, selectedNotifications]
    );

    const handleSelectAllVisible = () => {
        if (areAllVisibleSelected) {
            const visibleIds = filteredNotifications.map(n => n.id);
            setSelectedNotifications(prev => prev.filter(id => !visibleIds.includes(id)));
        } else {
            const visibleIds = filteredNotifications.map(n => n.id);
            setSelectedNotifications(prev => [...new Set([...prev, ...visibleIds])]);
        }
    };

    const handleToggleExpand = (id: number) => {
        setExpandedId(prevId => (prevId === id ? null : id));
    };

    const handleMarkAsRead = (id: number) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    };
    
    const handleTaskComplete = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        // Mark as read and Done
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true, status: 'Done' } : n));
    };

    const handleRescheduleTask = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setNotifications(prev => prev.map(n => {
            if (n.id === id) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return { ...n, dueDate: tomorrow.toISOString() };
            }
            return n;
        }));
    };

    const handleArchive = (id: number) => {
        const notificationToArchive = notifications.find(n => n.id === id);
        if (notificationToArchive) {
            setNotifications(prev => prev.filter(n => n.id !== id));
            setArchivedNotifications(prev => [{ ...notificationToArchive, isRead: true }, ...prev]);
        }
    };

    const handleRestore = (id: number) => {
        const notificationToRestore = archivedNotifications.find(n => n.id === id);
        if (notificationToRestore) {
            setArchivedNotifications(prev => prev.filter(n => n.id !== id));
            setNotifications(prev => [{ ...notificationToRestore, isRead: false }, ...prev]);
        }
    };

    // Bulk Actions
    const handleBulkMarkAsRead = () => {
        setNotifications(prev => 
           prev.map(n => selectedNotifications.includes(n.id) ? { ...n, isRead: true } : n)
       );
       setSelectedNotifications([]);
   };

    const handleBulkMarkAsDone = () => {
        setNotifications(prev => 
            prev.map(n => selectedNotifications.includes(n.id) ? { ...n, status: 'Done', isRead: true } : n)
        );
        setSelectedNotifications([]);
    };

    const handleBulkArchive = () => {
        const toArchive = notifications.filter(n => selectedNotifications.includes(n.id));
        setNotifications(prev => prev.filter(n => !selectedNotifications.includes(n.id)));
        setArchivedNotifications(prev => [...toArchive.map(n => ({...n, isRead: true})), ...prev]);
        setSelectedNotifications([]);
    };

    const handleAgentToggle = (agent: string) => {
        setTempSelectedAgents(prev =>
            prev.includes(agent)
                ? prev.filter(a => a !== agent)
                : [...prev, agent]
        );
    };

    const handleConfirmAssignment = () => {
        if (tempSelectedAgents.length === 0) return;

        const newRecipient = tempSelectedAgents.join(', ');
        setNotifications(prev =>
            prev.map(n => selectedNotifications.includes(n.id) ? { ...n, recipient: newRecipient } : n)
        );

        setSelectedNotifications([]);
        setTempSelectedAgents([]);
        setIsAssignMenuOpen(false);
    };
    
    const filterKeyMap: { [key: string]: keyof typeof filterOptions } = {
        sender: 'senders',
        recipient: 'recipients',
        status: 'statuses',
        category: 'categories',
        linkedClient: 'linkedClients',
    };

    useEffect(() => {
        // Clear selection when changing tabs
        setSelectedNotifications([]);
    }, [activeTab]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 relative">
            <style>{`
                @keyframes content-fade-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                .animate-content-fade-in { animation: content-fade-in 0.3s ease-out forwards; }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up { animation: slideUp 0.3s ease-out forwards; }
            `}</style>

            <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">מרכז הודעות</h1>
                    <p className="text-sm text-text-muted">כל ההתראות, המשימות וההודעות שלך במקום אחד.</p>
                </div>
                <button onClick={() => navigate('/candidates')} title="סגור" className="p-2 rounded-full text-text-muted hover:bg-bg-hover">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>

            <div className="bg-bg-subtle/70 rounded-xl border border-border-default mb-4 p-3 space-y-3">
                <div className="flex flex-col md:flex-row items-center gap-3">
                    <div className="flex-shrink-0 flex items-center bg-bg-card border border-border-default/50 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                        {([
                            ['all', `הכל (${notifications.length})`], 
                            ['tasks', `משימות פתוחות (${openTasksCount})`],
                            ['unread', `חדשות (${unreadCount})`], 
                            ['archived', `ארכיון (${archivedNotifications.length})`]
                        ] as const).map(([tab, label]) => (
                            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-1.5 px-4 text-sm font-semibold rounded-md transition whitespace-nowrap ${activeTab === tab ? 'bg-white shadow-sm text-primary-700 border border-gray-100' : 'text-text-muted hover:text-text-default'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                     {activeTab !== 'archived' && (
                        <div className="flex items-center gap-2 p-2 hidden md:flex">
                            <input
                                type="checkbox"
                                id="select-all"
                                checked={areAllVisibleSelected}
                                onChange={handleSelectAllVisible}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                            />
                            <label htmlFor="select-all" className="text-sm font-medium text-text-muted cursor-pointer">
                                בחר הכל
                            </label>
                        </div>
                     )}
                    <div className="relative w-full md:flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="חיפוש לפי כותרת, תוכן או אחראי..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-bg-card border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            setIsAdvancedFilterOpen(!isAdvancedFilterOpen);
                        }}
                        className="text-sm font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1"
                    >
                        <span>חיפוש מתקדם</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedFilterOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                {isAdvancedFilterOpen && (
                    <div className="pt-3 border-t border-border-default">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
                            {Object.keys(filterKeyMap).map(filter => (
                                <select key={filter} name={filter} value={(advancedFilters as any)[filter]} onChange={handleAdvancedFilterChange} className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm">
                                    <option value="">{ {sender: 'שולח', recipient: 'מקבל', status: 'סטטוס', category: 'קטגוריה', linkedClient: 'לקוח'}[filter] }</option>
                                    {filterOptions[filterKeyMap[filter as keyof typeof filterKeyMap]].map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            ))}
                            <input type="date" name="fromDate" value={advancedFilters.fromDate} onChange={handleAdvancedFilterChange} className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm" title="מתאריך"/>
                            <input type="date" name="toDate" value={advancedFilters.toDate} onChange={handleAdvancedFilterChange} className="w-full bg-bg-card border border-border-default text-text-default text-sm rounded-lg p-2 transition shadow-sm" title="עד תאריך"/>
                        </div>
                    </div>
                )}
            </div>

            <main className="flex-1 overflow-y-auto space-y-2 pb-20">
                {filteredNotifications.length > 0 ? (
                    filteredNotifications.map(notification => {
                        const { icon, bg, text } = notificationStyles[notification.type];
                        const isSelected = selectedNotifications.includes(notification.id);
                        
                        // Task urgency logic
                        const urgencyState = notification.type === 'task' && notification.status !== 'Done' 
                            ? getTaskUrgencyState(notification.dueDate) 
                            : 'none';

                        let urgencyClasses = 'border-border-default bg-bg-card';
                        let dateColorClass = 'text-text-subtle';
                        
                        if (urgencyState === 'overdue') {
                            urgencyClasses = 'border-red-400 bg-red-50/40 border-r-4'; // Using border-r for RTL
                            dateColorClass = 'text-red-600 font-bold';
                        } else if (urgencyState === 'soon') {
                            urgencyClasses = 'border-orange-400 bg-orange-50/40 border-r-4';
                            dateColorClass = 'text-orange-600 font-semibold';
                        } else if (notification.type === 'task' && notification.status !== 'Done') {
                            // Future tasks
                            urgencyClasses = 'border-l border-t border-b border-r-4 border-r-green-200 bg-white';
                        }

                        const displayDate = notification.type === 'task' && notification.status !== 'Done'
                            ? formatDueDate(notification.dueDate)
                            : formatRelativeTime(notification.timestamp);

                        return (
                            <div key={notification.id} className={`rounded-lg p-3 flex items-start gap-3 transition-all duration-200 border ${urgencyClasses} ${isSelected ? '!bg-primary-50 !border-primary-300 shadow-md' : ''}`}>
                                {activeTab !== 'archived' && (
                                    <div className="flex items-center h-full pt-1.5">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleSelect(notification.id)}
                                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                        />
                                    </div>
                                )}
                                <div className="flex-1 flex flex-row items-start gap-4 cursor-pointer" onClick={() => handleToggleExpand(notification.id)}>
                                    {!notification.isRead && activeTab !== 'archived' && !isSelected && notification.type !== 'task' && <div className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-2" title="לא נקרא" />}
                                    
                                    {/* Task Check Circle */}
                                    {notification.type === 'task' && notification.status !== 'Done' && activeTab !== 'archived' && (
                                        <button 
                                            onClick={(e) => handleTaskComplete(e, notification.id)}
                                            className="mt-1 w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 transition-colors flex items-center justify-center group/check"
                                            title="סמן כבוצע"
                                        >
                                            <CheckCircleIcon className="w-0 h-0 text-green-500 group-hover/check:w-3.5 group-hover/check:h-3.5 transition-all duration-200" />
                                        </button>
                                    )}

                                    <div className="flex-1 flex flex-col">
                                        <div className="flex justify-between items-start">
                                             <p className={`font-semibold text-sm ${urgencyState === 'overdue' ? 'text-red-800' : 'text-text-default'}`}>{notification.title}</p>
                                             <span className={`text-xs ${dateColorClass} whitespace-nowrap mr-2`}>{displayDate}</span>
                                        </div>
                                        <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{notification.content}</p>
                                        
                                        {expandedId === notification.id && (
                                            <div className="mt-3 pt-3 border-t border-border-default animate-content-fade-in">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                                    {notification.recipient && <div><strong className="text-text-muted">נמען:</strong> <span className="font-semibold text-text-default">{notification.recipient}</span></div>}
                                                    {notification.sender && <div><strong className="text-text-muted">שולח:</strong> <span className="font-semibold text-text-default">{notification.sender}</span></div>}
                                                    {notification.urgency && <div><strong className="text-text-muted">דחיפות:</strong> <span className="font-semibold text-text-default">{notification.urgency}</span></div>}
                                                    {notification.category && <div><strong className="text-text-muted">קטגוריה:</strong> <span className="font-semibold text-text-default">{notification.category}</span></div>}
                                                    {notification.linkedClient && <div><strong className="text-text-muted">לקוח:</strong> <span className="font-semibold text-text-default">{notification.linkedClient}</span></div>}
                                                    {notification.linkedCandidateId && (
                                                        <div className="md:col-span-2">
                                                            <strong className="text-text-muted">מועמד:</strong>{' '}
                                                            <button onClick={(e) => { e.stopPropagation(); onOpenCandidateSummary(notification.linkedCandidateId!); }} className="font-semibold text-primary-600 hover:underline">צפה בפרופיל</button>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                                    {notification.type === 'task' && activeTab !== 'archived' ? (
                                                        <>
                                                            <button onClick={(e) => handleTaskComplete(e, notification.id)} className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-md hover:bg-green-100 transition-colors">
                                                                <CheckCircleIcon className="w-4 h-4"/>
                                                                סמן כבוצע
                                                            </button>
                                                            <button onClick={(e) => handleRescheduleTask(e, notification.id)} className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-md hover:bg-amber-100 transition-colors">
                                                                <ClockIcon className="w-4 h-4"/>
                                                                דחה למחר
                                                            </button>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedNotifications([notification.id]);
                                                                    setIsAssignMenuOpen(true);
                                                                }} 
                                                                className="flex items-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-md hover:bg-primary-100 transition-colors"
                                                            >
                                                                <UserGroupIcon className="w-4 h-4"/>
                                                                העבר לנציג
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleArchive(notification.id); }} className="flex items-center gap-1.5 text-xs font-semibold text-text-muted border border-border-default px-3 py-1.5 rounded-md hover:bg-bg-hover transition-colors">
                                                                <ArchiveBoxIcon className="w-4 h-4"/>
                                                                ארכיון
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            {activeTab !== 'archived' ? (
                                                                <>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleArchive(notification.id); }} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-red-600 p-1.5 rounded-md hover:bg-red-50"><ArchiveBoxIcon className="w-4 h-4"/> ארכיון</button>
                                                                    {!notification.isRead && notification.type !== 'task' && <button onClick={(e) => { e.stopPropagation(); handleMarkAsRead(notification.id); }} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-green-600 p-1.5 rounded-md hover:bg-green-50"><CheckCircleIcon className="w-4 h-4"/> סמן כנקרא</button>}
                                                                </>
                                                            ) : (
                                                                <button onClick={(e) => { e.stopPropagation(); handleRestore(notification.id); }} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary-600 p-1.5 rounded-md hover:bg-primary-50"><ArrowUturnLeftIcon className="w-4 h-4"/> שחזר</button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full ${bg} ${text}`}>
                                        {icon}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                ) : (
                     <div className="text-center py-20 text-text-muted flex flex-col items-center">
                        <MagnifyingGlassIcon className="w-12 h-12 text-text-subtle mb-4" />
                        <p className="font-semibold text-lg">{searchTerm || Object.values(advancedFilters).some(v=>v) ? 'לא נמצאו התראות' : activeTab === 'archived' ? 'הארכיון ריק' : 'אין הודעות חדשות'}</p>
                        <p className="text-sm mt-1">{searchTerm || Object.values(advancedFilters).some(v=>v) ? 'נסה מונח חיפוש אחר.' : activeTab === 'archived' ? 'הודעות שסומנו כטופלו יופיעו כאן.' : 'הכל מעודכן!'}</p>
                    </div>
                )}
            </main>
            
            {selectedNotifications.length > 0 && activeTab !== 'archived' && (
                <div className="absolute bottom-0 inset-x-0 z-20 p-4 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto w-auto max-w-full bg-bg-card shadow-2xl rounded-xl border border-border-default p-2 flex items-center flex-wrap justify-center gap-2 animate-slide-up">
                        <span className="text-sm font-semibold text-text-default px-2">
                            {selectedNotifications.length} נבחרו
                        </span>
                        <div className="h-6 w-px bg-border-default"></div>
                        <button onClick={handleBulkMarkAsRead} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">סמן כנקרא</button>
                        <button onClick={handleBulkMarkAsDone} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">סמן כטופל</button>
                        <button onClick={handleBulkArchive} className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors">העבר לארכיון</button>
                        
                        <div className="relative" ref={assignMenuRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAssignMenuOpen(prev => !prev);
                                    if (isAssignMenuOpen) {
                                        setTempSelectedAgents([]);
                                    }
                                }}
                                className="text-sm font-semibold text-text-muted hover:text-primary-600 px-3 py-1.5 rounded-md hover:bg-primary-50 transition-colors"
                            >
                                העבר לנציג
                            </button>
                            {isAssignMenuOpen && (
                                <div className="absolute bottom-full mb-2 right-1/2 translate-x-1/2 bg-bg-card rounded-lg shadow-xl border border-border-default z-30 w-56 p-3">
                                    <p className="text-xs font-semibold text-text-muted px-1 pb-2">בחר נציגים לשיוך</p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                        {filterOptions.recipients
                                            .filter(r => r !== 'עצמי' && r !== 'כולם')
                                            .map(agent => (
                                                <label key={agent} className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-1 rounded cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={tempSelectedAgents.includes(agent)}
                                                        onChange={() => handleAgentToggle(agent)}
                                                        className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                                                    />
                                                    {agent}
                                                </label>
                                            ))}
                                    </div>
                                    <button
                                        onClick={handleConfirmAssignment}
                                        disabled={tempSelectedAgents.length === 0}
                                        className="w-full mt-3 bg-primary-500 text-white font-semibold py-1.5 rounded-md hover:bg-primary-600 transition disabled:bg-gray-300"
                                    >
                                        שייך ({tempSelectedAgents.length})
                                    </button>
                                </div>
                            )}
                        </div>
                        
                        <button onClick={() => setSelectedNotifications([])} className="p-2 rounded-full text-text-subtle hover:bg-bg-hover" title="נקה בחירה">
                            <XMarkIcon className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationCenter;
