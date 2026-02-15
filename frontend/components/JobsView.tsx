
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
    PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon, PencilIcon, TrashIcon, Cog6ToothIcon, BriefcaseIcon, 
    UserGroupIcon, CalendarDaysIcon, XMarkIcon,
    ChevronDownIcon, TableCellsIcon, Squares2X2Icon, ArrowPathIcon, StarIcon, SparklesIcon,
    FireIcon, ExclamationTriangleIcon, FlagIcon, CheckIcon, WalletIcon, MapPinIcon, UserIcon, AdjustmentsHorizontalIcon,
    CheckCircleIcon, ChevronUpIcon, ArchiveBoxIcon, ChartBarIcon, ClockIcon, RocketLaunchIcon, DocumentTextIcon
} from './Icons';
import JobDetailsDrawer from './JobDetailsDrawer';
import JobStatusModal from './JobStatusModal';
import LocationSelector, { LocationItem } from './LocationSelector';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import CompanyFilterPopover from './CompanyFilterPopover';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import JobsAIAnalysisModal from './JobsAIAnalysisModal'; // New Import
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה';
type Priority = 'רגילה' | 'דחופה' | 'קריטית';
export type HealthProfile = 'standard' | 'high_volume' | 'executive' | 'disabled';

export interface Job {
  id: number;
  title: string;
  client: string;
  field: string;
  role: string;
  priority: Priority;
  clientType: string;
  city: string;
  region: string;
  gender: 'זכר' | 'נקבה' | 'לא משנה';
  mobility: boolean;
  licenseType: string;
  postingCode: string;
  validityDays: number;
  recruitingCoordinator: string;
  accountManager: string;
  salaryMin: number;
  salaryMax: number;
  ageMin: number;
  ageMax: number;
  openPositions: number;
  status: JobStatus;
  associatedCandidates: number;
  waitingForScreening: number;
  activeProcess: number;
  openDate: string;
  recruiter: string;
  location: string;
  jobType: string | string[];
  description: string;
  requirements: string[];
  rating: number; // 1-5 stars
  healthProfile: HealthProfile; 
}

