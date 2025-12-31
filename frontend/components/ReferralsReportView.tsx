
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, Cog6ToothIcon, Squares2X2Icon, TableCellsIcon, AvatarIcon, 
    PencilIcon, PaperAirplaneIcon, ChevronDownIcon, CheckCircleIcon,
    ClockIcon, DocumentArrowDownIcon, ChartBarIcon, ExclamationTriangleIcon,
    AdjustmentsHorizontalIcon, FunnelIcon, TrophyIcon, UserIcon, ArrowPathIcon, ChevronUpIcon
} from './Icons';
import UpdateStatusModal from './UpdateStatusModal';
import ReReferModal from './ReReferModal';
import JobDetailsDrawer from './JobDetailsDrawer';
import { type Job, jobsData as allJobsData } from './JobsView';

// --- TYPES ---
type ReferralStatus = 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'נדחה' | 'התקבל לעבודה' | 'פעיל';

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
  daysInStage?: number;
}

interface ReferralsReportViewProps {
    onOpenNewTask: () => void;
    onOpenCandidateSummary: (candidateId: number) => void;
}

// --- RICH MOCK DATA ---
const longSummary = `מועמד בעל ניסיון עשיר של מעל 5 שנים בתחום, המציג יכולות טכניות וניהוליות מרשימות.
במהלך הראיון הפגין ידע מעמיק בניהול מוצר מקצה לקצה, החל משלב האפיון ועד להשקה.
עבד בחברות סטארטאפ וגם בארגונים גדולים, מה שמקנה לו ראייה רחבה וגמישות מחשבתית.
בעל תואר ראשון במדעי המחשב ותואר שני במנהל עסקים.
שולט בשפה האנגלית ברמה גבוהה מאוד (שפת אם).
מחפש אתגר חדש ומעוניין להשתלב בחברה טכנולוגית צומחת.
התרשמתי מאוד מהמוטיבציה שלו ומהיכולת שלו לפתור בעיות מורכבות בצורה יצירתית.
הוא זמין לתחילת עבודה מיידית.
ממליצים ציינו שהוא "שחקן נשמה" ובעל יחסי אנוש מעולים.
לסיכום, מדובר במועמד חזק מאוד שמתאים לדרישות המשרה באופן מלא.`;

const detailedQA: InterviewQA[] = [
    { question: 'מהן ציפיות השכר שלך?', answer: 'אני מכוון לטווח של 25,000 - 28,000 ש"ח ברוטו + רכב ותנאים סוציאליים מלאים.' },
    { question: 'מהי זמינותך לתחילת עבודה?', answer: 'מיידית. סיימתי את תפקידי האחרון לפני כשבוע ואני פנוי לתהליכים.' },
    { question: 'מדוע עזבת את מקום העבודה האחרון?', answer: 'החברה עברה רה-ארגון וקיצוצים נרחבים, והפרויקט שעליו עבדתי הוקפא.' },
    { question: 'האם יש לך ניסיון בניהול צוות?', answer: 'כן, בתפקידי הקודם ניהלתי צוות של 5 מפתחים ואנשי QA במשך שנתיים.' },
    { question: 'מהו המודל העבודה המועדף עליך?', answer: 'אני מעדיף מודל היברידי, שילוב של 3 ימים מהמשרד ויומיים מהבית.' }
];

