
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    BriefcaseIcon, UserGroupIcon, Cog6ToothIcon, PlusIcon, ChevronDownIcon, 
    PencilIcon, SparklesIcon, GenderMaleIcon, GenderFemaleIcon, MapPinIcon, TrashIcon, XMarkIcon,
    BellIcon, ShareIcon, CheckCircleIcon, UserIcon, NoSymbolIcon, TagIcon, InformationCircleIcon,
    MagnifyingGlassIcon, BuildingOffice2Icon, GlobeAmericasIcon, ChevronUpIcon, ExclamationTriangleIcon, CheckIcon
} from './Icons';
import { GoogleGenAI, Type } from '@google/genai';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import LocationSelector, { LocationItem } from './LocationSelector';

// --- TYPES ---
type Priority = 'רגילה' | 'דחופה' | 'קריטית';
type TagMode = 'normal' | 'mandatory' | 'negative';
type TagSource = 'global' | 'company' | 'manual';
type PublicationStatus = 'draft' | 'published';

interface JobSkill {
    id: string;
    name: string;
    mode: TagMode;
    source: TagSource;
}

interface TelephoneQuestion {
    id: number;
    question: string;
    order: number;
    disqualificationReason: string;
}

interface LanguageRequirement {
  id: number;
  language: string;
  level: string;
}

interface RecruitmentSource {
    id: string;
    name: string;
    selected: boolean;
    status: PublicationStatus; // New: Publication status
    alertDays: number | null; // New: Days before expiration (null = no alert)
}

// --- CONSTANTS ---
const priorityOptions = ['רגילה', 'דחופה', 'קריטית'] as const;
const jobTypeOptions = [
    { id: 'משרה מלאה', name: 'משרה מלאה' },
    { id: 'משרה חלקית', name: 'משרה חלקית' },
    { id: 'משמרות', name: 'משמרות' },
    { id: 'פרילנס', name: 'פרילנס' },
    { id: 'זמנית', name: 'זמנית' },
    { id: 'היברידי', name: 'היברידי' }
];
const languageLevels = ['שפת אם', 'רמה גבוהה מאוד', 'טוב מאוד', 'בינוני', 'בסיסי'];

// 1. GLOBAL SYSTEM TAGS (Managed by You/Platform Admin)
const systemTagsList = [
    { id: 'sys_1', name: 'ניהול', synonyms: ['מנהל', 'ראש צוות', 'VP', 'Director'] },
    { id: 'sys_2', name: 'מכירות', synonyms: ['Sales', 'SDR', 'Account Manager', 'מכירה'] },
    { id: 'sys_3', name: 'שיווק', synonyms: ['Marketing', 'Marcom', 'PPC', 'SEO'] },
    { id: 'sys_4', name: 'React', synonyms: ['ReactJS', 'React.js', 'Frontend'] },
    { id: 'sys_5', name: 'Node.js', synonyms: ['NodeJS', 'Backend', 'Express'] },
    { id: 'sys_6', name: 'Fullstack', synonyms: ['Full Stack', 'Web Developer'] },
];

// 2. COMPANY TAGS (Managed by Client Admin in Settings)
const companyTagsList = [
    { id: 'comp_1', name: 'בוגר טכניון', synonyms: ['Technion', 'מכון טכנולוגי'] },
    { id: 'comp_2', name: 'יוצא 8200', synonyms: ['יחידה 8200', 'מודיעין'] },
    { id: 'comp_3', name: 'Cultural Fit', synonyms: ['התאמה תרבותית'] },
    { id: 'comp_4', name: 'זמינות מיידית', synonyms: ['מיידי', 'מתחיל מחר'] },
];

const mockContacts = [
    { id: 1, name: 'ישראל ישראלי', role: 'מנהל גיוס' },
    { id: 2, name: 'דנה כהן', role: 'רכזת גיוס בכירה' },
    { id: 3, name: 'אביב לוי', role: 'מנהל לקוחות' },
    { id: 4, name: 'יעל שחר', role: 'מנהלת HR' },
];

const mockInternalRecruiters = [
    { id: 'r1', name: 'דנה כהן' },
    { id: 'r2', name: 'אביב לוי' },
    { id: 'r3', name: 'יעל שחר' },
    { id: 'r4', name: 'מיכל אלקבץ' },
];

const mockAccountManagers = [
    { id: 'm1', name: 'ישראל ישראלי' },
    { id: 'm2', name: 'שרית בן חיים' },
    { id: 'm3', name: 'גילעד בן חיים' },
];

const disqualificationReasons = [
    "ללא סיבה",
    "ניסיון",
    "שכר",
    "השכלה / הכשרה",
    "זמינות / שעות עבודה",
    "מיקום / ניידות",
    "התאמה לתפקיד / ארגונית",
    "יציבות תעסוקתית",
    "חוסר תגובה",
    "סיבה אישית של המועמד",
    "אחר"
];

const availableSources: RecruitmentSource[] = [
    { id: 'alljobs', name: 'AllJobs', selected: false, status: 'draft', alertDays: null },
    { id: 'linkedin', name: 'LinkedIn', selected: false, status: 'draft', alertDays: null },
    { id: 'jobmaster', name: 'JobMaster', selected: false, status: 'draft', alertDays: null },
    { id: 'drushim', name: 'Drushim', selected: false, status: 'draft', alertDays: null },
    { id: 'facebook', name: 'Facebook', selected: false, status: 'draft', alertDays: null },
    { id: 'friend', name: 'חבר מביא חבר', selected: true, status: 'published', alertDays: 3 },
];

// --- COMPONENTS ---

const SectionCard: React.FC<{ id: string; title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }> = ({ id, title, icon, children, className = '' }) => (
    <div id={id} className={`bg-bg-card border border-border-default rounded-2xl shadow-sm overflow-visible scroll-mt-52 ${className}`}>
        <div className="p-4 border-b border-border-default bg-bg-subtle/30 flex items-center gap-2 rounded-t-2xl">
            <div className="text-primary-500">{icon}</div>
            <h3 className="font-bold text-lg text-text-default">{title}</h3>
        </div>
        <div className="p-6">
            {children}
        </div>
    </div>
);

const TechnicalIdentifiers: React.FC<{ jobId: string; postingCode: string; creationDate: string }> = ({ jobId, postingCode, creationDate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const uniqueEmail = `humand+j${jobId}@app.hiro.co.il`;

    return (
        <div className="mt-6 pt-4 border-t border-border-default">
            <button 
                type="button" 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors w-full justify-end sm:justify-start"
            >
                {isOpen ? 'הסתר מזהים טכניים' : 'הצג מזהים טכניים'}
                {isOpen ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
            </button>

            {isOpen && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-semibold text-text-muted mb-1">מייל ייחודי (לקליטת קו"ח)</label>
                        <input 
                            type="text" 
                            value={uniqueEmail} 
                            disabled 
                            className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed select-all" 
                        />
                    </div>
                     <div>
                        <label className="block text-xs font-semibold text-text-muted mb-1">קוד לפרסום</label>
                        <input 
                            type="text" 
                            value={postingCode} 
                            disabled 
                            className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed text-center" 
                        />
                    </div>
                     <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-text-muted mb-1">מס' משרה</label>
                            <input 
                                type="text" 
                                value={jobId} 
                                disabled 
                                className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed text-center" 
                            />
                        </div>
                        <div>
                             <label className="block text-xs font-semibold text-text-muted mb-1">תאריך יצירה</label>
                            <input 
                                type="text" 
                                value={creationDate} 
                                disabled 
                                className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5 cursor-not-allowed text-center" 
                            />
                        </div>
                     </div>
                </div>
            )}
        </div>
    );
};

