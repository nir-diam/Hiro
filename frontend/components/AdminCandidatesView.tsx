
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, AvatarIcon, UserGroupIcon, 
    ArrowDownTrayIcon, TrashIcon, CheckCircleIcon, MegaphoneIcon, 
    GlobeAmericasIcon, BuildingOffice2Icon, RocketLaunchIcon, 
    AdjustmentsHorizontalIcon, EllipsisVerticalIcon,
    UserPlusIcon, XMarkIcon, ChevronDownIcon, EnvelopeIcon, PaperAirplaneIcon,
    BriefcaseIcon, AcademicCapIcon, WalletIcon, PlusIcon, BookmarkIcon, FunnelIcon, MinusIcon,
    ChatBubbleBottomCenterTextIcon, TableCellsIcon, Squares2X2Icon, Cog6ToothIcon, CircleStackIcon,
    ChevronLeftIcon, ChevronRightIcon
} from './Icons';
import LocationSelector, { LocationItem } from './LocationSelector';
import CompanyFilterPopover from './CompanyFilterPopover';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import { useSavedSearches } from '../context/SavedSearchesContext';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';

// --- TYPES ---
type SourceType = 'job_application' | 'portal_signup' | 'campaign' | 'import';
type Operator = 'AND' | 'OR' | 'NOT';

interface ComplexFilterRule {
    id: string;
    operator: Operator;
    field: string;
    value?: string;
    textValue?: string;
}

interface AdminCandidate {
    id: string;
    name: string;
    avatar: string;
    email: string;
    phone: string;
    title: string;
    location: string;
    sourceType: SourceType;
    sourceDetail: string; 
    registrationDate: string;
    status: 'active' | 'passive' | 'blacklisted';
    profileCompleteness: number;
    associatedClient?: string;
    industry?: string;
    companySize?: string;
    salaryExpectation?: number;
    age?: number;
}

interface MessageTemplate {
    id: number;
    name: string;
    type: 'email' | 'sms';
    subject?: string;
    content: string;
}

// --- MOCK DATA ---
const mockTemplates: MessageTemplate[] = [
    { id: 1, name: 'הזמנה לראיון (מייל)', type: 'email', subject: 'זימון לראיון עבודה ב-Hiro', content: 'היי {name},\n\nראינו את קורות החיים שלך והתרשמנו מאוד. נשמח לתאם ראיון היכרות.\n\nבברכה,\nצוות הגיוס' },
    { id: 2, name: 'עדכון סטטוס (SMS)', type: 'sms', content: 'היי {name}, רצינו לעדכן שקורות החיים שלך התקבלו ונמצאים בבדיקה. נחזור אליך בהקדם. צוות Hiro' },
    { id: 3, name: 'דחייה מנומסת (מייל)', type: 'email', subject: 'עדכון לגבי מועמדותך', content: 'שלום {name},\n\nתודה על התעניינותך במשרה. לצערנו החלטנו להתקדם עם מועמדים אחרים.\nנשמור את פרטיך למשרות עתידיות.\n\nבהצלחה!' },
];

const jobScopeOptions = ['משרה מלאה', 'משרה חלקית', 'משמרות', 'פרילנס', 'היברידי'];

const defaultStatsConfig: ViewConfig[] = [
    { id: 'total', name: 'סה״כ במאגר', visible: true },
    { id: 'organic', name: 'נרשמים מהפורטל', visible: true },
    { id: 'fromCampaigns', name: 'לידים מקמפיינים', visible: true },
    { id: 'newToday', name: 'הצטרפו היום', visible: true },
    { id: 'joinedPool', name: 'מצטרפים לפול', visible: true },
];