const referralsData: Referral[] = [
    { 
        id: 1, candidateName: 'שפירא גדעון', avatar: 'שג', clientName: 'בזק', jobTitle: 'מנהל/ת שיווק דיגיטלי', coordinator: 'דנה כהן', status: 'ראיון', referralDate: '2025-07-20', lastUpdatedBy: 'דנה כהן', source: 'AllJobs', daysInStage: 2,
        interviewQA: detailedQA,
        feedbackSummary: longSummary,
        clientContacts: [{ id: 101, name: 'יוסי כהן', email: 'yossi@bezeq.co.il' }]
    },
    { 
        id: 2, candidateName: 'כהן מאיה', avatar: 'כמ', clientName: 'Wix', jobTitle: 'מפתחת Fullstack', coordinator: 'אביב לוי', status: 'בבדיקה', referralDate: '2025-07-10', lastUpdatedBy: 'אביב לוי', source: 'LinkedIn', daysInStage: 12,
        interviewQA: detailedQA, 
        feedbackSummary: longSummary,
        clientContacts: [{ id: 201, name: 'איתי לוי', email: 'itai@wix.com' }]
    },
    { 
        id: 3, candidateName: 'לוי דוד', avatar: 'לד', clientName: 'Fiverr', jobTitle: 'מעצב UX/UI', coordinator: 'דנה כהן', status: 'חדש', referralDate: '2025-07-18', lastUpdatedBy: 'מערכת', source: 'חבר מביא חבר', daysInStage: 3,
        interviewQA: detailedQA, 
        feedbackSummary: longSummary,
        clientContacts: [{ id: 301, name: 'נעמה ברק', email: 'naama@fiverr.com' }]
    },
    { 
        id: 4, candidateName: 'ישראלי יעל', avatar: 'יי', clientName: 'אלביט מערכות', jobTitle: 'מהנדסת QA', coordinator: 'יעל שחר', status: 'נדחה', referralDate: '2025-07-17', lastUpdatedBy: 'יעל שחר', source: 'Ethosia', daysInStage: 1,
        interviewQA: detailedQA, 
        feedbackSummary: 'המועמדת נחמדה אך חסרת ניסיון מספק בבדיקות אוטומציה מורכבות כפי שנדרש למשרה זו.',
        clientContacts: [{ id: 401, name: 'דניאל שוורץ', email: 'daniel@elbit.co.il' }]
    },
    { 
        id: 5, candidateName: 'מזרחי אבי', avatar: 'מא', clientName: 'תנובה', jobTitle: 'מנהל מוצר', coordinator: 'אביב לוי', status: 'התקבל', referralDate: '2025-07-16', lastUpdatedBy: 'אביב לוי', source: 'GotFriends', daysInStage: 5,
        interviewQA: detailedQA, 
        feedbackSummary: longSummary,
        clientContacts: [{ id: 501, name: 'רוני שקד', email: 'roni@tnuva.co.il' }]
    },
    { id: 6, candidateName: 'פרידמן שרה', avatar: 'פש', clientName: 'Nisha', jobTitle: 'מהנדסת QA | אוטומציה', coordinator: 'יעל שחר', status: 'חדש', referralDate: '2025-07-05', lastUpdatedBy: 'מערכת', source: 'Nisha', interviewQA: [], feedbackSummary: 'טרם נוצר קשר.', clientContacts: [], daysInStage: 15 },
    { id: 7, candidateName: 'גולן איתי', avatar: 'גא', clientName: 'בזק', jobTitle: 'מנהל/ת שיווק דיגיטלי', coordinator: 'דנה כהן', status: 'התקבל', referralDate: '2025-06-20', lastUpdatedBy: 'דנה כהן', source: 'AllJobs', daysInStage: 4, interviewQA: [], feedbackSummary: 'התקבל לעבודה.', clientContacts: [] },
    { id: 8, candidateName: 'רון שחר', avatar: 'רש', clientName: 'Wix', jobTitle: 'מפתחת Backend', coordinator: 'אביב לוי', status: 'ראיון', referralDate: '2025-07-21', lastUpdatedBy: 'אביב לוי', source: 'LinkedIn', daysInStage: 1, interviewQA: [], feedbackSummary: 'מתקדם לראיון טכני.', clientContacts: [] },
    { id: 9, candidateName: 'דניאל קליין', avatar: 'דק', clientName: 'בזק', jobTitle: 'אנליסט נתונים', coordinator: 'דנה כהן', status: 'בבדיקה', referralDate: '2025-07-22', lastUpdatedBy: 'דנה כהן', source: 'AllJobs', daysInStage: 0, interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 10, candidateName: 'מיכל לוי', avatar: 'מל', clientName: 'Fiverr', jobTitle: 'Data Analyst', coordinator: 'יעל שחר', status: 'הצעה', referralDate: '2025-07-15', lastUpdatedBy: 'יעל שחר', source: 'LinkedIn', daysInStage: 2, interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 11, candidateName: 'אסף כהן', avatar: 'אכ', clientName: 'אלביט מערכות', jobTitle: 'System Admin', coordinator: 'יעל שחר', status: 'פעיל', referralDate: '2025-07-25', lastUpdatedBy: 'יעל שחר', source: 'חבר מביא חבר', interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 12, candidateName: 'דנה רון', avatar: 'דר', clientName: 'Wix', jobTitle: 'Product Manager', coordinator: 'אביב לוי', status: 'חדש', referralDate: '2025-07-26', lastUpdatedBy: 'אביב לוי', source: 'LinkedIn', daysInStage: 0, interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 13, candidateName: 'עמית גל', avatar: 'עג', clientName: 'בזק', jobTitle: 'מנהל/ת שיווק', coordinator: 'דנה כהן', status: 'ראיון', referralDate: '2025-07-24', lastUpdatedBy: 'דנה כהן', source: 'AllJobs', daysInStage: 3, interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 14, candidateName: 'שירן מלכה', avatar: 'שמ', clientName: 'תנובה', jobTitle: 'נהג חלוקה', coordinator: 'יעל שחר', status: 'חדש', referralDate: '2025-07-27', lastUpdatedBy: 'יעל שחר', source: 'Facebook', daysInStage: 1, interviewQA: [], feedbackSummary: '', clientContacts: [] },
    { id: 15, candidateName: 'רועי כהן', avatar: 'רכ', clientName: 'אלביט', jobTitle: 'מהנדס תוכנה', coordinator: 'אביב לוי', status: 'בבדיקה', referralDate: '2025-07-25', lastUpdatedBy: 'אביב לוי', source: 'חבר מביא חבר', daysInStage: 2, interviewQA: [], feedbackSummary: '', clientContacts: [] },
];

