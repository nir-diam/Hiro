
import React, { useState, useMemo } from 'react';
import { 
    MagnifyingGlassIcon, FunnelIcon, UserGroupIcon, CalendarDaysIcon, 
    CheckCircleIcon, ExclamationTriangleIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon, 
    WhatsappIcon, PaperAirplaneIcon, ArrowPathIcon, ChevronDownIcon, ClockIcon, 
    XMarkIcon, UserIcon, BriefcaseIcon, PaperClipIcon, CheckIcon, BuildingOffice2Icon
} from './Icons';

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
    recipientType: RecipientType; // NEW FIELD
    recipientPhone?: string;
    recipientEmail?: string;
    content: string;
    status: MsgStatus;
    timestamp: string;
    agentName: string;
    relatedJob?: string;
    hasAttachment: boolean;
    errorMessage?: string;
}

// --- MOCK DATA ---
const mockMessages: MessageLog[] = [
    {
        id: 1, channel: 'whatsapp', direction: 'outbound', recipientName: 'גדעון שפירא', recipientType: 'candidate', recipientPhone: '054-1234567',
        content: 'היי גדעון, ראיתי את קורות החיים שלך למשרת מנהל שיווק. אשמח לתאם שיחה קצרה.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
        agentName: 'דנה כהן', relatedJob: 'מנהל/ת שיווק דיגיטלי', hasAttachment: false
    },
    {
        id: 2, channel: 'email', direction: 'outbound', recipientName: 'נועה לוי', recipientType: 'candidate', recipientEmail: 'noa@gmail.com',
        content: 'זימון לראיון עבודה - בזק. שלום נועה, בהמשך לשיחתנו...',
        status: 'delivered', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
        agentName: 'אביב לוי', relatedJob: 'מפתח/ת Fullstack', hasAttachment: true
    },
    {
        id: 3, channel: 'sms', direction: 'outbound', recipientName: 'דוד כהן', recipientType: 'candidate', recipientPhone: '052-9999999',
        content: 'דוד שלום, נסינו להשיגך בקשר למשרת נהג חלוקה. אנא חזור אלינו.',
        status: 'failed', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
        agentName: 'מערכת', relatedJob: 'נהג חלוקה', hasAttachment: false, errorMessage: 'מספר שגוי או חסום'
    },
    {
        id: 4, channel: 'whatsapp', direction: 'inbound', recipientName: 'גדעון שפירא', recipientType: 'candidate', recipientPhone: '054-1234567',
        content: 'היי דנה, תודה על הפנייה. אני זמין מחר ב-10 בבוקר.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        agentName: 'דנה כהן', relatedJob: 'מנהל/ת שיווק דיגיטלי', hasAttachment: false
    },
    {
        id: 5, channel: 'email', direction: 'outbound', recipientName: 'רון שחר', recipientType: 'candidate', recipientEmail: 'ron@walla.co.il',
        content: 'עדכון לגבי מועמדותך. לצערנו החלטנו להתקדם עם מועמדים אחרים.',
        status: 'sent', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
        agentName: 'יעל שחר', relatedJob: 'אנליסט נתונים', hasAttachment: false
    },
    {
        id: 6, channel: 'whatsapp', direction: 'outbound', recipientName: 'מיכל אברהמי', recipientType: 'client', recipientPhone: '050-1112223',
        content: 'היי מיכל (HR בזק), שלחתי לך במייל את קורות החיים של גדעון. אשמח לפידבק.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
        agentName: 'דנה כהן', relatedJob: 'מנהל/ת שיווק', hasAttachment: false
    },
    {
        id: 7, channel: 'sms', direction: 'outbound', recipientName: 'יוסי בניון', recipientType: 'candidate', recipientPhone: '055-5555555',
        content: 'שלום יוסי, קיבלנו את פרטיך. ניצור קשר בהקדם.',
        status: 'delivered', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
        agentName: 'מערכת', relatedJob: 'מחסנאי', hasAttachment: false
    },
    {
        id: 8, channel: 'email', direction: 'outbound', recipientName: 'ישראל ישראלי', recipientType: 'client', recipientEmail: 'israel@getter.co.il',
        content: 'סיכום שבועי - גיוסים פתוחים. היי ישראל, מצורף דוח סטטוס...',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        agentName: 'אביב לוי', relatedJob: 'כללי', hasAttachment: true
    },
    {
        id: 9, channel: 'whatsapp', direction: 'outbound', recipientName: 'יעל שחר', recipientType: 'recruiter', recipientPhone: '050-0000000',
        content: 'היי יעל, את יכולה לחזור למועמד דוד? הוא חיפש אותך.',
        status: 'read', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        agentName: 'דנה כהן', relatedJob: '', hasAttachment: false
    }
];