// --- REUSABLE COMPONENTS ---

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; subtext?: string }> = ({ title, value, icon, color, subtext }) => (
    <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow h-full">
        <div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-wide mb-1">{title}</p>
            <p className="text-2xl font-black text-text-default">{value}</p>
            {subtext && <p className="text-xs text-green-600 font-medium mt-1">{subtext}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

const SourceBadge: React.FC<{ type: SourceType; detail: string }> = ({ type, detail }) => {
    const configs = {
        job_application: { icon: <BuildingOffice2Icon className="w-3 h-3"/>, bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-100', label: 'משרה' },
        portal_signup: { icon: <GlobeAmericasIcon className="w-3 h-3"/>, bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-100', label: 'פורטל' },
        campaign: { icon: <MegaphoneIcon className="w-3 h-3"/>, bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-100', label: 'קמפיין' },
        import: { icon: <ArrowDownTrayIcon className="w-3 h-3"/>, bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-100', label: 'ייבוא' },
    };
    const config = configs[type];
    return (
        <div className="flex flex-col items-start gap-1">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${config.bg} ${config.text} ${config.border}`}>
                {config.icon}
                {config.label}
            </span>
            <span className="text-xs text-text-default truncate max-w-[150px]" title={detail}>{detail}</span>
        </div>
    );
};

const CompletenessBar: React.FC<{ value: number }> = ({ value }) => {
    let color = 'bg-red-500';
    if (value > 50) color = 'bg-yellow-500';
    if (value > 80) color = 'bg-green-500';
    return (
        <div className="w-24">
            <div className="flex justify-between text-[10px] text-text-subtle mb-1">
                <span>איכות דאטה</span>
                <span className="font-bold">{value}%</span>
            </div>
            <div className="w-full h-1.5 bg-bg-subtle rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }}></div>
            </div>
        </div>
    );
};

// Double Range Slider
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
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', colorVar = '--color-primary-500' }) => {
    const minVal = Math.min(valueMin, valueMax);
    const maxVal = Math.max(valueMin, valueMax);
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;
    
    return (
        <div className="w-full pt-2 pb-6 relative group/slider">
            <div className="flex flex-col items-center mb-6">
                 <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">{label}</label>
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
                <input
                    type="range" min={min} max={max} step={step} value={minVal}
                    onChange={(e) => onChange(nameMin, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:appearance-none"
                />
                <input
                    type="range" min={min} max={max} step={step} value={maxVal}
                    onChange={(e) => onChange(nameMax, Number(e.target.value))}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary-600 [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:appearance-none"
                />
            </div>
        </div>
    );
};

// Campaign Modal
const CampaignModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    recipientCount: number; 
    onSubmit: (data: any) => void; 
}> = ({ isOpen, onClose, recipientCount, onSubmit }) => {
    const [channel, setChannel] = useState<'email' | 'sms'>('email');
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');

    useEffect(() => {
        if (isOpen) {
            setChannel('email');
            setSelectedTemplate('');
            setSubject('');
            setContent('');
        }
    }, [isOpen]);

    const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const templateId = Number(e.target.value);
        setSelectedTemplate(e.target.value);
        const template = mockTemplates.find(t => t.id === templateId);
        if (template) {
            setChannel(template.type); 
            setSubject(template.subject || '');
            setContent(template.content);
        } else {
            setSubject('');
            setContent('');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
             <div className="bg-bg-card rounded-2xl p-0 max-w-lg w-full shadow-2xl flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                 <div className="p-5 border-b border-border-default flex justify-between items-center bg-bg-subtle/30">
                     <h3 className="text-xl font-bold text-text-default">שליחת דיוור מרוכז</h3>
                     <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                 </div>
                 
                 <div className="p-6 space-y-5">
                     {/* Channel Selection */}
                     <div>
                         <label className="block text-sm font-bold text-text-muted mb-2">ערוץ שליחה</label>
                         <div className="flex gap-4">
                             <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-2 transition-all ${channel === 'email' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-border-default hover:bg-bg-subtle'}`}>
                                 <input type="radio" name="channel" value="email" checked={channel === 'email'} onChange={() => setChannel('email')} className="hidden" />
                                 <EnvelopeIcon className="w-5 h-5" />
                                 <span>אימייל</span>
                             </label>
                             <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-2 transition-all ${channel === 'sms' ? 'border-green-500 bg-green-50 text-green-700' : 'border-border-default hover:bg-bg-subtle'}`}>
                                 <input type="radio" name="channel" value="sms" checked={channel === 'sms'} onChange={() => setChannel('sms')} className="hidden" />
                                 <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
                                 <span>SMS</span>
                             </label>
                         </div>
                     </div>

                     {/* Template Selection */}
                     <div>
                         <label className="block text-sm font-bold text-text-muted mb-1.5">בחר תבנית (אופציונלי)</label>
                         <select 
                            value={selectedTemplate} 
                            onChange={handleTemplateChange} 
                            className="w-full bg-bg-input border border-border-default rounded-xl p-2.5 text-sm focus:ring-primary-500 focus:border-primary-500"
                        >
                             <option value="">כתוב הודעה חדשה...</option>
                             {mockTemplates.map(t => (
                                 <option key={t.id} value={t.id}>{t.name} ({t.type === 'email' ? 'מייל' : 'SMS'})</option>
                             ))}
                         </select>
                     </div>

                     {/* Subject (Email Only) */}
                     {channel === 'email' && (
                         <div className="animate-fade-in">
                             <label className="block text-sm font-bold text-text-muted mb-1.5">נושא ההודעה</label>
                             <input 
                                type="text" 
                                value={subject} 
                                onChange={e => setSubject(e.target.value)} 
                                className="w-full bg-bg-input border border-border-default rounded-xl p-2.5 text-sm focus:ring-primary-500"
                                placeholder="לדוגמה: הזדמנות למשרה חדשה ב-Hiro"
                            />
                         </div>
                     )}

                     {/* Body */}
                     <div>
                         <label className="block text-sm font-bold text-text-muted mb-1.5">תוכן ההודעה</label>
                         <textarea 
                            value={content} 
                            onChange={e => setContent(e.target.value)} 
                            rows={5} 
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-primary-500 resize-none"
                            placeholder={channel === 'email' ? "כתוב את תוכן המייל כאן..." : "כתוב הודעת SMS קצרה..."}
                        ></textarea>
                        <div className="text-xs text-text-subtle mt-1 text-left">{content.length} תווים</div>
                     </div>
                 </div>

                 <div className="p-5 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3">
                     <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">ביטול</button>
                     <button 
                        onClick={() => onSubmit({ channel, subject, content })} 
                        className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 shadow-lg shadow-primary-500/20 flex items-center gap-2"
                        disabled={!content || (channel === 'email' && !subject)}
                    >
                        <PaperAirplaneIcon className="w-4 h-4 transform rotate-180" />
                        <span>שלח ל-{recipientCount} מועמדים</span>
                     </button>
                 </div>
             </div>
        </div>
    )
}

// Save Search Modal
const SaveSearchModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string) => void;
}> = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
             <div className="bg-bg-card rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border-default" onClick={e => e.stopPropagation()}>
                 <h3 className="text-lg font-bold text-text-default mb-4">שמירת חיפוש</h3>
                 <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="תן שם לרשימה (למשל: מפתחי ריאקט תל אביב)"
                    className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-primary-500 mb-4"
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-text-muted hover:bg-bg-hover">ביטול</button>
                    <button onClick={() => onSave(name)} disabled={!name.trim()} className="px-5 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50">שמור רשימה</button>
                </div>
             </div>
        </div>
    );
};

// --- MAIN VIEW ---

const AdminCandidatesView: React.FC = () => {
    const navigate = useNavigate();
    const { addSearch } = useSavedSearches();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
    const [searchResults, setSearchResults] = useState<AdminCandidate[]>([]);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [totalCandidates, setTotalCandidates] = useState(0);
    const pageSizeOptions = useMemo(() => [10, 50, 100, 200, 500], []);
    const totalPages = Math.max(1, Math.ceil((totalCandidates || 0) / pageSize));
    const [isLoading, setIsLoading] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // View Config
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    
    // Sorting Config
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // Columns Configuration
    const allColumns = [
        { id: 'select', header: '', static: true }, // Checkbox
        { id: 'name', header: 'מועמד' },
        { id: 'source', header: 'מקור הגעה / Attribution' },
        { id: 'contact', header: 'פרטי קשר' },
        { id: 'location', header: 'מיקום' },
        { id: 'status', header: 'סטטוס במערכת' },
        { id: 'completeness', header: 'איכות פרופיל' },
        { id: 'updated', header: 'תאריך הרשמה' },
        { id: 'actions', header: '', static: true }
    ];

    const defaultVisibleColumns = ['select', 'name', 'source', 'contact', 'location', 'status', 'completeness', 'updated', 'actions'];
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

    // Filters State
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(false);
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
    const [isSaveSearchModalOpen, setIsSaveSearchModalOpen] = useState(false);

    const [searchParams, setSearchParams] = useState({
        mainFieldTags: [] as string[],
        locations: [] as LocationItem[],
        jobScopes: [] as string[],
        status: 'all',
        sourceType: 'all' as SourceType | 'all',
        interestRole: '',
        ageMin: 18,
        ageMax: 65,
        salaryMin: 5000,
        salaryMax: 30000,
        hasDegree: false,
        lastUpdated: null as DateRange | null,
    });
    const [searchParamsFromUrl] = useSearchParams();
    const [tagFilterCandidateIds, setTagFilterCandidateIds] = useState<Set<string> | null>(null);
    
    // Complex Query Builder State
    const [complexRules, setComplexRules] = useState<ComplexFilterRule[]>([]);

    const [mainFieldInput, setMainFieldInput] = useState('');
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industry: string;
        field: string;
    }>({ sizes: [], sectors: [], industry: '', field: '' });
    
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);

    const mapCandidate = useCallback((c: any): AdminCandidate => ({
        id: (c.id || c.userId || Math.random().toString()).toString(),
        name: c.fullName || c.name || 'ללא שם',
        avatar: (c.fullName || c.name || '??').slice(0, 2),
        email: c.email || '',
        phone: c.phone || '',
        title: c.title || c.professionalSummary || '',
        location: c.address || c.location || '',
        sourceType: (c.sourceType || 'job_application') as SourceType,
        sourceDetail: c.sourceDetail || c.source || '',
        registrationDate: c.createdAt || '',
        status: (c.status as any) || 'active',
        profileCompleteness: Number(c.profileCompleteness || c.matchScore || 0),
        associatedClient: c.associatedClient || '',
        industry: c.industry || '',
        companySize: c.companySize || '',
        salaryExpectation: Number(c.salaryExpectation || c.salaryMin || 0),
        age: c.age ? Number(c.age) : undefined,
    }), []);

    const stats = useMemo(() => ({
        total: totalCandidates,
        newToday: 0,
        fromCampaigns: candidates.filter(c => c.sourceType === 'campaign').length,
        organic: candidates.filter(c => c.sourceType === 'portal_signup').length,
        joinedPool: 0
    }), [candidates, totalCandidates]);
    
    // Stats View Config (New)
    const [statsConfig, setStatsConfig] = useState<ViewConfig[]>(defaultStatsConfig);
    const [isStatsCustomizeOpen, setIsStatsCustomizeOpen] = useState(false);
    const statsPopoverRef = useRef<HTMLDivElement>(null);
    const statsCustomizeBtnRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const tagParam = searchParamsFromUrl.get('tag');
        if (!apiBase || !tagParam) {
            setTagFilterCandidateIds(null);
            return;
        }
        (async () => {
            try {
                const res = await fetch(`${apiBase}/api/admin/candidate-tags/tag/${tagParam}`);
                if (!res.ok) throw new Error('Failed to load tag usage');
                const data = await res.json();
                const ids = Array.isArray(data)
                    ? data.map(entry => entry.candidate_id || entry.candidateId || entry.candidateId || null).filter(Boolean).map(String)
                    : [];
                setTagFilterCandidateIds(new Set(ids));
            } catch (err) {
                console.error('Failed to apply tag filter', err);
                setTagFilterCandidateIds(null);
            }
        })();
    }, [apiBase, searchParamsFromUrl]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
          // Stats Popover
          if (statsPopoverRef.current && !statsPopoverRef.current.contains(event.target as Node) && statsCustomizeBtnRef.current && !statsCustomizeBtnRef.current.contains(event.target as Node)) {
             setIsStatsCustomizeOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadCandidates = useCallback(async () => {
        if (!apiBase) return;
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(pageSize),
            });
            const trimmed = searchTerm.trim();
            if (trimmed.length >= 3) {
                params.set('search', trimmed);
            }
            const res = await fetch(`${apiBase}/api/candidates?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load candidates');
            const payload = await res.json();
            const list = Array.isArray(payload.data)
                ? payload.data
                : Array.isArray(payload.rows)
                    ? payload.rows
                    : [];
            setCandidates(list.map(mapCandidate));
            setTotalCandidates(Number(payload.total) || list.length);
        } catch (err: any) {
            setError(err.message || 'Load failed');
            setCandidates([]);
            setTotalCandidates(0);
        } finally {
            setIsLoading(false);
        }
    }, [apiBase, mapCandidate, page, pageSize, searchTerm]);

    useEffect(() => {
        loadCandidates();
    }, [loadCandidates]);

    useEffect(() => {
        const refreshInterval = setInterval(() => {
            loadCandidates();
        }, 10000);
        return () => clearInterval(refreshInterval);
    }, [loadCandidates]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm]);

    // Clear search when entering view
    useEffect(() => {
        setSearchTerm('');
        setSearchResults([]);
        setSelectedIds(new Set());
    }, []);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    const buildFilters = useCallback(() => {
        return {
            sourceType: searchParams.sourceType !== 'all' ? searchParams.sourceType : undefined,
            status: searchParams.status !== 'all' ? searchParams.status : undefined,
            locations: searchParams.locations.map((l) => l.value),
            tags: searchParams.mainFieldTags,
            jobScopes: searchParams.jobScopes,
            interestRole: searchParams.interestRole,
            ageMin: searchParams.ageMin,
            ageMax: searchParams.ageMax,
            salaryMin: searchParams.salaryMin,
            salaryMax: searchParams.salaryMax,
            hasDegree: searchParams.hasDegree,
        };
    }, [searchParams]);

    const runSearch = useCallback(async (term: string) => {
        const q = term.trim();
        if (!apiBase) return;
        if (q.length < 3) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates/search/free`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, limit: pageSize }),
            });
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            setSearchResults(Array.isArray(data) ? data.map(mapCandidate) : []);
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setIsSearching(false);
        }
    }, [apiBase, mapCandidate, pageSize]);

    const runAdvancedSearch = useCallback(async (term: string) => {
        const q = term.trim();
        if (!apiBase) return;
        if (q.length < 3) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        setError(null);
        try {
            const filters = buildFilters();
            const res = await fetch(`${apiBase}/api/candidates/search/semantic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q, filters, limit: pageSize }),
            });
            if (!res.ok) throw new Error('Search failed');
            const data = await res.json();
            const list = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : [];
            setSearchResults(list.map(mapCandidate));
        } catch (err: any) {
            setError(err.message || 'Search failed');
        } finally {
            setIsSearching(false);
        }
    }, [apiBase, buildFilters, mapCandidate, pageSize]);

    useEffect(() => {
        const handle = setTimeout(() => {
            if (searchTerm.trim().length >= 3) {
                void runAdvancedSearch(searchTerm);
            } else {
                setSearchResults([]);
            }
        }, 400);
        return () => clearTimeout(handle);
    }, [searchTerm, runAdvancedSearch]);

    // Filter Logic
    const filteredCandidates = useMemo(() => {
        const useRemote = searchResults.length > 0 && searchTerm.trim().length >= 3;
        const base = useRemote ? searchResults : candidates;
        let filtered = base.filter(c => {
            const matchesSearch = useRemote || !searchTerm ||
                                  c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  (c.phone || '').includes(searchTerm);
            if (tagFilterCandidateIds && tagFilterCandidateIds.size) {
                const backendId = c.backendId || c.id;
                if (!backendId || !tagFilterCandidateIds.has(backendId)) return false;
            }
            
            const matchesSource = searchParams.sourceType === 'all' || c.sourceType === searchParams.sourceType;
            const matchesLocation = searchParams.locations.length === 0 || 
                searchParams.locations.some(loc => 
                    (loc.type === 'city' && c.location === loc.value) || 
                    (loc.type === 'region')
                );

            const matchesCompanyFilters = () => {
                const { industry, sizes } = companyFilters;
                const industryMatch = !industry || c.industry === industry;
                const sizeMatch = sizes.length === 0 || (c.companySize && sizes.includes(c.companySize));
                return industryMatch && sizeMatch;
            };

            return matchesSearch && matchesSource && matchesLocation && matchesCompanyFilters();
        });

        // Sorting
        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof AdminCandidate];
                let bValue: any = b[sortConfig.key as keyof AdminCandidate];

                // Handle complex fields/derived values mapping if necessary
                if (sortConfig.key === 'updated') {
                    aValue = new Date(a.registrationDate).getTime();
                    bValue = new Date(b.registrationDate).getTime();
                } else if (sortConfig.key === 'completeness') {
                     aValue = a.profileCompleteness;
                     bValue = b.profileCompleteness;
                }
                
                if (aValue === undefined || aValue === null) aValue = '';
                if (bValue === undefined || bValue === null) bValue = '';

                if (aValue < bValue) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        
        return filtered;
    }, [searchTerm, searchParams, companyFilters, sortConfig, candidates, searchResults]);

    // Handlers
    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedIds(new Set(filteredCandidates.map(c => c.id)));
        else setSelectedIds(new Set());
    };

    const handleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleMainFieldKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && mainFieldInput.trim()) {
            e.preventDefault();
            setSearchParams(prev => ({
                ...prev,
                mainFieldTags: [...prev.mainFieldTags, mainFieldInput.trim()],
            }));
            setMainFieldInput('');
        }
    };

    const handleRemoveMainFieldTag = (tagToRemove: string) => {
        setSearchParams(prev => ({
            ...prev,
            mainFieldTags: prev.mainFieldTags.filter(tag => tag !== tagToRemove),
        }));
    };

    const handleJobScopeToggle = (scope: string) => {
        setSearchParams(prev => {
            const newScopes = prev.jobScopes.includes(scope)
                ? prev.jobScopes.filter(s => s !== scope)
                : [...prev.jobScopes, scope];
            return { ...prev, jobScopes: newScopes };
        });
    };
    
    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        if (selectedField) {
            setSearchParams(prev => ({ ...prev, interestRole: selectedField.role }));
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleSliderChange = (name: string, value: number) => {
        setSearchParams(prev => ({ ...prev, [name]: value }));
    };

    const handleResetFilters = () => {
        setSearchParams({
            mainFieldTags: [],
            locations: [],
            jobScopes: [],
            status: 'all',
            sourceType: 'all',
            interestRole: '',
            ageMin: 18,
            ageMax: 65,
            salaryMin: 5000,
            salaryMax: 30000,
            hasDegree: false,
            lastUpdated: null,
        });
        setMainFieldInput('');
        setComplexRules([]);
        setCompanyFilters({ sizes: [], sectors: [], industry: '', field: '' });
    };
    
    // --- Complex Rules Logic ---
    const handleAddRule = (operator: Operator) => {
        const newRule: ComplexFilterRule = {
            id: Date.now().toString(),
            operator,
            field: 'general',
            value: ''
        };
        setComplexRules(prev => [...prev, newRule]);
    };

    const handleRemoveRule = (id: string) => {
        setComplexRules(prev => prev.filter(r => r.id !== id));
    };
    
    const handleRuleChange = (id: string, field: keyof ComplexFilterRule, value: string) => {
        setComplexRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    };


    const handleSendCampaign = (data: any) => {
        setIsCampaignModalOpen(false);
        console.log("Sending campaign:", data, "To IDs:", Array.from(selectedIds));
        alert('הקמפיין נשלח בהצלחה!');
    };

    const handleSaveSearch = (name: string) => {
        if (!name) return;
        const currentFilters = {
            searchTerm,
            params: searchParams,
            company: companyFilters,
            complex: complexRules
        };
        addSearch(name, false, currentFilters, [], []);
        setIsSaveSearchModalOpen(false);
        alert(`החיפוש "${name}" נשמר בהצלחה!`);
    };

    // Sorting Helper
    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle text-xs ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    // Column Management
    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                // Insert maintaining order
                const newCols = [...prev, columnId];
                 newCols.sort((a, b) => {
                    const indexA = allColumns.findIndex(c => c.id === a);
                    const indexB = allColumns.findIndex(c => c.id === b);
                    return indexA - indexB;
                });
                return newCols;
            }
        });
    };

    const handleDragStart = (index: number, colId: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };

    const handleDragEnter = (index: number) => {
         if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };

    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    // Stats View Logic
    const handleSaveStatsConfig = (newConfig: ViewConfig[]) => {
        setStatsConfig(newConfig);
        setIsStatsCustomizeOpen(false);
    };

    const handleResetStatsConfig = () => {
        setStatsConfig(defaultStatsConfig);
        setIsStatsCustomizeOpen(false);
    }
    
    const statsDataMapping: Record<string, any> = {
        total: { title: 'סה״כ במאגר', value: stats.total.toLocaleString(), icon: <UserGroupIcon className="w-6 h-6 text-primary-600"/>, color: 'bg-primary-100', subtext: '+12 השבוע' },
        organic: { title: 'נרשמים מהפורטל', value: stats.organic.toLocaleString(), icon: <GlobeAmericasIcon className="w-6 h-6 text-green-600"/>, color: 'bg-green-100' },
        fromCampaigns: { title: 'לידים מקמפיינים', value: stats.fromCampaigns.toLocaleString(), icon: <MegaphoneIcon className="w-6 h-6 text-purple-600"/>, color: 'bg-purple-100', subtext: '3 קמפיינים פעילים' },
        newToday: { title: 'הצטרפו היום', value: stats.newToday, icon: <UserPlusIcon className="w-6 h-6 text-orange-600"/>, color: 'bg-orange-100' },
        joinedPool: { title: 'מצטרפים לפול', value: stats.joinedPool, icon: <CircleStackIcon className="w-6 h-6 text-indigo-600"/>, color: 'bg-indigo-100' }
    };


    const renderCell = (candidate: AdminCandidate, colId: string) => {
        switch(colId) {
            case 'select':
                return (
                     <input 
                        type="checkbox" 
                        checked={selectedIds.has(candidate.id)}
                        onChange={() => handleSelect(candidate.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer" 
                    />
                );
            case 'name':
                return (
                     <div className="flex items-center gap-3">
                        <AvatarIcon initials={candidate.avatar} size={40} fontSize={16} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                        <div>
                            <p className="font-bold text-text-default text-base">{candidate.name}</p>
                            <p className="text-xs text-text-muted">{candidate.title}</p>
                        </div>
                    </div>
                );
            case 'source':
                return <SourceBadge type={candidate.sourceType} detail={candidate.sourceDetail} />;
            case 'contact':
                return (
                     <div className="text-xs">
                        <div className="text-text-default font-medium">{candidate.email}</div>
                        <div className="text-text-muted mt-0.5">{candidate.phone}</div>
                    </div>
                );
            case 'location': return <span className="text-text-muted">{candidate.location}</span>;
            case 'status':
                return (
                    <>
                        {candidate.status === 'active' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200"><CheckCircleIcon className="w-3 h-3"/> פעיל</span>}
                        {candidate.status === 'passive' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">לא מחפש</span>}
                        {candidate.status === 'blacklisted' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">חסום</span>}
                    </>
                );
            case 'completeness': return <CompletenessBar value={candidate.profileCompleteness} />;
            case 'updated': return <span className="text-text-muted text-xs font-mono">{new Date(candidate.registrationDate).toLocaleDateString('he-IL')}</span>;
            case 'actions':
                return (
                    <button className="p-2 rounded-full hover:bg-bg-subtle text-text-subtle opacity-0 group-hover:opacity-100 transition-opacity">
                        <EllipsisVerticalIcon className="w-5 h-5"/>
                    </button>
                );
            default: return null;
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header & Stats */}
            <div className="flex flex-col gap-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">ניהול מועמדים (Global Pool)</h1>
                        <p className="text-sm text-text-muted">מבט על כלל המועמדים במערכת מכל מקורות ההגעה</p>
                    </div>
                    <button onClick={() => setIsCampaignModalOpen(true)} className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-purple-700 transition shadow-md flex items-center gap-2">
                        <RocketLaunchIcon className="w-5 h-5"/>
                        <span>קמפיין חדש</span>
                    </button>
                </div>
                
                {/* Dynamic Stats Grid */}
                <div className="relative">
                    <div className="flex justify-between items-center mb-2">
                         <h2 className="text-sm font-bold text-text-muted uppercase tracking-wide">מדדים מרכזיים</h2>
                         <div className="relative">
                             <button 
                                ref={statsCustomizeBtnRef}
                                onClick={() => setIsStatsCustomizeOpen(!isStatsCustomizeOpen)}
                                className="p-1.5 hover:bg-bg-subtle rounded-full text-text-muted transition-colors"
                            >
                                <Cog6ToothIcon className="w-4 h-4"/>
                            </button>
                             {isStatsCustomizeOpen && (
                                <div ref={statsPopoverRef} className="z-20">
                                    <CustomizeViewsPopover
                                        isOpen={true}
                                        onClose={() => setIsStatsCustomizeOpen(false)}
                                        views={statsConfig}
                                        onSave={handleSaveStatsConfig}
                                        onReset={handleResetStatsConfig}
                                    />
                                </div>
                            )}
                         </div>
                    </div>
                    
                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${statsConfig.filter(s=>s.visible).length > 5 ? '5' : statsConfig.filter(s=>s.visible).length} gap-4`}>
                        {statsConfig.filter(c => c.visible).map(config => {
                            const data = statsDataMapping[config.id];
                            if(!data) return null;
                             return (
                                <StatCard 
                                    key={config.id}
                                    title={data.title} 
                                    value={data.value} 
                                    icon={data.icon} 
                                    color={data.color} 
                                    subtext={data.subtext} 
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* --- Advanced Toolbar --- */}
            <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm relative z-20">
                <div className="flex flex-col xl:flex-row gap-3 items-center">
                     <div className="relative flex-grow w-full xl:w-auto">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="חיפוש לפי שם, מייל, טלפון..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all" 
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 w-full xl:w-auto">
                        <button 
                            onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)}
                            className={`flex items-center justify-center gap-2 font-semibold py-2.5 px-4 rounded-xl border transition-all whitespace-nowrap ${isAdvancedSearchOpen ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                        >
                            <AdjustmentsHorizontalIcon className="w-5 h-5" />
                            <span>סינון מתקדם</span>
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                        </button>

                         <div className="relative">
                            <button
                                ref={companyFilterButtonRef}
                                onClick={() => setIsCompanyFilterOpen(prev => !prev)}
                                className={`flex items-center gap-2 font-semibold py-2.5 px-4 rounded-xl border transition-all whitespace-nowrap ${
                                    isCompanyFilterOpen || companyFilters.industry
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-white text-text-default border-border-default hover:border-primary-300'
                                }`}
                            >
                                <BuildingOffice2Icon className="w-5 h-5" />
                                <span>רקע תעסוקתי</span>
                            </button>
                            {isCompanyFilterOpen && (
                                <CompanyFilterPopover
                                    onClose={() => setIsCompanyFilterOpen(false)}
                                    filters={companyFilters}
                                    setFilters={setCompanyFilters}
                                />
                            )}
                        </div>
                        
                        <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default">
                             <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                             <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                    <label className="text-[11px] text-text-muted font-semibold uppercase tracking-wide">גודל עמוד</label>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            const nextSize = Number(e.target.value) || 100;
                            setPageSize(nextSize);
                            setPage(1);
                        }}
                        className="text-sm bg-bg-input border border-border-default rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition shadow-sm"
                    >
                        {pageSizeOptions.map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            className="p-1 rounded-full border border-border-default bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                        <span>
                            עמוד {page} מתוך {totalPages}
                        </span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            className="p-1 rounded-full border border-border-default bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                
                 {/* --- EXPANDED ADVANCED FILTERS PANEL --- */}
                 {isAdvancedSearchOpen && (
                    <div className="mt-4 pt-4 border-t border-border-subtle animate-fade-in space-y-4">
                         {/* ... (Existing Filter Panel Code) ... */}
                         {/* Including: Tags, Source, Status, Location, Scope, Role, Date, Education, Sliders, Complex Rules */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            
                            {/* Row 1 */}
                            <div className="lg:col-span-2">
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">תגיות וכישורים</label>
                                <div className="w-full bg-bg-input border border-border-default rounded-xl p-1.5 flex items-center flex-wrap gap-2 min-h-[42px] focus-within:ring-2 focus-within:ring-primary-500 transition-shadow">
                                    {searchParams.mainFieldTags.map((tag, index) => (
                                        <span key={index} className="flex items-center bg-primary-100 text-primary-800 text-xs font-medium pl-2 pr-1.5 py-0.5 rounded-full">
                                            {tag}
                                            <button onClick={() => handleRemoveMainFieldTag(tag)} className="me-1 text-primary-500 hover:text-primary-700">
                                                <XMarkIcon className="h-3 w-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <input 
                                        type="text" 
                                        value={mainFieldInput} 
                                        onChange={(e) => setMainFieldInput(e.target.value)} 
                                        onKeyDown={handleMainFieldKeyDown} 
                                        placeholder="הקלד תגית..." 
                                        className="flex-grow bg-transparent outline-none text-sm min-w-[80px]" 
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">מקור הגעה</label>
                                <select 
                                    value={searchParams.sourceType} 
                                    onChange={(e) => setSearchParams(prev => ({ ...prev, sourceType: e.target.value as any }))}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-primary-500"
                                >
                                    <option value="all">כל המקורות</option>
                                    <option value="job_application">הגשות למשרה</option>
                                    <option value="portal_signup">הרשמה בפורטל</option>
                                    <option value="campaign">קמפיינים</option>
                                    <option value="import">ייבוא חיצוני</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">סטטוס</label>
                                <select 
                                    value={searchParams.status} 
                                    onChange={(e) => setSearchParams(prev => ({ ...prev, status: e.target.value }))}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm focus:ring-primary-500"
                                >
                                    <option value="all">הכל</option>
                                    <option value="active">פעיל</option>
                                    <option value="passive">לא מחפש</option>
                                    <option value="blacklisted">חסום</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">מיקום</label>
                                <LocationSelector 
                                    selectedLocations={searchParams.locations}
                                    onChange={(newLocations) => setSearchParams(prev => ({ ...prev, locations: newLocations }))}
                                    className="w-full"
                                    placeholder="בחר עיר או אזור..."
                                />
                            </div>

                            {/* Row 2 */}
                             <div className="lg:col-span-2">
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">היקף משרה</label>
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
                                 <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">תחום / תפקיד</label>
                                 <button 
                                    onClick={() => setIsJobFieldSelectorOpen(true)}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 px-3 text-sm flex justify-between items-center text-start hover:border-primary-300 transition-colors"
                                >
                                    <span className="truncate">{searchParams.interestRole || 'בחר תפקיד...'}</span>
                                    <BriefcaseIcon className="w-4 h-4 text-text-subtle" />
                                </button>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">עודכן לאחרונה</label>
                                <DateRangeSelector 
                                    value={searchParams.lastUpdated} 
                                    onChange={(val) => setSearchParams(prev => ({...prev, lastUpdated: val}))} 
                                    placeholder="כל הזמנים"
                                />
                            </div>
                            
                             <div>
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">השכלה</label>
                                <button 
                                    onClick={() => setSearchParams(p => ({ ...p, hasDegree: !p.hasDegree }))} 
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all ${searchParams.hasDegree ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-sm' : 'bg-bg-input border-border-default text-text-muted hover:border-primary-300'}`}
                                >
                                    <span className="font-semibold text-xs">בעל תואר אקדמי</span>
                                    {searchParams.hasDegree ? <CheckCircleIcon className="w-4 h-4" /> : <AcademicCapIcon className="w-4 h-4 opacity-50"/>}
                                </button>
                            </div>

                            {/* Row 3 - Sliders */}
                            <div className="col-span-full md:col-span-2 lg:col-span-2 grid grid-cols-2 gap-4 p-3 bg-bg-subtle/30 rounded-xl border border-border-default/50">
                                <DoubleRangeSlider
                                    label="ציפיות שכר" min={5000} max={50000} step={500}
                                    valueMin={searchParams.salaryMin} valueMax={searchParams.salaryMax}
                                    onChange={handleSliderChange} nameMin="salaryMin" nameMax="salaryMax" unit="₪"
                                    colorVar="--color-secondary-500"
                                />
                                <DoubleRangeSlider
                                    label="גיל" min={18} max={70} step={1}
                                    valueMin={searchParams.ageMin} valueMax={searchParams.ageMax}
                                    onChange={handleSliderChange} nameMin="ageMin" nameMax="ageMax"
                                />
                            </div>

                        </div>
                        
                        {/* COMPLEX QUERY BUILDER */}
                        <div className="bg-bg-subtle/40 rounded-xl p-3 border border-border-default/50 mt-2">
                             <div className="flex items-center gap-2 mb-2">
                                 <FunnelIcon className="w-4 h-4 text-primary-500" />
                                 <h4 className="text-xs font-bold text-primary-700 uppercase tracking-wide">שאילתות מורכבות (שכבת סינון נוספת)</h4>
                             </div>
                             
                             {complexRules.length > 0 && (
                                <div className="space-y-2 mb-3">
                                    {complexRules.map((rule, idx) => (
                                        <div key={rule.id} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-border-default shadow-sm animate-fade-in text-sm">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${rule.operator === 'AND' ? 'bg-blue-100 text-blue-700' : rule.operator === 'OR' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                                {rule.operator === 'AND' ? 'וגם' : rule.operator === 'OR' ? 'או' : 'ללא'}
                                            </span>
                                            <input 
                                                type="text" 
                                                placeholder="שדה..." 
                                                value={rule.field || ''}
                                                onChange={(e) => setComplexRules(prev => prev.map(r => r.id === rule.id ? { ...r, field: e.target.value } : r))}
                                                className="bg-bg-subtle/50 px-2 py-1 rounded border border-border-default text-xs w-24 outline-none focus:border-primary-300"
                                            />
                                            <span className="text-text-muted">=</span>
                                            <input 
                                                type="text" 
                                                placeholder="ערך..." 
                                                value={rule.value || ''}
                                                onChange={(e) => setComplexRules(prev => prev.map(r => r.id === rule.id ? { ...r, value: e.target.value } : r))}
                                                className="bg-bg-subtle/50 px-2 py-1 rounded border border-border-default text-xs flex-grow outline-none focus:border-primary-300"
                                            />
                                            
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
                        
                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-border-default">
                             <div className="flex items-center gap-2">
                                <button onClick={handleResetFilters} className="text-xs font-semibold text-text-muted hover:text-red-500 transition-colors">
                                    נקה הכל
                                </button>
                                <button onClick={() => setIsSaveSearchModalOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-800 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition">
                                    <BookmarkIcon className="w-3.5 h-3.5"/>
                                    <span>שמור כרשימה אישית</span>
                                </button>
                            </div>
                            <button onClick={() => setIsAdvancedSearchOpen(false)} className="bg-primary-600 text-white font-bold py-2 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm">
                                הצג תוצאות
                            </button>
                        </div>
                    </div>
                )}

                {/* Bulk Actions Bar */}
                {selectedIds.size > 0 && (
                    <div className="mt-4 flex items-center gap-3 bg-primary-50 px-3 py-2 rounded-lg border border-primary-100 animate-fade-in">
                        <span className="text-sm font-bold text-primary-800">{selectedIds.size} נבחרו</span>
                        <div className="h-4 w-px bg-primary-200"></div>
                        <button className="text-text-subtle hover:text-red-500 p-1 rounded hover:bg-white transition"><TrashIcon className="w-4 h-4"/></button>
                        <button className="text-text-subtle hover:text-primary-600 p-1 rounded hover:bg-white transition"><ArrowDownTrayIcon className="w-4 h-4"/></button>
                        <button 
                            onClick={() => setIsCampaignModalOpen(true)}
                            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-md font-bold hover:bg-purple-700 transition flex items-center gap-1.5 ml-auto"
                        >
                            <PaperAirplaneIcon className="w-3.5 h-3.5 transform rotate-180" />
                            שלח דיוור לנבחרים
                        </button>
                    </div>
                )}
            </div>

            {/* Rich Table / Grid */}
            <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm">
                
                {/* View Switcher Header (Visible in table/grid) */}
                <div className="p-3 border-b border-border-default bg-bg-subtle/30 flex justify-between items-center">
                    <span className="text-sm font-semibold text-text-muted">מציג {filteredCandidates.length} מועמדים</span>
                    <div className="flex items-center gap-2">
                        {viewMode === 'table' && (
                             <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 hover:bg-bg-hover rounded-full text-text-muted"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-3 animate-fade-in">
                                        <p className="font-bold text-xs mb-2">הצג עמודות</p>
                                        <div className="space-y-1">
                                            {allColumns.filter(c => !c.static).map(col => (
                                                <label key={col.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-bg-hover rounded">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={visibleColumns.includes(col.id)} 
                                                        onChange={() => handleColumnToggle(col.id)} 
                                                        className="rounded text-primary-600 focus:ring-primary-500"
                                                    />
                                                    {col.header}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="w-px h-5 bg-border-default mx-1"></div>
                        <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {viewMode === 'table' ? (
                <table className="w-full text-sm text-right min-w-[1000px]">
                            <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default sticky top-0 z-10">
                                <tr>
                                    {visibleColumns.map((colId, index) => {
                                        const col = allColumns.find(c => c.id === colId);
                                        if(!col) return null;
                                        return (
                                            <th 
                                                key={col.id} 
                                                className={`p-4 bg-bg-subtle ${!col.static ? 'cursor-move hover:bg-bg-hover' : ''} ${draggingColumn === col.id ? 'opacity-50' : ''}`}
                                                draggable={!col.static}
                                                onClick={!col.static ? () => requestSort(col.id) : undefined}
                                                onDragStart={() => !col.static && handleDragStart(index, col.id)}
                                                onDragEnter={() => !col.static && handleDragEnter(index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={e => e.preventDefault()}
                                            >
                                                {col.id === 'select' ? (
                                                     <input 
                                                        type="checkbox" 
                                                        onChange={handleSelectAll} 
                                                        checked={filteredCandidates.length > 0 && selectedIds.size === filteredCandidates.length}
                                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 cursor-pointer" 
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-1 cursor-pointer">
                                                        {col.header}
                                                        {getSortIndicator(col.id)}
                                                    </div>
                                                )}
                                            </th>
                                        )
                                    })}
                        </tr>
                    </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {filteredCandidates.map(candidate => (
                                    <tr 
                                        key={candidate.id} 
                                        onClick={() => navigate(`/admin/candidates/${candidate.id}`)}
                                        className={`group hover:bg-bg-hover transition-colors cursor-pointer ${selectedIds.has(candidate.id) ? 'bg-primary-50/40' : ''}`}
                                    >
                                        {visibleColumns.map(colId => (
                                            <td key={colId} className="p-4" onClick={colId === 'select' || colId === 'actions' ? e => e.stopPropagation() : undefined}>
                                                {renderCell(candidate, colId)}
                            </td>
                                        ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6 bg-bg-subtle/20">
                            {filteredCandidates.map(candidate => (
                                <div key={candidate.id} className={`bg-bg-card rounded-2xl border p-5 shadow-sm hover:shadow-lg transition-all relative group flex flex-col items-center text-center ${selectedIds.has(candidate.id) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-border-default'}`}>
                                    <div className="absolute top-4 right-4 z-10" onClick={e => e.stopPropagation()}>
                                        <input type="checkbox" checked={selectedIds.has(candidate.id)} onChange={() => handleSelect(candidate.id)} className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500 cursor-pointer" />
                                    </div>
                                    
                                    <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center text-2xl font-bold text-primary-700 border-4 border-white shadow-sm mb-4">
                                        {candidate.avatar}
                                    </div>
                                    
                                    <h3 className="text-lg font-bold text-text-default mb-1">{candidate.name}</h3>
                                    <p className="text-sm text-text-muted mb-4">{candidate.title}</p>
                                    
                                    <div className="w-full mb-4">
                                         <CompletenessBar value={candidate.profileCompleteness} />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-2 w-full text-xs text-text-muted bg-bg-subtle/50 p-3 rounded-xl border border-border-default mb-4">
                                        <div className="text-center border-l border-border-default">
                                            <span className="block font-bold text-text-default">{candidate.location}</span>
                                            <span>מיקום</span>
                                        </div>
                                         <div className="text-center">
                                            <span className="block font-bold text-text-default">{candidate.status}</span>
                                            <span>סטטוס</span>
                                        </div>
                                    </div>
                                    
                                    <div className="w-full mt-auto flex gap-2">
                                        <button onClick={() => navigate(`/admin/candidates/${candidate.id}`)} className="flex-1 bg-primary-600 text-white font-bold py-2 rounded-lg hover:bg-primary-700 transition text-sm">פרופיל</button>
                                        <button className="p-2 border border-border-default rounded-lg hover:bg-bg-hover text-text-muted"><EllipsisVerticalIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {filteredCandidates.length === 0 && (
                    <div className="p-12 text-center text-text-muted flex flex-col items-center">
                        <MagnifyingGlassIcon className="w-12 h-12 opacity-20 mb-3"/>
                        <p className="font-semibold">לא נמצאו מועמדים התואמים את הסינון</p>
                    </div>
                )}
            </div>

            <CampaignModal 
                isOpen={isCampaignModalOpen}
                onClose={() => setIsCampaignModalOpen(false)}
                recipientCount={selectedIds.size > 0 ? selectedIds.size : filteredCandidates.length}
                onSubmit={handleSendCampaign}
            />
            
            <SaveSearchModal 
                isOpen={isSaveSearchModalOpen}
                onClose={() => setIsSaveSearchModalOpen(false)}
                onSave={handleSaveSearch}
            />

            <JobFieldSelector
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
        </div>
    );
};

export default AdminCandidatesView;
