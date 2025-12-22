
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, Cog6ToothIcon, Squares2X2Icon, TableCellsIcon, AvatarIcon, 
    PencilIcon, PaperAirplaneIcon, ChevronDownIcon, XMarkIcon, CheckCircleIcon,
    ClockIcon, CalendarIcon, PhoneIcon, EnvelopeIcon, WhatsappIcon, SmsSlashIcon,
    Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon, ChevronUpIcon
} from './Icons';
import UpdateStatusModal from './UpdateStatusModal';


// --- TYPES ---
type ReferralStatus = 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'נדחה';

interface InterviewQA {
  question: string;
  answer: string;
}

interface ClientContact {
    id: number;
    name: string;
    email: string;
}

interface Referral {
  id: number;
  candidateName: string;
  avatar: string;
  clientName: string;
  jobTitle: string;
  coordinator: string;
  status: ReferralStatus;
  referralDate: string;
  lastUpdatedBy: string;
  source: string;
  interviewQA: InterviewQA[];
  feedbackSummary: string;
  clientContacts: ClientContact[];
}


// --- MOCK DATA ---
const referralsData: Referral[] = [
    { 
        id: 1, 
        candidateName: 'שפירא גדעון', 
        avatar: 'שג', 
        clientName: 'בזק', 
        jobTitle: 'מנהל/ת שיווק דיגיטלי', 
        coordinator: 'דנה כהן', 
        status: 'ראיון', 
        referralDate: '2025-07-20', 
        lastUpdatedBy: 'דנה כהן', 
        source: 'AllJobs',
        interviewQA: [
            { question: 'מה התקציב הגדול ביותר שניהלת?', answer: 'ניהלתי תקציב חודשי של 250,000 ש"ח בקמפיינים בגוגל ופייסבוק.' },
            { question: 'ספר על קמפיין מוצלח שהובלת.', answer: 'הובלתי קמפיין השקה למוצר חדש שהביא לעלייה של 30% בלידים בחודש הראשון.' }
        ],
        feedbackSummary: 'מועמד מרשים עם ניסיון רלוונטי רב. הראה הבנה עמוקה של התחום והציג יכולות אנליטיות גבוהות. מומלץ להמשיך לשלב הבא.',
        clientContacts: [
            { id: 101, name: 'יוסי כהן (מנהל שיווק)', email: 'yossi@bezeq.co.il' },
            { id: 102, name: 'שירה לוי (HR)', email: 'shira@bezeq.co.il' }
        ]
    },
    { 
        id: 2, 
        candidateName: 'כהן מאיה', 
        avatar: 'כמ', 
        clientName: 'Wix', 
        jobTitle: 'מפתחת Fullstack', 
        coordinator: 'אביב לוי', 
        status: 'בבדיקה', 
        referralDate: '2025-07-19', 
        lastUpdatedBy: 'אביב לוי', 
        source: 'LinkedIn',
        interviewQA: [
            { question: 'מה הניסיון שלך עם React ו-Node.js?', answer: '5 שנות ניסיון עם React, 3 עם Node.js. עבדתי על פרויקטים גדולים בשני התחומים.' },
            { question: 'האם יש לך ניסיון עם TypeScript?', answer: 'כן, בכל הפרויקטים האחרונים שלי השתמשתי ב-TypeScript.' }
        ],
        feedbackSummary: 'מפתחת חזקה מאוד, מרגישה בנוח עם הטכנולוגיות שלנו. התקשורת איתה טובה, נראית מתאימה לצוות.',
        clientContacts: [
            { id: 201, name: 'איתי לוי (ראש צוות)', email: 'itai@wix.com' },
        ]
    },
    { 
        id: 3, 
        candidateName: 'לוי דוד', 
        avatar: 'לד', 
        clientName: 'Fiverr', 
        jobTitle: 'מעצב UX/UI', 
        coordinator: 'דנה כהן', 
        status: 'חדש', 
        referralDate: '2025-07-18', 
        lastUpdatedBy: 'מערכת', 
        source: 'חבר מביא חבר',
        interviewQA: [],
        feedbackSummary: 'עדיין לא בוצע סינון טלפוני.',
        clientContacts: [
            { id: 301, name: 'נעמה ברק (מנהלת עיצוב)', email: 'naama@fiverr.com' },
        ]
    },
    { 
        id: 4, 
        candidateName: 'ישראלי יעל', 
        avatar: 'יי', 
        clientName: 'אלביט מערכות', 
        jobTitle: 'מהנדסת QA', 
        coordinator: 'יעל שחר', 
        status: 'נדחה', 
        referralDate: '2025-07-17', 
        lastUpdatedBy: 'יעל שחר', 
        source: 'Ethosia',
        interviewQA: [
            { question: 'מה הניסיון שלך בבדיקות אוטומטיות?', answer: 'יש לי ניסיון בסיסי, בעיקר ב-Selenium, אבל רוב העבודה שלי הייתה בבדיקות ידניות.' }
        ],
        feedbackSummary: 'המועמדת נחמדה אך חסרת ניסיון מספק בבדיקות אוטומציה, שזו דרישת חובה למשרה. לא ממשיכים בתהליך.',
        clientContacts: [
            { id: 401, name: 'דניאל שוורץ (ראש צוות QA)', email: 'daniel@elbit.co.il' },
        ]
    },
    { 
        id: 5, 
        candidateName: 'מזרחי אבי', 
        avatar: 'מא', 
        clientName: 'תנובה', 
        jobTitle: 'מנהל מוצר', 
        coordinator: 'אביב לוי', 
        status: 'התקבל', 
        referralDate: '2025-07-16', 
        lastUpdatedBy: 'אביב לוי', 
        source: 'GotFriends',
        interviewQA: [
            { question: 'ספר על מוצר שהובלת מא\' ועד ת\'.', answer: 'הובלתי את כל תהליך האפיון, פיתוח והשקה של אפליקציית ניהול מלאי חדשה.' }
        ],
        feedbackSummary: 'מועמד מעולה, ניסיון רלוונטי והתאמה תרבותית. עבר את כל השלבים בהצלחה וקיבל הצעה.',
        clientContacts: [
            { id: 501, name: 'רוני שקד (סמנכ"ל מוצר)', email: 'roni@tnuva.co.il' },
        ]
    },
    { id: 6, candidateName: 'פרידמן שרה', avatar: 'פש', clientName: 'Nisha', jobTitle: 'מהנדסת QA | אוטומציה', coordinator: 'יעל שחר', status: 'חדש', referralDate: '2025-07-10', lastUpdatedBy: 'מערכת', source: 'Nisha', interviewQA: [], feedbackSummary: 'טרם נוצר קשר.', clientContacts: [{ id: 601, name: 'جهة اتصال', email: 'contact@nisha.com' }] },
];

