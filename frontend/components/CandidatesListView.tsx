
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, Cog6ToothIcon, AvatarIcon, ChevronDownIcon, ArrowPathIcon,
    TargetIcon, CalendarIcon, BriefcaseIcon, PencilIcon, WalletIcon, GenderMaleIcon, GenderFemaleIcon, UserIcon,
    AcademicCapIcon, LanguageIcon, XMarkIcon, MapPinIcon, TableCellsIcon, Squares2X2Icon, ExclamationTriangleIcon,
    ChevronUpIcon, BookmarkIcon, CheckCircleIcon, DocumentTextIcon, ArrowTopRightOnSquareIcon, FolderIcon, ArchiveBoxIcon, ChatBubbleBottomCenterTextIcon, EnvelopeIcon, WhatsappIcon,
    BookmarkIconSolid, CheckIcon, AdjustmentsHorizontalIcon, BuildingOffice2Icon, MinusIcon, SparklesIcon, FunnelIcon,
    ChevronLeftIcon, DocumentArrowDownIcon
} from './Icons';
import { SavedSearch, useSavedSearches } from '../context/SavedSearchesContext';
import CompanyFilterPopover from './CompanyFilterPopover';
import CandidateCard from './CandidateCard';
import CandidateRow from './CandidateRow';
import DevAnnotation from './DevAnnotation';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import LocationSelector, { LocationItem } from './LocationSelector';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import { useLanguage } from '../context/LanguageContext';

type Operator = 'AND' | 'OR' | 'NOT';

interface ComplexFilterRule {
    id: string;
    operator: Operator;
    field: 'referrals' | 'source' | 'status_change';
    value?: string;
    textValue?: string;
    dateRange?: DateRange | null;
}

export interface Candidate {
  id: number;
  name: string;
  avatar: string;
  title: string;
  status: string;
  lastActivity: string;
  source: string;
  tags: string[];
  internalTags: string[];
  matchScore: number;
  matchAnalysis?: {
      jobTitle: string;
      reason: string;
  };
  address?: string;
  phone: string;
  industry?: string;
  field?: string;
  sector?: string;
  companySize?: string;
  industryAnalysis?: {
      industries: { label: string; percentage: number }[];
      smartTags?: {
          domains: string[];
          orgDNA: { label: string; subLabel: string; icon?: React.ReactNode };
      };
  };
}