const allColumns: { id: keyof Referral | 'actions'; header: string }[] = [
  { id: 'candidateName', header: 'שם המועמד' },
  { id: 'clientName', header: 'שם הלקוח' },
  { id: 'jobTitle', header: 'כותרת המשרה' },
  { id: 'coordinator', header: 'רכז' },
  { id: 'status', header: 'סטטוס' },
  { id: 'referralDate', header: 'תאריך הפניה' },
  { id: 'lastUpdatedBy', header: 'עודכן ע"י' },
  { id: 'source', header: 'מקור' },
];

const statusStyles: { [key: string]: string } = {
  'חדש': 'bg-blue-100 text-blue-800 border-blue-200',
  'בבדיקה': 'bg-purple-100 text-purple-800 border-purple-200',
  'ראיון': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'הצעה': 'bg-orange-100 text-orange-800 border-orange-200',
  'התקבל': 'bg-green-100 text-green-800 border-green-200',
  'התקבל לעבודה': 'bg-green-100 text-green-800 border-green-200',
  'פעיל': 'bg-teal-100 text-teal-800 border-teal-200',
  'נדחה': 'bg-gray-100 text-gray-700 border-gray-200',
};

const statusOptions: ReferralStatus[] = ['חדש', 'בבדיקה', 'ראיון', 'הצעה', 'התקבל', 'נדחה'];

// --- WIDGET COMPONENTS ---

const FunnelWidget: React.FC<{ stages: Record<string, number> }> = ({ stages }) => (
    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-4">
        <h3 className="font-bold text-text-default text-sm mb-4 flex items-center gap-2">
            <FunnelIcon className="w-4 h-4 text-primary-500" />
            משפך גיוס (Funnel)
        </h3>
        <div className="space-y-3">
             <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-default w-12">חדש</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                     <div className="h-2 rounded-full bg-blue-100 flex-1 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-full bg-blue-500 w-full"></div>
                     </div>
                </div>
                <span className="font-bold w-6 text-left">{stages.new}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-default w-12">בבדיקה</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                     <div className="h-2 rounded-full bg-purple-100 flex-1 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-full bg-purple-500 w-4/5"></div>
                     </div>
                </div>
                <span className="font-bold w-6 text-left">{stages.review}</span>
            </div>
             <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-default w-12">ראיון</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                     <div className="h-2 rounded-full bg-yellow-100 flex-1 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-full bg-yellow-500 w-3/5"></div>
                     </div>
                </div>
                <span className="font-bold w-6 text-left">{stages.interview}</span>
            </div>
             <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-default w-12">הצעה</span>
                <div className="flex items-center gap-2 flex-1 mx-2">
                     <div className="h-2 rounded-full bg-orange-100 flex-1 relative overflow-hidden">
                        <div className="absolute top-0 right-0 h-full bg-orange-500 w-2/5"></div>
                     </div>
                </div>
                <span className="font-bold w-6 text-left">{stages.offer}</span>
            </div>
            <div className="pt-2 border-t border-border-subtle mt-2 flex justify-between items-center text-sm font-bold text-green-700 bg-green-50 p-2 rounded-lg">
                <span className="flex items-center gap-1"><TrophyIcon className="w-3.5 h-3.5"/> התקבלו</span>
                <span>{stages.hired}</span>
            </div>
        </div>
    </div>
);