const statusStyles: { [key in JobStatus]: { text: string; bg: string; border: string; } } = {
  'פתוחה': { text: 'text-green-800', bg: 'bg-green-100', border: 'border-green-200' },
  'מוקפאת': { text: 'text-amber-800', bg: 'bg-amber-100', border: 'border-amber-200' },
  'מאוישת': { text: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200' },
  'טיוטה': { text: 'text-indigo-800', bg: 'bg-indigo-100', border: 'border-indigo-200' },
};

const initialFilters = {
    searchTerm: '',
    client: '',
    status: '',
    recruiter: '',
    fromDate: '',
    toDate: '',
    field: '',
    role: '',
    priority: '',
    clientType: '',
    locations: [] as LocationItem[], 
    gender: '',
    mobility: '',
    licenseType: '',
    jobId: '',
    postingCode: '',
    validityDays: '',
    recruitingCoordinator: '',
    accountManager: '',
    salaryMin: 5000,
    salaryMax: 50000,
    ageMin: 18,
    ageMax: 70,
    positionsMin: 1,
    positionsMax: 20,
    companyIndustry: '',
    companySizes: [] as string[],
    companySectors: [] as string[],
    jobScopes: [] as string[],
};

// --- HELPER FUNCTIONS ---
const getJobHealthData = (job: Job) => {
    if (job.healthProfile === 'disabled') {
        return { color: 'bg-gray-300', message: 'בקרת בריאות כבויה למשרה זו.', pulse: false };
    }

    if (job.status !== 'פתוחה') {
         return { color: 'bg-gray-300', message: `משרה בסטטוס ${job.status}`, pulse: false };
    }

    const daysOpen = Math.ceil((new Date().getTime() - new Date(job.openDate).getTime()) / (1000 * 60 * 60 * 24));

    if (job.healthProfile === 'executive') {
        if (daysOpen > 30 && job.associatedCandidates === 0) {
            return { color: 'bg-red-500', message: 'קריטי: חודש ללא מועמדים (בכירים)!', pulse: true };
        }
        if (job.associatedCandidates > 0 && job.activeProcess === 0 && daysOpen > 14) {
            return { color: 'bg-red-500', message: 'תקיעות: יש מועמדים אך אין תהליך כבר שבועיים.', pulse: true };
        }
        if (job.waitingForScreening > 5) {
             return { color: 'bg-orange-500', message: 'עומס: משרת בכירים דורשת יחס אישי, 5+ ממתינים.', pulse: false };
        }
    }
    else if (job.healthProfile === 'high_volume') {
        if (daysOpen > 7 && job.associatedCandidates < 5) {
             return { color: 'bg-red-500', message: 'קריטי: שבוע ללא זרימת מועמדים מספקת (מסה)!', pulse: true };
        }
        if (job.waitingForScreening > 50) {
            return { color: 'bg-red-500', message: 'צוואר בקבוק: מעל 50 מועמדים ממתינים!', pulse: true };
        } else if (job.waitingForScreening > 25) {
            return { color: 'bg-orange-500', message: 'עומס: הצטברות מועמדים לסינון (מעל 25).', pulse: false };
        }
    }
    else {
        if (daysOpen > 14 && job.associatedCandidates === 0) {
            return { color: 'bg-red-500', message: 'קריטי: המשרה פתוחה שבועיים ללא מועמדים!', pulse: true };
        } else if (job.waitingForScreening > 20) {
            return { color: 'bg-red-500', message: 'צוואר בקבוק: מעל 20 מועמדים ממתינים לסינון!', pulse: true };
        } else if (daysOpen > 60 && job.activeProcess === 0) {
            return { color: 'bg-red-500', message: 'קריטי: המשרה פתוחה חודשיים ללא התקדמות!', pulse: false };
        } else if (job.activeProcess === 0 && job.associatedCandidates > 0) {
            return { color: 'bg-orange-500', message: 'דחיפות גבוהה: יש מועמדים אך אין תהליכים פעילים.', pulse: false };
        } else if (job.waitingForScreening > 10) {
            return { color: 'bg-orange-500', message: 'עומס: הצטברות מועמדים לסינון (מעל 10).', pulse: false };
        } else if (job.associatedCandidates < 5 && daysOpen > 7) {
            return { color: 'bg-yellow-400', message: 'אזהרה: כמות מועמדים נמוכה יחסית לוותק המשרה.', pulse: false };
        } 
    }
    
    return { color: 'bg-emerald-500', message: 'תהליך תקין: יש זרימה של מועמדים ותהליכים.', pulse: false };
};


// --- COMPONENTS ---
const StarRating: React.FC<{ rating: number; onRate: (rating: number) => void }> = ({ rating, onRate }) => {
    const [hover, setHover] = useState(0);

    return (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {[...Array(5)].map((_, index) => {
                const ratingValue = index + 1;
                return (
                    <button
                        key={index}
                        className="focus:outline-none"
                        onClick={() => onRate(ratingValue === rating ? 0 : ratingValue)}
                        onMouseEnter={() => setHover(ratingValue)}
                        onMouseLeave={() => setHover(0)}
                    >
                         <StarIcon 
                            className={`w-3.5 h-3.5 transition-colors duration-200 ${
                                ratingValue <= (hover || rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                            }`} 
                        />
                    </button>
                );
            })}
        </div>
    );
};

const PriorityBadge: React.FC<{ priority: Priority; onUpdate: (p: Priority) => void }> = ({ priority, onUpdate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const { t } = useLanguage();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const renderBadge = () => {
        if (priority === 'קריטית') {
            return (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                    <FireIcon className="w-3 h-3" />
                    <span>{t('priority.קריטית')}</span>
                </div>
            );
        }
        if (priority === 'דחופה') {
            return (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full border border-orange-200">
                    <ExclamationTriangleIcon className="w-3 h-3" />
                    <span>{t('priority.דחופה')}</span>
                </div>
            );
        }
        return (
            <div className="w-6 h-6 flex items-center justify-center text-text-subtle opacity-30 hover:opacity-100 transition-opacity cursor-pointer hover:bg-bg-subtle rounded">
                <FlagIcon className="w-4 h-4" />
            </div>
        );
    };

    return (
        <div className="relative flex justify-center">
            <button 
                ref={buttonRef}
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="outline-none"
            >
                {renderBadge()}
            </button>

            {isOpen && (
                <div 
                    ref={popoverRef}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-bg-card rounded-lg shadow-xl border border-border-default z-50 w-32 overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => { onUpdate('רגילה'); setIsOpen(false); }} className="text-right px-4 py-2 text-sm hover:bg-bg-hover text-text-default transition-colors flex items-center gap-2">
                         <FlagIcon className="w-4 h-4 text-gray-400" /> {t('priority.רגילה')}
                    </button>
                    <button onClick={() => { onUpdate('דחופה'); setIsOpen(false); }} className="text-right px-4 py-2 text-sm hover:bg-bg-hover text-text-default transition-colors flex items-center gap-2">
                         <ExclamationTriangleIcon className="w-4 h-4 text-orange-500" /> {t('priority.דחופה')}
                    </button>
                    <button onClick={() => { onUpdate('קריטית'); setIsOpen(false); }} className="text-right px-4 py-2 text-sm hover:bg-bg-hover text-text-default transition-colors flex items-center gap-2">
                         <FireIcon className="w-4 h-4 text-red-500" /> {t('priority.קריטית')}
                    </button>
                </div>
            )}
        </div>
    );
};

const HealthTooltip: React.FC<{ message: string }> = ({ message }) => (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-[220px] bg-gray-800 text-white text-xs rounded-lg py-2 px-3 shadow-xl z-50 text-center transition-opacity opacity-0 group-hover/health:opacity-100 duration-200 pointer-events-none">
        {message}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
    </div>
);

const JobHealthIndicator: React.FC<{ job: Job }> = ({ job }) => {
    const { color, message, pulse } = getJobHealthData(job);
    
    return (
        <div className="group/health relative inline-flex items-center justify-center cursor-help mx-auto w-8 h-8">
            <div className="absolute inset-0 flex items-center justify-center w-full h-full">
                 <div className={`w-3 h-3 rounded-full ${color} ${pulse ? 'animate-pulse ring-2 ring-offset-1 ring-red-200' : ''} shadow-sm`}></div>
            </div>
             <HealthTooltip message={message} />
        </div>
    );
};

// --- UPDATED HELPER COMPONENTS ---
const FilterInput: React.FC<{ label: string; name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string }> = ({ label, name, value, onChange, type = 'text', placeholder }) => (
    <div>
        <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition" />
    </div>
);

const FilterSelect: React.FC<{ label?: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; options: string[]; placeholder: string, className?: string }> = ({ label, name, value, onChange, options, placeholder, className }) => (
    <div className={className}>
        {label && <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>}
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 px-3 text-sm focus:ring-primary-500 focus:border-primary-300 transition">
            <option value="">{placeholder}</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

// Enhanced DoubleRangeSlider with numeric inputs (Consistent with Candidate View)
const DoubleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    valueMin: number;
    valueMax: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    nameMin: string;
    nameMax: string;
    unit?: string;
    colorVar?: string;
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', colorVar = '--color-primary-500' }) => {
    const minVal = Math.min(Number(valueMin), Number(valueMax));
    const maxVal = Math.max(Number(valueMin), Number(valueMax));
    const minPercent = ((minVal - min) / (max - min)) * 100;
    const maxPercent = ((maxVal - min) / (max - min)) * 100;
    
    // Ticks calculation
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
                 <label className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">{label}</label>
                
                <div className="flex items-center gap-1.5 bg-bg-card border border-border-default shadow-sm px-3 py-1 rounded-full text-sm font-extrabold z-10 tabular-nums" dir="ltr">
                    <input
                        type="number" min={min} max={max} step={step} value={minVal} name={nameMin}
                        onChange={onChange}
                        className="w-20 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
                    />
                    <span className="text-text-subtle text-xs font-normal">-</span>
                    <input
                        type="number" min={min} max={max} step={step} value={maxVal} name={nameMax}
                        onChange={onChange}
                        className="w-20 bg-transparent text-center outline-none focus:text-primary-600 transition-colors"
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
                    type="range" min={min} max={max} step={step} value={minVal} name={nameMin} onChange={onChange}
                    className="absolute w-full h-1 bg-transparent appearance-none pointer-events-none z-20 range-thumb-custom"
                />
                <input
                    type="range" min={min} max={max} step={step} value={maxVal} name={nameMax} onChange={onChange}
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
        </div>
    );
};