// --- COMPONENTS ---

const StatusIcon: React.FC<{ status: MsgStatus; channel: Channel }> = ({ status, channel }) => {
    if (status === 'failed') return <span title="נכשל"><ExclamationTriangleIcon className="w-4 h-4 text-red-500" /></span>;
    
    // For WhatsApp, we simulate checks
    if (channel === 'whatsapp') {
        if (status === 'read') return <div className="flex -space-x-1" title="נקרא"><CheckIcon className="w-3 h-3 text-blue-500"/><CheckIcon className="w-3 h-3 text-blue-500"/></div>;
        if (status === 'delivered') return <div className="flex -space-x-1" title="התקבל"><CheckIcon className="w-3 h-3 text-gray-400"/><CheckIcon className="w-3 h-3 text-gray-400"/></div>;
        return <span title="נשלח"><CheckIcon className="w-3 h-3 text-gray-400" /></span>;
    }

    if (status === 'read') return <span title="נקרא"><CheckCircleIcon className="w-4 h-4 text-green-500" /></span>;
    if (status === 'delivered') return <span title="התקבל במכשיר"><CheckCircleIcon className="w-4 h-4 text-gray-400" /></span>;
    return <span title="נשלח"><CheckIcon className="w-4 h-4 text-gray-300" /></span>;
};

const ChannelIcon: React.FC<{ channel: Channel }> = ({ channel }) => {
    switch (channel) {
        case 'whatsapp': return <div className="p-1.5 bg-[#25D366]/10 rounded-full"><WhatsappIcon className="w-4 h-4 text-[#25D366]" /></div>;
        case 'sms': return <div className="p-1.5 bg-blue-50 rounded-full"><ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-blue-500" /></div>;
        case 'email': return <div className="p-1.5 bg-purple-50 rounded-full"><EnvelopeIcon className="w-4 h-4 text-purple-500" /></div>;
    }
};

const RecipientTypeIcon: React.FC<{ type: RecipientType }> = ({ type }) => {
    switch (type) {
        case 'candidate': return <UserIcon className="w-3 h-3" />;
        case 'client': return <BuildingOffice2Icon className="w-3 h-3" />;
        case 'recruiter': return <BriefcaseIcon className="w-3 h-3" />;
    }
};

const getRecipientLabel = (type: RecipientType) => {
    switch (type) {
        case 'candidate': return 'מועמד';
        case 'client': return 'לקוח';
        case 'recruiter': return 'רכז';
    }
};

const getRecipientColor = (type: RecipientType) => {
    switch (type) {
        case 'candidate': return 'bg-blue-50 text-blue-700 border-blue-100';
        case 'client': return 'bg-purple-50 text-purple-700 border-purple-100';
        case 'recruiter': return 'bg-orange-50 text-orange-700 border-orange-100';
    }
};