const allColumns: { id: keyof Referral | 'actions'; header: string }[] = [
  { id: 'candidateName', header: 'שם המועמד' },
  { id: 'clientName', header: 'שם הלקוח' },
  { id: 'jobTitle', header: 'כותרת המשרה' },
  { id: 'coordinator', header: 'רכז' },
  { id: 'status', header: 'סטטוס' },
  { id: 'referralDate', header: 'תאריך הפניה' },
  { id: 'lastUpdatedBy', header: 'משתמש מעדכן אחרון' },
  { id: 'source', header: 'מקור גיוס' },
];

const statusStyles: { [key in ReferralStatus]: string } = {
  'חדש': 'bg-primary-100 text-primary-800',
  'בבדיקה': 'bg-yellow-100 text-yellow-800',
  'ראיון': 'bg-secondary-100 text-secondary-800',
  'הצעה': 'bg-blue-100 text-blue-800',
  'התקבל': 'bg-accent-100 text-accent-800',
  'נדחה': 'bg-gray-200 text-gray-700',
};
const statusOptions = Object.keys(statusStyles) as ReferralStatus[];

interface ReferralsReportViewProps {
    onOpenNewTask: () => void;
    onOpenCandidateSummary: (candidateId: number) => void;
}

const ActionButton: React.FC<{ icon: React.ReactNode; tooltip: string; onClick: (e: React.MouseEvent) => void; }> = ({ icon, tooltip, onClick }) => (
    <button onClick={onClick} title={tooltip} className="p-2 text-text-muted rounded-full hover:bg-bg-hover hover:text-primary-600 transition-colors">
        {icon}
    </button>
);