// Updated JobCard for Local Use in JobsView
const JobCard: React.FC<{ 
    job: Job; 
    onRate: (rating: number) => void;
    onUpdatePriority: (p: Priority) => void;
    onClick: () => void;
    selectionMode: boolean;
    isSelected: boolean;
    onSelect: () => void;
}> = ({ job, onRate, onUpdatePriority, onClick, selectionMode, isSelected, onSelect }) => {
    const { t } = useLanguage();
    const { bg, text } = statusStyles[job.status];

    const handleClick = (e: React.MouseEvent) => {
        if (selectionMode) {
            e.stopPropagation();
            onSelect();
        } else {
            onClick();
        }
    };

    return (
        <div 
            onClick={handleClick}
            className={`bg-bg-card rounded-xl border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative group ${isSelected ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-border-default hover:border-primary-300'}`}
        >
            {/* Selection Checkbox (Visible in mode or on hover/selected) */}
            {selectionMode && (
                <div className="absolute top-3 left-3 z-10" onClick={e => e.stopPropagation()}>
                    <input 
                        type="checkbox" 
                        checked={isSelected} 
                        onChange={onSelect}
                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                    />
                </div>
            )}

            <div className="flex justify-between items-start mb-3 pl-6"> {/* Added padding for checkbox */}
                <div>
                    <div className="flex items-center gap-2">
                         <h3 className="font-bold text-text-default text-base leading-tight truncate max-w-[180px]" title={job.title}>{job.title}</h3>
                         <PriorityBadge priority={job.priority} onUpdate={onUpdatePriority} />
                    </div>
                    <p className="text-xs text-text-muted mt-1">{job.client}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${bg} ${text} border-transparent`}>{t(`status.${job.status}`)}</span>
                    <JobHealthIndicator job={job} />
                </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-subtle">
                 <StarRating rating={job.rating} onRate={onRate} />
                 <div className="text-xs text-text-muted flex gap-3">
                     <span title={t('jobs.col_candidates')}>{job.associatedCandidates} <UserIcon className="w-3 h-3 inline"/></span>
                     <span title={t('jobs.col_open_date')}>{job.openDate}</span>
                 </div>
            </div>
        </div>
    );
};


// --- MAIN JOBS VIEW ---
const JobsView: React.FC = () => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [filters, setFilters] = useState(initialFilters);
    
    const loadJobs = useCallback(async () => {
        setLoadingJobs(true);
        try {
            const res = await fetch(`${apiBase}/api/jobs`);
            if (!res.ok) throw new Error('Failed to load jobs');
            const payload = await res.json();
            setJobs(Array.isArray(payload) ? payload : []);
        } catch (err) {
            console.error('[JobsView] loadJobs', err);
        } finally {
            setLoadingJobs(false);
        }
    }, [apiBase]);

    useEffect(() => {
        loadJobs();
    }, [loadJobs]);

    const persistJobUpdate = useCallback(async (id: number, updates: Partial<Job>) => {
        const res = await fetch(`${apiBase}/api/jobs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        if (!res.ok) throw new Error('Failed to update job');
        const updated = await res.json();
        setJobs(prev => prev.map(job => (job.id === updated.id ? updated : job)));
        return updated;
    }, [apiBase]);

    const createJobRecord = useCallback(async (payload: Partial<Job>) => {
        const res = await fetch(`${apiBase}/api/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create job');
        const created = await res.json();
        setJobs(prev => [...prev, created]);
        return created;
    }, [apiBase]);

    const deleteJobRecord = useCallback(async (id: number) => {
        const res = await fetch(`${apiBase}/api/jobs/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete job');
        setJobs(prev => prev.filter(job => job.id !== id));
    }, [apiBase]);
    
    // --- New state for Date Range ---
    const [dateRange, setDateRange] = useState<DateRange | null>(null);

    // --- New state for Job Status Modal ---
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [jobToEditStatus, setJobToEditStatus] = useState<Job | null>(null);
    // --------------------------------------
    
    // --- New State for Job Field and Company Filters ---
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    
    // --- NEW STATE FOR STATS & SELECTION ---
    const [showMobileStats, setShowMobileStats] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // --- NEW STATE FOR BULK ACTIONS & AI ---
    const [activeBulkAction, setActiveBulkAction] = useState<'none' | 'menu' | 'status' | 'priority'>('none');
    const [isAIAnalysisOpen, setIsAIAnalysisOpen] = useState(false);


    const allColumns = useMemo(() => [
        { id: 'rating', header: t('jobs.col_rating') },
        { id: 'health', header: t('jobs.col_health') },
        { id: 'title', header: t('jobs.col_title') },
        { id: 'priority', header: t('jobs.col_priority') },
        { id: 'client', header: t('jobs.col_client') },
        { id: 'status', header: t('jobs.col_status') },
        { id: 'associatedCandidates', header: t('jobs.col_candidates') },
        { id: 'waitingForScreening', header: t('jobs.col_waiting') },
        { id: 'activeProcess', header: t('jobs.col_process') },
        { id: 'openDate', header: t('jobs.col_open_date') },
        { id: 'recruiter', header: t('jobs.col_recruiter') },
        { id: 'id', header: t('jobs.col_id') },
        { id: 'postingCode', header: t('jobs.col_posting_code') },
        { id: 'field', header: t('jobs.col_field') },
        { id: 'role', header: t('jobs.col_role') },
        { id: 'clientType', header: t('jobs.col_client_type') },
        { id: 'location', header: t('jobs.col_location') },
        { id: 'salaryRange', header: t('jobs.col_salary') },
        { id: 'ageRange', header: t('jobs.col_age') },
        { id: 'openPositions', header: t('jobs.col_positions') },
        { id: 'validityDays', header: t('jobs.col_validity') },
        { id: 'recruitingCoordinator', header: t('jobs.col_coordinator') },
        { id: 'accountManager', header: t('jobs.col_account_manager') },
        { id: 'gender', header: t('jobs.col_gender') },
        { id: 'mobility', header: t('jobs.col_mobility') },
        { id: 'licenseType', header: t('jobs.col_license') },
    ], [t]);

    const defaultVisibleColumns = useMemo(() => ['rating', 'health', 'title', 'priority', 'client', 'status', 'associatedCandidates', 'waitingForScreening', 'activeProcess', 'openDate', 'recruiter'], []);
    const [visibleColumns, setVisibleColumns] = useState(defaultVisibleColumns);

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const jobScopeOptions = ['משרה מלאה', 'משרה חלקית', 'משמרות', 'פרילנס'];

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-primary-500 font-bold ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };
    
    const handleRateJob = async (jobId: number, newRating: number) => {
        try {
            await persistJobUpdate(jobId, { rating: newRating });
        } catch (err) {
            alert((err as Error).message || 'Failed to update rating');
        }
    };

    const handlePriorityUpdate = async (jobId: number, newPriority: Priority) => {
        try {
            await persistJobUpdate(jobId, { priority: newPriority });
        } catch (err) {
            alert((err as Error).message || 'Failed to update priority');
        }
    };
    
    // --- Selection Handlers ---
    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode);
        setSelectedIds(new Set());
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Select visible filtered jobs
            setSelectedIds(new Set(sortedAndFilteredJobs.map(j => j.id)));
        } else {
            setSelectedIds(new Set());
        }
    };
    
    const handleBulkDelete = async () => {
        if (!selectedIds.size) return;
        if (!window.confirm(`האם למחוק ${selectedIds.size} משרות שנבחרו?`)) return;
        try {
            await Promise.all(Array.from(selectedIds).map(id => deleteJobRecord(id)));
            setSelectedIds(new Set());
        } catch (err) {
            alert((err as Error).message || 'Bulk delete failed');
        }
    };

    const handleCreateJob = async () => {
        if (!window.confirm('האם ליצור משרה חדשה דיפולטית?')) return;
        try {
            const created = await createJobRecord({
                title: 'משרה חדשה',
                client: 'לקוח חדש',
                field: 'כללי',
                role: 'תפקיד פתוח',
                priority: 'רגילה',
                status: 'טיוטה',
                openDate: new Date().toISOString(),
                jobType: ['קבועה'],
                salaryMin: 0,
                salaryMax: 0,
                ageMin: 18,
                ageMax: 99,
                openPositions: 1,
                recruiter: 'admin',
                location: 'לא הוגדר',
                rating: 0,
            });
            if (created) {
                setSelectedJob(created);
                setIsDrawerOpen(true);
            }
        } catch (err) {
            alert((err as Error).message || 'Failed to create job');
        }
    };
    
    // --- Bulk Update Handlers ---
    const handleBulkUpdate = async (field: keyof Job, value: any) => {
        if (selectedIds.size === 0) return;
        try {
            await Promise.all(Array.from(selectedIds).map(id => persistJobUpdate(id, { [field]: value })));
            setActiveBulkAction('none');
            setSelectedIds(new Set());
        } catch (err) {
            alert((err as Error).message || 'Bulk update failed');
        }
    };

    const handleBulkJobField = async (field: SelectedJobField | null) => {
        if (!field || selectedIds.size === 0) return;
        try {
            await Promise.all(
                Array.from(selectedIds).map(id =>
                    persistJobUpdate(id, { field: field.category, role: field.role }),
                ),
            );
            setActiveBulkAction('none');
            setSelectedIds(new Set());
        } catch (err) {
            alert((err as Error).message || 'Bulk job field update failed');
        } finally {
            setIsJobFieldSelectorOpen(false);
        }
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

    const openJobDetails = (job: Job) => {
        if (selectionMode) {
             handleSelect(job.id);
        } else {
            setSelectedJob(job);
            setIsDrawerOpen(true);
        }
    };
    
    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: Number(value) }));
    };

    const handleLocationsChange = (newLocations: LocationItem[]) => {
        setFilters(prev => ({ ...prev, locations: newLocations }));
    };

    const handleResetFilters = () => {
        setFilters(initialFilters);
        setIsAdvancedFilterOpen(false);
    };

    const openStatusModal = (job: Job) => {
        setJobToEditStatus(job);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatus = async (newStatus: JobStatus, note: string) => {
        if (!jobToEditStatus) return;
        try {
            await persistJobUpdate(jobToEditStatus.id, { status: newStatus });
            console.log(`Updated job ${jobToEditStatus.id} status to ${newStatus}. Note: ${note}`);
        } catch (err) {
            alert((err as Error).message || 'Failed to update status');
        }
    };

    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        // Check if this was triggered from Bulk Mode or Filter Mode
        if (activeBulkAction === 'none') {
             // Filter mode
            if (selectedField) {
                setFilters(prev => ({
                    ...prev,
                    field: selectedField.category, 
                    role: selectedField.role       
                }));
            }
        } else {
            // Bulk Edit mode
            handleBulkJobField(selectedField);
        }
        setIsJobFieldSelectorOpen(false);
    };

    const handleDateRangeChange = (range: DateRange | null) => {
        setDateRange(range);
        setFilters(prev => ({
            ...prev,
            fromDate: range?.from || '',
            toDate: range?.to || ''
        }));
    };
    
    const [companyFilterState, setCompanyFilterState] = useState({
        sizes: filters.companySizes,
        sectors: filters.companySectors,
        industry: filters.companyIndustry,
        field: ''
    });
    
    useEffect(() => {
        setFilters(prev => ({
            ...prev,
            companySizes: companyFilterState.sizes,
            companySectors: companyFilterState.sectors,
            companyIndustry: companyFilterState.industry
        }));
    }, [companyFilterState]);
    
    const handleJobScopeToggle = (scope: string) => {
        setFilters(prev => {
            const currentScopes = prev.jobScopes || [];
            const newScopes = currentScopes.includes(scope)
                ? currentScopes.filter(s => s !== scope)
                : [...currentScopes, scope];
            return { ...prev, jobScopes: newScopes };
        });
    };


    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job => {
            const search = filters.searchTerm.toLowerCase();
            const matchesSearch = !search || 
                job.title.toLowerCase().includes(search) ||
                job.client.toLowerCase().includes(search) ||
                job.location.toLowerCase().includes(search) ||
                String(job.id).includes(search);

            const checkRange = (min: number, max: number, filterMin: number, filterMax: number) => {
                return max >= filterMin && min <= filterMax;
            };

            const checkMobility = () => {
                if (filters.mobility === '') return true;
                if (filters.mobility === 'כן') return job.mobility;
                if (filters.mobility === 'לא') return !job.mobility;
                return true;
            };

            const matchesLocation = filters.locations.length === 0 || 
                filters.locations.some(loc => 
                    (loc.type === 'city' && job.city === loc.value) ||
                    (loc.type === 'region' && job.region === loc.value)
                );
            
            const matchesCompanyIndustry = !filters.companyIndustry || job.field === filters.companyIndustry;
            
            // Check Job Scope
            const matchesScope = filters.jobScopes.length === 0 || 
               (Array.isArray(job.jobType) 
                    ? job.jobType.some(t => filters.jobScopes.includes(t)) 
                    : filters.jobScopes.includes(job.jobType as string));

            return matchesSearch &&
                (!filters.client || job.client === filters.client) &&
                (!filters.status || job.status === filters.status) &&
                (!filters.recruiter || job.recruiter === filters.recruiter) &&
                (!filters.fromDate || job.openDate >= filters.fromDate) &&
                (!filters.toDate || job.openDate <= filters.toDate) &&
                (!filters.field || job.field === filters.field) &&
                (!filters.role || job.role === filters.role) &&
                (!filters.priority || job.priority === filters.priority) &&
                (!filters.clientType || job.clientType === filters.clientType) &&
                matchesLocation &&
                (!filters.gender || job.gender === filters.gender) &&
                checkMobility() &&
                (!filters.licenseType || job.licenseType === filters.licenseType) &&
                (!filters.jobId || String(job.id) === filters.jobId) &&
                (!filters.postingCode || job.postingCode === filters.postingCode) &&
                (!filters.recruitingCoordinator || job.recruitingCoordinator === filters.recruitingCoordinator) &&
                (!filters.accountManager || job.accountManager === filters.accountManager) &&
                checkRange(job.salaryMin, job.salaryMax, filters.salaryMin, filters.salaryMax) &&
                checkRange(job.ageMin, job.ageMax, filters.ageMin, filters.ageMax) &&
                checkRange(job.openPositions, job.openPositions, filters.positionsMin, filters.positionsMax) &&
                matchesCompanyIndustry &&
                matchesScope;
        });

        if (sortConfig !== null) {
            filtered.sort((a, b) => {
                let aValue: any;
                let bValue: any;
        
                const sortKey = sortConfig.key === 'salaryRange' 
                    ? 'salaryMin' 
                    : sortConfig.key === 'ageRange'
                    ? 'ageMin'
                    : sortConfig.key;

                aValue = a[sortKey as keyof Job];
                bValue = b[sortKey as keyof Job];
        
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

    }, [jobs, filters, sortConfig]);

    const stats = useMemo(() => {
        const activeJobs = jobs.filter(j => j.status === 'פתוחה');
        
        // 1. Attention Needed: Jobs with 'critical' priority OR red health indicator
        const attentionNeeded = activeJobs.filter(j => {
             const health = getJobHealthData(j);
             return j.priority === 'קריטית' || health.color === 'bg-red-500';
        }).length;

        // 2. Bottleneck: Total candidates waiting for screening
        const totalWaiting = activeJobs.reduce((acc, j) => acc + j.waitingForScreening, 0);

        // 3. Momentum: Jobs with active processes
        const momentumJobs = activeJobs.filter(j => j.activeProcess > 0).length;

        // 4. Efficiency: Average days open
        const totalDays = activeJobs.reduce((acc, j) => {
            const days = Math.ceil((new Date().getTime() - new Date(j.openDate).getTime()) / (1000 * 60 * 60 * 24));
            return acc + days;
        }, 0);
        const avgDays = activeJobs.length ? Math.round(totalDays / activeJobs.length) : 0;

        return { attentionNeeded, totalWaiting, momentumJobs, avgDays };
    }, [jobs]);
    
    // Check if all displayed are selected
    const areAllVisibleSelected = sortedAndFilteredJobs.length > 0 && sortedAndFilteredJobs.every(j => selectedIds.has(j.id));

    const filterOptions = useMemo(() => ({
        recruiters: [...new Set(jobs.map(j => j.recruiter))],
        statuses: [...new Set(jobs.map(j => j.status as string))] as JobStatus[],
        fields: [...new Set(jobs.map(j => j.field))],
        clients: [...new Set(jobs.map(j => j.client))],
        roles: [...new Set(jobs.map(j => j.role))],
        priorities: ['רגילה', 'דחופה', 'קריטית'],
        clientTypes: [...new Set(jobs.map(j => j.clientType))],
        genders: ['זכר', 'נקבה', 'לא משנה'],
        licenseTypes: ['A', 'B', 'C', 'C1', 'אין'],
        recruitingCoordinators: [...new Set(jobs.map(j => j.recruitingCoordinator))],
        accountManagers: [...new Set(jobs.map(j => j.accountManager))]
    }), [jobs]);

    const handleColumnToggle = (columnId: string) => {
      setVisibleColumns(prev => {
        const isCurrentlyVisible = prev.some(c => c === columnId);
        if(isCurrentlyVisible) {
          return prev.length > 1 ? prev.filter(c => c !== columnId) : prev;
        } else {
          const columnToAdd = allColumns.find(c => c.id === columnId);
          if (columnToAdd) {
                const newColumns = [...prev, columnId];
                newColumns.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                return newColumns;
            }
            return prev;
        }
      })
    };
    
    const handleDragStart = (index: number, colId: string) => { 
        dragItemIndex.current = index;
        setDraggingColumn(colId);
    };
    const handleDragEnter = (index: number) => {
        if(dragItemIndex.current === null || dragItemIndex.current === index) return;
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
    const handleDrop = () => { 
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };

    const renderCell = (job: Job, columnId: string) => {
      switch(columnId) {
        case 'rating': return <StarRating rating={job.rating || 0} onRate={(r) => handleRateJob(job.id, r)} />;
        case 'health': return <JobHealthIndicator job={job} />;
        case 'priority': return <PriorityBadge priority={job.priority} onUpdate={(p) => handlePriorityUpdate(job.id, p)} />;
        case 'title':
           return (
             <div className="relative group/title flex items-center">
                <Link to={`/jobs/edit/${job.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-primary-700 hover:underline">{job.title}</Link>
             </div>
           );
        case 'status': return (
            <button 
                onClick={(e) => { e.stopPropagation(); openStatusModal(job); }}
                className={`text-xs font-bold px-3 py-1 rounded-full transition-transform hover:scale-105 active:scale-95 shadow-sm border ${statusStyles[job.status].bg} ${statusStyles[job.status].text} ${statusStyles[job.status].border || 'border-transparent'}`}
            >
                {t(`status.${job.status}`)}
            </button>
        );
        case 'associatedCandidates': return <span className="font-semibold text-text-default text-center block">{job.associatedCandidates}</span>;
        case 'waitingForScreening': return <span className="font-medium text-amber-600 text-center block">{job.waitingForScreening}</span>;
        case 'activeProcess': return <span className="font-medium text-green-600 text-center block">{job.activeProcess}</span>;
        case 'id': return job.id;
        case 'salaryRange': return `${job.salaryMin.toLocaleString()}₪ - ${job.salaryMax.toLocaleString()}₪`;
        case 'ageRange': return `${job.ageMin} - ${job.ageMax}`;
        case 'mobility': return job.mobility ? t('filter.status_active') : t('filter.status_inactive');
        default: return (job as any)[columnId];
      }
    };


    const StatCard = ({ title, value, icon, color }: { title: string, value: string | number, icon: any, color: string }) => (
        <div className="bg-bg-card p-4 rounded-xl border border-border-default flex items-center justify-between shadow-sm">
             <div>
                <p className="text-xs text-text-muted font-bold uppercase mb-1">{title}</p>
                <p className="text-2xl font-black text-text-default">{value}</p>
             </div>
             <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
             
            <header className="bg-bg-subtle/80 backdrop-blur-md -mx-6 -mt-6 px-6 pt-6 pb-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-2">
                    <div>
                        <h1 className="text-2xl font-bold text-text-default">{t('jobs.title')}</h1>
                        <p className="text-sm text-text-muted">{t('jobs.subtitle')}</p>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                        {/* Mobile Stats Toggle */}
                        <div className="lg:hidden">
                            <button 
                                onClick={() => setShowMobileStats(!showMobileStats)}
                                className="flex items-center gap-2 text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-2 rounded-lg"
                            >
                                <ChartBarIcon className="w-4 h-4"/>
                                {showMobileStats ? 'הסתר מדדים' : 'הצג מדדים'}
                            </button>
                        </div>
                        
                        <button onClick={handleCreateJob} className="flex-grow md:flex-grow-0 flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('jobs.new_job_btn')}</span>
                        </button>
                    </div>
                </div>
            </header>
            
            {/* Stats Dashboard */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${showMobileStats ? 'block' : 'hidden lg:grid'}`}>
                 <StatCard title="דורש טיפול" value={stats.attentionNeeded} icon={<ExclamationTriangleIcon className="w-5 h-5 text-red-600"/>} color="bg-red-50" />
                 <StatCard title="ממתינים לסינון" value={stats.totalWaiting} icon={<UserGroupIcon className="w-5 h-5 text-orange-600"/>} color="bg-orange-50" />
                 <StatCard title="משרות בתנועה" value={stats.momentumJobs} icon={<RocketLaunchIcon className="w-5 h-5 text-green-600"/>} color="bg-green-50" />
                 <StatCard title="זמן ממוצע לאיוש" value={stats.avgDays} icon={<ClockIcon className="w-5 h-5 text-blue-600"/>} color="bg-blue-50" />
            </div>
            
            <div className="bg-bg-card p-3 rounded-xl border border-border-default">
                <div className="pb-2 -mb-2">
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="relative flex-grow min-w-[15rem] flex-shrink-0">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input type="text" placeholder={t('jobs.search_placeholder')} name="searchTerm" value={filters.searchTerm} onChange={handleFilterChange} className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition shadow-sm" />
                        </div>
                        <FilterSelect placeholder={t('jobs.filter_client')} name="client" value={filters.client} onChange={handleFilterChange} options={filterOptions.clients} className="flex-grow min-w-[8rem] flex-shrink-0" />
                        <FilterSelect placeholder={t('jobs.filter_status')} name="status" value={filters.status} onChange={handleFilterChange} options={filterOptions.statuses.map(s => t(`status.${s}`))} className="flex-grow min-w-[8rem] flex-shrink-0" />
                        
                        {/* Date Range Selector */}
                        <div className="min-w-[140px]">
                            <DateRangeSelector 
                                value={dateRange} 
                                onChange={handleDateRangeChange} 
                                placeholder={t('filter.last_updated') || 'תאריכים'}
                            />
                        </div>

                        {/* Job Field Button */}
                        <button
                            onClick={() => {
                                // Set bulk action to none to ensure standard filtering
                                setActiveBulkAction('none');
                                setIsJobFieldSelectorOpen(true);
                            }}
                            className={`flex items-center gap-2 font-semibold py-2.5 px-4 rounded-lg border border-border-default transition-all whitespace-nowrap text-sm ${
                                filters.field || filters.role
                                    ? 'bg-primary-100 text-primary-700 border-primary-300'
                                    : 'bg-bg-input text-text-default hover:border-primary-300'
                            }`}
                            title="סינון לפי תחום משרה"
                        >
                            <BriefcaseIcon className="w-4 h-4" />
                            <span className="hidden xl:inline">{filters.role || filters.field || 'תחום משרה'}</span>
                        </button>

                         <div className="relative">
                            <button
                                onClick={() => setIsCompanyFilterOpen(!isCompanyFilterOpen)}
                                className={`flex items-center gap-2 font-semibold py-2.5 px-4 rounded-lg border border-border-default transition-all whitespace-nowrap text-sm ${
                                    isCompanyFilterOpen || filters.companyIndustry
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-bg-input text-text-default hover:border-primary-300'
                                }`}
                                title="סינון לפי תעשייה/סקטור"
                            >
                                <BuildingOffice2Icon className="w-4 h-4" />
                                <span className="hidden xl:inline">{t('jobs.filter_industry_btn')}</span>
                            </button>
                            {isCompanyFilterOpen && (
                                <CompanyFilterPopover
                                    onClose={() => setIsCompanyFilterOpen(false)}
                                    filters={companyFilterState}
                                    setFilters={setCompanyFilterState}
                                />
                            )}
                        </div>

                        {/* Selection Mode Toggle */}
                        <button 
                            onClick={toggleSelectionMode} 
                            className={`p-2.5 rounded-lg border transition-all ${selectionMode ? 'bg-primary-100 border-primary-500 text-primary-700' : 'bg-bg-subtle border-border-default text-text-muted hover:border-primary-300'}`}
                            title="בחירה מרובה"
                        >
                            <CheckCircleIcon className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 flex-shrink-0 ml-auto">
                            <button onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)} className="text-sm font-semibold text-primary-600 bg-primary-100/70 py-2.5 px-4 rounded-lg hover:bg-primary-200 transition flex items-center justify-center gap-1">
                                <span>{t('candidates.advanced_search')}</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedFilterOpen ? 'rotate-180' : ''}`}/>
                            </button>
                            <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                                <button onClick={() => setViewMode('table')} title={t('candidates.view_list')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                                <button onClick={() => setViewMode('grid')} title={t('candidates.view_grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                            </div>
                             <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title={t('candidates.customize_columns')} className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isSettingsOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4 max-h-96 overflow-y-auto">
                                    <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                    <div className="space-y-2">
                                    {allColumns.map(column => (
                                        <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                        <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600" />
                                        {column.header}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {isAdvancedFilterOpen && (
                    <div className="pt-4 mt-3 border-t border-border-default space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                            <div className="relative md:col-span-2">
                                <label className="block text-xs font-semibold text-text-muted mb-1">{t('filter.location')}</label>
                                <LocationSelector 
                                    selectedLocations={filters.locations}
                                    onChange={handleLocationsChange}
                                    className="w-full"
                                    placeholder={t('filter.location_placeholder')}
                                />
                            </div>
                            <FilterSelect label={t('jobs.col_priority')} name="priority" value={filters.priority} onChange={handleFilterChange} options={filterOptions.priorities.map(p => t(`priority.${p}`))} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_client_type')} name="clientType" value={filters.clientType} onChange={handleFilterChange} options={filterOptions.clientTypes} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_gender')} name="gender" value={filters.gender} onChange={handleFilterChange} options={filterOptions.genders.map(g => t(`filter.gender_${g === 'זכר' ? 'male' : g === 'נקבה' ? 'female' : 'all'}`))} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_mobility')} name="mobility" value={filters.mobility} onChange={handleFilterChange} options={[t('filter.status_active'), t('filter.status_inactive')]} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_license')} name="licenseType" value={filters.licenseType} onChange={handleFilterChange} options={filterOptions.licenseTypes} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_recruiter')} name="recruitingCoordinator" value={filters.recruitingCoordinator} onChange={handleFilterChange} options={filterOptions.recruitingCoordinators} placeholder={t('filter.status_all')} />
                            <FilterSelect label={t('jobs.col_account_manager')} name="accountManager" value={filters.accountManager} onChange={handleFilterChange} options={filterOptions.accountManagers} placeholder={t('filter.status_all')} />
                            <FilterInput label={t('jobs.col_id')} name="jobId" value={filters.jobId} onChange={handleFilterChange} />
                            <FilterInput label={t('jobs.col_posting_code')} name="postingCode" value={filters.postingCode} onChange={handleFilterChange} />
                             <div className="lg:col-span-2">
                                <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">{t('filter.job_scope')}</label>
                                <div className="flex flex-wrap gap-2">
                                    {jobScopeOptions.map(scope => (
                                        <button
                                            key={scope}
                                            onClick={() => handleJobScopeToggle(scope)}
                                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                                                filters.jobScopes.includes(scope)
                                                    ? 'bg-primary-100 text-primary-700 border border-primary-200 shadow-sm'
                                                    : 'bg-bg-subtle text-text-muted border border-transparent hover:bg-bg-hover'
                                            }`}
                                        >
                                            {scope}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 mt-4 border-t border-border-default">
                             <DoubleRangeSlider 
                                label={t('filter.salary_internal')}
                                min={5000} max={50000} step={1000} 
                                valueMin={Number(filters.salaryMin)} valueMax={Number(filters.salaryMax)} 
                                onChange={handleSliderChange} 
                                nameMin="salaryMin" nameMax="salaryMax" 
                                unit="₪" 
                                colorVar="--color-secondary-500"
                            />
                            <DoubleRangeSlider 
                                label={t('filter.age_range')}
                                min={18} max={70} step={1} 
                                valueMin={Number(filters.ageMin)} valueMax={Number(filters.ageMax)} 
                                onChange={handleSliderChange} 
                                nameMin="ageMin" nameMax="ageMax" 
                            />
                            <DoubleRangeSlider 
                                label={t('jobs.col_positions')}
                                min={1} max={20} step={1} 
                                valueMin={Number(filters.positionsMin)} valueMax={Number(filters.positionsMax)} 
                                onChange={handleSliderChange} 
                                nameMin="positionsMin" nameMax="positionsMax" 
                            />
                        </div>
                        <div className="flex justify-end pt-4 mt-4 border-t border-border-default">
                            <button onClick={handleResetFilters} className="text-sm font-semibold text-text-muted hover:text-primary-600 py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-1.5"><ArrowPathIcon className="w-4 h-4" /> {t('candidates.reset_all')}</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Bulk Actions Menu (Floating) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 bg-bg-card border border-border-default shadow-2xl rounded-full px-6 py-3 flex items-center gap-4 animate-slide-up">
                    <span className="font-bold text-primary-600 text-sm">{selectedIds.size} משרות נבחרו</span>
                    <div className="h-6 w-px bg-border-default"></div>
                    
                    {/* Bulk Edit Button */}
                     <div className="relative">
                        <button 
                            onClick={() => setActiveBulkAction(activeBulkAction === 'menu' ? 'none' : 'menu')}
                            className="flex items-center gap-1.5 text-text-default hover:bg-bg-subtle px-3 py-1.5 rounded-lg transition-colors font-bold text-sm"
                        >
                            <PencilIcon className="w-4 h-4"/>
                            שינוי מרוכז
                        </button>
                        
                        {/* Popup Menu */}
                        {activeBulkAction === 'menu' && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-white border border-border-default rounded-xl shadow-xl overflow-hidden animate-fade-in">
                                <button onClick={() => { setActiveBulkAction('status'); }} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle">סטטוס משרה</button>
                                <button onClick={() => { setActiveBulkAction('none'); setIsJobFieldSelectorOpen(true); }} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle">תחום / תפקיד</button>
                                <button onClick={() => { setActiveBulkAction('none'); /* Handle location bulk in future */ alert('Coming soon'); }} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle">מיקום</button>
                                <button onClick={() => setActiveBulkAction('priority')} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle text-text-default">דחיפות</button>
                            </div>
                        )}

                        {/* Sub-menu: Status Selection */}
                        {activeBulkAction === 'status' && (
                             <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-white border border-border-default rounded-xl shadow-xl overflow-hidden animate-fade-in">
                                {['פתוחה', 'מוקפאת', 'סגורה'].map(status => (
                                    <button 
                                        key={status} 
                                        onClick={() => handleBulkUpdate('status', status)} 
                                        className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle last:border-0"
                                    >
                                        {status}
                                    </button>
                                ))}
                                <button onClick={() => setActiveBulkAction('menu')} className="w-full text-center px-4 py-2 text-xs bg-bg-subtle text-text-muted hover:bg-bg-hover">חזרה</button>
                            </div>
                        )}

                        {/* Sub-menu: Priority Selection */}
                        {activeBulkAction === 'priority' && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 bg-white border border-border-default rounded-xl shadow-xl overflow-hidden animate-fade-in">
                                <button onClick={() => handleBulkUpdate('priority', 'רגילה')} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span> רגילה
                                </button>
                                <button onClick={() => handleBulkUpdate('priority', 'דחופה')} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-orange-500"></span> דחופה
                                </button>
                                <button onClick={() => handleBulkUpdate('priority', 'קריטית')} className="w-full text-right px-4 py-3 text-sm hover:bg-bg-hover border-b border-border-subtle flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-red-500"></span> קריטית
                                </button>
                                <button onClick={() => setActiveBulkAction('menu')} className="w-full text-center px-4 py-2 text-xs bg-bg-subtle text-text-muted hover:bg-bg-hover">חזרה</button>
                            </div>
                        )}
                    </div>

                    {/* AI Analysis Button */}
                    <button 
                        onClick={() => setIsAIAnalysisOpen(true)}
                        className="flex items-center gap-1.5 text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-colors font-bold text-sm border border-purple-200"
                    >
                        <SparklesIcon className="w-4 h-4"/>
                        ניתוח חכם
                    </button>

                     <button 
                        onClick={handleBulkDelete} 
                        className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-bold text-sm"
                    >
                        <TrashIcon className="w-4 h-4"/>
                        מחק
                    </button>

                    <div className="h-6 w-px bg-border-default"></div>
                    <button onClick={() => setSelectedIds(new Set())} className="p-1 hover:bg-bg-subtle rounded-full text-text-muted">
                        <XMarkIcon className="w-5 h-5"/>
                    </button>
                </div>
            )}

            <main className="flex-1 overflow-hidden">
                 {sortedAndFilteredJobs.length > 0 ? (
                    viewMode === 'table' ? (
                        <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-right min-w-[1000px]">
                                    <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default">
                                        <tr>
                                            {/* Select Column (Static First) */}
                                            {selectionMode && (
                                                <th className="p-4 w-12 text-center bg-bg-subtle">
                                                     <input 
                                                        type="checkbox" 
                                                        onChange={handleSelectAll} 
                                                        checked={sortedAndFilteredJobs.length > 0 && selectedIds.size === sortedAndFilteredJobs.length}
                                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                    />
                                                </th>
                                            )}

                                            {visibleColumns.map((colId, index) => {
                                                const col = allColumns.find(c => c.id === colId);
                                                if(!col) return null;
                                                return (
                                                    <th 
                                                        key={col.id} 
                                                        draggable 
                                                        onClick={() => requestSort(col.id)}
                                                        onDragStart={() => handleDragStart(index, col.id)} 
                                                        onDragEnter={() => handleDragEnter(index)} 
                                                        onDragEnd={handleDragEnd} 
                                                        onDragOver={(e) => e.preventDefault()} 
                                                        onDrop={handleDrop} 
                                                        className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors bg-bg-subtle ${draggingColumn === col.id ? 'opacity-50' : ''}`}
                                                    >
                                                        <div className="flex items-center gap-1">
                                                            {col.header} 
                                                            {getSortIndicator(col.id)}
                                                        </div>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-subtle">
                                        {sortedAndFilteredJobs.map(job => (
                                            <tr key={job.id} onClick={() => openJobDetails(job)} className={`group hover:bg-bg-hover transition-colors cursor-pointer ${selectedIds.has(job.id) ? 'bg-primary-50/50' : ''}`}>
                                                 {/* Select Cell (Static First) */}
                                                {selectionMode && (
                                                    <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                                         <input 
                                                            type="checkbox" 
                                                            checked={selectedIds.has(job.id)}
                                                            onChange={() => handleSelect(job.id)}
                                                            className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                        />
                                                    </td>
                                                )}

                                                {visibleColumns.map(colId => (
                                                    <td key={colId} className="p-4">
                                                        {renderCell(job, colId)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {sortedAndFilteredJobs.map(job => (
                                <JobCard 
                                    key={job.id} 
                                    job={job} 
                                    onRate={(r) => handleRateJob(job.id, r)}
                                    onUpdatePriority={(p) => handlePriorityUpdate(job.id, p)}
                                    onClick={() => openJobDetails(job)}
                                    selectionMode={selectionMode}
                                    isSelected={selectedIds.has(job.id)}
                                    onSelect={() => handleSelect(job.id)}
                                />
                            ))}
                        </div>
                    )
                ) : (
                    <div className="text-center py-16 flex flex-col items-center">
                        <BriefcaseIcon className="w-16 h-16 text-text-subtle mb-4"/>
                        <h3 className="text-xl font-bold text-text-default">לא נמצאו משרות</h3>
                        <p className="mt-2 text-text-muted">נסה לשנות את תנאי החיפוש או ליצור משרה חדשה.</p>
                    </div>
                )}
            </main>
            
            <JobDetailsDrawer
                job={selectedJob}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
            
            <JobStatusModal 
                isOpen={isStatusModalOpen}
                onClose={() => { setIsStatusModalOpen(false); setJobToEditStatus(null); }}
                currentStatus={jobToEditStatus?.status || 'טיוטה'}
                jobTitle={jobToEditStatus?.title || ''}
                onSave={handleSaveStatus}
            />

            <JobFieldSelector
                value={null}
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
            
            {/* AI Analysis Modal */}
            <JobsAIAnalysisModal 
                isOpen={isAIAnalysisOpen}
                onClose={() => setIsAIAnalysisOpen(false)}
                selectedJobs={jobs.filter(j => selectedIds.has(j.id))}
            />

             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
        </div>
    );
};

export default JobsView;