const PriorityToggle: React.FC<{
    value: Priority;
    onChange: (value: Priority) => void;
}> = ({ value, onChange }) => {
    const selectedIndex = priorityOptions.indexOf(value);

    return (
        <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">דחיפות</label>
            <div className="relative flex w-full p-1 bg-bg-subtle rounded-lg">
                <div 
                    className="absolute top-1 bottom-1 bg-bg-card rounded-md shadow-sm transition-transform duration-300 ease-in-out"
                    style={{
                        width: 'calc(100% / 3)',
                        transform: `translateX(-${selectedIndex * 100}%)`,
                    }}
                ></div>
                {priorityOptions.map((option) => (
                    <button
                        key={option}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onChange(option); }}
                        className={`relative z-10 flex-1 py-1.5 text-sm font-semibold rounded-md transition-colors duration-200 ${
                            value === option ? 'text-primary-700' : 'text-text-muted hover:text-text-default'
                        }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
        </div>
    );
};

const SourceRow: React.FC<{
    source: RecruitmentSource;
    onToggleSelect: () => void;
    onStatusChange: (newStatus: PublicationStatus) => void;
    onAlertChange: (days: number | null) => void;
}> = ({ source, onToggleSelect, onStatusChange, onAlertChange }) => {
    const [isAlertPopoverOpen, setIsAlertPopoverOpen] = useState(false);
    const [daysInput, setDaysInput] = useState<number>(source.alertDays || 3);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
                setIsAlertPopoverOpen(false);
            }
        };
        if (isAlertPopoverOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAlertPopoverOpen]);

    const handleBellClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsAlertPopoverOpen(!isAlertPopoverOpen);
    };

    const handleEnableAlert = () => {
        onAlertChange(daysInput);
        setIsAlertPopoverOpen(false);
    };

    const handleDisableAlert = () => {
        onAlertChange(null);
        setIsAlertPopoverOpen(false);
    };

    const toggleStatus = (e: React.MouseEvent) => {
        e.stopPropagation();
        const nextStatus = source.status === 'draft' ? 'published' : 'draft';
        onStatusChange(nextStatus);
    };

    return (
        <div className="flex items-center justify-between p-3 border-b border-border-subtle last:border-0 hover:bg-bg-hover transition-colors rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer flex-grow">
                <input 
                    type="checkbox" 
                    checked={source.selected} 
                    onChange={onToggleSelect}
                    className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 transition-all"
                />
                <span className={`text-sm font-medium ${source.selected ? 'text-text-default' : 'text-text-muted'}`}>{source.name}</span>
            </label>
            
            <div className="flex items-center gap-3">
                {source.selected && (
                    <button 
                        onClick={toggleStatus}
                        className={`text-xs font-bold px-3 py-1 rounded-full border transition-all duration-200 ${
                            source.status === 'published' 
                                ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200' 
                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                        }`}
                        title={source.status === 'published' ? 'לחץ להעברה לטיוטה' : 'לחץ לפרסום'}
                    >
                        {source.status === 'published' ? 'פורסם' : 'טיוטה'}
                    </button>
                )}

                {source.selected && (
                    <div className="relative">
                        <button 
                            type="button"
                            onClick={handleBellClick}
                            className={`p-1.5 rounded-full transition-colors relative ${
                                source.alertDays !== null 
                                    ? 'text-primary-600 bg-primary-50 ring-1 ring-primary-200' 
                                    : 'text-text-subtle hover:text-text-default hover:bg-bg-subtle'
                            }`}
                            title={source.alertDays !== null ? `התראה ${source.alertDays} ימים לפני סיום` : 'הגדר התראת סיום'}
                        >
                            <BellIcon className="w-4 h-4" />
                            {source.alertDays !== null && (
                                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500"></span>
                                </span>
                            )}
                        </button>

                        {isAlertPopoverOpen && (
                            <div 
                                ref={popoverRef}
                                className="absolute top-full left-0 mt-2 w-64 bg-bg-card border border-border-default rounded-lg shadow-xl z-50 p-4 animate-fade-in"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="absolute -top-2 left-3 w-4 h-4 bg-bg-card border-t border-l border-border-default transform rotate-45"></div>
                                <h4 className="text-sm font-bold text-text-default mb-3">התראת סיום פרסום</h4>
                                
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-xs text-text-muted mb-1">התראה לפני (ימים):</label>
                                        <input 
                                            type="number" 
                                            min="1" 
                                            max="30" 
                                            value={daysInput} 
                                            onChange={(e) => setDaysInput(Number(e.target.value))}
                                            className="w-full bg-bg-input border border-border-default rounded px-2 py-1 text-sm focus:ring-primary-500 focus:border-primary-500"
                                        />
                                    </div>
                                    
                                    <div className="flex gap-2 pt-1">
                                        <button 
                                            onClick={handleEnableAlert}
                                            className="flex-1 bg-primary-600 text-white text-xs font-bold py-1.5 rounded hover:bg-primary-700 transition"
                                        >
                                            עדכן
                                        </button>
                                        {source.alertDays !== null && (
                                            <button 
                                                onClick={handleDisableAlert}
                                                className="flex-1 bg-bg-subtle text-text-muted text-xs font-bold py-1.5 rounded hover:text-red-500 transition border border-transparent hover:border-border-default"
                                            >
                                                בטל
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const MultiSelect: React.FC<{
    label: string;
    options: { id: string; name: string }[];
    selectedIds: string[];
    onChange: (selectedIds: string[]) => void;
    placeholder?: string;
}> = ({ label, options, selectedIds, onChange, placeholder = 'בחר...' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(item => item !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    const removeTag = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        onChange(selectedIds.filter(item => item !== id));
    };

    return (
        <div className="relative" ref={containerRef}>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
            <div 
                className="w-full bg-bg-input border border-border-default rounded-lg p-2 min-h-[42px] cursor-pointer flex flex-wrap gap-2 items-center"
                onClick={() => setIsOpen(!isOpen)}
            >
                {selectedIds.length === 0 && <span className="text-sm text-text-subtle px-1">{placeholder}</span>}
                {selectedIds.map(id => {
                    const option = options.find(o => o.id === id);
                    if (!option) return null;
                    return (
                        <span key={id} className="bg-primary-50 text-primary-700 text-xs font-semibold px-2 py-1 rounded-md flex items-center gap-1 border border-primary-100">
                            {option.name}
                            <button onClick={(e) => removeTag(e, id)} className="hover:text-primary-900 rounded-full p-0.5">
                                <XMarkIcon className="w-3 h-3" />
                            </button>
                        </span>
                    );
                })}
                 <div className="flex-grow flex justify-end">
                     <ChevronDownIcon className={`w-4 h-4 text-text-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                 </div>
            </div>
            
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    {options.map(option => (
                        <div 
                            key={option.id} 
                            onClick={() => toggleOption(option.id)}
                            className="px-3 py-2 hover:bg-bg-hover cursor-pointer flex items-center gap-2 text-sm"
                        >
                            <input 
                                type="checkbox" 
                                checked={selectedIds.includes(option.id)} 
                                onChange={() => {}} 
                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                            />
                            <span className={selectedIds.includes(option.id) ? 'font-semibold text-primary-700' : 'text-text-default'}>
                                {option.name}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

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
    className?: string;
    includeUnknown?: boolean;
    onIncludeUnknownChange?: (checked: boolean) => void;
    unknownLabel?: string;
    highlight?: boolean;
    colorVar?: string;
}> = ({ label, min, max, step, valueMin, valueMax, onChange, nameMin, nameMax, unit = '', className = '', includeUnknown, onIncludeUnknownChange, unknownLabel, highlight, colorVar = '--color-primary-500' }) => {
    const minVal = Math.min(Number(valueMin), Number(valueMax));
    const maxVal = Math.max(Number(valueMin), Number(valueMax));
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
        <div className={`${className} ${highlight ? 'p-2 -m-2 rounded-lg bg-purple-50/50 border border-purple-100' : ''} max-w-[260px] mx-auto`}>
             <div className="flex flex-col items-center mb-6">
                <label className="text-sm font-semibold text-text-muted flex items-center gap-2 mb-2">
                    {label}
                    {highlight && <SparklesIcon className="w-3 h-3 text-purple-500 animate-pulse" />}
                </label>
                
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

            <div className="relative h-8 flex items-center mb-2" dir="ltr">
                <div className="absolute w-full h-1.5 bg-bg-subtle rounded-full overflow-hidden">
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
             <div className="flex justify-between mt-1 w-full" dir="ltr">
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
                 <label className="flex items-center gap-2 cursor-pointer mt-3 justify-center">
                    <input 
                        type="checkbox" 
                        checked={includeUnknown} 
                        onChange={(e) => onIncludeUnknownChange(e.target.checked)} 
                        className="w-3.5 h-3.5 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                    />
                    <span className="text-xs text-text-subtle">{unknownLabel}</span>
                </label>
            )}
        </div>
    );
};

const SmartTag: React.FC<{ 
    tag: JobSkill; 
    onToggle: (id: string) => void; 
    onRemove: (id: string) => void; 
}> = ({ tag, onToggle, onRemove }) => {
    let baseStyles = "inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer select-none border";
    let icon = null;
    let titleText = "";

    if (tag.mode === 'mandatory') {
        baseStyles += " bg-green-100 text-green-800 border-green-200 hover:bg-green-200";
        icon = <CheckCircleIcon className="w-3.5 h-3.5" />;
        titleText = "תגית חובה (Must Have)";
    } else if (tag.mode === 'negative') {
        baseStyles += " bg-red-100 text-red-800 border-red-200 line-through decoration-red-800/50 hover:bg-red-200";
        icon = <NoSymbolIcon className="w-3.5 h-3.5" />;
        titleText = "תגית שוללת (Killer)";
    } else {
        if (tag.source === 'global') {
             baseStyles += " bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100";
             icon = <SparklesIcon className="w-3.5 h-3.5 text-purple-500"/>;
             titleText = "תגית גלובאלית (כוללת מילים נרדפות)";
        } else if (tag.source === 'company') {
             baseStyles += " bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100";
             icon = <BuildingOffice2Icon className="w-3.5 h-3.5 text-blue-500"/>;
             titleText = "תגית חברה (מוגדרת ע\"י הארגון)";
        } else {
             baseStyles += " bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200";
             icon = <TagIcon className="w-3.5 h-3.5 text-gray-500" />;
             titleText = "מילת מפתח (טקסט חופשי)";
        }
    }

    return (
        <div className={baseStyles} onClick={() => onToggle(tag.id)} title={`${titleText} - לחץ לשינוי מצב`}>
            {icon}
            <span>{tag.name}</span>
            <button 
                onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
                className="ml-1 p-0.5 rounded-full hover:bg-black/10 focus:outline-none"
            >
                <XMarkIcon className="w-3 h-3" />
            </button>
        </div>
    );
};

const EditQuestionModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    question: TelephoneQuestion;
    onSave: (updatedQ: TelephoneQuestion) => void;
}> = ({ isOpen, onClose, question, onSave }) => {
    const [text, setText] = useState(question.question);
    const [reason, setReason] = useState(question.disqualificationReason);

    useEffect(() => {
        setText(question.question);
        setReason(question.disqualificationReason);
    }, [question]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 border border-border-default" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold">עריכת שאלה</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6"/>
                    </button>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">שאלה</label>
                    <input 
                        type="text" 
                        value={text} 
                        onChange={e => setText(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500" 
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">סיבת פסילה</label>
                    <select 
                        value={reason} 
                        onChange={e => setReason(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500"
                    >
                         {disqualificationReasons.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border-default">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                    <button 
                        type="button" 
                        onClick={() => onSave({ ...question, question: text, disqualificationReason: reason })} 
                        className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all"
                    >
                        שמור שינויים
                    </button>
                </div>
            </div>
        </div>
    );
};

const sections = [
    { id: 'general-info', title: 'מידע כללי', icon: <BriefcaseIcon className="w-5 h-5"/> },
    { id: 'description-content', title: 'תיאור ותוכן', icon: <PencilIcon className="w-5 h-5"/> },
    { id: 'conditions-reqs', title: 'תנאים ודרישות', icon: <UserGroupIcon className="w-5 h-5"/> },
    { id: 'distribution', title: 'הפצה וצוות', icon: <ShareIcon className="w-5 h-5"/> },
    { id: 'screening', title: 'סינון', icon: <Cog6ToothIcon className="w-5 h-5"/> },
];

// --- MAIN COMPONENT ---
interface NewJobViewProps {
  onCancel: () => void;
  onSave: (jobData: any) => void;
  isEditing?: boolean;
  jobData?: any;
  isEmbedded?: boolean;
}

const initialJobState = {
    clientName: '', 
    jobId: '10257', 
    postingCode: String(Math.floor(100000 + Math.random() * 900000)), 
    creationDate: new Date().toLocaleDateString('he-IL'),
    status: 'טיוטה', 
    priority: 'רגילה' as Priority, 
    healthProfile: 'standard', 
    jobType: ['משרה מלאה'], 
    jobField: null as SelectedJobField | null,
    contacts: mockContacts.map(c => c.id), 
    jobTitle: '', 
    jobDescription: '', 
    internalNotes: '', 
    requirements: '',
    maritalStatus: 'לא חשוב', 
    mobility: 'לא חשוב', 
    drivingLicense: 'לא חשוב', 
    gender: ['male', 'female'], 
    ageMin: 20, 
    ageMax: 65, 
    includeUnknownAge: true,
    salaryMin: 8000, 
    salaryMax: 15000, 
    includeUnknownSalary: true,
    recruitmentSources: availableSources,
    languages: [] as LanguageRequirement[],
    skills: [] as JobSkill[], 
    locations: [] as LocationItem[], 
    telephoneQuestions: [] as TelephoneQuestion[],
    assignedRecruiters: [] as string[],
    assignedAccountManagers: [] as string[],
};

const NewJobView: React.FC<NewJobViewProps> = ({ onCancel, onSave, isEditing = false, jobData, isEmbedded = false }) => {
    const navigate = useNavigate();
    const { jobId } = useParams<{ jobId: string }>();

    const [formData, setFormData] = useState(initialJobState);
    const [activeSection, setActiveSection] = useState('general-info');
    const [isClientConfirmed, setIsClientConfirmed] = useState(false);
    
    const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
    const [showParseSummary, setShowParseSummary] = useState(false);
    const [parseSummaryData, setParseSummaryData] = useState<{ filled: string[], missing: string[] }>({ filled: [], missing: [] });

    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [pastedJobText, setPastedJobText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [parseSuccess, setParseSuccess] = useState(false);
    
    const [newLanguageName, setNewLanguageName] = useState('');
    const [newLanguageLevel, setNewLanguageLevel] = useState('טובה מאוד');

    const [newSkillText, setNewSkillText] = useState('');
    const [suggestions, setSuggestions] = useState<{global: typeof systemTagsList, company: typeof companyTagsList}>({ global: [], company: [] });
    const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
    const skillInputRef = useRef<HTMLInputElement>(null);

    const [newQuestionText, setNewQuestionText] = useState('');
    const [newQuestionKiller, setNewQuestionKiller] = useState('ללא סיבה');
    const [editingQuestion, setEditingQuestion] = useState<TelephoneQuestion | null>(null);

    const navRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isEditing && jobData) {
             setFormData(prev => ({
                ...prev,
                clientName: jobData.client || prev.clientName,
                jobTitle: jobData.title || prev.jobTitle,
                jobDescription: jobData.description || prev.jobDescription,
                internalNotes: jobData.internalNotes || '',
                salaryMin: jobData.salaryMin || prev.salaryMin,
                salaryMax: jobData.salaryMax || prev.salaryMax,
                status: jobData.status || prev.status,
                priority: jobData.priority || prev.priority,
                healthProfile: jobData.healthProfile || 'standard',
                jobType: Array.isArray(jobData.jobType) ? jobData.jobType : (jobData.jobType ? [jobData.jobType] : ['משרה מלאה']),
                telephoneQuestions: jobData.telephoneQuestions || [],
                languages: jobData.languages || [],
                skills: jobData.skills || [], 
                locations: jobData.locations || [], 
             }));
             if (jobData.client) setIsClientConfirmed(true);
        }
    }, [isEditing, jobData]);

    useEffect(() => {
        const scrollContainer = document.getElementById('main-scroll-container');
        if (!scrollContainer) return;

        const handleScroll = () => {
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const threshold = isEmbedded ? 140 : 100; // Adjusted for sticky nav heights

            let currentSectionId = sections[0].id;

            for (const section of sections) {
                const element = document.getElementById(section.id);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    // Section is active if its top is above the threshold (nav area)
                    if (rect.top <= containerTop + threshold + 20) {
                        currentSectionId = section.id;
                    } else {
                        break; 
                    }
                }
            }
            
            if (activeSection !== currentSectionId) {
                setActiveSection(currentSectionId);
            }
        };

        scrollContainer.addEventListener('scroll', handleScroll);
        handleScroll();
        return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }, [activeSection, isEmbedded]);

    useEffect(() => {
        if (navRef.current && activeSection) {
            const activeButton = navRef.current.querySelector(`[data-section-id="${activeSection}"]`) as HTMLElement;
            if (activeButton) {
                const container = navRef.current;
                const scrollLeft = activeButton.offsetLeft - (container.clientWidth / 2) + (activeButton.clientWidth / 2);
                container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
            }
        }
    }, [activeSection]);


    const scrollToSection = (id: string) => {
        const element = document.getElementById(id);
        const scrollContainer = document.getElementById('main-scroll-container');
        if (element && scrollContainer) {
            const containerTop = scrollContainer.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            const scrollTop = scrollContainer.scrollTop;
            const offset = isEmbedded ? 135 : 110; // Precision offset for landing just below sticky nav
            scrollContainer.scrollTo({ top: scrollTop + elementTop - containerTop - offset, behavior: 'smooth' });
        }
    };

    const handleParseJob = async () => {
        if (!pastedJobText.trim()) return;
        setIsParsing(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                    { text: "אתה עוזר גיוס חכם. נתח את תיאור המשרה הבא וחלץ ממנו את הפרטים לתוך JSON. המפתחות הנדרשים: jobTitle (שם המשרה), jobDescription (תיאור, נקה תווים מיותרים), requirements (דרישות), salaryMin (שכר מינימום, אופציונלי), salaryMax (שכר מקסימום, אופציונלי), city (עיר, אופציונלי). בנוסף, צור רשימה של 3-4 שאלות סינון (screeningQuestions) קריטיות למשרה זו, שנועדו לפסול מועמדים לא מתאימים (לדוגמה: 'האם יש לך ניסיון ב-React?'). לכל שאלה, הצע סיבת פסילה קצרה (disqualificationReason)." },
                    { text: pastedJobText }
                ],
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            jobTitle: { type: Type.STRING },
                            jobDescription: { type: Type.STRING },
                            requirements: { type: Type.STRING },
                            salaryMin: { type: Type.NUMBER },
                            salaryMax: { type: Type.NUMBER },
                            city: { type: Type.STRING },
                            screeningQuestions: {
                                type: Type.ARRAY,
                                items: {
                                    type: Type.OBJECT,
                                    properties: {
                                        question: { type: Type.STRING },
                                        disqualificationReason: { type: Type.STRING }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (response.text) {
                const extractedData = JSON.parse(response.text);
                
                const filled = new Set<string>();
                const filledList: string[] = [];
                const missingList: string[] = [];
                
                if (extractedData.jobTitle) { filled.add('jobTitle'); filledList.push('כותרת המשרה'); } else missingList.push('כותרת המשרה');
                if (extractedData.jobDescription) { filled.add('jobDescription'); filledList.push('תיאור המשרה'); } else missingList.push('תיאור המשרה');
                if (extractedData.salaryMin || extractedData.salaryMax) { filled.add('salaryMin'); filled.add('salaryMax'); filledList.push('טווח שכר'); } else missingList.push('טווח שכר');
                if (extractedData.city) { filled.add('locations'); filledList.push('מיקום'); } else missingList.push('מיקום');
                if (extractedData.screeningQuestions?.length > 0) { filledList.push(`${extractedData.screeningQuestions.length} שאלות סינון`); }

                const newQuestions = extractedData.screeningQuestions?.map((q: any, index: number) => ({
                    id: Date.now() + index,
                    question: q.question,
                    order: index + 1,
                    disqualificationReason: q.disqualificationReason || 'ניסיון'
                })) || [];

                setFormData(prev => ({
                    ...prev,
                    jobTitle: extractedData.jobTitle || prev.jobTitle,
                    jobDescription: extractedData.jobDescription || prev.jobDescription,
                    requirements: extractedData.requirements || prev.requirements,
                    salaryMin: extractedData.salaryMin || prev.salaryMin,
                    salaryMax: extractedData.salaryMax || prev.salaryMax,
                    locations: extractedData.city ? [...prev.locations, { type: 'city', value: extractedData.city }] : prev.locations,
                    telephoneQuestions: newQuestions
                }));
                
                setAiFilledFields(filled);
                setParseSummaryData({ filled: filledList, missing: missingList });
                
                setParseSuccess(true);
                setTimeout(() => {
                    setParseSuccess(false);
                    setIsAIModalOpen(false);
                    setPastedJobText('');
                    setShowParseSummary(true); 
                }, 1000);
            }
        } catch (error) {
            console.error("Parsing error", error);
        } finally {
            setIsParsing(false);
        }
    };
    
    const getInputClass = (name: string, baseClass: string) => {
        if (aiFilledFields.has(name)) {
            return `${baseClass} ring-2 ring-purple-200 bg-purple-50/30 border-purple-300`;
        }
        return baseClass;
    };
    
    const AIIndicator = ({ name }: { name: string }) => {
        if (aiFilledFields.has(name)) {
            return (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-purple-400 pointer-events-none animate-pulse" title="מולא אוטומטית ע״י AI">
                    <SparklesIcon className="w-4 h-4" />
                </div>
            );
        }
        return null;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        let processedValue: string | number | boolean = value;
        if (type === 'number' || type === 'range') processedValue = Number(value);
        if (checked !== undefined) processedValue = checked;
        
        if (aiFilledFields.has(name)) {
            const newSet = new Set(aiFilledFields);
            newSet.delete(name);
            setAiFilledFields(newSet);
        }
        
        setFormData(prev => ({ ...prev, [name]: processedValue }));
    };

    const handleSliderChange = (name: string, value: number) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGenderChange = (g: 'male'|'female') => { 
        setFormData(prev => { 
            const n = [...prev.gender]; 
            if(n.includes(g) && n.length>1) return {...prev, gender: n.filter(x=>x!==g)}; 
            if(!n.includes(g)) n.push(g); 
            return {...prev, gender: n}; 
        }) 
    };
    
    const handleAddLanguage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (newLanguageName) {
            setFormData(prev => ({
                ...prev,
                languages: [...(prev.languages || []), { id: Date.now(), language: newLanguageName, level: newLanguageLevel }]
            }));
            setNewLanguageName('');
        }
    };
    const handleRemoveLanguage = (id: number) => { setFormData(prev => ({...prev, languages: prev.languages.filter(l => l.id !== id)})) };

    const handleSkillInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setNewSkillText(val);
        
        if (val.trim()) {
            const matchedGlobal = systemTagsList.filter(t => 
                t.name.toLowerCase().includes(val.toLowerCase()) || 
                t.synonyms.some(s => s.toLowerCase().includes(val.toLowerCase()))
            );
            const matchedCompany = companyTagsList.filter(t => 
                t.name.toLowerCase().includes(val.toLowerCase()) || 
                t.synonyms.some(s => s.toLowerCase().includes(val.toLowerCase()))
            );
            
            setSuggestions({ global: matchedGlobal, company: matchedCompany });
            setIsSuggestionsOpen(true);
        } else {
            setIsSuggestionsOpen(false);
        }
    };

    const handleSelectTag = (tag: {id: string, name: string}, source: TagSource) => {
         const newTag: JobSkill = {
            id: Date.now().toString(),
            name: tag.name,
            mode: 'normal',
            source: source
        };
        setFormData(prev => ({
            ...prev,
            skills: [...(prev.skills || []), newTag]
        }));
        setNewSkillText('');
        setIsSuggestionsOpen(false);
        skillInputRef.current?.focus();
    };

    const handleAddManualTag = () => {
        if (newSkillText.trim()) {
            const newTag: JobSkill = {
                id: Date.now().toString(),
                name: newSkillText.trim(),
                mode: 'normal',
                source: 'manual'
            };
            setFormData(prev => ({
                ...prev,
                skills: [...(prev.skills || []), newTag]
            }));
            setNewSkillText('');
            setIsSuggestionsOpen(false);
        }
    };

    const handleToggleSmartTag = (id: string) => {
        setFormData(prev => ({
            ...prev,
            skills: prev.skills.map(tag => {
                if (tag.id === id) {
                    const nextMode: TagMode = 
                        tag.mode === 'normal' ? 'mandatory' : 
                        tag.mode === 'mandatory' ? 'negative' : 'normal';
                    return { ...tag, mode: nextMode };
                }
                return tag;
            })
        }));
    };

    const handleRemoveSmartTag = (id: string) => {
        setFormData(prev => ({
            ...prev,
            skills: prev.skills.filter(tag => tag.id !== id)
        }));
    };
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (skillInputRef.current && !skillInputRef.current.parentElement?.contains(event.target as Node)) {
                setIsSuggestionsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const handleAddQuestion = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (newQuestionText) {
            setFormData(prev => ({
                ...prev,
                telephoneQuestions: [...(prev.telephoneQuestions || []), { id: Date.now(), question: newQuestionText, order: (prev.telephoneQuestions?.length || 0) + 1, disqualificationReason: newQuestionKiller }]
            }));
            setNewQuestionText('');
            setNewQuestionKiller('ללא סיבה'); 
        }
    };
    const handleRemoveQuestion = (id: number) => { setFormData(prev => ({...prev, telephoneQuestions: prev.telephoneQuestions.filter(q => q.id !== id)})) };
    
    const handleUpdateQuestion = (updatedQ: TelephoneQuestion) => {
        setFormData(prev => ({
            ...prev,
            telephoneQuestions: prev.telephoneQuestions.map(q => q.id === updatedQ.id ? updatedQ : q)
        }));
        setEditingQuestion(null);
    };

    const toggleContact = (contactId: number) => {
        setFormData(prev => ({
            ...prev,
            contacts: prev.contacts.includes(contactId) 
                ? prev.contacts.filter(id => id !== contactId) 
                : [...prev.contacts, contactId]
        }));
    };

    const toggleSourceSelection = (sourceId: string) => {
        setFormData(prev => ({
            ...prev,
            recruitmentSources: prev.recruitmentSources.map(s => s.id === sourceId ? { ...s, selected: !s.selected } : s)
        }));
    };

    const handleSourceStatusChange = (sourceId: string, newStatus: PublicationStatus) => {
        setFormData(prev => ({
            ...prev,
            recruitmentSources: prev.recruitmentSources.map(s => s.id === sourceId ? { ...s, status: newStatus } : s)
        }));
    };

    const handleSourceAlertChange = (sourceId: string, days: number | null) => {
        setFormData(prev => ({
            ...prev,
            recruitmentSources: prev.recruitmentSources.map(s => s.id === sourceId ? { ...s, alertDays: days } : s)
        }));
    };
    
    const handleLocationsChange = (newLocations: LocationItem[]) => {
        setFormData(prev => ({ ...prev, locations: newLocations }));
    };

    const handleSaveAndContinue = () => { 
        onSave(formData); 
        navigate(`/jobs/${formData.jobId}/publish`);
    };

    const handleJustSave = () => {
        onSave(formData);
        // Optional: show a toast notification here
        alert('השינויים נשמרו בהצלחה');
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                input[type=range]::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    pointer-events: all;
                    width: 18px; height: 18px;
                    background-color: white;
                    border-radius: 50%;
                    border: 3px solid var(--color-primary-500);
                    cursor: pointer;
                    margin-top: -7px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.3s ease-out; }
            `}</style>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                     <h1 className="text-2xl font-extrabold text-text-default">
                        {isEditing ? `עריכת משרה: ${formData.jobTitle}` : 'פתיחת משרה חדשה'}
                    </h1>
                    <p className="text-sm text-text-muted mt-1">
                        מלא את הפרטים ליצירה ופרסום המשרה.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                     <button type="button" onClick={() => setIsAIModalOpen(true)} className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:shadow-lg transition-all transform hover:scale-105">
                        <SparklesIcon className="w-5 h-5"/>
                        <span>ייבוא חכם (AI)</span>
                    </button>
                     <button type="button" onClick={handleSaveAndContinue} className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-md">שמור והמשך</button>
                </div>
            </div>

            <div 
                ref={navRef} 
                className={`sticky top-0 z-50 overflow-x-auto bg-bg-card shadow-sm py-2 -mx-4 px-4 md:mx-0 md:px-0 border-b border-border-default no-scrollbar`}
            >
                <div className="flex items-center md:w-auto rounded-xl gap-1 w-max">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            data-section-id={section.id}
                            type="button"
                            onClick={() => scrollToSection(section.id)}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                                activeSection === section.id 
                                    ? 'bg-primary-100 text-primary-700 shadow-sm' 
                                    : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'
                            }`}
                        >
                            {section.icon}
                            {section.title}
                        </button>
                    ))}
                </div>
            </div>

            {isAIModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-border-default">
                        <div className="p-6">
                            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                                <SparklesIcon className="w-6 h-6 text-primary-500"/>
                                ייבוא משרה באמצעות AI
                            </h3>
                            <p className="text-text-muted mb-4 text-sm">הדבק את תיאור המשרה והמערכת תמלא את הטופס אוטומטית.</p>
                            <textarea
                                value={pastedJobText}
                                onChange={(e) => setPastedJobText(e.target.value)}
                                rows={8}
                                className="w-full bg-bg-input border border-border-default rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary-500 resize-none"
                                placeholder="הדבק כאן את הטקסט..."
                                disabled={isParsing}
                            />
                        </div>
                        <div className="p-4 bg-bg-subtle border-t border-border-default flex justify-end gap-3">
                            <button type="button" onClick={() => setIsAIModalOpen(false)} className="px-5 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition">ביטול</button>
                            <button type="button" onClick={handleParseJob} disabled={isParsing || !pastedJobText} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-bold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                                {isParsing ? 'מנתח...' : 'נתח ומלא טופס'}
                                {parseSuccess && <CheckCircleIcon className="w-5 h-5"/>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {showParseSummary && (
                <div className="fixed bottom-6 right-6 z-[60] bg-bg-card border border-border-default shadow-2xl rounded-xl p-5 max-w-md animate-fade-in">
                    <div className="flex justify-between items-start mb-3">
                        <h4 className="font-bold text-lg flex items-center gap-2">
                            <SparklesIcon className="w-5 h-5 text-purple-500" />
                            סיכום ניתוח AI
                        </h4>
                        <button onClick={() => setShowParseSummary(false)}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                    </div>
                    
                    {parseSummaryData.filled.length > 0 && (
                        <div className="mb-3">
                            <p className="text-xs font-bold text-green-700 uppercase mb-1">הושלם בהצלחה:</p>
                            <div className="flex flex-wrap gap-1">
                                {parseSummaryData.filled.map(f => (
                                    <span key={f} className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100 flex items-center gap-1">
                                        <CheckCircleIcon className="w-3 h-3"/> {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {parseSummaryData.missing.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-orange-700 uppercase mb-1">חסר מידע (להשלמה ידנית):</p>
                            <div className="flex flex-wrap gap-1">
                                {parseSummaryData.missing.map(f => (
                                    <span key={f} className="text-xs bg-orange-50 text-orange-800 px-2 py-0.5 rounded border border-orange-100 flex items-center gap-1">
                                        <ExclamationTriangleIcon className="w-3 h-3"/> {f}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-8">
                <SectionCard id="general-info" title="מידע כללי" icon={<BriefcaseIcon className="w-5 h-5"/>} className="z-10 relative">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">שם הלקוח</label>
                            {isClientConfirmed ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-full bg-primary-50 border border-primary-200 text-primary-900 font-bold text-sm rounded-lg p-2.5 flex items-center justify-between">
                                        <span>{formData.clientName}</span>
                                        <CheckCircleIcon className="w-4 h-4 text-primary-600" />
                                    </div>
                                    <button type="button" onClick={() => setIsClientConfirmed(false)} className="text-sm font-semibold text-text-muted hover:text-primary-600 underline flex-shrink-0">החלף</button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-grow">
                                        <select 
                                            name="clientName" 
                                            value={formData.clientName} 
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                        >
                                            <option value="">בחר לקוח...</option>
                                            <option>בזק</option><option>Wix</option><option>אל-על</option>
                                        </select>
                                    </div>
                                    <button type="button" onClick={() => setIsClientConfirmed(true)} disabled={!formData.clientName} className="bg-primary-600 text-white font-bold p-2.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                        <CheckCircleIcon className="w-5 h-5"/>
                                    </button>
                                </div>
                            )}
                       </div>

                       <div className="lg:col-span-1">
                            <JobFieldSelector 
                                value={formData.jobField}
                                onChange={(value) => setFormData(prev => ({...prev, jobField: value}))}
                                isModalOpen={isJobFieldSelectorOpen}
                                setIsModalOpen={setIsJobFieldSelectorOpen}
                            />
                       </div>
                       
                       <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">פרופיל בריאות (SLA)</label>
                           <div className="relative">
                               <select name="healthProfile" value={formData.healthProfile} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 pr-9 appearance-none focus:ring-primary-500 focus:border-primary-500 cursor-pointer">
                                    <option value="standard">רגיל (Standard)</option>
                                    <option value="high_volume">מסת גיוס (Volume)</option>
                                    <option value="executive">בכירים (Executive)</option>
                                </select>
                               <div className={`absolute top-1/2 left-3 -translate-y-1/2 w-3 h-3 rounded-full ${formData.healthProfile === 'high_volume' ? 'bg-orange-500' : formData.healthProfile === 'executive' ? 'bg-purple-500' : 'bg-green-500'}`}></div>
                               <ChevronDownIcon className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                           </div>
                       </div>
                       
                        <div className="lg:col-span-1">
                             <MultiSelect 
                                label="רכזים משויכים" 
                                options={mockInternalRecruiters} 
                                selectedIds={formData.assignedRecruiters} 
                                onChange={(ids) => setFormData(prev => ({ ...prev, assignedRecruiters: ids }))}
                                placeholder="בחר רכזים..."
                             />
                        </div>

                         <div className="lg:col-span-1">
                             <MultiSelect 
                                label="מנהלי תיק לקוח" 
                                options={mockAccountManagers} 
                                selectedIds={formData.assignedAccountManagers} 
                                onChange={(ids) => setFormData(prev => ({ ...prev, assignedAccountManagers: ids }))}
                                placeholder="בחר מנהלי תיק..."
                             />
                        </div>

                       <div className="lg:col-span-1">
                           <label className="block text-sm font-semibold text-text-muted mb-1.5">סטטוס</label>
                            <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                                <option>טיוטה</option><option>פעילה</option><option>מוקפאת</option>
                            </select>
                       </div>

                       <div className="lg:col-span-1">
                           <MultiSelect
                               label="היקף משרה"
                               options={jobTypeOptions}
                               selectedIds={formData.jobType} 
                               onChange={(ids) => setFormData(prev => ({ ...prev, jobType: ids }))}
                               placeholder="בחר היקף משרה..."
                           />
                       </div>
                       
                       <div className="lg:col-span-1">
                           <PriorityToggle value={formData.priority} onChange={(p) => setFormData(prev => ({ ...prev, priority: p }))} />
                       </div>
                    </div>
                    <TechnicalIdentifiers jobId={formData.jobId} postingCode={formData.postingCode} creationDate={formData.creationDate} />
                </SectionCard>

                <SectionCard id="description-content" title="תיאור ותוכן" icon={<PencilIcon className="w-5 h-5"/>}>
                    <div className="space-y-4">
                        <div className="relative">
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">כותרת המשרה</label>
                            <input 
                                type="text" 
                                name="jobTitle" 
                                value={formData.jobTitle} 
                                onChange={handleChange} 
                                placeholder="לדוגמה: מנהל/ת מוצר בכיר/ה" 
                                className={getInputClass('jobTitle', "w-full bg-bg-input border border-border-default text-text-default text-lg font-bold rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-3 transition shadow-sm")} 
                            />
                             <AIIndicator name="jobTitle" />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">תיאור המשרה</label>
                                <textarea name="jobDescription" value={formData.jobDescription} onChange={handleChange} rows={8} className={getInputClass('jobDescription', "w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-primary-500 focus:border-primary-500 resize-y")} placeholder="פירוט תחומי אחריות..."></textarea>
                                <AIIndicator name="jobDescription" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">הערות פנימיות (לא לפרסום) - רקע צהוב</label>
                                <textarea name="internalNotes" value={formData.internalNotes} onChange={handleChange} rows={8} className="w-full bg-yellow-50 border border-yellow-200 text-text-default text-sm rounded-xl p-3 focus:ring-yellow-500 focus:border-yellow-500 resize-y" placeholder="דגשים לצוות הגיוס..."></textarea>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard id="conditions-reqs" title="תנאים ודרישות" icon={<UserGroupIcon className="w-5 h-5"/>}>
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                         
                         <div className="lg:col-span-3">
                             <h4 className="text-sm font-bold text-text-default mb-2">כישורים ותגיות חכמות</h4>
                             <div className="relative mb-3">
                                 <div className="flex items-center gap-2">
                                     <div className="relative flex-grow max-w-md">
                                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                        <input 
                                            ref={skillInputRef}
                                            type="text" 
                                            value={newSkillText} 
                                            onChange={handleSkillInputChange} 
                                            onKeyDown={(e) => e.key === 'Enter' && handleAddManualTag()}
                                            onFocus={() => { if(newSkillText) setIsSuggestionsOpen(true) }}
                                            placeholder="הקלד תגית (למשל 'React', 'ניהול')..." 
                                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg py-2.5 pl-3 pr-10 focus:ring-primary-500 focus:border-primary-500"
                                        />
                                        
                                        {isSuggestionsOpen && (suggestions.global.length > 0 || suggestions.company.length > 0) && (
                                            <div className="absolute top-full right-0 w-full mt-1 bg-bg-card border border-border-default rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                                {suggestions.global.length > 0 && (
                                                    <div>
                                                        <div className="px-3 py-1.5 bg-bg-subtle text-xs font-bold text-text-muted border-b border-border-subtle sticky top-0 flex items-center gap-2">
                                                            <GlobeAmericasIcon className="w-3.5 h-3.5"/>
                                                            תגיות מערכת
                                                        </div>
                                                        {suggestions.global.map(tag => (
                                                            <button 
                                                                key={tag.id}
                                                                onClick={() => handleSelectTag(tag, 'global')}
                                                                className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover flex flex-col items-start gap-0.5 border-b border-border-subtle/30 last:border-0"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <SparklesIcon className="w-3.5 h-3.5 text-purple-500"/>
                                                                    <span className="font-bold text-text-default">{tag.name}</span>
                                                                </div>
                                                                {tag.synonyms.length > 0 && (
                                                                    <span className="text-xs text-text-muted truncate w-full">
                                                                        {tag.synonyms.join(', ')}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {suggestions.company.length > 0 && (
                                                    <div>
                                                        <div className="px-3 py-1.5 bg-bg-subtle text-xs font-bold text-text-muted border-b border-border-subtle sticky top-0 flex items-center gap-2">
                                                            <BuildingOffice2Icon className="w-3.5 h-3.5"/>
                                                            תגיות חברה
                                                        </div>
                                                        {suggestions.company.map(tag => (
                                                            <button 
                                                                key={tag.id}
                                                                onClick={() => handleSelectTag(tag, 'company')}
                                                                className="w-full text-right px-3 py-2 text-sm hover:bg-bg-hover flex flex-col items-start gap-0.5 border-b border-border-subtle/30 last:border-0"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <BuildingOffice2Icon className="w-3.5 h-3.5 text-blue-500"/>
                                                                    <span className="font-bold text-text-default">{tag.name}</span>
                                                                </div>
                                                                 {tag.synonyms.length > 0 && (
                                                                    <span className="text-xs text-text-muted truncate w-full">
                                                                        {tag.synonyms.join(', ')}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                     </div>
                                     <button 
                                        type="button" 
                                        onClick={handleAddManualTag} 
                                        disabled={!newSkillText} 
                                        className="bg-bg-subtle border border-border-default text-text-default p-2.5 rounded-lg hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 min-w-fit"
                                        title="הוסף כמילת מפתח (טקסט חופשי)"
                                    >
                                        <PlusIcon className="w-4 h-4"/>
                                        <span className="text-xs font-semibold hidden md:inline">הוסף כטקסט</span>
                                    </button>
                                 </div>
                             </div>
                             
                             <div className="flex flex-wrap gap-2 min-h-[40px] p-2 bg-bg-subtle/30 rounded-lg border border-border-default/50">
                                {formData.skills && formData.skills.length > 0 ? (
                                    formData.skills.map(tag => (
                                        <SmartTag 
                                            key={tag.id} 
                                            tag={tag} 
                                            onToggle={handleToggleSmartTag} 
                                            onRemove={handleRemoveSmartTag} 
                                        />
                                    ))
                                ) : (
                                    <span className="text-text-muted text-sm italic p-1">לא נוספו תגיות.</span>
                                )}
                             </div>
                             
                             <div className="flex items-center gap-4 mt-2 text-xs text-text-subtle flex-wrap">
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-gray-200 border border-gray-300"></div> רגיל (עדיפות)</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-200 border border-green-300"></div><CheckCircleIcon className="w-3 h-3 text-green-600"/> חובה (Must)</span>
                                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-200 border border-red-300"></div><NoSymbolIcon className="w-3 h-3 text-red-600"/> שלילה (Killer)</span>
                                <span className="flex items-center gap-1 mr-2 border-r border-border-subtle pr-2"><SparklesIcon className="w-3 h-3 text-purple-500"/> מערכת</span>
                                <span className="flex items-center gap-1 mr-2"><BuildingOffice2Icon className="w-3 h-3 text-blue-500"/> חברה</span>
                                <span className="flex items-center gap-1"><TagIcon className="w-3 h-3 text-gray-500"/> ידני</span>
                             </div>
                         </div>

                         <div className="lg:col-span-3 mt-4 border-t border-border-default pt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">שפות נדרשות</h4>
                             <div className="flex items-end gap-2 mb-3 max-w-md">
                                 <div className="flex-grow">
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">שפה</label>
                                     <input type="text" value={newLanguageName} onChange={(e) => setNewLanguageName(e.target.value)} placeholder="אנגלית" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"/>
                                 </div>
                                  <div className="w-40">
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">רמה</label>
                                     <select value={newLanguageLevel} onChange={(e) => setNewLanguageLevel(e.target.value)} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
                                         {languageLevels.map(l => <option key={l} value={l}>{l}</option>)}
                                     </select>
                                 </div>
                                 <button type="button" onClick={handleAddLanguage} className="bg-primary-100 text-primary-700 p-2.5 rounded-lg hover:bg-primary-200"><PlusIcon className="w-5 h-5"/></button>
                             </div>
                             <div className="flex flex-wrap gap-2">
                                 {formData.languages && formData.languages.map(lang => (
                                     <span key={lang.id} className="flex items-center gap-1 bg-white border border-border-default px-2 py-1 rounded-md text-sm">
                                         {lang.language} - {lang.level}
                                         <button type="button" onClick={() => handleRemoveLanguage(lang.id)} className="text-text-subtle hover:text-red-500"><XMarkIcon className="w-3 h-3"/></button>
                                     </span>
                                 ))}
                             </div>
                         </div>

                        <div className="lg:col-span-3 mt-4 border-t border-border-default pt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">שכר ותנאים</h4>
                             <div className={`bg-bg-subtle/30 p-4 rounded-xl border border-border-default/50 ${aiFilledFields.has('salaryMin') ? 'ring-2 ring-purple-100' : ''}`}>
                                 <div className="relative">
                                    <DoubleRangeSlider 
                                        label="טווח שכר חודשי" 
                                        min={5000} 
                                        max={50000} 
                                        step={500} 
                                        valueMin={formData.salaryMin} 
                                        valueMax={formData.salaryMax} 
                                        onChange={handleChange} 
                                        nameMin="salaryMin" 
                                        nameMax="salaryMax" 
                                        unit="₪" 
                                        includeUnknown={formData.includeUnknownSalary}
                                        onIncludeUnknownChange={(checked) => setFormData(prev => ({...prev, includeUnknownSalary: checked}))}
                                        unknownLabel="כלול ציפיות שכר לא ידועות"
                                        highlight={aiFilledFields.has('salaryMin')}
                                        colorVar="--color-primary-500"
                                    />
                                    <AIIndicator name="salaryMin" />
                                </div>
                                 <div className="mt-4 flex flex-wrap gap-4">
                                     <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">רשיון נהיגה</label>
                                        <select name="drivingLicense" value={formData.drivingLicense} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 min-w-[150px]">
                                            <option>לא חשוב</option><option>B</option><option>C</option>
                                        </select>
                                     </div>
                                     <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">ניידות</label>
                                        <select name="mobility" value={formData.mobility} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 min-w-[150px]">
                                            <option>לא חשוב</option><option>חובה</option>
                                        </select>
                                     </div>
                                 </div>
                             </div>
                        </div>

                        <div className="lg:col-span-3 mt-4">
                             <h4 className="text-sm font-bold text-text-default mb-4">דמוגרפיה (אופציונלי)</h4>
                             <div className="flex items-center gap-4">
                                 <div className="flex items-center gap-2">
                                     <span className="text-sm font-semibold text-text-muted">מין:</span>
                                     <div className="flex gap-1">
                                         <button type="button" onClick={() => handleGenderChange('male')} className={`p-1.5 rounded-lg border ${formData.gender.includes('male') ? 'bg-blue-100 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-400'}`}><GenderMaleIcon className="w-5 h-5"/></button>
                                         <button type="button" onClick={() => handleGenderChange('female')} className={`p-1.5 rounded-lg border ${formData.gender.includes('female') ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-white border-gray-200 text-gray-400'}`}><GenderFemaleIcon className="w-5 h-5"/></button>
                                     </div>
                                 </div>
                                  <div className="flex-grow max-w-sm">
                                     <DoubleRangeSlider 
                                        label="גילאים" 
                                        min={18} 
                                        max={70} 
                                        step={1} 
                                        valueMin={formData.ageMin} 
                                        valueMax={formData.ageMax} 
                                        onChange={handleChange} 
                                        nameMin="ageMin" 
                                        nameMax="ageMax" 
                                        includeUnknown={formData.includeUnknownAge}
                                        onIncludeUnknownChange={(checked) => setFormData(prev => ({...prev, includeUnknownAge: checked}))}
                                        unknownLabel="כלול גיל לא ידוע"
                                        className="" 
                                        colorVar="--color-secondary-500"
                                    />
                                  </div>
                             </div>
                        </div>
                     </div>
                </SectionCard>
                
                <SectionCard id="distribution" title="הפצה וצוות" icon={<ShareIcon className="w-5 h-5"/>}>
                     <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                         <div>
                             <h4 className="font-bold text-text-default mb-3 flex items-center justify-between">
                                 <span>אנשי קשר למשרה</span>
                                 <span className="text-xs font-normal text-text-muted">ברירת מחדל: כולם</span>
                             </h4>
                             <div className="space-y-2 max-h-60 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/30">
                                 {mockContacts.map(contact => (
                                     <label key={contact.id} className="flex items-center gap-3 p-2 hover:bg-bg-hover rounded cursor-pointer">
                                         <input 
                                            type="checkbox" 
                                            checked={formData.contacts.includes(contact.id)} 
                                            onChange={() => toggleContact(contact.id)}
                                            className="w-4 h-4 text-primary-600 rounded"
                                         />
                                         <div className="flex-grow">
                                             <div className="font-semibold text-sm">{contact.name}</div>
                                             <div className="text-xs text-text-muted">{contact.role}</div>
                                         </div>
                                     </label>
                                 ))}
                             </div>
                         </div>

                         <div>
                             <h4 className="font-bold text-text-default mb-3">פרסום והתראות</h4>
                             <div className="space-y-2 max-h-60 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/30">
                                 {formData.recruitmentSources.map(source => (
                                     <SourceRow 
                                        key={source.id} 
                                        source={source} 
                                        onToggleSelect={() => toggleSourceSelection(source.id)}
                                        onStatusChange={(status) => handleSourceStatusChange(source.id, status)}
                                        onAlertChange={(days) => handleSourceAlertChange(source.id, days)}
                                     />
                                 ))}
                             </div>
                         </div>
                     </div>
                </SectionCard>

                <SectionCard id="location-settings" title="מיקום גיאוגרפי" icon={<MapPinIcon className="w-5 h-5"/>}>
                     <div className="space-y-4">
                        <div className="flex flex-col md:flex-row gap-4 items-end relative">
                             <AIIndicator name="locations" />
                            <div className="flex-grow w-full">
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">הוסף מיקום (עיר/אזור)</label>
                                <LocationSelector
                                    selectedLocations={formData.locations}
                                    onChange={handleLocationsChange}
                                    className="w-full"
                                />
                            </div>
                        </div>
                     </div>
                </SectionCard>

                 <SectionCard id="screening" title="שאלות סינון (Automation)" icon={<Cog6ToothIcon className="w-5 h-5"/>}>
                     <div className="space-y-4">
                         <div>
                             <h4 className="text-sm font-bold text-text-default mb-3">שאלות לסינון טלפוני</h4>
                             <div className="space-y-3 mb-4">
                                 {formData.telephoneQuestions.map((q, idx) => (
                                     <div key={q.id} className="flex items-center gap-3 bg-bg-subtle/50 p-3 rounded-lg border border-border-default group hover:border-primary-300 transition-colors">
                                         <span className="font-bold text-text-muted text-sm">#{idx+1}</span>
                                         <div className="flex-grow">
                                             <div className="font-medium text-sm text-text-default">{q.question}</div>
                                             {q.disqualificationReason && <div className="text-xs text-red-600">סיבת פסילה: {q.disqualificationReason}</div>}
                                         </div>
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <button type="button" onClick={() => setEditingQuestion(q)} className="p-1.5 text-text-subtle hover:text-primary-600 rounded-full hover:bg-bg-hover"><PencilIcon className="w-4 h-4"/></button>
                                             <button type="button" onClick={() => handleRemoveQuestion(q.id)} className="p-1.5 text-text-subtle hover:text-red-500 rounded-full hover:bg-bg-hover"><TrashIcon className="w-4 h-4"/></button>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                             
                             <div className="flex flex-col gap-3 bg-primary-50/30 p-4 rounded-xl border border-primary-100">
                                 <div>
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">שאלה</label>
                                     <input type="text" name="newQuestionText" value={newQuestionText} onChange={(e) => setNewQuestionText(e.target.value)} placeholder="האם יש לך ניסיון ב...?" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                                 </div>
                                 <div>
                                     <label className="block text-sm font-semibold text-text-muted mb-1.5">קטגוריית פסילה</label>
                                     <select 
                                        name="newQuestionKiller" 
                                        value={newQuestionKiller} 
                                        onChange={(e) => setNewQuestionKiller(e.target.value)} 
                                        className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                     >
                                         {disqualificationReasons.map(reason => (
                                             <option key={reason} value={reason}>{reason}</option>
                                         ))}
                                     </select>
                                 </div>
                                 <button type="button" onClick={handleAddQuestion} className="w-full bg-primary-100 text-primary-700 font-bold py-2 rounded-lg hover:bg-primary-200 mt-2">הוסף שאלה</button>
                             </div>
                         </div>
                     </div>
                 </SectionCard>
            </div>
            
             {editingQuestion && (
                <EditQuestionModal 
                    isOpen={!!editingQuestion} 
                    onClose={() => setEditingQuestion(null)} 
                    question={editingQuestion} 
                    onSave={handleUpdateQuestion} 
                />
            )}
            <div className="sticky bottom-0 z-30 p-4 bg-bg-card border-t border-border-default flex justify-between items-center -mx-4 md:mx-0 rounded-b-2xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                <div className="text-xs text-text-muted">
                    * שינויים נשמרים בטיוטה
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={handleJustSave} className="bg-bg-subtle text-text-default font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover border border-border-default transition">
                        שמור (ללא מעבר)
                    </button>
                    {/* Ensure floating AI button (z-40) is not covered. This bar is z-30. */}
                </div>
            </div>
        </div>
    );
};

export default NewJobView;