const MessageCard: React.FC<{ msg: MessageLog; onClick: () => void; isSelected: boolean }> = ({ msg, onClick, isSelected }) => {
    const isFailed = msg.status === 'failed';
    const borderClass = isFailed ? 'border-red-300 bg-red-50/30' : isSelected ? 'border-primary-500 bg-primary-50/50' : 'border-border-default bg-bg-card hover:border-primary-300';
    const recipientStyle = getRecipientColor(msg.recipientType);
    
    return (
        <div 
            onClick={onClick}
            className={`relative p-4 rounded-xl border transition-all cursor-pointer group ${borderClass}`}
        >
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${isFailed ? 'bg-red-100 text-red-600' : 'bg-primary-100 text-primary-600'}`}>
                        {msg.recipientName.split(' ').map(n => n[0]).join('').slice(0,2)}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="font-bold text-text-default text-sm truncate">{msg.recipientName}</h4>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${recipientStyle}`}>
                                <RecipientTypeIcon type={msg.recipientType} />
                                {getRecipientLabel(msg.recipientType)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                            <ChannelIcon channel={msg.channel} />
                            <span>{msg.direction === 'inbound' ? 'נכנס' : 'יוצא'}</span>
                            <span>•</span>
                            <span>{new Date(msg.timestamp).toLocaleTimeString('he-IL', {hour: '2-digit', minute: '2-digit'})}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <StatusIcon status={msg.status} channel={msg.channel} />
                        {msg.hasAttachment && <PaperClipIcon className="w-3 h-3 text-text-subtle" />}
                </div>
            </div>
            
            <p className={`text-sm line-clamp-2 leading-relaxed ${isFailed ? 'text-red-800' : 'text-text-muted'}`}>
                {msg.content}
            </p>

            {msg.relatedJob && (
                <div className="mt-3 flex items-center gap-1 text-[10px] text-text-subtle bg-bg-subtle/50 px-2 py-1 rounded w-fit">
                    <BriefcaseIcon className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{msg.relatedJob}</span>
                </div>
            )}
            
            {isFailed && (
                <div className="absolute top-2 left-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                </div>
            )}
        </div>
    );
};