const AttentionItem: React.FC<{ name: string; job: string; days: number; onClick: () => void }> = ({ name, job, days, onClick }) => (
    <div 
        onClick={onClick}
        className="flex items-center justify-between p-3 rounded-lg hover:bg-red-50 cursor-pointer group transition-colors border border-transparent hover:border-red-100 mb-1 last:mb-0"
    >
        <div className="flex items-center gap-3 min-w-0">
            <div className="relative flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
            </div>
            <div className="min-w-0">
                <p className="font-bold text-text-default text-xs truncate">{name}</p>
                <p className="text-[10px] text-text-muted truncate">{job}</p>
            </div>
        </div>
        <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-red-600 bg-white px-2 py-0.5 rounded-full border border-red-100 shadow-sm shrink-0 whitespace-nowrap">
                {days} ימים
            </span>
        </div>
    </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode; tooltip: string; onClick?: (e: React.MouseEvent) => void }> = ({ icon, tooltip, onClick }) => (
    <button onClick={onClick} title={tooltip} className="p-2 text-text-subtle hover:text-primary-600 hover:bg-bg-hover rounded-full transition-colors">
        {icon}
    </button>
);

const ExpandedRowContent: React.FC<{ referral: Referral, className?: string, layout?: 'row' | 'card' }> = ({ referral, className, layout = 'row' }) => (
    <div className={className}>
        <div className={`grid gap-4 text-sm ${layout === 'row' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            <div>
                <p className="font-bold text-text-default mb-1">תקציר / פידבק:</p>
                <p className="text-text-muted bg-white p-3 rounded-lg border border-border-default whitespace-pre-line leading-relaxed">{referral.feedbackSummary}</p>
            </div>
            {referral.interviewQA.length > 0 && (
                <div>
                     <p className="font-bold text-text-default mb-1">שאלות סינון:</p>
                     <div className="space-y-2">
                        {referral.interviewQA.map((qa, i) => (
                            <div key={i} className="bg-white p-2 rounded-lg border border-border-default">
                                <p className="font-semibold text-xs text-primary-700">{qa.question}</p>
                                <p className="text-text-muted text-xs mt-1">{qa.answer}</p>
                            </div>
                        ))}
                     </div>
                </div>
            )}
        </div>
    </div>
);

const ReferralGridCard: React.FC<{ 
    referral: Referral, 
    isExpanded: boolean, 
    onToggle: () => void,
    onEdit: (e: React.MouseEvent) => void,
    onReRefer: (e: React.MouseEvent) => void
}> = ({ referral, isExpanded, onToggle, onEdit, onReRefer }) => {
    return (
        <div className={`bg-bg-card rounded-xl border border-border-default p-4 shadow-sm hover:shadow-md transition-all flex flex-col h-full ${isExpanded ? 'ring-1 ring-primary-200' : ''}`}>
             <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border border-primary-200 text-xs">
                        {referral.avatar}
                    </div>
                    <div>
                        <h4 className="font-bold text-text-default">{referral.candidateName}</h4>
                        <p className="text-xs text-text-muted truncate max-w-[150px]">{referral.jobTitle}</p>
                    </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyles[referral.status] || 'bg-gray-100'}`}>
                    {referral.status}
                </span>
             </div>
             
             <div className="text-xs text-text-muted space-y-1 mb-3 flex-grow">
                <p>לקוח: <span className="font-semibold text-text-default">{referral.clientName}</span></p>
                <p>רכז: {referral.coordinator}</p>
                <p>תאריך: {new Date(referral.referralDate).toLocaleDateString('he-IL')}</p>
             </div>
             
             {isExpanded && (
                 <ExpandedRowContent 
                    referral={referral} 
                    className="mb-3 pt-3 border-t border-border-default bg-bg-subtle/30 p-2 rounded-lg -mx-2" 
                    layout="card" 
                />
             )}

             <div className="flex items-center gap-2 pt-3 border-t border-border-default mt-auto">
                 <button onClick={onToggle} className="flex-1 py-1.5 text-xs font-semibold bg-bg-subtle hover:bg-bg-hover text-text-muted rounded transition-colors flex items-center justify-center gap-1">
                    <span>{isExpanded ? 'סגור פרטים' : 'פרטים מלאים'}</span>
                    <ChevronDownIcon className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                 </button>
                 <button onClick={onEdit} className="p-1.5 text-text-subtle hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors" title="ערוך סטטוס">
                     <PencilIcon className="w-4 h-4" />
                 </button>
                 <button onClick={onReRefer} className="p-1.5 text-text-subtle hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors" title="הפניה מחדש">
                     <PaperAirplaneIcon className="w-4 h-4" />
                 </button>
             </div>
        </div>
    );
};

// --- MAIN VIEW ---