const ExpandedRowContent: React.FC<{ referral: Referral }> = ({ referral }) => (
    <div className="p-4 bg-bg-subtle/70">
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
            <div>
                <h4 className="font-bold text-text-muted mb-2">שאלות ותשובות מראיון טלפוני</h4>
                <div className="space-y-3 text-sm max-h-48 overflow-y-auto pr-2">
                    {referral.interviewQA.length > 0 ? referral.interviewQA.map((item, index) => (
                        <div key={index}>
                            <p className="font-semibold text-text-default">{item.question}</p>
                            <p className="text-text-muted pl-4">{item.answer}</p>
                        </div>
                    )) : <p className="text-text-subtle">אין נתונים זמינים.</p>}
                </div>
            </div>
            <div>
                <h4 className="font-bold text-text-muted mb-2">סיכום חוות דעת</h4>
                <p className="text-sm text-text-muted leading-relaxed">{referral.feedbackSummary}</p>
            </div>
        </div>
    </div>
);

const ReReferModal: React.FC<{ isOpen: boolean; onClose: () => void; onSend: (data: { notes: string; contacts: number[] }) => void; referral: Referral | null; }> = ({ isOpen, onClose, onSend, referral }) => {
    const [notes, setNotes] = useState('');
    const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
    
    useEffect(() => {
        if (referral) {
            setNotes('');
            setSelectedContacts([]);
        }
    }, [referral]);

    if (!isOpen || !referral) return null;

    const handleContactToggle = (contactId: number) => {
        setSelectedContacts(prev => prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]);
    };

    const handleSend = () => {
        onSend({ notes, contacts: selectedContacts });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">הפניה מחדש: {referral.candidateName}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 space-y-4">
                    <p className="text-sm">אתה עומד להפנות מחדש את המועמד למשרת <span className="font-semibold">{referral.jobTitle}</span> ב<span className="font-semibold">{referral.clientName}</span>.</p>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">הערות להפניה:</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="הוסף הערה למנהל המגייס..."></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-2">בחר אנשי קשר לקבלת העדכון:</label>
                        <div className="space-y-2 max-h-32 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/50">
                            {referral.clientContacts.map(contact => (
                                <label key={contact.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-hover cursor-pointer">
                                    <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => handleContactToggle(contact.id)} className="w-4 h-4 text-primary-600 rounded" />
                                    <div>
                                        <span className="font-semibold text-text-default">{contact.name}</span>
                                        <span className="text-xs text-text-subtle block">{contact.email}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button onClick={handleSend} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2 flex items-center gap-2">
                        <PaperAirplaneIcon className="w-5 h-5" />
                        שלח הפניה
                    </button>
                </footer>
            </div>
        </div>
    );
};

const ReferralsReportView: React.FC<ReferralsReportViewProps> = ({ onOpenNewTask, onOpenCandidateSummary }) => {
    const [referrals, setReferrals] = useState<Referral[]>(referralsData);
    const [filters, setFilters] = useState({
        candidateName: '',
        clientName: '',
        status: '',
        processStage: 'הכל',
        jobTitle: '',
        coordinator: '',
        referralDate: '',
        lastUpdatedBy: '',
        source: '',
    });
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(allColumns.map(c => c.id));
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
    const [reReferModal, setReReferModal] = useState<{ isOpen: boolean; referral: Referral | null }>({ isOpen: false, referral: null });
    const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Referral; direction: 'asc' | 'desc' } | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const dragItemIndex = useRef<number | null>(null);
    
    const settingsRef = useRef<HTMLDivElement>(null);

    const requestSort = (key: keyof Referral) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof Referral) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };
    
    const filterOptions = useMemo(() => {
        const coordinators = [...new Set(referralsData.map(r => r.coordinator))];
        const sources = [...new Set(referralsData.map(r => r.source))];
        const lastUpdatedBy = [...new Set(referralsData.map(r => r.lastUpdatedBy))];
        return { coordinators, sources, lastUpdatedBy, statuses: statusOptions };
    }, []);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleClearFilters = () => {
        setFilters({
            candidateName: '', clientName: '', status: '', processStage: 'הכל',
            jobTitle: '', coordinator: '', referralDate: '', lastUpdatedBy: '', source: '',
        });
        setAdvancedSearchOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleOpenStatusModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setEditingReferral(referral);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatusUpdate = (data: any) => {
        if (!editingReferral) return;
        setReferrals(prev => prev.map(r => r.id === editingReferral.id ? { ...r, status: data.status, lastUpdatedBy: 'עצמי' } : r));
        setIsStatusModalOpen(false);
        setEditingReferral(null);
    };

    const handleOpenReReferModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setReReferModal({ isOpen: true, referral });
    };

    const handleSendReReferral = (data: { notes: string; contacts: number[] }) => {
        console.log('Re-referring with data:', data);
        setReReferModal({ isOpen: false, referral: null });
        // FIX: Corrected state setter name from setActiveReferrals to setReferrals.
        setReferrals(prev => prev.map(r => r.id === reReferModal.referral?.id ? { ...r, status: r.status, notes: data.notes } as any : r));
    };

    const sortedAndFilteredReferrals = useMemo(() => {
        const processStageMap: { [key: string]: ReferralStatus[] } = {
            'בתהליך': ['חדש', 'בבדיקה', 'ראיון', 'הצעה'],
            'התקבלו': ['התקבל'],
            'לא בתהליך': ['נדחה'],
        };
        
        let filtered = referralsData.filter(referral => {
             const matchesStage = filters.processStage === 'הכל' || 
                (processStageMap[filters.processStage as keyof typeof processStageMap] && 
                 processStageMap[filters.processStage as keyof typeof processStageMap].includes(referral.status));

            return (
                matchesStage &&
                (filters.candidateName ? referral.candidateName.toLowerCase().includes(filters.candidateName.toLowerCase()) : true) &&
                (filters.clientName ? referral.clientName.toLowerCase().includes(filters.clientName.toLowerCase()) : true) &&
                (filters.jobTitle ? referral.jobTitle.toLowerCase().includes(filters.jobTitle.toLowerCase()) : true) &&
                (filters.coordinator ? referral.coordinator === filters.coordinator : true) &&
                (filters.status ? referral.status === filters.status : true) &&
                (filters.referralDate ? referral.referralDate === filters.referralDate : true) &&
                (filters.lastUpdatedBy ? referral.lastUpdatedBy === filters.lastUpdatedBy : true) &&
                (filters.source ? referral.source === filters.source : true)
            );
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        
        return filtered;
    }, [filters, sortConfig]);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            const isVisible = prev.includes(columnId);
            if (isVisible) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const columnToAdd = allColumns.find(c => c.id === columnId);
                if (columnToAdd) {
                    const newColumns = [...prev, columnId];
                    newColumns.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                    return newColumns;
                }
                return prev;
            }
        });
    };
    
    const handleDragStart = (index: number, colId: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };
    
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newVisibleColumns = [...visibleColumns];
        const draggedItem = newVisibleColumns.splice(dragItemIndex.current, 1)[0];
        newVisibleColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newVisibleColumns);
    };
    
    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    const ReferralCard: React.FC<{ referral: Referral }> = ({ referral }) => (
        <div className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div>
                <div className="flex items-center gap-3 mb-3">
                    <AvatarIcon initials={referral.avatar} size={40} fontSize={16} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                    <div>
                        <button onClick={(e) => { e.stopPropagation(); onOpenCandidateSummary(referral.id); }} className="font-bold text-text-default hover:underline text-right">
                           {referral.candidateName}
                        </button>
                        <p className="text-sm text-text-muted">{referral.jobTitle}</p>
                    </div>
                </div>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-text-muted">לקוח:</span> <span className="font-semibold text-text-default">{referral.clientName}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">רכז:</span> <span className="font-semibold text-text-default">{referral.coordinator}</span></div>
                    <div className="flex justify-between items-center">
                        <span className="text-text-muted">סטטוס:</span> 
                        <button onClick={(e) => handleOpenStatusModal(e, referral)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[referral.status]}`}>
                            {referral.status}
                        </button>
                    </div>
                    <div className="flex justify-between"><span className="text-text-muted">תאריך הפניה:</span> <span className="font-semibold text-text-default">{referral.referralDate}</span></div>
                </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle flex justify-end items-center gap-2">
                <ActionButton icon={<PencilIcon className="w-5 h-5"/>} tooltip="ערוך סטטוס" onClick={(e) => handleOpenStatusModal(e, referral)} />
                <ActionButton icon={<PaperAirplaneIcon className="w-5 h-5"/>} tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
            </div>
        </div>
    );

    const FilterInput: React.FC<{label: string, name: string, value: string, onChange: any, type?: string, className?: string}> = ({ label, name, value, onChange, type = 'text', className }) => (
        <div className={className}>
            <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
            <input type={type} name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition" />
        </div>
    );

    const FilterSelect: React.FC<{label: string, name: string, value: string, onChange: any, options: string[], className?: string}> = ({ label, name, value, onChange, options, className }) => (
         <div className={className}>
            <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
            <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition">
                <option value="">הכל</option>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
    );

    const renderCell = (referral: Referral, columnId: string) => {
        switch(columnId) {
            case 'candidateName':
                return (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onOpenCandidateSummary(referral.id); }} 
                        className="font-semibold text-primary-700 hover:underline text-right"
                    >
                        {referral.candidateName}
                    </button>
                );
            case 'status':
                return <button onClick={(e) => handleOpenStatusModal(e, referral)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[referral.status]}`}>{referral.status}</button>;
            default:
                return (referral as any)[columnId] || '-';
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                 <div>
                    <h2 className="text-2xl font-bold text-text-default">דוח הפניות</h2>
                    <p className="text-sm text-text-muted">נמצאו {sortedAndFilteredReferrals.length} הפניות</p>
                </div>
            </header>
            
            <div className="p-3 bg-bg-subtle rounded-xl border border-border-default mb-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
                    <FilterInput label="שם המועמד" name="candidateName" value={filters.candidateName} onChange={handleFilterChange} className="lg:col-span-1" />
                    <FilterInput label="שם הלקוח" name="clientName" value={filters.clientName} onChange={handleFilterChange} className="lg:col-span-1" />
                    <FilterSelect label="סטאטוס" name="status" value={filters.status} onChange={handleFilterChange} options={filterOptions.statuses} className="lg:col-span-1" />
                    <FilterSelect label="שלב בתהליך" name="processStage" value={filters.processStage} onChange={handleFilterChange} options={['הכל', 'בתהליך', 'התקבלו', 'לא בתהליך']} className="lg:col-span-1" />
                    <button onClick={() => setAdvancedSearchOpen(!advancedSearchOpen)} className="text-sm font-semibold text-primary-600 bg-primary-100/70 py-2.5 px-4 rounded-lg hover:bg-primary-200 transition flex items-center justify-center gap-1">
                        <span>חיפוש מתקדם</span>
                        {advancedSearchOpen ? <ChevronUpIcon className="w-4 h-4"/> : <ChevronDownIcon className="w-4 h-4"/>}
                    </button>
                </div>
                
                {advancedSearchOpen && (
                    <div className="pt-4 border-t border-border-default animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                            <FilterInput label="כותרת המשרה" name="jobTitle" value={filters.jobTitle} onChange={handleFilterChange} />
                            <FilterSelect label="רכז" name="coordinator" value={filters.coordinator} onChange={handleFilterChange} options={filterOptions.coordinators} />
                            <FilterSelect label="משתמש מעדכן" name="lastUpdatedBy" value={filters.lastUpdatedBy} onChange={handleFilterChange} options={filterOptions.lastUpdatedBy} />
                            <FilterSelect label="מקור גיוס" name="source" value={filters.source} onChange={handleFilterChange} options={filterOptions.sources} />
                            <FilterInput label="תאריך הפניה" name="referralDate" value={filters.referralDate} onChange={handleFilterChange} type="date" />
                        </div>
                    </div>
                )}

                <div className="mt-3 flex justify-between items-center">
                    <div>
                        <button onClick={handleClearFilters} className="text-sm font-semibold text-primary-600 hover:underline transition-colors">נקה פילטרים</button>
                    </div>
                    <div className="flex items-center bg-bg-card border border-border-default/50 p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} title="תצוגת טבלה" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto">
                {viewMode === 'table' ? (
                     <div className="overflow-x-auto border border-border-default rounded-lg">
                        <table className="w-full text-sm text-right min-w-[1000px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80 sticky top-0 z-10">
                                <tr>
                                    <th className="p-4 w-10"></th>
                                    {visibleColumns.map((colId, index) => {
                                        const col = allColumns.find(c => c.id === colId);
                                        if (!col) return null;
                                        return (
                                            <th
                                                key={col.id}
                                                className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''}`}
                                                onClick={() => requestSort(col.id as keyof Referral)}
                                                draggable
                                                onDragStart={() => handleDragStart(index, col.id as string)}
                                                onDragEnter={() => handleDragEnter(index)}
                                                onDragEnd={handleDragEnd}
                                                onDrop={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>{col.header}</span>
                                                    {getSortIndicator(col.id as keyof Referral)}
                                                </div>
                                            </th>
                                        );
                                    })}
                                    <th className="p-4">פעולות</th>
                                    <th className="p-4 sticky left-0 bg-bg-subtle/80 w-16">
                                        <div className="relative" ref={settingsRef}>
                                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                            {isSettingsOpen && (
                                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                    <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                                    <div className="space-y-2">
                                                    {allColumns.map(column => (
                                                        <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={visibleColumns.includes(column.id)}
                                                            onChange={() => handleColumnToggle(column.id)}
                                                            className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                                                        />
                                                        {column.header}
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
                                {sortedAndFilteredReferrals.map(referral => (
                                    <React.Fragment key={referral.id}>
                                        <tr onClick={() => setExpandedRowId(prevId => prevId === referral.id ? null : referral.id)} className="hover:bg-bg-hover cursor-pointer group">
                                            <td className="p-4 text-center">
                                                <ChevronDownIcon className={`w-5 h-5 text-text-subtle transition-transform ${expandedRowId === referral.id ? 'rotate-180' : ''}`} />
                                            </td>
                                            {visibleColumns.map(colId => (
                                                <td key={colId} className="p-4 text-text-muted">
                                                    {renderCell(referral, colId)}
                                                </td>
                                            ))}
                                            <td className="p-4">
                                                <div className="flex items-center gap-1">
                                                    <ActionButton icon={<PencilIcon className="w-5 h-5"/>} tooltip="ערוך סטטוס" onClick={(e) => handleOpenStatusModal(e, referral)} />
                                                    <ActionButton icon={<PaperAirplaneIcon className="w-5 h-5"/>} tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
                                                </div>
                                            </td>
                                            <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16"></td>
                                        </tr>
                                        {expandedRowId === referral.id && (
                                            <tr className="bg-bg-subtle/50">
                                                <td colSpan={visibleColumns.length + 3}>
                                                    <ExpandedRowContent referral={referral} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {sortedAndFilteredReferrals.map(referral => (
                            <ReferralCard key={referral.id} referral={referral} />
                        ))}
                    </div>
                )}
            </main>
            <ReReferModal
                isOpen={reReferModal.isOpen}
                onClose={() => setReReferModal({ isOpen: false, referral: null })}
                onSend={handleSendReReferral}
                referral={reReferModal.referral}
            />
            {editingReferral && (
                <UpdateStatusModal
                    isOpen={isStatusModalOpen}
                    onClose={() => setIsStatusModalOpen(false)}
                    onSave={handleSaveStatusUpdate}
                    initialStatus={editingReferral.status}
                    onOpenNewTask={onOpenNewTask}
                />
            )}
        </div>
    );
};

export default ReferralsReportView;
