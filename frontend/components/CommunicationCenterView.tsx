
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, FunnelIcon, UserGroupIcon, CalendarDaysIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon, 
    WhatsappIcon, PaperAirplaneIcon, ArrowPathIcon, ChevronDownIcon, ClockIcon, 
    XMarkIcon, UserIcon, BriefcaseIcon, PaperClipIcon, CheckIcon, BuildingOffice2Icon,
    InboxIcon, ArchiveBoxIcon, BellIcon, SparklesIcon, PhoneIcon, ArrowDownTrayIcon, PlusIcon,
    TrashIcon, DocumentTextIcon, MapPinIcon, ArrowUturnLeftIcon
} from './Icons';
import Drawer from './Drawer';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
type Channel = 'whatsapp' | 'sms' | 'email';
type MsgStatus = 'sent' | 'delivered' | 'read' | 'failed';
type Direction = 'outbound' | 'inbound';
type RecipientType = 'candidate' | 'client' | 'recruiter';

interface MessageLog {
    id: number;
    channel: Channel;
    direction: Direction;
    recipientName: string;
    recipientType: RecipientType;
    candidateId?: number;
    recipientPhone?: string;
    recipientEmail?: string;
    content: string;
    status: MsgStatus;
    timestamp: string;
    agentName: string;
    relatedJob?: string;
    hasAttachment: boolean;
    errorMessage?: string;
    isRead: boolean;
    isArchived: boolean; // New field for archive logic
}

interface MessageTemplate {
    id: number;
    title: string;
    content: string;
    channel: 'all' | Channel;
}

interface CommunicationCenterViewProps {
    onOpenCandidateSummary: (id: number) => void;
}

// --- MOCK DATA ---
const mockMessages: MessageLog[] = [
    {
        id: 4, channel: 'whatsapp', direction: 'inbound', recipientName: 'גדעון שפירא', recipientType: 'candidate', candidateId: 1, recipientPhone: '054-1234567',
        content: 'היי דנה, תודה על הפנייה. אני זמין מחר ב-10 בבוקר לשיחה. האם זה מתאים לך?',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        agentName: 'דנה כהן', relatedJob: 'מנהל/ת שיווק דיגיטלי', hasAttachment: false, isRead: false, isArchived: false
    },
    {
        id: 1, channel: 'whatsapp', direction: 'outbound', recipientName: 'גדעון שפירא', recipientType: 'candidate', candidateId: 1, recipientPhone: '054-1234567',
        content: 'היי גדעון, ראיתי את קורות החיים שלך למשרת מנהל שיווק. אשמח לתאם שיחה קצרה.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(), 
        agentName: 'דנה כהן', relatedJob: 'מנהל/ת שיווק דיגיטלי', hasAttachment: false, isRead: true, isArchived: false
    },
    {
        id: 3, channel: 'sms', direction: 'outbound', recipientName: 'דוד כהן', recipientType: 'candidate', candidateId: 3, recipientPhone: '052-9999999',
        content: 'דוד שלום, נסינו להשיגך בקשר למשרת נהג חלוקה. אנא חזור אלינו.',
        status: 'failed', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), 
        agentName: 'מערכת', relatedJob: 'נהג חלוקה', hasAttachment: false, errorMessage: 'מספר שגוי או חסום', isRead: true, isArchived: false
    },
    {
        id: 2, channel: 'email', direction: 'outbound', recipientName: 'נועה לוי', recipientType: 'candidate', candidateId: 13, recipientEmail: 'noa@gmail.com',
        content: 'זימון לראיון עבודה - בזק. שלום נועה, בהמשך לשיחתנו אנו שמחים לזמן אותך לראיון פרונטלי במשרדי החברה.',
        status: 'delivered', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), 
        agentName: 'אביב לוי', relatedJob: 'מפתח/ת Fullstack', hasAttachment: true, isRead: true, isArchived: false
    },
    {
        id: 8, channel: 'email', direction: 'outbound', recipientName: 'ישראל ישראלי', recipientType: 'client', recipientEmail: 'israel@getter.co.il',
        content: 'סיכום שבועי - גיוסים פתוחים. היי ישראל, מצורף דוח סטטוס מועמדים לשבוע האחרון.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        agentName: 'אביב לוי', relatedJob: 'כללי', hasAttachment: true, isRead: true, isArchived: true // Archived example
    },
    {
        id: 9, channel: 'whatsapp', direction: 'outbound', recipientName: 'יעל שחר', recipientType: 'recruiter', recipientPhone: '050-0000000',
        content: 'היי יעל, את יכולה לחזור למועמד דוד? הוא חיפש אותך.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
        agentName: 'דנה כהן', relatedJob: '', hasAttachment: false, isRead: true, isArchived: false
    },
    {
        id: 5, channel: 'email', direction: 'outbound', recipientName: 'רון שחר', recipientType: 'candidate', candidateId: 4, recipientEmail: 'ron@walla.co.il',
        content: 'עדכון לגבי מועמדותך. לצערנו החלטנו להתקדם עם מועמדים אחרים.',
        status: 'sent', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), 
        agentName: 'יעל שחר', relatedJob: 'אנליסט נתונים', hasAttachment: false, isRead: true, isArchived: false
    },
];