export const candidatesData: Candidate[] = [
  { 
      id: 1, 
      name: 'שפירא גדעון', 
      avatar: 'שג', 
      title: 'מנהל שיווק', 
      status: 'עבר בדיקה ראשונית', 
      lastActivity: '14:01 28/05/2025', 
      source: 'AllJobs', 
      tags: ['ניהול', 'שיווק דיגיטלי', 'PPC'], 
      internalTags: ['מתאים גם לניהול מוצר'], 
      matchScore: 92,
      matchAnalysis: {
          jobTitle: 'מנהל/ת שיווק דיגיטלי',
          reason: 'התאמה גבוהה מאוד. למועמד ניסיון ניהולי מוכח ורקע חזק ב-PPC, התואם את דרישות הליבה של המשרה.'
      },
      address: 'תל אביב', 
      phone: '054-1234567',
      industry: 'תעשייה וייצור',
      field: 'ייצור מזון ומשקאות',
      sector: 'פרטי',
      companySize: '200-1000',
      industryAnalysis: {
          industries: [
              { label: 'מסחר וקמעונאות', percentage: 60 },
              { label: 'טכנולוגיה ושירותים', percentage: 40 },
          ]
      }
  },
  { 
      id: 2, 
      name: 'כהן מאיה', 
      avatar: 'כמ', 
      title: 'מפתחת Fullstack', 
      status: 'חדש', 
      lastActivity: '11:23 27/05/2025', 
      source: 'LinkedIn', 
      tags: ['React', 'Node.js', 'TypeScript'], 
      internalTags: [], 
      matchScore: 85, 
      matchAnalysis: {
          jobTitle: 'מפתח/ת Fullstack',
          reason: 'התאמה טובה. שולטת בטכנולוגיות הנדרשות (React, Node), אך חסר ניסיון בניהול צוות.'
      },
      address: 'חיפה', 
      phone: '052-2345678', 
      industry: 'תעשייה וייצור', 
      field: 'ייצור שבבים', 
      sector: 'ציבורי', 
      companySize: '1000+',
      industryAnalysis: {
          industries: [
              { label: 'הייטק (SaaS)', percentage: 80 },
              { label: 'פינטק', percentage: 20 },
          ]
      }
  },
  { 
      id: 3, 
      name: 'לוי דוד', 
      avatar: 'לד', 
      title: 'מעצב UX/UI', 
      status: 'חדש', 
      lastActivity: '09:05 27/05/2025', 
      source: 'חבר מביא חבר', 
      tags: ['Figma', 'UX', 'Mobile Design'], 
      internalTags: [], 
      matchScore: 65,
      matchAnalysis: {
          jobTitle: 'מעצב/ת מוצר',
          reason: 'התאמה בינונית. תיק העבודות מרשים אך חסר ניסיון במערכות מורכבות (B2B).'
      },
      phone: '053-3456789', 
      industry: 'הייטק', 
      field: 'עיצוב', 
      sector: 'פרטי', 
      companySize: '51-200',
      industryAnalysis: {
          industries: [
              { label: 'דיגיטל', percentage: 50 },
              { label: 'פרסום', percentage: 30 },
              { label: 'הייטק', percentage: 20 },
          ]
      }
  }, 
  { 
      id: 4, 
      name: 'ישראלי יעל', 
      avatar: 'יי', 
      title: '', 
      status: 'בבדיקה', 
      lastActivity: '18:45 26/05/2025', 
      source: 'Ethosia', 
      tags: ['QA', 'Automation', 'Selenium'], 
      internalTags: [], 
      matchScore: 45, 
      matchAnalysis: {
          jobTitle: 'ראש צוות QA',
          reason: 'התאמה נמוכה. חסר ניסיון ניהולי וניסיון בפיתוח תשתיות אוטומציה מאפס.'
      },
      address: 'ירושלים', 
      phone: '050-4567890', 
      industry: 'הייטק', 
      field: 'QA', 
      sector: 'ציבורי', 
      companySize: '1000+',
      industryAnalysis: {
          industries: [
              { label: 'ביטחוני', percentage: 70 },
              { label: 'בנקאות', percentage: 30 },
          ]
      }
  }, 
  { id: 5, name: 'מזרחי אבי', avatar: 'מא', title: 'מנהל מוצר', status: 'ראיון HR', lastActivity: '16:30 25/05/2025', source: 'GotFriends', tags: [], internalTags: [], matchScore: 25, address: 'באר שבע', phone: '058-5678901', industry: 'הייטק', field: 'ניהול מוצר', sector: 'פרטי', companySize: '51-200' }, 
  { id: 6, name: 'יוסי לוי', avatar: 'יל', title: 'אנליסט נתונים', status: 'חדש', lastActivity: '10:15 24/05/2025', source: 'JobMaster', tags: ['SQL', 'Excel', 'ניתוח נתונים'], internalTags: [], matchScore: 78, address: 'רמת גן', phone: '054-6789012', industry: 'פיננסים', field: 'Data', sector: 'פרטי', companySize: '200-1000' },
  { id: 7, name: 'רינה כהן', avatar: 'רכ', title: 'מנהלת פרויקטים', status: 'ראיון HR', lastActivity: '09:00 23/05/2025', source: 'חבר מביא חבר', tags: ['Agile', 'Jira', 'ניהול פרויקטים'], internalTags: [], matchScore: 88, address: 'הרצליה', phone: '052-7890123', industry: 'הייטק', field: 'פרויקטים', sector: 'פרטי', companySize: '51-200' },
  { id: 8, name: 'משה פרץ', avatar: 'מפ', title: 'מהנדס QA', status: 'עבר בדיקה ראשונית', lastActivity: '15:45 22/05/2025', source: 'Ethosia', tags: ['Automation', 'Java', 'Selenium'], internalTags: [], matchScore: 95, address: 'פתח תקווה', phone: '053-8901234', industry: 'תעשייה וייצור', field: 'אלקטרוניקה', sector: 'ציבורי', companySize: '1000+' },
  { id: 9, name: 'שרה כץ', avatar: 'שכ', title: 'מעבת גרפית', status: 'חדש', lastActivity: '12:10 21/05/2025', source: 'LinkedIn', tags: ['Photoshop', 'Illustrator', 'Branding'], internalTags: [], matchScore: 72, address: 'גבעתיים', phone: '050-9012345', industry: 'פרסום ומדיה', field: 'עיצוב גרפי', sector: 'פרטי', companySize: '1-50' },
  { id: 10, name: 'אבי שביט', avatar: 'אש', title: 'מנהל מכירות', status: 'בבדיקה', lastActivity: '11:05 20/05/2025', source: 'GotFriends', tags: ['מכירות B2B', 'ניהול מו"מ', 'Salesforce'], internalTags: [], matchScore: 81, address: 'ראשון לציון', phone: '058-0123456', industry: 'תחבורה ולוגיסטיקה', field: 'לוגיסטיקה ושינוע', sector: 'פרטי', companySize: '200-1000' },
  { id: 11, name: 'תמר דהן', avatar: 'תד', title: 'רכזת גיוס', status: 'חדש', lastActivity: '17:30 19/05/2025', source: 'AllJobs', tags: ['גיוס טכנולוגי', 'Sourcing', 'ראיונות'], internalTags: [], matchScore: 68, address: 'חולון', phone: '054-1234568', industry: 'משאבי אנוש', field: 'גיוס', sector: 'פרטי', companySize: '51-200' },
  { id: 12, name: 'דוד ביטון', avatar: 'דב', title: 'מהנדס DevOps', status: 'עבר בדיקה ראשונית', lastActivity: '14:20 18/05/2025', source: 'חבר מביא חבר', tags: ['AWS', 'Kubernetes', 'CI/CD'], internalTags: [], matchScore: 93, address: 'נס ציונה', phone: '052-2345679', industry: 'תעשייה וייצור', field: 'ייצור שבבים', sector: 'ציבורי', companySize: '1000+' },
  { id: 13, name: 'נועה פרידמן', avatar: 'נפ', title: 'מנהלת מוצר', status: 'חדש', lastActivity: '10:00 17/05/2025', source: 'JobMaster', tags: ['Product Strategy', 'UX', 'Agile'], internalTags: [], matchScore: 86, address: 'כפר סבא', phone: '053-3456780', industry: 'הייטק', field: 'ניהול מוצר', sector: 'פרטי', companySize: '200-1000' },
  { id: 14, name: 'איתי גולן', avatar: 'אג', title: 'נציג תמיכה טכנית', status: 'ראיון HR', lastActivity: '08:45 16/05/2025', source: 'LinkedIn', tags: ['Support', 'Zendesk', 'Customer Service'], internalTags: [], matchScore: 79, address: 'רעננה', phone: '050-4567891', industry: 'שירותים', field: 'תמיכה טכנית', sector: 'פרטי', companySize: '1-50' },
  { id: 15, name: 'הילה אזולאי', avatar: 'הא', title: 'מנהלת חשבונות', status: 'עבר בדיקה ראשונית', lastActivity: '16:00 15/05/2025', source: 'AllJobs', tags: ['סוג 3', 'Priority', 'דוחות כספיים'], internalTags: [], matchScore: 90, address: 'בת ים', phone: '058-5678902', industry: 'פיננסים', field: 'הנהלת חשבונות', sector: 'פרטי', companySize: '51-200' },
  { id: 16, name: 'יונתן כהן', avatar: 'יכ', title: 'מנהל פרויקטים', status: 'חדש', lastActivity: '14/05/2025', source: 'AllJobs', tags: ['Project Management', 'Agile'], internalTags: [], matchScore: 82, address: 'אשדוד', phone: '054-9876543', industry: 'תשתיות', field: 'בנייה', sector: 'ממשלתי', companySize: '1000+' },
  { id: 17, name: 'מיכל לוי', avatar: 'מל', title: 'אנליסטית BI', status: 'בבדיקה', lastActivity: '13/05/2025', source: 'LinkedIn', tags: ['BI', 'SQL', 'Tableau'], internalTags: [], matchScore: 89, address: 'נתניה', phone: '052-8765432', industry: 'הייטק', field: 'Data', sector: 'פרטי', companySize: '200-1000' },
  { id: 18, name: 'אמיר חדד', avatar: 'אח', title: 'איש מכירות', status: 'חדש', lastActivity: '12:05/2025', source: 'חבר מביא חבר', tags: ['מכירות', 'שירות לקוחות'], internalTags: [], matchScore: 70, address: 'רחובות', phone: '053-7654321', industry: 'תחבורה ולוגיסטיקה', field: 'הפצה ושרשרת אספקה', sector: 'פרטי', companySize: '200-1000' },
  { id: 19, name: 'רוני פרץ', avatar: 'רפ', title: 'מפתחת Frontend', status: 'ראיון HR', lastActivity: '11/05/2025', source: 'JobMaster', tags: ['React', 'CSS', 'HTML'], internalTags: [], matchScore: 91, address: 'תל אביב', phone: '050-6543210', industry: 'הייטק', field: 'פיתוח תוכנה', sector: 'פרטי', companySize: '51-200' },
  { id: 20, name: 'דניאל ישראלי', avatar: 'די', title: 'מנהל רשת', status: 'עבר בדיקה ראשונית', lastActivity: '10:05/2025', source: 'Ethosia', tags: ['Windows Server', 'Networking'], internalTags: [], matchScore: 85, address: 'באר שבע', phone: '058-5432109', industry: 'הייטק', field: 'IT', sector: 'ציבורי', companySize: '1000+' },
];


const getMissingFields = (candidate: Candidate): string[] => {
    const missing: string[] = [];
    if (!candidate.name || !candidate.name.includes(' ')) missing.push('שם מלא');
    if (!candidate.title) missing.push('תפקיד');
    if (!candidate.tags || candidate.tags.length === 0) missing.push('תגיות');
    if (!candidate.address) missing.push('עיר');
    return missing;
};

const DoubleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    valueMin: number;
    valueMax: number;
    onChange: (name: string, val: number) => void;
    nameMin: string;
    nameMax: string;
    unit?: string;
    colorVar?: string;
    icon?: React.ReactNode;
    includeUnknown?: boolean;
    onIncludeUnknownChange?: (checked: boolean) => void;
    unknownLabel?: string;
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', colorVar = '--color-primary-500', icon, includeUnknown, onIncludeUnknownChange, unknownLabel }) => {
    const minVal = Math.min(valueMin, valueMax);
    const maxVal = Math.max(valueMin, valueMax);
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;
    
    const ticks = useMemo(() => {
        const count = 5;
        const arr = [];
        for(let i=0; i<count; i++) {
           const val = min + ((max-min) * (i / (count-1)));
           arr.push(Math.round(val/step)*step); 
        }
        return arr;
    }, [min, max, step]);

    return (
        <div className="w-full pt-2 pb-6 relative group/slider">
            <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <label className="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</label>
                </div>
                
                <div className="flex items-center gap-1.5 bg-bg-card border border-border-default shadow-sm px-3 py-1 rounded-full text-sm font-extrabold z-10 tabular-nums" dir="ltr">
                    <input
                        type="number" min={min} max={max} step={step} value={minVal}
                        onChange={(e) => onChange(nameMin, Number(e.target.value))}
                        className="w-16 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    <span className="text-text-subtle text-xs font-normal">-</span>
                    <input
                        type="number" min={min} max={max} step={step} value={maxVal}
                        onChange={(e) => onChange(nameMax, Number(e.target.value))}
                        className="w-16 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    {unit && <span className="text-[10px] text-text-muted font-bold ml-0.5">{unit}</span>}
                </div>
            </div>
            
            <div className="relative h-6 flex items-center px-2" dir="ltr">
                <div className="absolute w-[calc(100%-16px)] h-1 bg-bg-subtle rounded-full overflow-hidden">
                     <div
                        className="absolute h-full rounded-full transition-all duration-300"
                        style={{ 
                            left: `${minPercent}%`, 
                            width: `${maxPercent - minPercent}%`,
                            backgroundColor: `rgb(var(${colorVar}))`
                        }}
                    ></div>
                </div>

                <style>{`
                    .range-thumb-custom::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        appearance: none;
                        height: 18px;
                        width: 18px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: 3px solid rgb(var(${colorVar}));
                        cursor: pointer;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                        margin-top: -8.5px;
                        pointer-events: auto;
                        transition: transform 0.15s ease;
                    }
                    .range-thumb-custom:active::-webkit-slider-thumb {
                        transform: scale(1.15);
                    }
                    .range-thumb-custom::-moz-range-thumb {
                        height: 18px;
                        width: 18px;
                        border-radius: 50%;
                        background: #ffffff;
                        border: 3px solid rgb(var(${colorVar}));
                        cursor: pointer;
                        box-shadow: 0 1px 4px rgba(0,0,0,0.15);
                        pointer-events: auto;
                    }
                `}</style>

                <input
                    type="range" min={min} max={max} step={step} value={minVal}
                    onChange={(e) => onChange(nameMin, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
                <input
                    type="range" min={min} max={max} step={step} value={maxVal}
                    onChange={(e) => onChange(nameMax, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
            </div>
            
            <div className="flex justify-between px-2 mt-1 w-full" dir="ltr">
                {ticks.map((t, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                        <div className="w-0.5 h-1 bg-border-default"></div>
                        <span className="text-[9px] text-text-subtle tabular-nums font-bold">
                            {t >= 1000 ? (t/1000) + 'k' : t}
                        </span>
                    </div>
                ))}
            </div>

            {onIncludeUnknownChange && (
                <label className="flex items-center gap-2 cursor-pointer mt-3 px-1 justify-center">
                    <input 
                        type="checkbox" 
                        checked={includeUnknown} 
                        onChange={(e) => onIncludeUnknownChange(e.target.checked)} 
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-[11px] font-medium text-text-subtle">{unknownLabel}</span>
                </label>
            )}
        </div>
    );
};


const jobScopeOptions = ['מלאה', 'חלקית', 'משמרות', 'פרילנס'];

interface CandidatesListViewProps {
    openSummaryDrawer: (candidateId: number) => void;
    favorites: Set<number>;
    toggleFavorite: (id: number) => void;
}

const CandidatesListView: React.FC<CandidatesListViewProps> = ({ openSummaryDrawer, favorites, toggleFavorite }) => {
    const navigate = useNavigate();
    const [searchParamsFromUrl] = useSearchParams();
    const { savedSearches, addSearch, updateSearch } = useSavedSearches();
    const { t } = useLanguage();

    const [searchTerm, setSearchTerm] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const dragItemIndex = useRef<number | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    
    const [complexRules, setComplexRules] = useState<ComplexFilterRule[]>([]);

    const [searchParams, setSearchParams] = useState({
        mainFieldTags: [] as string[],
        jobScopes: jobScopeOptions, 
        locations: [] as LocationItem[],
        status: '',
        interestField: '', 
        interestRole: '', 
        interestJob: '',
        ageMin: 18, 
        ageMax: 65, 
        salaryMin: 5000, 
        salaryMax: 30000,
        internalSalaryMin: 5000,
        internalSalaryMax: 30000,
        gender: 'any' as 'any' | 'male' | 'female',
        hasDegree: false,
        includeUnknownAge: true,
        includeUnknownSalary: true,
        industryExperience: '',
        lastUpdated: null as DateRange | null,
        interestDate: null as DateRange | null,
    });
    
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industry: string;
        field: string;
    }>({ sizes: [], sectors: [], industry: '', field: '' });
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);
    
    const [mainFieldInput, setMainFieldInput] = useState('');
    const [languageFilters, setLanguageFilters] = useState<{ language: string; level: string }[]>([]);
    const [currentLanguage, setCurrentLanguage] = useState('אנגלית');
    const [currentLevel, setCurrentLevel] = useState('רמה גבוהה');
    
    const [additionalFilters, setAdditionalFilters] = useState<{ id: number; field: string }[]>([]);
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const fieldSelectorRef = useRef<HTMLDivElement>(null);
    
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'save' | 'update'>('save');
    const [searchNameToSave, setSearchNameToSave] = useState('');
    const [isPublicSearch, setIsPublicSearch] = useState(false);
    const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
    const [loadedSearch, setLoadedSearch] = useState<SavedSearch | null>(null);

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [isBulkActionsMobileOpen, setIsBulkActionsMobileOpen] = useState(false);
    const [isMoreActionsOpen, setIsMoreActionsOpen] = useState(false);
    
    // Add state for active tooltip in list view
    const [activeMatchState, setActiveMatchState] = useState<{ id: number, top: number, left: number } | null>(null);

    const [sortConfig, setSortConfig] = useState<{ key: keyof Candidate; direction: 'asc' | 'desc' } | null>(null);
    
    const [showNeedsAttention, setShowNeedsAttention] = useState(false);
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    // Initialize columns state with translations
    const allColumns = useMemo(() => [
        { id: 'name', header: t('col.name') },
        { id: 'matchScore', header: t('col.match') },
        { id: 'title', header: t('col.role') },
        { id: 'status', header: t('col.status') },
        { id: 'lastActivity', header: t('col.last_activity') },
        { id: 'source', header: t('col.source') },
        { id: 'industry', header: t('col.industry') },
        { id: 'field', header: t('col.field') },
        { id: 'sector', header: t('col.sector') },
        { id: 'companySize', header: t('col.company_size') },
    ], [t]);

    // Use a subset for default visibility
    const defaultVisibleColumns = useMemo(() => ['name', 'matchScore', 'title', 'status', 'lastActivity', 'source'], []);
    const [columns, setColumns] = useState(allColumns.filter(c => defaultVisibleColumns.includes(c.id)));

    // Effect to update columns when language changes
    useEffect(() => {
        // Re-construct the currently visible columns with new translations
        setColumns(prevColumns => {
            const visibleIds = prevColumns.map(c => c.id);
            return allColumns.filter(c => visibleIds.includes(c.id));
        });
    }, [allColumns]);


    const requestSort = (key: keyof Candidate) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        setSelectedIds(new Set());
        setIsBulkActionsMobileOpen(false);
        setIsMoreActionsOpen(false);
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };
    
    useEffect(() => {
        if (feedbackMessage) {
          const timer = setTimeout(() => {
            setFeedbackMessage(null);
          }, 3000);
          return () => clearTimeout(timer);
        }
    }, [feedbackMessage]);
    
    // Close match tooltip when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (activeMatchState !== null && !(event.target as Element).closest('.match-score-popup')) {
            setActiveMatchState(null);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMatchState]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (fieldSelectorRef.current && !fieldSelectorRef.current.contains(event.target as Node)) {
            setIsFieldSelectorOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

     useEffect(() => {
        const savedSearchId = searchParamsFromUrl.get('savedSearchId');
        if (savedSearchId) {
            const searchToLoad = savedSearches.find(s => s.id === Number(savedSearchId));
            if (searchToLoad) {
                if (loadedSearch?.id !== searchToLoad.id) {
                    setSearchParams(searchToLoad.searchParams);
                    setAdditionalFilters(searchToLoad.additionalFilters);
                    setLanguageFilters(searchToLoad.languageFilters);
                    
                    if (searchToLoad.searchParams.complexRules) {
                        setComplexRules(searchToLoad.searchParams.complexRules);
                    } else {
                        setComplexRules([]);
                    }

                    setIsAdvancedSearchOpen(true);
                    setLoadedSearch(searchToLoad);
                }
            } else {
                setLoadedSearch(null);
            }
        } else {
             setLoadedSearch(null);
        }
    }, [searchParamsFromUrl, savedSearches, loadedSearch?.id]);

    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        if (selectedField) {
            setSearchParams(prev => ({
                ...prev,
                interestRole: selectedField.role,
                interestField: selectedField.category
            }));
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleSliderChange = (name: string, value: number) => {
        setSearchParams(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenSaveModal = () => {
        setModalMode('save');
        setSearchNameToSave('');
        setIsPublicSearch(false);
        setIsSaveModalOpen(true);
    };
    
    const handleModalSubmit = () => {
        if (!searchNameToSave.trim()) {
            alert('Please enter a name for the search.');
            return;
        }
        const finalSearchParams = { ...searchParams, complexRules };

        if (modalMode === 'update' && loadedSearch) {
            updateSearch(
                loadedSearch.id,
                searchNameToSave,
                isPublicSearch,
                finalSearchParams,
                additionalFilters,
                languageFilters
            );
            setFeedbackMessage('החיתוך עודכן בהצלחה!');
        } else {
            addSearch(searchNameToSave, isPublicSearch, finalSearchParams, additionalFilters, languageFilters);
            setFeedbackMessage('החיתוך נשמר בהצלחה!');
        }
        setSearchNameToSave('');
        setIsSaveModalOpen(false);
    };

    const handleJobScopeToggle = (scope: string) => {
        setSearchParams(prev => {
            const newScopes = prev.jobScopes.includes(scope)
                ? prev.jobScopes.filter(s => s !== scope)
                : [...prev.jobScopes, scope];
            return { ...prev, jobScopes: newScopes };
        });
    };
    
    const handleMainFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && mainFieldInput.trim()) {
            e.preventDefault();
            const newTags = mainFieldInput.split(',').map(tag => tag.trim()).filter(tag => tag);
            const uniqueNewTags = newTags.filter(tag => !searchParams.mainFieldTags.includes(tag));
            if (uniqueNewTags.length > 0) {
                setSearchParams(prev => ({
                    ...prev,
                    mainFieldTags: [...prev.mainFieldTags, ...uniqueNewTags],
                }));
            }
            setMainFieldInput('');
        }
    };
    
    const handleRemoveMainFieldTag = (tagToRemove: string) => {
        setSearchParams(prev => ({
            ...prev,
            mainFieldTags: prev.mainFieldTags.filter(tag => tag !== tagToRemove),
        }));
    };

    const handleAddLanguage = () => {
        if (currentLanguage && currentLevel && !languageFilters.some(f => f.language === currentLanguage)) {
            setLanguageFilters(prev => [...prev, { language: currentLanguage, level: currentLevel }]);
        }
    };

    const handleRemoveLanguage = (languageToRemove: string) => {
        setLanguageFilters(prev => prev.filter(f => f.language !== languageToRemove));
    };
    
    const handleAddRule = (operator: Operator) => {
        const newRule: ComplexFilterRule = {
            id: Date.now().toString(),
            operator,
            field: 'referrals',
            value: '',
            dateRange: null
        };
        setComplexRules(prev => [...prev, newRule]);
    };

    const handleRemoveRule = (id: string) => {
        setComplexRules(prev => prev.filter(r => r.id !== id));
    };

    const handleRuleChange = (id: string, updates: Partial<ComplexFilterRule>) => {
        setComplexRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
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

    const processedCandidates = useMemo(() => {
        let filtered = candidatesData;

        if (showNeedsAttention) {
            filtered = filtered.filter(candidate => getMissingFields(candidate).length > 0);
        }

        if (showFavoritesOnly) {
            filtered = filtered.filter(candidate => favorites.has(candidate.id));
        }

        if (companyFilters.industry) {
            filtered = filtered.filter(c => c.industry === companyFilters.industry);
        }
        if (companyFilters.field) {
            filtered = filtered.filter(c => c.field === companyFilters.field);
        }
        if (companyFilters.sizes && companyFilters.sizes.length > 0) {
             filtered = filtered.filter(c => c.companySize && companyFilters.sizes.includes(c.companySize));
        }
        if (companyFilters.sectors && companyFilters.sectors.length > 0) {
             filtered = filtered.filter(c => c.sector && companyFilters.sectors.includes(c.sector));
        }

        let sortableItems = filtered.filter(candidate => 
            candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            candidate.title.toLowerCase().includes(searchTerm.toLowerCase())
        );

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        return sortableItems;
    }, [searchTerm, sortConfig, showNeedsAttention, showFavoritesOnly, favorites, companyFilters]);

    const areAllVisibleSelected = useMemo(() => {
        if (processedCandidates.length === 0) return false;
        return processedCandidates.every(c => selectedIds.has(c.id));
    }, [selectedIds, processedCandidates]);
    
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(processedCandidates.map(c => c.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleColumnToggle = (columnId: string) => {
        const isVisible = columns.some(c => c.id === columnId);
        if (isVisible) {
            if (columns.length > 1) setColumns(prev => prev.filter(c => c.id !== columnId));
        } else {
            const columnToAdd = allColumns.find(c => c.id === columnId);
            if (columnToAdd) setColumns(prev => [...prev, columnToAdd]);
        }
    };
    
    const handleDragStart = (index: number, colId: string) => { 
        dragItemIndex.current = index; 
        setDraggingColumn(colId);
    };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newColumns = [...columns];
        const draggedItem = newColumns.splice(dragItemIndex.current, 1)[0];
        newColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setColumns(newColumns);
    };
    const handleDragEnd = () => { 
        dragItemIndex.current = null; 
        setDraggingColumn(null);
    };
    const handleDrop = () => { 
        dragItemIndex.current = null; 
        setDraggingColumn(null);
    };

    const handleShowResults = () => {
        setIsAdvancedSearchOpen(false);
        setFeedbackMessage(t('candidates.found_count', { count: processedCandidates.length }));
    };

    // Helper for score circle colors inside the list view (duplicated logic for consistency)
    const getScoreColorClass = (score: number) => {
        if (score >= 90) return 'text-green-600 border-green-200 bg-green-50';
        if (score >= 75) return 'text-yellow-600 border-yellow-200 bg-yellow-50';
        if (score >= 60) return 'text-orange-600 border-orange-200 bg-orange-50';
        return 'text-red-600 border-red-200 bg-red-50';
    };

    const handleScoreClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (activeMatchState?.id === id) {
            setActiveMatchState(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        // Calculate position relative to viewport, centered horizontally on button
        setActiveMatchState({
            id,
            top: rect.top - 10,
            left: rect.left + (rect.width / 2)
        });
    };

    // Render logic for the popup based on activeMatchState
    const activeCandidateForPopup = activeMatchState 
        ? processedCandidates.find(c => c.id === activeMatchState.id)
        : null;

    const renderCell = (candidate: Candidate, columnId: string) => {
        const missingFields = getMissingFields(candidate);
        const hasMissingFields = missingFields.length > 0;
        const isFavorite = favorites.has(candidate.id);
        
        switch (columnId) {
            case 'name':
                return (
                    <div className="flex items-center gap-3">
                        {/* Restore Avatar */}
                        <AvatarIcon initials={candidate.avatar} size={36} fontSize={14} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                        <div className="flex flex-col">
                            <span 
                                onClick={(e) => { e.stopPropagation(); navigate(`/candidates/${candidate.id}`); }} 
                                className="font-bold text-text-default hover:text-primary-600 cursor-pointer transition-colors text-base"
                            >
                                {candidate.name}
                            </span>
                             {/* Keep missing fields warning and favorite button here */}
                             <div className="flex items-center gap-2 mt-0.5">
                                {hasMissingFields && (
                                    <span title={`חסרים פרטים: ${missingFields.join(', ')}`}>
                                        <ExclamationTriangleIcon className="w-3.5 h-3.5 text-amber-500" />
                                    </span>
                                )}
                                 <button 
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(candidate.id); }} 
                                    className="text-text-subtle hover:text-primary-500 transition-colors"
                                >
                                    {isFavorite ? <BookmarkIconSolid className="w-4 h-4 text-primary-500" /> : <BookmarkIcon className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            case 'matchScore':
                 return (
                    <div className="flex items-center justify-center">
                        <div 
                            onClick={(e) => handleScoreClick(e, candidate.id)}
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-sm cursor-pointer ${getScoreColorClass(candidate.matchScore)}`}
                        >
                            {candidate.matchScore}%
                        </div>
                    </div>
                 );
            default:
                return (candidate as any)[columnId];
        }
    };

    return (
        <div className="space-y-6">
            {feedbackMessage && (
                <div className="fixed top-24 right-6 bg-green-500 text-white py-2 px-4 rounded-lg shadow-lg animate-fade-in-out z-50 flex items-center gap-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span>{feedbackMessage}</span>
                </div>
            )}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.9); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out;
                }
                 @keyframes slide-up {
                    from { opacity: 0; transform: translateY(100%); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
                .dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); cursor: grabbing !important; } 
                th[draggable] { user-select: none; }
                @keyframes fade-in-out {
                    0%, 100% { opacity: 0; transform: translateY(-20px); }
                    10%, 90% { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-out {
                    animation: fade-in-out 3s ease-in-out forwards;
                }
            `}</style>

            <header className="flex flex-col lg:flex-row items-start lg:items-center gap-3 pb-2">
                <div className="relative w-full lg:flex-grow">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input 
                        type="text" 
                        placeholder={t('candidates.search_placeholder')} 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full bg-bg-card border border-border-default rounded-xl py-3 ps-10 pe-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition shadow-sm" 
                    />
                </div>

                <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3 lg:items-center lg:flex-shrink-0">
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto flex-grow sm:flex-grow-0">
                        <button onClick={() => navigate('/candidates/new')} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white font-semibold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-sm whitespace-nowrap">
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('candidates.new_candidate_btn')}</span>
                        </button>
                        <button onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl border-2 transition-all whitespace-nowrap ${isAdvancedSearchOpen ? 'bg-primary-600 text-white border-primary-600' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`}>
                             <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            <span>{t('candidates.filter_btn')}</span>
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <div className="relative">
                            <button
                                ref={companyFilterButtonRef}
                                onClick={() => setIsCompanyFilterOpen(prev => !prev)}
                                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl border-2 transition-all whitespace-nowrap ${
                                    isCompanyFilterOpen
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'
                                }`}
                            >
                                <BuildingOffice2Icon className="w-5 h-5" />
                                <span>{t('candidates.employment_background_btn')}</span>
                            </button>
                            {isCompanyFilterOpen && (
                                <CompanyFilterPopover
                                onClose={() => setIsCompanyFilterOpen(false)}
                                filters={companyFilters}
                                setFilters={setCompanyFilters}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0 w-full sm:w-auto sm:ms-auto justify-between sm:justify-end lg:justify-start">
                        <div className="flex gap-2">
                            <button onClick={toggleSelectionMode} className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${selectionMode ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`} title={t('candidates.multi_select_tooltip')}>
                                 <CheckCircleIcon className="w-5 h-5" />
                            </button>
                             <button onClick={() => setShowNeedsAttention(!showNeedsAttention)} className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${showNeedsAttention ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : 'bg-bg-card text-text-default border-border-default hover:border-yellow-300'}`} title={t('candidates.needs_attention_tooltip')}>
                                <ExclamationTriangleIcon className="w-5 h-5" />
                            </button>
                            <button 
                                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)} 
                                className={`p-3 rounded-xl border-2 transition-all flex-shrink-0 ${showFavoritesOnly ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-bg-card text-text-default border-border-default hover:border-primary-300'}`}
                                title={t('candidates.favorites_only_tooltip')}
                            >
                                {showFavoritesOnly ? <BookmarkIconSolid className="w-5 h-5" /> : <BookmarkIcon className="w-5 h-5" />}
                            </button>
                        </div>

                        <div className="w-px h-8 bg-border-default mx-1 hidden sm:block flex-shrink-0"></div>

                         <div className="flex items-center bg-bg-subtle p-1.5 rounded-xl border border-border-default flex-shrink-0 ml-2 sm:ms-0">
                            <button onClick={() => setViewMode('grid')} title={t('candidates.view_grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                            <button onClick={() => setViewMode('table')} title={t('candidates.view_list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        </div>
                    </div>
                </div>
            </header>
            
            {isAdvancedSearchOpen && (
                 <div className="bg-bg-card rounded-2xl shadow-sm p-3 space-y-3 border border-border-default transition-all duration-300">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.tags_skills')}</label>
                            <div className="w-full bg-bg-input border border-border-default rounded-xl p-1.5 flex items-center flex-wrap gap-2 min-h-[38px] focus-within:ring-2 focus-within:ring-primary-500 transition-shadow">
                                {searchParams.mainFieldTags.map((tag, index) => (
                                    <span key={index} className="flex items-center bg-primary-100 text-primary-800 text-xs font-medium pl-2 pr-1.5 py-0.5 rounded-full animate-fade-in">
                                        {tag}
                                        <button
                                            onClick={() => handleRemoveMainFieldTag(tag)}
                                            className="me-1 text-primary-500 hover:text-primary-700"
                                            aria-label={`Remove ${tag}`}
                                        >
                                            <XMarkIcon className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))}
                                <input 
                                    type="text" 
                                    value={mainFieldInput} 
                                    onChange={(e) => setMainFieldInput(e.target.value)} 
                                    onKeyDown={handleMainFieldKeyDown} 
                                    placeholder={t('filter.tags_placeholder')} 
                                    className="flex-grow bg-transparent outline-none text-sm min-w-[100px]" 
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.location')}</label>
                             <LocationSelector 
                                selectedLocations={searchParams.locations}
                                onChange={(newLocations) => setSearchParams(prev => ({ ...prev, locations: newLocations }))}
                                className="w-full"
                                placeholder={t('filter.location_placeholder')}
                            />
                        </div>
                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.status')}</label>
                            <select className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm focus:ring-primary-500 focus:border-primary-500">
                                <option>{t('filter.status_all')}</option>
                                <option>{t('filter.status_active')}</option>
                                <option>{t('filter.status_inactive')}</option>
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.last_updated')}</label>
                            <DateRangeSelector 
                                value={searchParams.lastUpdated} 
                                onChange={(val) => setSearchParams(prev => ({...prev, lastUpdated: val}))} 
                                placeholder={t('filter.status_all')}
                            />
                        </div>

                         <div className="lg:col-span-2">
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.job_scope')}</label>
                            <div className="flex flex-wrap gap-2">
                                {jobScopeOptions.map(scope => (
                                    <button
                                        key={scope}
                                        onClick={() => handleJobScopeToggle(scope)}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                                            searchParams.jobScopes.includes(scope)
                                                ? 'bg-primary-100 text-primary-700 border border-primary-200 shadow-sm'
                                                : 'bg-bg-subtle text-text-muted border border-transparent hover:bg-bg-hover'
                                        }`}
                                    >
                                        {scope}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.interest_role')}</label>
                             <button 
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm flex justify-between items-center text-start hover:border-primary-300 transition-colors h-[38px]"
                            >
                                <span className="truncate">{searchParams.interestRole || t('filter.interest_role_placeholder')}</span>
                                <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                            </button>
                        </div>
                        
                        <div className={`transition-all duration-300 ease-in-out relative z-30 ${searchParams.interestRole ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.interest_date')}</label>
                             <DateRangeSelector 
                                value={searchParams.interestDate} 
                                onChange={(val) => setSearchParams(prev => ({...prev, interestDate: val}))} 
                                placeholder={t('filter.status_all')}
                                disabled={!searchParams.interestRole}
                            />
                        </div>

                         <div>
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.gender')}</label>
                            <div className="flex bg-bg-input border border-border-default rounded-xl p-1 h-[38px]">
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'any'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'any' ? 'bg-primary-100 text-primary-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >{t('filter.gender_all')}</button>
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'female'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'female' ? 'bg-pink-100 text-pink-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >
                                    <span className="flex items-center justify-center gap-1"><GenderFemaleIcon className="w-3 h-3"/> {t('filter.gender_female')}</span>
                                </button>
                                <button 
                                    onClick={() => setSearchParams(prev => ({...prev, gender: 'male'}))} 
                                    className={`flex-1 text-xs font-medium rounded-lg transition-colors ${searchParams.gender === 'male' ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                                >
                                     <span className="flex items-center justify-center gap-1"><GenderMaleIcon className="w-3 h-3"/> {t('filter.gender_male')}</span>
                                </button>
                            </div>
                        </div>

                        <div className="lg:col-span-1">
                             <DoubleRangeSlider
                                label={t('filter.age_range')} min={18} max={80} step={1}
                                valueMin={Number(searchParams.ageMin)} valueMax={Number(searchParams.ageMax)}
                                onChange={handleSliderChange} nameMin="ageMin" nameMax="ageMax"
                                includeUnknown={searchParams.includeUnknownAge}
                                onIncludeUnknownChange={(checked) => setSearchParams(prev => ({...prev, includeUnknownAge: checked}))}
                                unknownLabel={t('filter.include_unknown_age')}
                            />
                        </div>
                        
                         <div className="lg:col-span-1">
                            <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.education')}</label>
                             <button 
                                onClick={() => setSearchParams(p => ({ ...p, hasDegree: !p.hasDegree }))} 
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border-2 transition-all h-[38px] ${searchParams.hasDegree ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' : 'bg-bg-input border-border-default text-text-muted hover:border-primary-300'}`}
                            >
                                <span className="font-semibold text-xs">{t('filter.has_degree')}</span>
                                {searchParams.hasDegree ? <CheckCircleIcon className="w-4 h-4" /> : <AcademicCapIcon className="w-4 h-4 opacity-50"/>}
                            </button>
                        </div>

                        <div className="col-span-full md:col-span-2 lg:col-span-2 grid grid-cols-2 gap-4 p-3 bg-bg-subtle/30 rounded-xl border border-border-default/50 relative overflow-hidden">
                            <DoubleRangeSlider
                                label={t('filter.salary_candidate')} min={5000} max={50000} step={500}
                                valueMin={Number(searchParams.salaryMin)} valueMax={Number(searchParams.salaryMax)}
                                onChange={handleSliderChange} nameMin="salaryMin" nameMax="salaryMax" unit="₪"
                                colorVar="--color-secondary-500"
                                includeUnknown={searchParams.includeUnknownSalary}
                                onIncludeUnknownChange={(checked) => setSearchParams(prev => ({...prev, includeUnknownSalary: checked}))}
                                unknownLabel={t('filter.include_unknown_salary')}
                                icon={<WalletIcon className="w-4 h-4 text-primary-600"/>}
                            />
                             <DoubleRangeSlider
                                label={t('filter.salary_internal')} min={5000} max={50000} step={500}
                                valueMin={Number(searchParams.internalSalaryMin)} valueMax={Number(searchParams.internalSalaryMax)}
                                onChange={handleSliderChange} nameMin="internalSalaryMin" nameMax="internalSalaryMax" unit="₪"
                                colorVar="--color-primary-600"
                                icon={<SparklesIcon className="w-4 h-4 text-primary-600"/>}
                            />
                        </div>
                        
                        <div className="lg:col-span-1">
                             <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wide">{t('filter.languages')}</label>
                             <div className="flex gap-1.5">
                                <select value={currentLanguage} onChange={(e) => setCurrentLanguage(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-1.5 px-2 text-[11px] h-[38px]"><option>עברית</option><option>אנגלית</option><option>רוסית</option></select>
                                <select value={currentLevel} onChange={(e) => setCurrentLevel(e.target.value)} className="flex-1 bg-bg-input border border-border-default rounded-xl py-1.5 px-2 text-[11px] h-[38px]"><option>שפת אם</option><option>גבוהה</option></select>
                                <button onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 p-2 rounded-xl hover:bg-primary-200 transition h-[38px] w-[38px] flex items-center justify-center shrink-0"><PlusIcon className="w-4 h-4"/></button>
                             </div>
                             <div className="flex flex-wrap gap-1 mt-2 min-h-[22px]">
                                {languageFilters.map(filter => (
                                    <span key={filter.language} className="flex items-center bg-sky-50 text-sky-700 text-[10px] font-semibold px-2 py-0.5 rounded-lg border border-sky-100">
                                        {filter.language}
                                        <button onClick={() => handleRemoveLanguage(filter.language)} className="me-1 hover:text-red-500"><XMarkIcon className="h-3 w-3" /></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-bg-subtle/40 rounded-xl p-3 border border-border-default/50 mt-2">
                         <div className="flex items-center gap-2 mb-2">
                             <FunnelIcon className="w-4 h-4 text-primary-500" />
                             <h4 className="text-xs font-bold text-primary-700 uppercase tracking-wide">{t('filter.complex_queries')}</h4>
                         </div>
                         
                         {complexRules.length > 0 && (
                            <div className="space-y-2 mb-3">
                                {complexRules.map((rule, idx) => (
                                    <div key={rule.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-border-default shadow-sm animate-fade-in text-sm">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rule.operator === 'AND' ? 'bg-blue-100 text-blue-700' : rule.operator === 'OR' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                            {rule.operator === 'AND' ? 'וגם' : rule.operator === 'OR' ? 'או' : 'ללא'}
                                        </span>
                                        <select 
                                            value={rule.field} 
                                            onChange={(e) => handleRuleChange(rule.id, { field: e.target.value as any })}
                                            className="bg-transparent font-semibold outline-none text-text-default cursor-pointer text-xs"
                                        >
                                            <option value="referrals">הפניות למשרה</option>
                                            <option value="source">מקור גיוס</option>
                                            <option value="status_change">שינוי סטטוס</option>
                                        </select>
                                        
                                        {rule.field === 'referrals' && (
                                             <div className="flex items-center gap-2 flex-grow">
                                                <input 
                                                    type="text" 
                                                    placeholder="שם משרה/מזהה..." 
                                                    value={rule.value || ''}
                                                    onChange={(e) => handleRuleChange(rule.id, { value: e.target.value })}
                                                    className="bg-bg-subtle/50 px-2 py-1 rounded border border-border-default text-xs flex-grow outline-none focus:border-primary-300"
                                                />
                                                <DateRangeSelector 
                                                    value={rule.dateRange || null} 
                                                    onChange={(val) => handleRuleChange(rule.id, { dateRange: val })} 
                                                    placeholder="מתי?"
                                                    className="min-w-[120px]"
                                                />
                                             </div>
                                        )}
                                        {rule.field === 'source' && (
                                            <input 
                                                type="text" 
                                                placeholder="מקור (למשל LinkedIn)..." 
                                                value={rule.textValue || ''}
                                                onChange={(e) => handleRuleChange(rule.id, { textValue: e.target.value })}
                                                className="bg-bg-subtle/50 px-2 py-1 rounded border border-border-default text-xs flex-grow outline-none focus:border-primary-300"
                                            />
                                        )}
                                        
                                        <button onClick={() => handleRemoveRule(rule.id)} className="text-text-subtle hover:text-red-500 p-1"><XMarkIcon className="w-3.5 h-3.5"/></button>
                                    </div>
                                ))}
                            </div>
                         )}

                         <div className="flex gap-2">
                             <button onClick={() => handleAddRule('AND')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 hover:bg-blue-100 transition-colors">
                                 <PlusIcon className="w-3 h-3" /> וגם (AND)
                             </button>
                             <button onClick={() => handleAddRule('OR')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200 hover:bg-orange-100 transition-colors">
                                 <PlusIcon className="w-3 h-3" /> או (OR)
                             </button>
                             <button onClick={() => handleAddRule('NOT')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-200 hover:bg-red-100 transition-colors">
                                 <MinusIcon className="w-3 h-3" /> ללא (NOT)
                             </button>
                         </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-border-default flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <button onClick={() => {setSearchParams(prev => ({...prev, mainFieldTags: [], locations: [], interestRole: '', industryExperience: '', hasDegree: false, jobScopes: jobScopeOptions, lastUpdated: null, interestDate: null })); setLanguageFilters([]); setMainFieldInput(''); setComplexRules([]);}} className="text-xs font-semibold text-text-muted hover:text-red-500 transition-colors">
                                {t('candidates.reset_all')}
                            </button>
                            <button onClick={handleOpenSaveModal} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition">
                                <BookmarkIcon className="w-3.5 h-3.5"/>
                                <span>{t('candidates.save_search')}</span>
                            </button>
                        </div>
                        <button onClick={handleShowResults} className="bg-primary-600 text-white font-bold py-2 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm">
                            {t('candidates.show_results')}
                        </button>
                    </div>
                 </div>
            )}

            <main className="bg-bg-card rounded-2xl shadow-sm overflow-hidden border border-border-default">
                {viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                <tr>
                                    {selectionMode && (
                                        <th className="p-4 w-12">
                                            <input type="checkbox" onChange={handleSelectAll} checked={areAllVisibleSelected} className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500" />
                                        </th>
                                    )}
                                    {columns.map((col, index) => (
                                        <th 
                                            key={col.id} 
                                            draggable 
                                            onClick={() => requestSort(col.id as keyof Candidate)}
                                            onDragStart={() => handleDragStart(index, col.id)} 
                                            onDragEnter={() => handleDragEnter(index)} 
                                            onDragEnd={handleDragEnd} 
                                            onDragOver={(e) => e.preventDefault()} 
                                            onDrop={handleDrop} 
                                            className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''}`}
                                            title="לחץ למיון או גרור לשינוי סדר"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span>{col.header}</span>
                                                {sortConfig?.key === col.id && (
                                                    <span className="text-text-subtle">
                                                        {sortConfig.direction === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    <th scope="col" className="px-2 py-3 sticky end-0 bg-bg-subtle w-16">
                                        <div className="relative" ref={settingsRef}>
                                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title={t('candidates.customize_columns')} className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                            {isSettingsOpen && (
                                            <div className="absolute top-full end-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                                <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                                <div className="space-y-2">
                                                {allColumns.map(column => (
                                                    <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                                    <input type="checkbox" checked={columns.some(c => c.id === column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
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
                            {processedCandidates.map(candidate => (
                                <tr key={candidate.id} onClick={() => selectionMode ? handleSelect(candidate.id) : openSummaryDrawer(candidate.id)} className={`group transition-colors ${selectionMode ? 'cursor-pointer' : ''} ${selectedIds.has(candidate.id) ? 'bg-primary-50' : 'hover:bg-bg-hover'}`}>
                                     {selectionMode && (
                                        <td className="p-4">
                                            <input type="checkbox" checked={selectedIds.has(candidate.id)} onChange={() => handleSelect(candidate.id)} onClick={e => e.stopPropagation()} className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500" />
                                        </td>
                                    )}
                                    {columns.map(col => (
                                        <td key={col.id} className="p-4 text-text-muted">{renderCell(candidate, col.id)}</td>
                                    ))}
                                    <td className="px-2 py-4 sticky end-0 bg-bg-card group-hover:bg-bg-hover group-[:has(:checked)]:bg-primary-50 transition-colors w-16"></td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                        {processedCandidates.map(candidate => {
                            const missingFields = getMissingFields(candidate);
                            const isSelected = selectedIds.has(candidate.id);
                            const isFavorite = favorites.has(candidate.id);
                            return (
                                <div key={candidate.id} onClick={() => selectionMode && handleSelect(candidate.id)} className={`relative rounded-lg transition-all ${selectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-primary-500' : ''}`}>
                                    {selectionMode && (
                                        <div className="absolute top-3 end-3 z-10 bg-bg-card/50 backdrop-blur-sm p-1 rounded-full">
                                            <input type="checkbox" checked={isSelected} readOnly className="h-5 w-5 rounded-full border-2 border-white text-primary-600 focus:ring-primary-500 pointer-events-none" />
                                        </div>
                                    )}
                                    <CandidateCard 
                                        key={candidate.id} 
                                        candidate={candidate} 
                                        onViewProfile={(id) => navigate(`/candidates/${id}`)}
                                        onOpenSummary={selectionMode ? () => {} : openSummaryDrawer}
                                        missingFields={missingFields}
                                        isFavorite={isFavorite}
                                        onToggleFavorite={toggleFavorite}
                                        onScoreClick={handleScoreClick} // Pass the handler
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Global Match Score Popup - Rendered outside overflow containers */}
            {activeMatchState && activeCandidateForPopup && (
                <div 
                    className="fixed z-[9999] w-72 bg-white rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.3)] border border-border-default p-4 text-right animate-fade-in match-score-popup"
                    style={{ 
                        top: activeMatchState.top, 
                        left: activeMatchState.left,
                        transform: 'translate(-50%, -100%)',
                        marginTop: '-10px'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Arrow */}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-border-default transform rotate-45"></div>

                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-border-subtle">
                        <div className="flex items-center gap-2">
                            <div className="p-1 bg-primary-50 rounded">
                                <SparklesIcon className="w-4 h-4 text-primary-600" />
                            </div>
                            <span className="text-sm font-bold text-gray-900">ניתוח התאמה AI</span>
                        </div>
                        <button onClick={() => setActiveMatchState(null)} className="text-text-muted hover:text-text-default">
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="space-y-3">
                        {activeCandidateForPopup.matchAnalysis ? (
                            <>
                                <p className="text-xs text-text-subtle font-medium">
                                    משרה: <span className="text-text-default font-bold">{activeCandidateForPopup.matchAnalysis.jobTitle}</span>
                                </p>
                                <p className="text-xs text-text-default leading-relaxed bg-bg-subtle/50 p-2.5 rounded-lg border border-border-subtle">
                                    {activeCandidateForPopup.matchAnalysis.reason}
                                </p>
                            </>
                        ) : (
                            <p className="text-xs text-text-muted italic">אין ניתוח זמין למועמד זה.</p>
                        )}
                        
                        <div className="pt-2">
                             <button className="w-full flex items-center justify-center gap-2 text-primary-600 hover:bg-primary-50 py-1.5 rounded-lg transition-colors text-xs font-bold border border-transparent hover:border-primary-100">
                                <ArrowPathIcon className="w-3.5 h-3.5" />
                                <span>חשב מחדש</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isSaveModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={() => setIsSaveModalOpen(false)}>
                    <div className="bg-bg-card rounded-lg shadow-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">{modalMode === 'update' ? 'עדכן חיתוך' : 'שמור חיתוך חיפוש'}</h3>
                        <input
                            type="text"
                            value={searchNameToSave}
                            onChange={e => setSearchNameToSave(e.target.value)}
                            placeholder="הזן שם לחיתוך..."
                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 mb-4"
                            autoFocus
                        />
                         <label className="flex items-center gap-2 text-sm text-text-default mb-4 cursor-pointer">
                            <input 
                                type="checkbox"
                                checked={isPublicSearch}
                                onChange={e => setIsPublicSearch(e.target.checked)}
                                className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                            />
                            <span>חיתוך ציבורי (גלוי לכלל הרכזים)</span>
                        </label>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setIsSaveModalOpen(false)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">ביטול</button>
                            <button onClick={handleModalSubmit} className="bg-primary-600 text-white font-bold py-2 px-4 rounded-lg">{modalMode === 'update' ? 'עדכן' : 'שמור'}</button>
                        </div>
                    </div>
                </div>
            )}
             {selectedIds.size > 0 && (
                <div className="fixed bottom-0 start-0 end-0 z-40 p-4 pointer-events-none">
                    <div className="w-full max-w-5xl mx-auto pointer-events-auto">
                        <div className="hidden md:block bg-bg-card rounded-xl shadow-2xl border border-border-default px-4 py-2 animate-slide-up">
                            {isMoreActionsOpen && (
                                <div className="flex items-center justify-between py-2 border-b border-border-default mb-2">
                                     <span className="text-sm font-bold text-text-muted">{t('actions.more_actions')}:</span>
                                     <div className="flex items-center gap-3">
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><WhatsappIcon className="w-5 h-5 text-green-600"/><span>שלח Whatsapp</span></button>
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><FolderIcon className="w-5 h-5"/><span>הוסף למאגר</span></button>
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><ArchiveBoxIcon className="w-5 h-5"/><span>ארכיון</span></button>
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><ArrowPathIcon className="w-5 h-5"/><span>שנה מקור</span></button>
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><ChatBubbleBottomCenterTextIcon className="w-5 h-5"/><span>שלח SMS</span></button>
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600"><EnvelopeIcon className="w-5 h-5"/><span>שלח מייל</span></button>
                                        {/* NEW DOWNLOAD ACTION */}
                                        <button className="flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-primary-600" onClick={() => alert(`מוריד ${selectedIds.size} מועמדים...`)}>
                                            <DocumentArrowDownIcon className="w-5 h-5"/>
                                            <span>הורד מועמדים</span>
                                        </button>
                                     </div>
                                </div>
                            )}
                             <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold">{t('actions.selected_count', { count: selectedIds.size })}</span>
                                        <button onClick={() => setSelectedIds(new Set())} className="text-sm font-semibold text-primary-600 hover:underline">{t('actions.clear_selection')}</button>
                                    </div>
                                    <div className="w-px h-6 bg-border-default" />
                                    <button onClick={() => setIsMoreActionsOpen(!isMoreActionsOpen)} className="text-sm font-semibold text-primary-600 flex items-center gap-1">
                                        <span>{t('actions.more_actions')}</span>
                                        {isMoreActionsOpen ? <ChevronUpIcon className="w-4 h-4"/> : <ChevronDownIcon className="w-4 h-4"/>}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 font-semibold text-sm">
                                    <span className="text-text-default">{t('actions.bulk_label')}</span>
                                    <button className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('actions.refer')}</button>
                                    <button className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('actions.add_to_filter')}</button>
                                    <button className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('actions.change_status')}</button>
                                    <button className="bg-bg-subtle text-text-default py-2 px-4 rounded-lg hover:bg-bg-hover">{t('actions.add_event')}</button>
                                </div>
                             </div>
                        </div>
                         <div className="md:hidden">
                            <button onClick={() => setIsBulkActionsMobileOpen(true)} className="fixed bottom-6 end-6 bg-primary-600 text-white rounded-full shadow-lg h-16 w-16 flex flex-col items-center justify-center animate-fade-in">
                                <span className="font-bold text-lg">{selectedIds.size}</span>
                                <span className="text-xs">פעולות</span>
                            </button>
                            {isBulkActionsMobileOpen && (
                                <div className="fixed inset-0 bg-black/40" onClick={() => setIsBulkActionsMobileOpen(false)}>
                                    <div className="absolute bottom-0 start-0 end-0 bg-bg-card rounded-t-2xl p-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="font-bold text-lg">{t('actions.selected_count', { count: selectedIds.size })}</h3>
                                            <button onClick={() => setIsBulkActionsMobileOpen(false)}><XMarkIcon className="w-6 h-6"/></button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-center font-semibold">
                                             <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover">{t('actions.refer')}</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover">{t('actions.add_to_filter')}</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover">{t('actions.change_status')}</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover">{t('actions.add_event')}</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><EnvelopeIcon className="w-5 h-5"/>שלח מייל</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><ChatBubbleBottomCenterTextIcon className="w-5 h-5"/>שלח SMS</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><WhatsappIcon className="w-5 h-5"/>שלח Whatsapp</button>
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5"><ArchiveBoxIcon className="w-5 h-5"/>ארכיון</button>
                                            {/* MOBILE DOWNLOAD ACTION */}
                                            <button className="bg-bg-subtle text-text-default py-3 px-2 rounded-lg hover:bg-bg-hover flex items-center justify-center gap-1.5" onClick={() => alert(`מוריד ${selectedIds.size} מועמדים...`)}>
                                                <DocumentArrowDownIcon className="w-5 h-5"/>הורד מועמדים
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>
                    </div>
                </div>
            )}
            
            <JobFieldSelector
                value={null}
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
        </div>
    );
}

export default CandidatesListView;