const CommunicationCenterView: React.FC = () => {
    const [selectedMsgId, setSelectedMsgId] = useState<number | null>(null);
    const [filterChannel, setFilterChannel] = useState<'all' | Channel>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'failed' | 'sent'>('all');
    const [filterRecipientType, setFilterRecipientType] = useState<'all' | RecipientType>('all');
    const [filterDateFrom, setFilterDateFrom] = useState<string>(''); // YYYY-MM-DD
    const [filterDateTo, setFilterDateTo] = useState<string>(''); // YYYY-MM-DD
    const [searchTerm, setSearchTerm] = useState('');

    const selectedMsg = mockMessages.find(m => m.id === selectedMsgId);

    const filteredMessages = useMemo(() => {
        return mockMessages.filter(msg => {
            const matchesSearch = 
                msg.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                msg.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                msg.agentName.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesChannel = filterChannel === 'all' || msg.channel === filterChannel;
            
            const matchesStatus = filterStatus === 'all' || 
                                  (filterStatus === 'failed' && msg.status === 'failed') ||
                                  (filterStatus === 'sent' && msg.status !== 'failed');
            
            const matchesRecipientType = filterRecipientType === 'all' || msg.recipientType === filterRecipientType;

            let matchesDate = true;
            if (filterDateFrom) {
                const fromDate = new Date(filterDateFrom);
                fromDate.setHours(0, 0, 0, 0);
                if (new Date(msg.timestamp) < fromDate) matchesDate = false;
            }
            if (filterDateTo && matchesDate) {
                const toDate = new Date(filterDateTo);
                toDate.setHours(23, 59, 59, 999);
                if (new Date(msg.timestamp) > toDate) matchesDate = false;
            }

            return matchesSearch && matchesChannel && matchesStatus && matchesRecipientType && matchesDate;
        });
    }, [searchTerm, filterChannel, filterStatus, filterRecipientType, filterDateFrom, filterDateTo]);

    // Calculate stats based on the FILTERED view (Dynamic)
    const stats = useMemo(() => {
        return {
            total: filteredMessages.length,
            failed: filteredMessages.filter(m => m.status === 'failed').length,
            sent: filteredMessages.filter(m => m.status !== 'failed' && m.direction === 'outbound').length
        };
    }, [filteredMessages]);

    // Helper to clear filters
    const clearFilters = () => {
        setFilterChannel('all');
        setFilterStatus('all');
        setFilterRecipientType('all');
        setFilterDateFrom('');
        setFilterDateTo('');
        setSearchTerm('');
    };

    const hasActiveFilters = filterChannel !== 'all' || filterStatus !== 'all' || filterRecipientType !== 'all' || filterDateFrom !== '' || filterDateTo !== '' || searchTerm !== '';

    return (
        <div className="h-full flex flex-col -m-6 bg-bg-default">
             {/* Header */}
             <div className="bg-bg-card border-b border-border-default p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10 shadow-sm">
                <div>
                    <h1 className="text-xl font-bold text-text-default flex items-center gap-2">
                        <ChatBubbleBottomCenterTextIcon className="w-6 h-6 text-primary-500" />
                        מרכז תקשורת
                    </h1>
                    <p className="text-sm text-text-muted">מעקב ובקרה על כל ערוצי התקשורת</p>
                </div>
                
                {/* Top Stats - Dynamic based on filters */}
                <div className="flex gap-3 bg-bg-subtle/50 p-2 rounded-lg border border-border-default">
                    <div className="flex flex-col items-center px-4 border-l border-border-default">
                        <span className="text-xs text-text-muted">נשלחו (בסינון)</span>
                        <span className="text-lg font-bold text-text-default">{stats.sent}</span>
                    </div>
                    <div className="flex flex-col items-center px-4 border-l border-border-default">
                        <span className="text-xs text-text-muted">נכשלו</span>
                        <span className="text-lg font-bold text-red-600">{stats.failed}</span>
                    </div>
                    <div className="flex flex-col items-center px-4">
                        <span className="text-xs text-text-muted">סה"כ</span>
                        <span className="text-lg font-bold text-text-default">{stats.total}</span>
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-hidden flex flex-row">
                 
                 {/* Right Sidebar - Filters */}
                 <div className="w-72 bg-bg-card border-l border-border-default flex-shrink-0 flex flex-col overflow-y-auto hidden md:flex">
                     <div className="p-4 space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-text-default">סינון וחיפוש</h3>
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="text-xs text-primary-600 hover:underline">איפוס</button>
                            )}
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder="חיפוש חופשי..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-primary-500"
                            />
                        </div>

                        {/* Date Range Filter */}
                        <div>
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">טווח תאריכים</h4>
                            <div className="space-y-2">
                                <div>
                                    <label className="text-xs text-text-subtle mb-1 block">מתאריך:</label>
                                    <input 
                                        type="date" 
                                        value={filterDateFrom} 
                                        onChange={(e) => setFilterDateFrom(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-text-subtle mb-1 block">עד תאריך:</label>
                                    <input 
                                        type="date" 
                                        value={filterDateTo} 
                                        onChange={(e) => setFilterDateTo(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Recipient Type Filter - NEW */}
                        <div>
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">נשלח אל (סוג נמען)</h4>
                            <div className="space-y-1">
                                <button onClick={() => setFilterRecipientType('all')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterRecipientType === 'all' ? 'bg-primary-50 text-primary-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    כל הנמענים
                                </button>
                                <button onClick={() => setFilterRecipientType('candidate')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${filterRecipientType === 'candidate' ? 'bg-blue-50 text-blue-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    <UserIcon className="w-4 h-4"/> מועמדים
                                </button>
                                <button onClick={() => setFilterRecipientType('client')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${filterRecipientType === 'client' ? 'bg-purple-50 text-purple-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    <BuildingOffice2Icon className="w-4 h-4"/> לקוחות
                                </button>
                                <button onClick={() => setFilterRecipientType('recruiter')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${filterRecipientType === 'recruiter' ? 'bg-orange-50 text-orange-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    <BriefcaseIcon className="w-4 h-4"/> רכזים
                                </button>
                            </div>
                        </div>

                        <hr className="border-border-default" />

                        {/* Status Folders */}
                        <div>
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">סטטוס הודעה</h4>
                            <div className="space-y-1">
                                <button onClick={() => setFilterStatus('all')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'all' ? 'bg-bg-subtle text-text-default' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    הכל
                                </button>
                                <button onClick={() => setFilterStatus('sent')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'sent' ? 'bg-green-50 text-green-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    נשלחו בהצלחה
                                </button>
                                <button onClick={() => setFilterStatus('failed')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium transition-colors flex justify-between items-center ${filterStatus === 'failed' ? 'bg-red-50 text-red-700' : 'text-text-default hover:bg-bg-subtle'}`}>
                                    <span>שגיאות שליחה</span>
                                </button>
                            </div>
                        </div>

                        {/* Channels */}
                        <div>
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">ערוץ תקשורת</h4>
                            <div className="space-y-1">
                                <button onClick={() => setFilterChannel('all')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${filterChannel === 'all' ? 'bg-bg-subtle' : 'hover:bg-bg-subtle'}`}>
                                    <div className="w-2 h-2 rounded-full bg-gray-400"></div> הכל
                                </button>
                                <button onClick={() => setFilterChannel('whatsapp')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${filterChannel === 'whatsapp' ? 'bg-green-50' : 'hover:bg-bg-subtle'}`}>
                                    <WhatsappIcon className="w-4 h-4 text-[#25D366]" /> WhatsApp
                                </button>
                                <button onClick={() => setFilterChannel('sms')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${filterChannel === 'sms' ? 'bg-blue-50' : 'hover:bg-bg-subtle'}`}>
                                    <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-blue-500" /> SMS
                                </button>
                                <button onClick={() => setFilterChannel('email')} className={`w-full text-right px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${filterChannel === 'email' ? 'bg-purple-50' : 'hover:bg-bg-subtle'}`}>
                                    <EnvelopeIcon className="w-4 h-4 text-purple-500" /> Email
                                </button>
                            </div>
                        </div>
                        
                        {/* Agent */}
                         <div>
                            <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">נשלח על ידי</h4>
                            <select className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                <option>כל הרכזים</option>
                                <option>דנה כהן</option>
                                <option>אביב לוי</option>
                                <option>מערכת (אוטומטי)</option>
                            </select>
                        </div>
                     </div>
                 </div>

                 {/* Center - Feed */}
                 <div className="flex-1 bg-bg-subtle/30 overflow-y-auto p-4 md:p-6">
                     <div className="max-w-3xl mx-auto space-y-3">
                         {filteredMessages.map(msg => (
                             <MessageCard 
                                key={msg.id} 
                                msg={msg} 
                                onClick={() => setSelectedMsgId(msg.id)}
                                isSelected={selectedMsgId === msg.id}
                             />
                         ))}
                         {filteredMessages.length === 0 && (
                             <div className="text-center py-20 text-text-muted">
                                 <FunnelIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                 <p className="font-semibold">לא נמצאו הודעות התואמות את הסינון.</p>
                                 <button onClick={clearFilters} className="text-primary-600 hover:underline mt-2 text-sm">נקה פילטרים</button>
                             </div>
                         )}
                     </div>
                 </div>

                 {/* Left - Detail Drawer (Slide over) */}
                 {selectedMsg && (
                     <div className="w-96 bg-bg-card border-r border-border-default flex-shrink-0 flex flex-col shadow-xl z-20 absolute left-0 h-full md:relative animate-fade-in">
                         <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/50">
                             <h3 className="font-bold text-text-default">פרטי הודעה</h3>
                             <button onClick={() => setSelectedMsgId(null)} className="p-1 rounded-full hover:bg-bg-hover text-text-muted">
                                 <XMarkIcon className="w-5 h-5" />
                             </button>
                         </div>
                         
                         <div className="flex-1 overflow-y-auto p-6">
                             {/* Header Info */}
                             <div className="text-center mb-6">
                                 <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-3 ${selectedMsg.recipientType === 'client' ? 'bg-purple-100 text-purple-600' : selectedMsg.recipientType === 'recruiter' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                     {selectedMsg.recipientName.split(' ').map(n => n[0]).join('').slice(0,2)}
                                 </div>
                                 <h2 className="text-xl font-bold text-text-default">{selectedMsg.recipientName}</h2>
                                 <div className={`flex items-center justify-center gap-2 text-sm mt-1 px-3 py-1 rounded-full w-fit mx-auto ${getRecipientColor(selectedMsg.recipientType)}`}>
                                     <RecipientTypeIcon type={selectedMsg.recipientType} />
                                     <span>{getRecipientLabel(selectedMsg.recipientType)}</span>
                                 </div>
                             </div>

                             {/* Message Details Box */}
                             <div className={`rounded-xl border p-4 mb-6 ${selectedMsg.status === 'failed' ? 'bg-red-50 border-red-200' : 'bg-bg-subtle border-border-default'}`}>
                                 <div className="flex justify-between items-start mb-4">
                                     <div className="flex items-center gap-2">
                                         <ChannelIcon channel={selectedMsg.channel} />
                                         <span className="font-semibold text-sm">{selectedMsg.channel.toUpperCase()}</span>
                                     </div>
                                     <div className="text-xs text-text-muted">
                                         {new Date(selectedMsg.timestamp).toLocaleString('he-IL')}
                                     </div>
                                 </div>
                                 
                                 <div className="bg-bg-card rounded-lg p-3 border border-border-default text-sm leading-relaxed mb-3">
                                     {selectedMsg.content}
                                 </div>

                                 {selectedMsg.errorMessage && (
                                     <div className="flex items-start gap-2 text-xs text-red-700 font-medium bg-red-100/50 p-2 rounded">
                                         <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                                         <span>שגיאה: {selectedMsg.errorMessage}</span>
                                     </div>
                                 )}

                                 <div className="flex justify-between items-center mt-3 pt-3 border-t border-border-default/50 text-xs">
                                     <div className="text-text-muted">
                                         נשלח ע"י: <span className="font-semibold text-text-default">{selectedMsg.agentName}</span>
                                     </div>
                                     <div className="flex items-center gap-1">
                                         <StatusIcon status={selectedMsg.status} channel={selectedMsg.channel} />
                                         <span className="capitalize">{selectedMsg.status}</span>
                                     </div>
                                 </div>
                             </div>
                             
                             {/* Context */}
                             {selectedMsg.relatedJob && (
                                <div className="space-y-4">
                                     <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">הקשר</h4>
                                     <div className="flex items-center gap-3 p-3 rounded-lg border border-border-default hover:bg-bg-subtle transition cursor-pointer">
                                         <BriefcaseIcon className="w-5 h-5 text-primary-500" />
                                         <div className="flex-1 min-w-0">
                                             <p className="text-sm font-bold text-text-default truncate">{selectedMsg.relatedJob}</p>
                                             <p className="text-xs text-text-muted">משרה מקושרת</p>
                                         </div>
                                         <ArrowPathIcon className="w-4 h-4 text-text-subtle" />
                                     </div>
                                 </div>
                             )}

                         </div>

                         {/* Actions Footer */}
                         <div className="p-4 border-t border-border-default bg-bg-subtle/30">
                             {selectedMsg.status === 'failed' ? (
                                 <button className="w-full flex items-center justify-center gap-2 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 transition shadow-sm">
                                     <ArrowPathIcon className="w-5 h-5" />
                                     <span>נסה לשלוח שוב</span>
                                 </button>
                             ) : (
                                 <button className="w-full flex items-center justify-center gap-2 bg-bg-card border border-border-default text-text-default font-bold py-2.5 rounded-xl hover:bg-bg-subtle transition">
                                     <PaperAirplaneIcon className="w-5 h-5" />
                                     <span>השב להודעה</span>
                                 </button>
                             )}
                         </div>
                     </div>
                 )}
             </div>
        </div>
    );
};

export default CommunicationCenterView;