const mockTemplates: MessageTemplate[] = [
    { id: 1, title: 'זימון לראיון טלפוני', content: 'היי {name}, כאן דנה ממימד אנושי. ראיתי את קורות החיים שלך ואשמח לתאם שיחה קצרה.', channel: 'all' },
    { id: 2, title: 'דחייה מנומסת', content: 'היי {name}, תודה על התעניינותך. כרגע החלטנו להתקדם עם מועמדים אחרים. נשמור את פרטיך לעתיד.', channel: 'all' },
    { id: 3, title: 'בקשה להמלצות', content: 'היי {name}, בהמשך לשיחתנו, אשמח לקבל פרטי ממליצים (שם ותפקיד) כדי שנוכל להתקדם.', channel: 'all' },
    { id: 4, title: 'תזכורת לראיון', content: 'היי {name}, תזכורת לראיון שלנו מחר בשעה 10:00 במשרדי החברה. בהצלחה!', channel: 'whatsapp' },
];

// --- ICONS & HELPERS ---
const ChannelIcon: React.FC<{ channel: Channel, className?: string }> = ({ channel, className = "w-4 h-4" }) => {
    switch (channel) {
        case 'whatsapp': return <WhatsappIcon className={`${className} text-[#25D366]`} />;
        case 'sms': return <ChatBubbleBottomCenterTextIcon className={`${className} text-blue-500`} />;
        case 'email': return <EnvelopeIcon className={`${className} text-purple-500`} />;
    }
};

const StatusIcon: React.FC<{ status: MsgStatus }> = ({ status }) => {
    switch(status) {
        case 'read': return <div className="flex -space-x-1"><CheckIcon className="w-3 h-3 text-blue-500"/><CheckIcon className="w-3 h-3 text-blue-500"/></div>;
        case 'delivered': return <div className="flex -space-x-1"><CheckIcon className="w-3 h-3 text-gray-400"/><CheckIcon className="w-3 h-3 text-gray-400"/></div>;
        case 'sent': return <CheckIcon className="w-3 h-3 text-gray-400"/>;
        case 'failed': return <ExclamationTriangleIcon className="w-3 h-3 text-red-500"/>;
    }
    return null;
};

// --- COMPONENTS ---

// 1. Filter Pane (Right)
const FilterPane: React.FC<{ 
    filters: any; 
    setFilters: (f: any) => void;
    isOpenMobile: boolean;
    onCloseMobile: () => void;
}> = ({ filters, setFilters, isOpenMobile, onCloseMobile }) => {
    const { t } = useLanguage();

    const handleDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        const end = new Date();
        const start = new Date();
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);
        
        setFilters({
            ...filters,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        });
    };

    return (
        <div className={`
            bg-bg-card border-l border-border-default flex-col h-full overflow-y-auto p-5 space-y-6 flex-shrink-0 transition-transform duration-300 z-50
            ${isOpenMobile ? 'fixed inset-0 w-full' : 'hidden md:flex w-72'}
        `}>
            <div className="flex justify-between items-center z-10 relative">
                 <h2 className="text-xl font-extrabold text-text-default">{t('communication.title')}</h2>
                 {isOpenMobile && (
                     <button onClick={onCloseMobile} className="p-2 bg-bg-subtle rounded-full text-text-muted hover:bg-bg-hover">
                         <XMarkIcon className="w-5 h-5"/>
                     </button>
                 )}
            </div>
            
            {/* View Folder Toggle (Inbox / Archive) */}
            <div className="bg-bg-subtle p-1 rounded-lg flex text-sm font-semibold">
                <button 
                    onClick={() => setFilters({ ...filters, folder: 'inbox' })}
                    className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${filters.folder === 'inbox' ? 'bg-white shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                >
                    <InboxIcon className="w-4 h-4"/>
                    {t('communication.inbox')}
                </button>
                <button 
                    onClick={() => setFilters({ ...filters, folder: 'archive' })}
                    className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-all ${filters.folder === 'archive' ? 'bg-white shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                >
                    <ArchiveBoxIcon className="w-4 h-4"/>
                    {t('communication.archive')}
                </button>
            </div>

            <div className="relative">
                <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                <input 
                    type="text" 
                    placeholder={t('communication.search_placeholder')} 
                    value={filters.search}
                    onChange={(e) => setFilters({...filters, search: e.target.value})}
                    className="w-full bg-bg-subtle border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-2 focus:ring-primary-500 transition-all outline-none"
                />
            </div>

            {/* Date Range */}
            <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('communication.filter_date_range')}</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                    <button onClick={() => handleDatePreset('today')} className="px-2 py-1.5 bg-bg-subtle text-xs font-medium rounded hover:bg-bg-hover text-text-default border border-border-default">{t('filter_option.today')}</button>
                    <button onClick={() => handleDatePreset('week')} className="px-2 py-1.5 bg-bg-subtle text-xs font-medium rounded hover:bg-bg-hover text-text-default border border-border-default">{t('filter_option.week')}</button>
                    <button onClick={() => handleDatePreset('month')} className="px-2 py-1.5 bg-bg-subtle text-xs font-medium rounded hover:bg-bg-hover text-text-default border border-border-default">{t('filter_option.month')}</button>
                    <button onClick={() => handleDatePreset('quarter')} className="px-2 py-1.5 bg-bg-subtle text-xs font-medium rounded hover:bg-bg-hover text-text-default border border-border-default">{t('filter_option.quarter')}</button>
                </div>
                <div className="space-y-2">
                    <div>
                        <span className="text-[10px] text-text-subtle block mb-1">{t('job_events.filter_from')}</span>
                        <input type="date" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} className="w-full bg-white border border-border-default rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                        <span className="text-[10px] text-text-subtle block mb-1">{t('job_events.filter_to')}</span>
                        <input type="date" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} className="w-full bg-white border border-border-default rounded-md px-2 py-1.5 text-sm" />
                    </div>
                </div>
            </div>

            {/* Recipients */}
            <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('communication.filter_recipient')}</label>
                <select 
                    value={filters.recipientType} 
                    onChange={(e) => setFilters({...filters, recipientType: e.target.value})}
                    className="w-full bg-white border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500"
                >
                    <option value="all">{t('filter_option.all_recipients')}</option>
                    <option value="candidate">{t('filter_option.candidates')}</option>
                    <option value="client">{t('filter_option.clients')}</option>
                    <option value="recruiter">{t('filter_option.recruiters')}</option>
                </select>
            </div>

            {/* Status */}
            <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('communication.filter_status')}</label>
                <select 
                    value={filters.status} 
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                    className="w-full bg-white border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500"
                >
                    <option value="all">{t('filter_option.all')}</option>
                    <option value="sent">{t('filter_option.sent')}</option>
                    <option value="failed">{t('filter_option.failed')}</option>
                </select>
            </div>

            {/* Channel */}
            <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('communication.filter_channel')}</label>
                <select 
                    value={filters.channel} 
                    onChange={(e) => setFilters({...filters, channel: e.target.value})}
                    className="w-full bg-white border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500"
                >
                    <option value="all">{t('filter_option.all')}</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                </select>
            </div>

            {/* Sender */}
            <div>
                <label className="text-xs font-bold text-text-muted uppercase mb-2 block">{t('communication.filter_sender')}</label>
                <select 
                    value={filters.sender} 
                    onChange={(e) => setFilters({...filters, sender: e.target.value})}
                    className="w-full bg-white border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500"
                >
                    <option value="all">{t('filter_option.all_senders')}</option>
                    <option value="dana">דנה כהן</option>
                    <option value="aviv">אביב לוי</option>
                    <option value="system">{t('filter_option.system')}</option>
                </select>
            </div>
            
            <div className="mt-auto pt-4 flex gap-3">
                 <button 
                    onClick={() => {
                        setFilters({ search: '', startDate: '', endDate: '', recipientType: 'all', status: 'all', channel: 'all', sender: 'all', folder: 'inbox' });
                        if(isOpenMobile) onCloseMobile();
                    }}
                    className="flex-1 text-sm text-text-muted hover:text-primary-600 border border-border-default py-2 rounded-lg bg-white"
                >
                    {t('communication.clear')}
                </button>
                {isOpenMobile && (
                    <button 
                        onClick={onCloseMobile}
                        className="flex-1 bg-primary-600 text-white text-sm font-bold py-2 rounded-lg"
                    >
                        {t('communication.show_results')}
                    </button>
                )}
            </div>
        </div>
    );
};