const ReferralsReportView: React.FC<ReferralsReportViewProps> = ({ onOpenNewTask, onOpenCandidateSummary }) => {
    const navigate = useNavigate();
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

    // Data State
    const [referrals, setReferrals] = useState<Referral[]>(referralsData);
    
    // Filters State
    const [filters, setFilters] = useState({
        searchTerm: '',
        dateRange: 'month',
        referralDate: thirtyDaysAgo.toISOString().split('T')[0],
        referralDateEnd: today.toISOString().split('T')[0],
        // Advanced Fields
        status: '', 
        clientName: '', 
        candidateName: '', 
        jobTitle: '', 
        coordinator: '', 
        source: '',
        lastUpdatedBy: '',
    });
    
    // UI State
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(['status', 'candidateName', 'jobTitle', 'clientName', 'referralDate', 'coordinator']);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof Referral; direction: 'asc' | 'desc' } | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const dragItemIndex = useRef<number | null>(null);
    
    // Mobile State
    const [showMobileStats, setShowMobileStats] = useState(false); // Mobile Toggle for Sidebar

    // Modals
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
    const [reReferModal, setReReferModal] = useState<{ isOpen: boolean; referral: Referral | null }>({ isOpen: false, referral: null });
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    
    const settingsRef = useRef<HTMLDivElement>(null);

    // --- Logic ---

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
        if (name === 'referralDate' || name === 'referralDateEnd') {
            setFilters(prev => ({ ...prev, dateRange: 'custom' }));
        }
    };

    const handleClearFilters = () => {
        setFilters({
            searchTerm: '',
            dateRange: 'month',
            referralDate: thirtyDaysAgo.toISOString().split('T')[0],
            referralDateEnd: today.toISOString().split('T')[0],
            status: '', clientName: '', candidateName: '', jobTitle: '', 
            coordinator: '', source: '', lastUpdatedBy: ''
        });
        setIsAdvancedSearchOpen(false);
    };

    const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        const end = new Date();
        const start = new Date();
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);
        
        setFilters(prev => ({
            ...prev,
            dateRange: preset,
            referralDate: start.toISOString().split('T')[0],
            referralDateEnd: end.toISOString().split('T')[0]
        }));
    };

    const sortedAndFilteredReferrals = useMemo(() => {
        return referrals.filter(referral => {
            const refDate = new Date(referral.referralDate);
            const startDate = filters.referralDate ? new Date(filters.referralDate) : null;
            const endDate = filters.referralDateEnd ? new Date(filters.referralDateEnd) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);
            
            // Basic Matches
            const matchesDate = (!startDate || refDate >= startDate) && (!endDate || refDate <= endDate);
            const searchLower = filters.searchTerm.toLowerCase();
            const matchesSearch = !searchLower || 
                referral.candidateName.toLowerCase().includes(searchLower) ||
                referral.clientName.toLowerCase().includes(searchLower) ||
                referral.jobTitle.toLowerCase().includes(searchLower);

            // Advanced Matches
            const matchesStatus = !filters.status || referral.status === filters.status;
            const matchesClient = !filters.clientName || referral.clientName.toLowerCase().includes(filters.clientName.toLowerCase());
            const matchesCoordinator = !filters.coordinator || referral.coordinator.toLowerCase().includes(filters.coordinator.toLowerCase());
            const matchesSource = !filters.source || referral.source.toLowerCase().includes(filters.source.toLowerCase());
            const matchesUpdater = !filters.lastUpdatedBy || referral.lastUpdatedBy.toLowerCase().includes(filters.lastUpdatedBy.toLowerCase());
            
            return matchesDate && matchesSearch && matchesStatus && matchesClient && matchesCoordinator && matchesSource && matchesUpdater;
        }).sort((a, b) => {
            if (!sortConfig) return 0;
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [referrals, filters, sortConfig]);

    // Insights Calculation
    const insights = useMemo(() => {
        const total = sortedAndFilteredReferrals.length;
        const accepted = sortedAndFilteredReferrals.filter(r => r.status === 'התקבל' || r.status === 'התקבל לעבודה').length;
        const stages = {
            new: sortedAndFilteredReferrals.filter(r => r.status === 'חדש').length,
            review: sortedAndFilteredReferrals.filter(r => r.status === 'בבדיקה').length,
            interview: sortedAndFilteredReferrals.filter(r => r.status === 'ראיון').length,
            offer: sortedAndFilteredReferrals.filter(r => r.status === 'הצעה').length,
            hired: accepted,
            rejected: sortedAndFilteredReferrals.filter(r => r.status === 'נדחה').length,
        };
        const needsAttention = sortedAndFilteredReferrals.filter(r => (r.status === 'חדש' || r.status === 'בבדיקה') && (r.daysInStage && r.daysInStage > 7));
        
        return { total, accepted, stages, needsAttention };
    }, [sortedAndFilteredReferrals]);

    const requestSort = (key: keyof Referral) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof Referral) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-primary-500 font-bold text-xs ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const handleOpenJobDrawer = (jobTitle: string) => {
         const job = allJobsData.find(j => j.title === jobTitle);
         const jobMap: {[key: string]: number} = { 'מפתח/ת Fullstack בכיר/ה': 2, 'מנהל/ת מוצר לחטיבת הפינטק': 7, 'מעצב/ת UX/UI': 3 }
         const fallbackJob = allJobsData.find(j => j.id === (jobMap[jobTitle] || 1));
         if (job || fallbackJob) {
            setSelectedJob(job || fallbackJob || null);
            setIsDrawerOpen(true);
         }
    };
    
    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]);
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

    const handleOpenStatusModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setEditingReferral(referral);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatusUpdate = (data: any) => {
        if (editingReferral) {
            setReferrals(prev => prev.map(r => r.id === editingReferral.id ? { ...r, status: data.status } : r));
        }
        setIsStatusModalOpen(false);
        setEditingReferral(null);
    };

    const handleOpenReReferModal = (e: React.MouseEvent, referral: Referral) => {
        e.stopPropagation();
        setReReferModal({ isOpen: true, referral });
    };

    const handleSendReReferral = (data: { notes: string; nextStatus: string; contacts: number[] }) => {
        if (reReferModal.referral) {
             setReferrals(prev => prev.map(r => r.id === reReferModal.referral!.id ? { ...r, status: data.nextStatus as ReferralStatus } : r));
        }
        setReReferModal({ isOpen: false, referral: null });
    };

    const renderCell = (referral: Referral, columnId: string) => {
        switch (columnId) {
            case 'status':
                return (
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${statusStyles[referral.status] || 'bg-gray-100'}`}>
                        {referral.status}
                    </span>
                );
            case 'candidateName':
                return (
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">
                            {referral.avatar}
                        </div>
                        <span className="font-semibold text-text-default">{referral.candidateName}</span>
                    </div>
                );
            case 'jobTitle':
                return <button onClick={() => handleOpenJobDrawer(referral.jobTitle)} className="text-primary-600 hover:underline font-medium">{referral.jobTitle}</button>;
            case 'clientName':
                 return <span className="font-medium text-text-default">{referral.clientName}</span>;
            case 'referralDate':
                return <span className="text-text-muted">{new Date(referral.referralDate).toLocaleDateString('he-IL')}</span>;
             case 'coordinator':
                 return <span className="text-text-muted">{referral.coordinator}</span>;
             case 'lastUpdatedBy':
                 return <span className="text-text-muted">{referral.lastUpdatedBy}</span>;
             case 'source':
                 return <span className="text-text-muted">{referral.source}</span>;
            default:
                return (referral as any)[columnId];
        }
    };

    // --- RENDER ---
    return (
        <div className="flex flex-col gap-4">
             {/* Header */}
             <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                 <div>
                     <h1 className="text-2xl font-black text-text-default mb-1">דוח הפניות</h1>
                     <p className="text-text-muted text-sm">סקירה מקיפה של כל תהליכי הגיוס הפעילים</p>
                 </div>
                 
                 {/* Top KPI Cards (The "Board") - Grid layout for mobile */}
                 <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-blue-100 text-blue-600 rounded-lg"><DocumentArrowDownIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">סה"כ הפניות</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.total}</p></div>
                     </div>
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-purple-100 text-purple-600 rounded-lg"><ClockIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">בתהליך</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.stages.review + insights.stages.interview + insights.stages.offer}</p></div>
                     </div>
                     <div className="bg-white border border-border-default rounded-xl px-2 py-2 flex flex-col sm:flex-row items-center justify-center sm:justify-start text-center sm:text-right gap-1 sm:gap-3 shadow-sm">
                         <div className="p-1.5 sm:p-2 bg-green-100 text-green-600 rounded-lg"><CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5"/></div>
                         <div><p className="text-[10px] sm:text-xs text-text-muted font-bold whitespace-nowrap">השמות</p><p className="text-lg sm:text-xl font-black text-text-default">{insights.accepted}</p></div>
                     </div>
                 </div>
             </div>

            {/* Split Search Bar */}
            <div className="bg-bg-card p-3 rounded-2xl shadow-sm border border-border-default flex-shrink-0 relative z-20">
                <div className="flex flex-col xl:flex-row gap-3 items-center">
                    <div className="relative flex-grow w-full xl:w-auto">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input type="text" name="searchTerm" value={filters.searchTerm} onChange={handleFilterChange} placeholder="חיפוש מועמד, לקוח או משרה..." className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 transition-shadow" />
                    </div>

                    <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default overflow-x-auto no-scrollbar w-full xl:w-auto">
                        {['today', 'week', 'month', 'quarter'].map(p => (
                             <button key={p} onClick={() => applyDatePreset(p as any)} className={`flex-1 xl:flex-none px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${filters.dateRange === p ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>
                                {p === 'today' ? 'היום' : p === 'week' ? 'השבוע' : p === 'month' ? 'החודש' : 'רבעון'}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all whitespace-nowrap font-bold text-sm w-full xl:w-auto ${isAdvancedSearchOpen ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                    >
                        <AdjustmentsHorizontalIcon className="w-5 h-5" />
                        <span>מסננים נוספים</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {/* Advanced Drawer */}
                {isAdvancedSearchOpen && (
                     <div className="mt-4 p-4 bg-bg-subtle/50 border border-border-default rounded-xl grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in shadow-inner">
                        <div><label className="block text-xs font-bold text-text-muted mb-1">תאריך מ-</label><input type="date" name="referralDate" value={filters.referralDate} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">תאריך עד-</label><input type="date" name="referralDateEnd" value={filters.referralDateEnd} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">סטטוס / שלב</label><select name="status" value={filters.status} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm"><option value="">הכל</option>{statusOptions.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">לקוח</label><input type="text" name="clientName" value={filters.clientName} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" placeholder="שם לקוח..." /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">רכז</label><input type="text" name="coordinator" value={filters.coordinator} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" placeholder="שם רכז..." /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">משתמש מעדכן</label><input type="text" name="lastUpdatedBy" value={filters.lastUpdatedBy} onChange={handleFilterChange} className="w-full bg-white border-border-default rounded-lg py-2 px-3 text-sm" placeholder="שם משתמש..." /></div>
                        <div><label className="block text-xs font-bold text-text-muted mb-1">מקור גיוס</label><input type="text" name="source" value={filters.source} onChange={handleFilterChange} className="w-full bg-bg-input border-border-default rounded-lg py-2 px-3 text-sm" placeholder="מקור..." /></div>
                        
                        <div className="md:col-span-4 lg:col-span-5 flex justify-end gap-2 mt-2 pt-2 border-t border-border-default/50">
                            <button onClick={handleClearFilters} className="text-sm font-semibold text-text-muted hover:text-red-500 px-4 flex items-center gap-1"><ArrowPathIcon className="w-4 h-4"/> איפוס</button>
                            <button onClick={() => setIsAdvancedSearchOpen(false)} className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 shadow-sm">סגור</button>
                        </div>
                     </div>
                )}
            </div>

            {/* Mobile Sidebar Toggle Button */}
            <div className="lg:hidden">
                <button 
                    onClick={() => setShowMobileStats(!showMobileStats)}
                    className="w-full bg-bg-card border border-border-default rounded-xl p-3 flex items-center justify-between shadow-sm text-sm font-bold text-text-default hover:bg-bg-subtle"
                >
                    <span>{showMobileStats ? 'הסתר מדדים' : 'הצג מדדים וסטטיסטיקה'}</span>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMobileStats ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Main Content: Sidebar + Table */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* Sidebar (Widgets) - Conditional on Mobile */}
                <div className={`w-full lg:w-1/4 flex flex-col gap-4 overflow-y-auto pr-1 pb-4 flex-shrink-0 transition-all sticky top-4 self-start max-h-[calc(100vh-20px)] ${showMobileStats ? 'block' : 'hidden lg:flex'}`}>
                    <FunnelWidget stages={insights.stages} />
                    
                    <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-4 flex-1 flex flex-col min-h-[250px]">
                        <h3 className="font-bold text-text-default text-sm mb-3 flex items-center gap-2">
                             <ExclamationTriangleIcon className="w-4 h-4 text-red-500" />
                             דורש טיפול (7+ ימים)
                        </h3>
                         <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {insights.needsAttention.length > 0 ? (
                                insights.needsAttention.map(r => (
                                    <AttentionItem key={r.id} name={r.candidateName} job={r.jobTitle} days={r.daysInStage || 0} onClick={() => onOpenCandidateSummary(r.id)} />
                                ))
                            ) : (
                                <div className="text-center py-8 text-text-muted text-xs bg-bg-subtle/30 rounded-lg border border-dashed border-border-default h-full flex flex-col items-center justify-center">
                                    <CheckCircleIcon className="w-8 h-8 text-green-500 mb-2 opacity-50" />
                                    אין מועמדים תקועים
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Table */}
                <div className="w-full lg:w-3/4 bg-bg-card rounded-2xl shadow-sm border border-border-default flex flex-col h-fit">
                     <header className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                         <div className="flex items-center gap-2">
                            <h3 className="font-bold text-text-default">רשימת הפניות</h3>
                            <span className="bg-bg-subtle px-2 py-0.5 rounded text-xs font-bold border border-border-default text-text-muted">{sortedAndFilteredReferrals.length}</span>
                        </div>
                         <div className="flex items-center gap-2">
                            <div className="flex bg-bg-subtle p-1 rounded-lg border border-border-default">
                                <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-4 h-4"/></button>
                                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-4 h-4"/></button>
                            </div>
                            <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 bg-white border border-border-default rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-4 h-4 text-text-muted"/></button>
                                {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-3">
                                        <div className="space-y-1">
                                        {allColumns.map(column => (
                                            <label key={column.id} className="flex items-center gap-2 text-sm text-text-default p-1 hover:bg-bg-hover rounded cursor-pointer">
                                            <input type="checkbox" checked={visibleColumns.includes(column.id as string)} onChange={() => handleColumnToggle(column.id as string)} className="w-4 h-4 text-primary-600 rounded" />
                                            {column.header}
                                            </label>
                                        ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                     </header>

                    <div className="flex-1 p-0 bg-white rounded-b-2xl">
                        {viewMode === 'table' ? (
                             <table className="w-full text-sm text-right min-w-[800px]">
                                <thead className="bg-bg-subtle/50 text-text-muted font-bold sticky top-0 z-10 border-b border-border-default">
                                    <tr>
                                        <th className="p-4 w-10"></th>
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumns.find(c => c.id === colId);
                                            if (!col) return null;
                                            return (
                                                <th 
                                                    key={col.id} 
                                                    draggable
                                                    onDragStart={() => handleDragStart(index, col.id as string)}
                                                    onDragEnter={() => handleDragEnter(index)}
                                                    onDragEnd={handleDragEnd}
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'opacity-50' : ''}`} 
                                                    onClick={() => requestSort(col.id as keyof Referral)}
                                                >
                                                    <div className="flex items-center gap-1">{col.header} {getSortIndicator(col.id as keyof Referral)}</div>
                                                </th>
                                            );
                                        })}
                                        <th className="p-4 text-center">פעולות</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {sortedAndFilteredReferrals.map(referral => (
                                        <React.Fragment key={referral.id}>
                                            <tr onClick={() => setExpandedRowId(prevId => prevId === referral.id ? null : referral.id)} className="hover:bg-primary-50/30 cursor-pointer group transition-colors">
                                                <td className="p-4 text-center">
                                                    <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${expandedRowId === referral.id ? 'rotate-180' : ''}`} />
                                                </td>
                                                {visibleColumns.map(colId => (
                                                    <td key={colId} className="p-4 text-text-muted">{renderCell(referral, colId)}</td>
                                                ))}
                                                <td className="p-4 text-center">
                                                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ActionButton icon={<PencilIcon className="w-4 h-4"/>} tooltip="ערוך סטטוס" onClick={(e) => handleOpenStatusModal(e, referral)} />
                                                        <ActionButton icon={<PaperAirplaneIcon className="w-4 h-4"/>} tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedRowId === referral.id && (
                                                <tr className="bg-bg-subtle/30 shadow-inner">
                                                    <td colSpan={visibleColumns.length + 2}><ExpandedRowContent referral={referral} className="p-6" /></td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                                {sortedAndFilteredReferrals.map(referral => (
                                    <div key={referral.id} className="group h-full">
                                        <ReferralGridCard 
                                            referral={referral} 
                                            isExpanded={expandedRowId === referral.id} 
                                            onToggle={() => setExpandedRowId(prevId => prevId === referral.id ? null : referral.id)}
                                            onEdit={(e) => handleOpenStatusModal(e, referral)}
                                            onReRefer={(e) => handleOpenReReferModal(e, referral)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            <ReReferModal isOpen={reReferModal.isOpen} onClose={() => setReReferModal({ isOpen: false, referral: null })} onSend={handleSendReReferral} referral={reReferModal.referral} />
            {editingReferral && (
                <UpdateStatusModal isOpen={isStatusModalOpen} onClose={() => setIsStatusModalOpen(false)} onSave={handleSaveStatusUpdate} initialStatus={editingReferral.status} onOpenNewTask={onOpenNewTask} />
            )}
             <JobDetailsDrawer job={selectedJob} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
        </div>
    );
};

export default ReferralsReportView;