// 2. Message List Pane (Middle)
const MessageListPane: React.FC<{
    messages: MessageLog[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    searchTerm: string;
    onSearchChange: (val: string) => void;
    selectedIds: number[];
    onToggleSelection: (id: number) => void;
    onSelectAll: (ids: number[]) => void;
    onToggleMobileFilters: () => void;
    folder: 'inbox' | 'archive';
}> = ({ messages, selectedIds, onSelect, onToggleSelection, onSelectAll, onToggleMobileFilters, folder }) => {
    const { t } = useLanguage();
    const allSelected = messages.length > 0 && messages.every(m => selectedIds.includes(m.id));

    const handleMasterCheckbox = () => {
        if (allSelected) {
            onSelectAll([]);
        } else {
            onSelectAll(messages.map(m => m.id));
        }
    };

    return (
        <div className="w-full md:w-[400px] lg:w-[450px] bg-white border-l border-border-default flex flex-col h-full">
            {/* List Header & Controls */}
            <div className="p-4 border-b border-border-default bg-bg-subtle/30 flex justify-between items-center h-[72px] z-10 relative">
                <div className="flex items-center gap-3">
                    <input 
                        type="checkbox" 
                        checked={allSelected}
                        onChange={handleMasterCheckbox}
                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold text-text-default">
                            {selectedIds.length > 0 ? t('communication.selected_count', {count: selectedIds.length}) : folder === 'inbox' ? t('communication.inbox') : t('communication.archive')}
                        </span>
                        <span className="text-[10px] text-text-muted">{t('communication.messages_count', {count: messages.length})}</span>
                    </div>
                </div>
                
                <div className="flex gap-2">
                     {selectedIds.length > 0 && (
                        <button onClick={() => onSelectAll([])} className="text-xs text-red-500 font-medium hover:underline">
                            {t('communication.delete_selection')}
                        </button>
                    )}
                    {/* Mobile Filter Toggle */}
                    <button 
                        onClick={onToggleMobileFilters}
                        className="md:hidden p-2 rounded-lg bg-bg-card border border-border-default text-text-muted hover:text-primary-600"
                    >
                        <FunnelIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-text-muted text-center p-4">
                        <InboxIcon className="w-12 h-12 mb-2 opacity-20" />
                        <p className="text-sm">
                            {folder === 'inbox' ? t('communication.empty_inbox') : t('communication.empty_archive')}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-border-subtle">
                        {messages.map(msg => {
                            const isSelected = selectedIds.includes(msg.id);
                            return (
                                <div 
                                    key={msg.id}
                                    onClick={() => onSelect(msg.id)}
                                    className={`p-4 cursor-pointer transition-all duration-200 relative group ${isSelected ? 'bg-primary-50/60' : 'hover:bg-bg-hover'}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                                             <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => onToggleSelection(msg.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {/* Unread Indicator */}
                                                    {!msg.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></div>}
                                                    <h4 className={`text-sm truncate ${!msg.isRead ? 'font-bold text-text-default' : 'font-medium text-text-default'}`}>
                                                        {msg.recipientName}
                                                    </h4>
                                                </div>
                                                <span className="text-[10px] text-text-muted whitespace-nowrap ml-1">
                                                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                </span>
                                            </div>
                                            
                                            <p className="text-xs text-text-muted line-clamp-2 leading-relaxed mb-2">
                                                {msg.content}
                                            </p>

                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className={`p-1 rounded-md ${msg.channel === 'whatsapp' ? 'bg-[#25D366]/10' : msg.channel === 'sms' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                                                        <ChannelIcon channel={msg.channel} className="w-3 h-3" />
                                                    </div>
                                                    {msg.hasAttachment && <PaperClipIcon className="w-3 h-3 text-text-subtle" />}
                                                </div>
                                                <StatusIcon status={msg.status} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Active Border Indicator */}
                                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500"></div>}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

// 3. Main Reading / Bulk Action Pane (Left)
const ReadingPane: React.FC<{ 
    selectedMessages: MessageLog[];
    onBulkSend: (channel: Channel, message: string) => void;
    onBulkArchive: () => void;
}> = ({ selectedMessages, onBulkSend, onBulkArchive }) => {
    const { t } = useLanguage();
    const isBulkMode = selectedMessages.length > 1;
    const msg = selectedMessages[0]; // For single view

    const [bulkMessage, setBulkMessage] = useState('');
    const [bulkChannel, setBulkChannel] = useState<Channel>('whatsapp');
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
    const templatesRef = useRef<HTMLDivElement>(null);

    // Close templates dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
                setIsTemplatesOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleTemplateSelect = (content: string) => {
        // Simple replace logic. Could be append.
        setBulkMessage(content.replace('{name}', 'מועמד'));
        setIsTemplatesOpen(false);
    };

    if (selectedMessages.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-bg-subtle/30 text-text-muted h-full">
                <ChatBubbleBottomCenterTextIcon className="w-16 h-16 opacity-10 mb-4" />
                <p className="text-lg font-medium">{t('communication.select_conversation')}</p>
            </div>
        );
    }

    // --- BULK ACTION MODE ---
    if (isBulkMode) {
        return (
            <div className="flex-1 flex flex-col h-full bg-bg-default relative">
                <header className="px-6 py-4 border-b border-border-default bg-white z-10 shadow-sm flex items-center justify-between h-[72px]">
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-bold">
                             {selectedMessages.length}
                         </div>
                         <div>
                             <h2 className="text-lg font-bold text-text-default">{t('communication.bulk_send_title')}</h2>
                             <p className="text-xs text-text-muted">{t('communication.selected_count', {count: selectedMessages.length})}</p>
                         </div>
                    </div>
                    <button 
                        onClick={onBulkArchive}
                        className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors flex items-center gap-2 text-sm font-semibold border border-transparent hover:border-red-100" 
                        title={t('communication.move_archive')}
                    >
                        <TrashIcon className="w-5 h-5"/>
                        <span className="hidden sm:inline">{t('communication.move_archive')}</span>
                    </button>
                </header>

                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-2xl mx-auto space-y-6">
                        {/* Selected Recipients Preview */}
                        <div className="bg-white p-4 rounded-xl border border-border-default">
                             <h3 className="text-sm font-bold text-text-muted mb-3 uppercase tracking-wide">{t('communication.recipients')}</h3>
                             <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                 {selectedMessages.map(m => (
                                     <div key={m.id} className="flex items-center gap-2 bg-bg-subtle px-3 py-1.5 rounded-full border border-border-default text-sm">
                                         <div className={`w-2 h-2 rounded-full ${m.channel === 'whatsapp' ? 'bg-green-500' : m.channel === 'sms' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
                                         <span className="font-medium text-text-default">{m.recipientName}</span>
                                     </div>
                                 ))}
                             </div>
                        </div>

                        {/* Compose Area */}
                        <div className="bg-white p-6 rounded-xl border border-border-default shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-text-default">{t('communication.new_message')}</h3>
                            
                            {/* Channel Selector */}
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-2">{t('communication.channel_send')}</label>
                                <div className="flex gap-4">
                                     <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${bulkChannel === 'whatsapp' ? 'border-[#25D366] bg-green-50 text-green-800' : 'border-border-default hover:bg-bg-hover'}`}>
                                        <input type="radio" name="bulk_channel" value="whatsapp" checked={bulkChannel === 'whatsapp'} onChange={() => setBulkChannel('whatsapp')} className="hidden"/>
                                        <WhatsappIcon className="w-5 h-5"/>
                                        <span className="font-bold">WhatsApp</span>
                                     </label>
                                     <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${bulkChannel === 'sms' ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-border-default hover:bg-bg-hover'}`}>
                                        <input type="radio" name="bulk_channel" value="sms" checked={bulkChannel === 'sms'} onChange={() => setBulkChannel('sms')} className="hidden"/>
                                        <ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>
                                        <span className="font-bold">SMS</span>
                                     </label>
                                     <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${bulkChannel === 'email' ? 'border-purple-500 bg-purple-50 text-purple-800' : 'border-border-default hover:bg-bg-hover'}`}>
                                        <input type="radio" name="bulk_channel" value="email" checked={bulkChannel === 'email'} onChange={() => setBulkChannel('email')} className="hidden"/>
                                        <EnvelopeIcon className="w-5 h-5"/>
                                        <span className="font-bold">Email</span>
                                     </label>
                                </div>
                            </div>

                            {/* Message Body */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-sm font-semibold text-text-muted">{t('communication.message_content')}</label>
                                    <div className="relative" ref={templatesRef}>
                                        <button 
                                            onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                                            className="text-xs font-semibold text-primary-600 hover:bg-primary-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                        >
                                            <DocumentTextIcon className="w-3.5 h-3.5" />
                                            {t('communication.choose_template')}
                                        </button>
                                        {isTemplatesOpen && (
                                            <div className="absolute left-0 bottom-full mb-2 w-64 bg-white border border-border-default rounded-lg shadow-xl z-20 overflow-hidden">
                                                <div className="p-2 border-b border-border-subtle bg-bg-subtle/50 text-xs font-bold text-text-muted">{t('communication.choose_template')}</div>
                                                <div className="max-h-48 overflow-y-auto">
                                                    {mockTemplates.map(t => (
                                                        <button 
                                                            key={t.id}
                                                            onClick={() => handleTemplateSelect(t.content)}
                                                            className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover border-b border-border-subtle last:border-0 truncate"
                                                        >
                                                            {t.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <textarea 
                                    className="w-full bg-bg-input border border-border-default rounded-xl p-4 min-h-[150px] focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                                    placeholder={t('communication.type_message')}
                                    value={bulkMessage}
                                    onChange={(e) => setBulkMessage(e.target.value)}
                                />
                                <div className="flex justify-between items-center mt-2">
                                     <button className="text-primary-600 text-xs font-semibold hover:underline flex items-center gap-1">
                                         <SparklesIcon className="w-3 h-3" />
                                         {t('communication.use_ai')}
                                     </button>
                                     <span className="text-xs text-text-subtle">{bulkMessage.length} {t('communication.chars')}</span>
                                </div>
                            </div>
                            
                            <button 
                                onClick={() => onBulkSend(bulkChannel, bulkMessage)}
                                disabled={!bulkMessage.trim()}
                                className="w-full bg-primary-600 text-white font-bold py-3 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <PaperAirplaneIcon className="w-5 h-5 transform rotate-180" />
                                <span>{t('communication.send_to', {count: selectedMessages.length})}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
    
    // For single message view within ReadingPane when selectedMessages.length === 1
    // We delegate to MessageDetailPane
    return <MessageDetailPane msg={msg} onOpenCandidateSummary={() => {}} />;
};

const EntityInfoDrawer: React.FC<{ entity: MessageLog | null; isOpen: boolean; onClose: () => void }> = ({ entity, isOpen, onClose }) => {
    const { t } = useLanguage();
    if (!entity) return null;

    const getRecipientTypeLabel = (type: RecipientType) => {
        if (type === 'candidate') return t('communication.candidate');
        if (type === 'client') return t('communication.client');
        return t('communication.other');
    }

    return (
        <Drawer 
            isOpen={isOpen} 
            onClose={onClose} 
            title={t('communication.profile')} 
            footer={
                <button onClick={onClose} className="text-primary-600 font-bold hover:bg-primary-50 px-4 py-2 rounded-lg transition-colors">
                    {t('invite.cancel')}
                </button>
            }
        >
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-700 font-bold text-2xl shadow-sm border border-white">
                        {entity.recipientName.charAt(0)}
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-text-default">{entity.recipientName}</h3>
                        <span className="inline-block mt-1 px-2 py-0.5 bg-bg-subtle text-text-subtle text-xs rounded-full border border-border-default capitalize">
                            {getRecipientTypeLabel(entity.recipientType)}
                        </span>
                    </div>
                </div>
                
                <div className="space-y-3 bg-bg-subtle/50 p-4 rounded-xl border border-border-default">
                    {entity.recipientPhone && (
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm text-text-muted">
                                <PhoneIcon className="w-4 h-4"/>
                            </div>
                            <span className="text-sm font-medium text-text-default">{entity.recipientPhone}</span>
                        </div>
                    )}
                    {entity.recipientEmail && (
                        <div className="flex items-center gap-3">
                             <div className="p-2 bg-white rounded-lg shadow-sm text-text-muted">
                                <EnvelopeIcon className="w-4 h-4"/>
                            </div>
                            <span className="text-sm font-medium text-text-default">{entity.recipientEmail}</span>
                        </div>
                    )}
                </div>
            </div>
        </Drawer>
    );
};

// 5. Message Detail Pane (New component to handle single message view)
const MessageDetailPane: React.FC<{ 
    msg: MessageLog | null, 
    onOpenCandidateSummary?: (id: number) => void, 
    onArchive?: (id: number) => void 
}> = ({ msg, onOpenCandidateSummary, onArchive }) => {
    const { t } = useLanguage();
    const [inputValue, setInputValue] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
    const [isEntityInfoOpen, setIsEntityInfoOpen] = useState(false); // Drawer State
    const templatesRef = useRef<HTMLDivElement>(null);

    // Close templates dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (templatesRef.current && !templatesRef.current.contains(event.target as Node)) {
                setIsTemplatesOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset input on msg change
    useEffect(() => {
        setInputValue('');
        setEmailSubject('');
    }, [msg]);

    const handleTemplateSelect = (content: string) => {
        setInputValue(content.replace('{name}', msg?.recipientName.split(' ')[0] || ''));
        setIsTemplatesOpen(false);
    };
    
    const handleProfileClick = () => {
        if (msg && msg.candidateId && onOpenCandidateSummary) {
             onOpenCandidateSummary(msg.candidateId);
        } else {
             // Fallback for non-candidate or missing ID (e.g., just open local info drawer)
             setIsEntityInfoOpen(true);
        }
    };
    
    const handleArchiveClick = () => {
        if(msg && onArchive) {
            onArchive(msg.id);
        }
    };

    if (!msg) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-bg-subtle/30 text-text-muted h-full">
                <ChatBubbleBottomCenterTextIcon className="w-16 h-16 opacity-10 mb-4" />
                <p className="text-lg font-medium">{t('communication.select_conversation')}</p>
            </div>
        );
    }

    const isOutbound = msg.direction === 'outbound';
    
    // Determine active input channel style and icon based on message channel
    let inputBorderColor = 'border-border-default';
    let inputFocusRing = 'focus-within:ring-primary-500/20';
    let sendButtonColor = 'bg-primary-600 hover:bg-primary-700';
    let ChannelIconComponent = ChatBubbleBottomCenterTextIcon;
    let channelLabel = "הודעה";

    if (msg.channel === 'whatsapp') {
        inputBorderColor = 'border-[#25D366]';
        inputFocusRing = 'focus-within:ring-[#25D366]/30';
        sendButtonColor = 'bg-[#25D366] hover:bg-[#128C7E]';
        ChannelIconComponent = WhatsappIcon;
        channelLabel = "WhatsApp";
    } else if (msg.channel === 'email') {
        inputBorderColor = 'border-purple-500';
        inputFocusRing = 'focus-within:ring-purple-500/30';
        sendButtonColor = 'bg-purple-600 hover:bg-purple-700';
        ChannelIconComponent = EnvelopeIcon;
        channelLabel = "Email";
    }

    const getRecipientTypeLabel = (type: RecipientType) => {
        if (type === 'candidate') return t('communication.candidate');
        if (type === 'client') return t('communication.client');
        return t('communication.other');
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-bg-default md:bg-white relative overflow-hidden">
            {/* Detail Header */}
            <header className="px-6 py-4 border-b border-border-default flex justify-between items-start bg-white z-10 h-[72px]">
                <div className="flex items-center gap-4 cursor-pointer hover:opacity-80 transition" onClick={handleProfileClick}>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-primary-700 font-bold text-lg shadow-sm border border-white relative">
                        {msg.recipientName.charAt(0)}
                        {/* Channel Badge Overlay on Avatar */}
                        <div className={`absolute -bottom-1 -right-1 p-1 rounded-full border-2 border-white shadow-sm ${msg.channel === 'whatsapp' ? 'bg-[#25D366] text-white' : msg.channel === 'email' ? 'bg-purple-500 text-white' : 'bg-blue-500 text-white'}`}>
                            <ChannelIconComponent className="w-2.5 h-2.5" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-text-default flex items-center gap-2">
                            {msg.recipientName}
                            <span className="text-xs font-normal text-text-subtle bg-bg-subtle px-2 py-0.5 rounded-full border border-border-default">
                                {getRecipientTypeLabel(msg.recipientType)}
                            </span>
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-0.5">
                            {msg.recipientPhone && (
                                <span className="flex items-center gap-1">
                                    <PhoneIcon className="w-3 h-3" /> {msg.recipientPhone}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={handleArchiveClick}
                        className={`p-2 rounded-lg border border-transparent hover:border-border-default transition-all ${msg.isArchived ? 'text-primary-600 bg-primary-50 hover:bg-primary-100' : 'text-text-muted hover:bg-bg-subtle'}`}
                        title={msg.isArchived ? t('communication.restore') : t('communication.move_archive')}
                    >
                        {msg.isArchived ? <ArrowUturnLeftIcon className="w-5 h-5" /> : <ArchiveBoxIcon className="w-5 h-5" />}
                    </button>
                    <button 
                        onClick={handleProfileClick}
                        className="flex items-center gap-2 px-3 py-2 bg-primary-50 text-primary-700 text-xs font-bold rounded-lg hover:bg-primary-100 transition-colors"
                    >
                        <UserIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('communication.profile')}</span>
                    </button>
                </div>
            </header>

            {/* Conversation Log View */}
            <div className="flex-1 overflow-y-auto p-6 bg-bg-subtle/30 space-y-6 relative">
                 {/* Entity Info Drawer Overlay - Only used for fallback/non-candidate entities now */}
                 <EntityInfoDrawer 
                    entity={msg} 
                    isOpen={isEntityInfoOpen} 
                    onClose={() => setIsEntityInfoOpen(false)} 
                />

                {/* Context Card */}
                {msg.relatedJob && (
                    <div className="flex justify-center">
                        <div className="bg-blue-50/80 text-blue-800 text-xs px-4 py-2 rounded-full shadow-sm border border-blue-100 flex items-center gap-2">
                            <BriefcaseIcon className="w-3.5 h-3.5" />
                            {t('communication.linked_job')}: <strong>{msg.relatedJob}</strong>
                        </div>
                    </div>
                )}

                {/* Date Separator */}
                <div className="flex justify-center">
                    <span className="text-[10px] font-bold text-text-subtle bg-bg-subtle px-3 py-1 rounded-full">
                        {new Date(msg.timestamp).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                </div>

                {/* The Message Bubble */}
                <div className={`flex w-full ${isOutbound ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] md:max-w-[60%] flex gap-3 ${isOutbound ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className="flex-shrink-0 mt-auto">
                            {isOutbound ? (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 font-bold border-2 border-white shadow-sm" title={msg.agentName}>
                                    {msg.agentName.charAt(0)}
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-xs font-bold border-2 border-white shadow-sm">
                                    {msg.recipientName.charAt(0)}
                                </div>
                            )}
                        </div>

                        <div className={`relative p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
                            isOutbound 
                                ? 'bg-white text-text-default rounded-bl-none border border-border-default' 
                                : 'bg-primary-600 text-white rounded-br-none'
                        }`}>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                            
                            <div className={`mt-2 flex items-center gap-1.5 text-[10px] ${isOutbound ? 'text-text-subtle' : 'text-primary-200'} justify-end`}>
                                <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                {isOutbound && (
                                    <>
                                        <span>•</span>
                                        <span className="capitalize flex items-center gap-1">
                                            {msg.channel} 
                                            <StatusIcon status={msg.status} />
                                        </span>
                                    </>
                                )}
                            </div>

                             {msg.status === 'failed' && (
                                <div className="mt-2 pt-2 border-t border-red-100 text-xs text-red-600 font-medium flex items-center gap-1">
                                    <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                                    {t('communication.error')}: {msg.errorMessage}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-border-default z-20">
                {/* Active Channel Indicator */}
                <div className={`flex items-center gap-2 mb-2 text-xs font-bold ${msg.channel === 'whatsapp' ? 'text-[#128C7E]' : msg.channel === 'email' ? 'text-purple-600' : 'text-blue-600'}`}>
                    <span>{t('communication.sending_via')}:</span>
                    <ChannelIconComponent className="w-3.5 h-3.5" />
                    <span>{channelLabel}</span>
                </div>

                <div className={`relative flex flex-col gap-2 bg-bg-input border ${inputBorderColor} rounded-2xl p-2 shadow-sm focus-within:ring-2 ${inputFocusRing} transition-all`}>
                    
                    {/* Subject Line for Email */}
                    {msg.channel === 'email' && (
                        <div className="px-1 pt-1 pb-2 border-b border-border-subtle">
                            <input 
                                type="text"
                                value={emailSubject}
                                onChange={(e) => setEmailSubject(e.target.value)}
                                placeholder={t('communication.email_subject')}
                                className="w-full bg-transparent border-none outline-none text-sm font-bold placeholder:font-normal"
                            />
                        </div>
                    )}

                    <div className="flex items-end gap-2">
                        <button className="p-2 text-text-subtle hover:text-primary-600 hover:bg-bg-subtle rounded-full transition-colors self-end">
                            <PaperClipIcon className="w-5 h-5" />
                        </button>
                        
                        <textarea 
                            rows={1}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="w-full bg-transparent border-none outline-none text-sm resize-none py-3 max-h-32 overflow-y-auto"
                            placeholder={t('communication.write_reply', {name: msg.recipientName})}
                        />
                        
                        <div className="flex items-center gap-1 self-end pb-1">
                            <div className="relative" ref={templatesRef}>
                                 <button 
                                    onClick={() => setIsTemplatesOpen(!isTemplatesOpen)}
                                    className="p-2 text-text-subtle hover:text-primary-600 hover:bg-bg-subtle rounded-full transition-colors" 
                                    title={t('communication.choose_template')}
                                >
                                    <DocumentTextIcon className="w-5 h-5" />
                                </button>
                                 {isTemplatesOpen && (
                                    <div className="absolute right-0 bottom-full mb-2 w-64 bg-white border border-border-default rounded-lg shadow-xl z-20 overflow-hidden">
                                        <div className="p-2 border-b border-border-subtle bg-bg-subtle/50 text-xs font-bold text-text-muted">{t('communication.choose_template')}</div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {mockTemplates.map(t => (
                                                <button 
                                                    key={t.id}
                                                    onClick={() => handleTemplateSelect(t.content)}
                                                    className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover border-b border-border-subtle last:border-0 truncate"
                                                >
                                                    {t.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                             <button className="p-2 text-text-subtle hover:text-primary-600 hover:bg-bg-subtle rounded-full transition-colors" title="AI">
                                <SparklesIcon className="w-5 h-5" />
                            </button>
                            <button className={`p-2 ${sendButtonColor} text-white rounded-xl shadow-md transition-transform active:scale-95 flex items-center justify-center`}>
                                <PaperAirplaneIcon className="w-5 h-5 transform rotate-180" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- MAIN WRAPPER ---
const CommunicationCenterView: React.FC<CommunicationCenterViewProps> = ({ onOpenCandidateSummary }) => {
    // Filter State
    const [filters, setFilters] = useState({
        search: '',
        startDate: '',
        endDate: '',
        recipientType: 'all',
        status: 'all',
        channel: 'all',
        sender: 'all',
        folder: 'inbox', // 'inbox' or 'archive'
    });
    
    // UI State
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<number[]>([]);
    const [selectedMsgIdForDetail, setSelectedMsgIdForDetail] = useState<number | null>(4); 
    const [isMobileListVisible, setIsMobileListVisible] = useState(true);

    // Mock Messages State - To allow archiving locally for demo
    const [messages, setMessages] = useState<MessageLog[]>(mockMessages);

    // FIX: Toggling archive state
    const handleToggleArchive = (id: number) => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, isArchived: !m.isArchived } : m));
        // If archived in inbox view, or restored in archive view, it disappears, so deselect detail.
        if (selectedMsgIdForDetail === id) setSelectedMsgIdForDetail(null);
    };

    // FIX: Bulk Archive Logic
    const handleBulkArchive = () => {
        const isArchiving = filters.folder === 'inbox';
        const actionName = isArchiving ? 'לארכיון' : 'לתיקייה הראשית';
        
        if (window.confirm(`האם להעביר ${selectedMsgIds.length} שיחות ${actionName}?`)) {
            setMessages(prev => 
                prev.map(m => selectedMsgIds.includes(m.id) ? { ...m, isArchived: isArchiving } : m)
            );
            setSelectedMsgIds([]);
        }
    };

    // Filtering Logic
    const filteredMessages = useMemo(() => {
        return messages.filter(m => {
            // Folder Filter
            if (filters.folder === 'inbox' && m.isArchived) return false;
            if (filters.folder === 'archive' && !m.isArchived) return false;

            const matchesSearch = !filters.search || 
                m.recipientName.includes(filters.search) || 
                m.content.includes(filters.search);
            
            const matchesRecipient = filters.recipientType === 'all' || m.recipientType === filters.recipientType;
            const matchesStatus = filters.status === 'all' || 
                (filters.status === 'sent' && m.status !== 'failed') ||
                (filters.status === 'failed' && m.status === 'failed');
            const matchesChannel = filters.channel === 'all' || m.channel === filters.channel;
            const matchesSender = filters.sender === 'all' || 
                (filters.sender === 'system' && m.agentName === 'מערכת') || 
                m.agentName.includes(filters.sender); 

            // Date filtering
            let matchesDate = true;
            if (filters.startDate) {
                matchesDate = new Date(m.timestamp) >= new Date(filters.startDate);
            }
            if (filters.endDate && matchesDate) {
                 matchesDate = new Date(m.timestamp) <= new Date(filters.endDate);
            }

            return matchesSearch && matchesRecipient && matchesStatus && matchesChannel && matchesSender && matchesDate;
        }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [filters, messages]);

    // Handlers
    const handleMessageSelect = (id: number) => {
        if (selectedMsgIds.length > 0) {
            handleToggleSelection(id);
        } else {
            setSelectedMsgIdForDetail(id);
            setIsMobileListVisible(false);
        }
    };

    const handleToggleSelection = (id: number) => {
        setSelectedMsgIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (ids: number[]) => {
        setSelectedMsgIds(ids);
    };
    
    const handleBulkSend = (channel: Channel, message: string) => {
        alert(`שולח ${channel} ל-${selectedMsgIds.length} נמענים:\n${message}`);
        setSelectedMsgIds([]);
    };

    // Derived: Selection
    const selectedMessagesObjects = useMemo(() => 
        messages.filter(m => selectedMsgIds.includes(m.id)), 
    [selectedMsgIds, messages]);

    const activeMessageForDetail = messages.find(m => m.id === selectedMsgIdForDetail) || null;

    return (
        <div className="flex h-full bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-hidden relative -m-2 sm:m-0">
            {/* 1. Filter Pane (Right) */}
            <FilterPane 
                filters={filters} 
                setFilters={setFilters}
                isOpenMobile={isMobileFiltersOpen}
                onCloseMobile={() => setIsMobileFiltersOpen(false)}
            />

            {/* 2. Message List Pane (Middle) */}
            <div className={`${isMobileListVisible ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-80 lg:w-96 h-full z-10`}>
                <MessageListPane 
                    messages={filteredMessages} 
                    selectedId={selectedMsgIds.length === 0 ? selectedMsgIdForDetail : null}
                    onSelect={handleMessageSelect}
                    searchTerm={filters.search}
                    onSearchChange={(val) => setFilters({...filters, search: val})}
                    selectedIds={selectedMsgIds}
                    onToggleSelection={handleToggleSelection}
                    onSelectAll={handleSelectAll}
                    onToggleMobileFilters={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                    folder={filters.folder as 'inbox'|'archive'}
                />
            </div>

            {/* 3. Reading / Action Pane (Left) */}
            <div className={`${!isMobileListVisible ? 'flex' : 'hidden'} md:flex flex-1 flex-col h-full z-20 absolute inset-0 md:static bg-white`}>
                 {/* Mobile Back Button Header */}
                 <div className="md:hidden p-3 border-b border-border-default flex items-center gap-2 bg-white">
                    <button onClick={() => setIsMobileListVisible(true)} className="p-2 -mr-2">
                        <ArrowPathIcon className="w-5 h-5 transform rotate-90" />
                    </button>
                    <span className="font-bold">חזרה לרשימה</span>
                 </div>
                 
                 {selectedMsgIds.length > 0 ? (
                    <ReadingPane 
                        selectedMessages={selectedMessagesObjects} 
                        onBulkSend={handleBulkSend}
                        onBulkArchive={handleBulkArchive}
                    />
                 ) : (
                    <MessageDetailPane 
                        msg={activeMessageForDetail} 
                        onOpenCandidateSummary={onOpenCandidateSummary} 
                        onArchive={handleToggleArchive}
                    />
                 )}
            </div>
        </div>
    );
};

export default CommunicationCenterView;
