import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XMarkIcon, MagnifyingGlassIcon, BriefcaseIcon, FunnelIcon, CalendarDaysIcon, PlusIcon, MegaphoneIcon, ChevronDownIcon, RocketLaunchIcon, MinusIcon } from './Icons';
import TagSelectorModal from './TagSelectorModal';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import JobFieldSelector from './JobFieldSelector';
import { fetchJobsForCompose, type JobComposeRow } from '../services/jobsApi';
import {
    type ComplexFilterRule,
    type ComplexQueryOperator,
    createEmptyComplexRule,
} from '../utils/complexQuery';

export type { ComplexFilterRule, ComplexQueryOperator };
export { createEmptyComplexRule, serializeComplexRulesForApi } from '../utils/complexQuery';

export const CATEGORIZED_FIELDS = [
    {
        category: 'כללי',
        icon: FunnelIcon,
        fields: [
            { value: 'text', label: 'טקסט חופשי' },
            { value: 'registration_date', label: 'תאריך קליטה' },
            { value: 'update_date', label: 'תאריך עדכון' },
            { value: 'candidate_status', label: 'איכות (סטאטוס)' },
        ]
    },
    {
        category: 'תעסוקה וכישורים',
        icon: BriefcaseIcon,
        fields: [
            { value: 'last_role', label: 'תפקיד אחרון' },
            { value: 'job_type', label: 'תחומי התעניינות' },
            { value: 'job_type_missing', label: 'חסרה התעניינות' },
            { value: 'mobility', label: 'ניידות' },
            { value: 'driving_license', label: 'רשיון נהיגה' },
            { value: 'missing_tag', label: 'חסרה תגית' },
        ]
    },
    {
        category: 'תהליך גיוס',
        icon: RocketLaunchIcon,
        fields: [
            { value: 'specific_job', label: 'משרה ספציפית' },
            { value: 'job_referrals', label: 'הפניות למשרה' },
            { value: 'disqualification_reasons', label: 'סיבות פסילה' },
            { value: 'events', label: 'אירועים' },
            { value: 'events_missing', label: 'חסר אירוע' },
        ]
    },
    {
        category: 'מקורות וערוצים',
        icon: MegaphoneIcon,
        fields: [
            { value: 'recruitment_source', label: 'מקור גיוס נוכחי/ראשוני' },
            { value: 'distribution_channels', label: 'ערוצי תפוצה' },
            { value: 'sender_address', label: 'כתובת השולח' },
        ]
    }
];

export const COMPLEX_QUERY_FIELDS = CATEGORIZED_FIELDS.flatMap(cat => cat.fields);

const FieldSelector = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selectedField = COMPLEX_QUERY_FIELDS.find(f => f.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredCategories = CATEGORIZED_FIELDS.map(cat => ({
        ...cat,
        fields: cat.fields.filter(f => f.label.toLowerCase().includes(searchTerm.toLowerCase()))
    })).filter(cat => cat.fields.length > 0);

    return (
        <div className="relative w-full md:w-64 shrink-0" ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-bg-card px-3 py-2.5 rounded-xl border border-border-default text-sm flex justify-between items-center hover:border-primary-400 transition-all font-bold text-text-default shadow-sm min-h-[48px] md:min-h-[42px]"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {selectedField ? (
                        <>
                            {CATEGORIZED_FIELDS.find(cat => cat.fields.some(f => f.value === value))?.icon && (
                                React.createElement(CATEGORIZED_FIELDS.find(cat => cat.fields.some(f => f.value === value))!.icon, { className: "w-4 h-4 text-primary-500 shrink-0" })
                            )}
                            <span className="truncate">{selectedField.label}</span>
                        </>
                    ) : (
                        <span className="text-text-muted">בחר שדה לחיפוש...</span>
                    )}
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <>
                    {/* Backdrop for mobile */}
                    <div className="fixed inset-0 bg-black/20 z-40 md:hidden animate-in fade-in" onClick={() => setIsOpen(false)} />
                    
                    <div className="fixed inset-x-4 bottom-4 md:absolute md:inset-auto md:top-full md:left-0 md:mt-2 z-50 w-auto md:w-72 bg-bg-card border border-border-default rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-1">
                        <div className="p-3 border-b border-border-default bg-bg-subtle/30">
                            <div className="relative">
                                <MagnifyingGlassIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                <input
                                    type="text"
                                    placeholder="חיפוש שדה..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-bg-surface border border-border-default pr-9 pl-3 py-2.5 md:py-2 rounded-xl text-sm outline-none focus:border-primary-400"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="max-h-[60vh] md:max-h-96 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border-default">
                            {filteredCategories.length > 0 ? (
                                filteredCategories.map(cat => (
                                    <div key={cat.category} className="mb-4 last:mb-2">
                                        <div className="px-3 py-1.5 text-[10px] font-black text-text-muted uppercase tracking-[0.1em] flex items-center gap-2 mb-1">
                                            {cat.icon && <cat.icon className="w-3.5 h-3.5" />}
                                            {cat.category}
                                        </div>
                                        <div className="grid grid-cols-1 gap-1">
                                            {cat.fields.map(field => (
                                                <button
                                                    type="button"
                                                    key={field.value}
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onChange(field.value);
                                                        setIsOpen(false);
                                                        setSearchTerm('');
                                                    }}
                                                    className={`w-full text-right px-4 py-3 md:py-2 text-sm rounded-xl transition-all flex items-center justify-between group ${value === field.value ? 'bg-primary-600 text-white font-bold shadow-md shadow-primary-500/20' : 'text-text-default hover:bg-primary-50 hover:text-primary-800'}`}
                                                >
                                                    <span>{field.label}</span>
                                                    {value === field.value ? (
                                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                                    ) : (
                                                        <PlusIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-8 text-center text-sm text-text-muted italic flex flex-col items-center gap-2">
                                    <MagnifyingGlassIcon className="w-8 h-8 opacity-20" />
                                    לא נמצאו שדות מתאימים
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const JOB_TYPES = ['פיתוח תוכנה', 'בקרת איכות', 'מוצר', 'עיצוב', 'שיווק', 'מכירות', 'משאבי אנוש', 'כספים'];
const STATUSES = ['פעיל', 'חסר פרטים', 'חסום'];
const SPECIFIC_JOB_STATUSES = ['הוגש למשרה', 'נשלחו קורות חיים', 'בתהליך הערכה', 'ראיון טלפוני', 'ראיון פרונטלי', 'הצעת שכר', 'מועמד סירב', 'נדחה', 'התקבל'];
const MOBILITY = ['בעל רכב פרטי', 'לא נייד', 'תחבורה ציבורית', 'לא צוין'];
const LICENSES = ['אין', 'B', 'B1', 'C1', 'C', 'A1', 'A', 'לא צוין'];
const SOURCES = ['אולג\'ובס', 'דרושים IL', 'ג\'ובמאסטר', 'לינקדאין', 'פייסבוק', 'חבר מביא חבר', 'אתר חברה'];
const CHANNELS = ['דוא"ל', 'סמס', 'ווטסאפ'];
const DISQUALIFICATION_REASONS = ['שכר גבוה מידי', 'חוסר ניסיון', 'לא זמין', 'לא עבר ראיון טכני', 'פער תרבותי'];
const EVENT_TYPES = ['ראיון טלפוני', 'ראיון פרונטלי', 'ראיון זום', 'מבחן בית', 'הצעת שכר'];
const JOB_STATUSES = ['פעילה', 'מוקפאת', 'טיוטה', 'סגורה'];
const RECRUITERS = ['משה לוי', 'ישראל ישראלי', 'גילעד בן חיים', 'שיר כהן', 'רונית אברהם'];
const CLIENTS = ['אלביט מערכות', 'רפאל', 'התעשייה האווירית', 'מייקרוסופט', 'גוגל ישראל'];
const UPDATE_TYPES = ['מערכת', 'משתמש', 'מועמד'];


// Mini Select for Arrays
const MultiSelect = ({ options, value = [], onChange, placeholder, allowSelectAll = false, className }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const currentVals = Array.isArray(value) ? value : [];

    const toggleOption = (opt: string) => {
        if (currentVals.includes(opt)) {
            onChange(currentVals.filter(v => v !== opt));
        } else {
            onChange([...currentVals, opt]);
        }
    };
    
    const selectAll = () => onChange(options);
    const clearAll = () => onChange([]);

    return (
        <div className={`relative ${className || 'flex-grow w-full'}`} ref={dropdownRef}>
            <div 
                className="bg-bg-card px-3 py-2.5 rounded-xl border border-border-default text-sm flex justify-between items-center cursor-pointer hover:border-primary-400 min-h-[48px] md:min-h-[42px] font-medium text-text-default shadow-sm transition-all"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex flex-wrap gap-1.5 flex-grow overflow-hidden">
                    {currentVals.length === 0 ? (
                        <span className="text-text-muted">{placeholder || 'בחר מהרשימה...'}</span>
                    ) : (
                        currentVals.map(val => (
                            <span key={val} className="bg-primary-600 text-white px-2.5 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm">
                                {val}
                                <button type="button" onClick={(e) => { e.stopPropagation(); toggleOption(val); }} className="hover:bg-white/20 rounded-full p-0.5 transition-colors">
                                    <XMarkIcon className="w-3 h-3" />
                                </button>
                            </span>
                        ))
                    )}
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-text-muted shrink-0 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            
            {isOpen && (
                <>
                    {/* Backdrop for mobile */}
                    <div className="fixed inset-0 bg-black/20 z-40 md:hidden animate-in fade-in" onClick={() => setIsOpen(false)} />
                    
                    <div className="fixed inset-x-4 bottom-4 md:absolute md:inset-auto md:top-full md:left-0 md:mt-2 z-50 w-auto md:w-full min-w-[240px] bg-bg-card border border-border-default rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-1">
                        {allowSelectAll && (
                            <div className="flex gap-2 p-3 border-b border-border-default bg-bg-subtle/30">
                                <button className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-xl font-bold text-xs hover:bg-primary-700 transition shadow-md shadow-primary-500/20" onClick={(e) => { e.stopPropagation(); selectAll(); }}>בחר הכל</button>
                                <button className="flex-1 px-3 py-2 bg-bg-surface text-text-muted border border-border-default rounded-xl font-bold text-xs hover:bg-bg-hover transition" onClick={(e) => { e.stopPropagation(); clearAll(); }}>נקה הכל</button>
                            </div>
                        )}
                        <div className="max-h-[50vh] md:max-h-64 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border-default">
                            {options.map((opt: string) => {
                                const isSelected = currentVals.includes(opt);
                                return (
                                    <div 
                                        key={opt}
                                        className={`px-3 py-3 md:py-2.5 text-sm cursor-pointer flex items-center gap-3 rounded-xl transition-all group ${isSelected ? 'bg-primary-50 text-primary-800 font-bold' : 'text-text-default hover:bg-primary-50'}`}
                                        onClick={(e) => { e.stopPropagation(); toggleOption(opt); }}
                                    >
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected ? 'bg-primary-600 border-primary-600 shadow-sm' : 'bg-bg-surface border-border-default group-hover:border-primary-400'}`}>
                                            <div className={`w-2.5 h-2.5 bg-white rounded-sm transition-transform ${isSelected ? 'scale-100' : 'scale-0'}`} />
                                        </div>
                                        <span>{opt}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

type JobPickerRow = { id: string; title: string; reqCode: string; status: string };

// Modals
export const JobSelectorModal = ({ isOpen, onClose, onSelect, isMulti = false, selectedIds = [] }: any) => {
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('הכל');
    const [localSelected, setLocalSelected] = useState<string[]>(Array.isArray(selectedIds) ? selectedIds : []);
    const [allJobs, setAllJobs] = useState<JobPickerRow[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setJobsLoading(true);
        fetchJobsForCompose()
            .then((rows: JobComposeRow[]) => {
                if (cancelled) return;
                setAllJobs(
                    rows.map((j) => ({
                        id: String(j.id),
                        title: String(j.title || '—'),
                        reqCode: String(j.postingCode || j.id).slice(0, 32),
                        status: 'פעילה',
                    })),
                );
            })
            .catch(() => {
                if (!cancelled) setAllJobs([]);
            })
            .finally(() => {
                if (!cancelled) setJobsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen]);
    
    if (!isOpen) return null;
    
    const jobs = allJobs.filter(j => 
        (statusFilter === 'הכל' || j.status === statusFilter) && 
        (j.title.toLowerCase().includes(search.toLowerCase()) || j.reqCode.includes(search))
    );

    const toggleJob = (job: any) => {
        if (!isMulti) {
            onSelect(job);
        } else {
            setLocalSelected(prev => 
                prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id]
            );
        }
    };

    const handleConfirm = () => {
        const selectedMocks = allJobs.filter(j => localSelected.includes(j.id));
        onSelect(selectedMocks);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-surface">
                    <h3 className="font-bold text-lg text-text-default flex items-center gap-2">
                        <BriefcaseIcon className="w-5 h-5 text-primary-500" /> בחירת משרה
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-default p-1"><XMarkIcon className="w-5 h-5"/></button>
                </div>
                
                <div className="p-4 border-b border-border-default bg-bg-subtle/30 space-y-3">
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                        <input 
                            type="text" 
                            placeholder="חיפוש משרה / מזהה..." 
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full bg-bg-surface border border-border-default pl-4 pr-9 py-2 rounded-lg text-sm outline-none focus:border-primary-400"
                        />
                    </div>
                    <div className="flex gap-2">
                        {['הכל', 'פעילה', 'מוקפאת', 'טיוטה', 'סגורה'].map(st => (
                            <button 
                                key={st} 
                                onClick={() => setStatusFilter(st)}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusFilter === st ? 'bg-primary-50 text-primary-700 border-primary-200' : 'bg-bg-surface text-text-muted border-border-default hover:bg-bg-subtle'}`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="overflow-y-auto p-2">
                    {jobsLoading && (
                        <p className="text-center text-text-muted p-4 text-sm">טוען משרות...</p>
                    )}
                    {!jobsLoading && jobs.map(job => {
                        const isSelected = localSelected.includes(job.id);
                        return (
                            <div 
                                key={job.id} 
                                onClick={() => toggleJob(job)}
                                className={`p-3 m-1 border rounded-xl cursor-pointer flex justify-between items-center transition ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:border-primary-300 hover:bg-primary-50/30'}`}
                            >
                                <div>
                                    <h4 className={`font-bold text-sm ${isSelected ? 'text-primary-800' : 'text-text-default'}`}>{job.title}</h4>
                                    <p className="text-xs text-text-muted">מזהה: {job.reqCode}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                                    job.status === 'פעילה' ? 'bg-green-100 text-green-700' : 
                                    job.status === 'סגורה' ? 'bg-bg-muted text-text-subtle' : 'bg-orange-100 text-orange-700'
                                }`}>{job.status}</span>
                            </div>
                        );
                    })}
                    {jobs.length === 0 && <p className="text-center text-text-muted p-6 text-sm">לא נמצאו משרות</p>}
                </div>
                
                {isMulti && (
                    <div className="p-3 border-t border-border-default bg-bg-surface flex justify-between items-center">
                        <span className="text-xs font-semibold text-text-muted">נבחרו {localSelected.length} משרות</span>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-default hover:bg-bg-hover">ביטול</button>
                            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700">אישור</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const EventSelectorModal = ({ isOpen, onClose, onSelect, isMulti = false, selectedIds = [] }: any) => {
    const [search, setSearch] = useState('');
    const [localSelected, setLocalSelected] = useState<string[]>(Array.isArray(selectedIds) ? selectedIds : []);
    
    if (!isOpen) return null;

    const toggleEvent = (ev: string) => {
        if (!isMulti) {
            onSelect(ev);
        } else {
            setLocalSelected(prev => 
                prev.includes(ev) ? prev.filter(id => id !== ev) : [...prev, ev]
            );
        }
    };

    const handleConfirm = () => {
        onSelect(localSelected);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl w-full max-w-sm shadow-xl flex flex-col">
                <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-surface">
                    <h3 className="font-bold text-lg text-text-default flex items-center gap-2">
                        <CalendarDaysIcon className="w-5 h-5 text-primary-500" /> בחירת אירוע
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-text-default p-1"><XMarkIcon className="w-5 h-5"/></button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh] space-y-1">
                    {EVENT_TYPES.map(ev => {
                        const isSelected = localSelected.includes(ev);
                        return (
                            <button 
                                key={ev} 
                                onClick={() => toggleEvent(ev)}
                                className={`w-full text-right p-3 border rounded-lg transition font-medium text-sm ${isSelected ? 'border-primary-500 bg-primary-50 text-primary-800' : 'border-border-default hover:bg-primary-50/50 text-text-default hover:text-primary-700'}`}
                            >
                                {ev}
                            </button>
                        )
                    })}
                </div>
                {isMulti && (
                    <div className="p-3 border-t border-border-default bg-bg-surface flex justify-between items-center">
                        <span className="text-xs font-semibold text-text-muted">נבחרו {localSelected.length} אירועים</span>
                        <div className="flex gap-2">
                            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-default hover:bg-bg-hover">ביטול</button>
                            <button onClick={handleConfirm} className="px-5 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700">אישור</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export const ComplexRuleRow = ({
    rule,
    onChange,
    onPatch,
    onRemove,
    isFirstRule = false,
}: {
    rule: ComplexFilterRule;
    onChange: (id: string, field: keyof ComplexFilterRule, value: unknown) => void;
    /** Apply several fields in one update (avoids stale state when changing field type). */
    onPatch: (id: string, patch: Partial<ComplexFilterRule>) => void;
    onRemove: (id: string) => void;
    /** First row OR merges panel filters (גיל, שכר…) with this rule via OR, not only between complex rows. */
    isFirstRule?: boolean;
}) => {
    const [isJobModalOpen, setJobModalOpen] = useState(false);
    const [isSpecificJobModalOpen, setSpecificJobModalOpen] = useState(false);
    const [isEventModalOpen, setEventModalOpen] = useState(false);
    const [isTagModalOpen, setTagModalOpen] = useState(false);
    
    const handleFieldChange = (val: string) => {
        onPatch(rule.id, {
            field: val,
            value: '',
            textValue: '',
            dateRange: null,
            secondaryValue: undefined,
            candidateStatus: undefined,
            jobStatuses: undefined,
            recruiters: undefined,
            clientValue: undefined,
            updaterTypes: undefined,
        });
    };

    const renderInput = () => {
        switch(rule.field) {
            case 'text':
            case 'last_role':
            case 'sender_address':
                return (
                    <div className="flex-grow flex flex-col md:flex-row gap-3 items-start md:items-center w-full">
                        <textarea 
                            placeholder={
                                rule.field === 'last_role' ? "הזן תפקידים לחיפוש (כל תפקיד בשורה נפרדת)..." : 
                                rule.field === 'sender_address' ? "הזן כתובות מייל לחיפוש..." :
                                "הזן ביטויים לחיפוש (כל ביטוי בשורה נפרדת)..."
                            }
                            value={rule.value || ''}
                            onChange={e => {
                                onChange(rule.id, 'value', e.target.value);
                                // Auto-resize with 10 lines cap
                                e.target.style.height = 'auto';
                                const newHeight = Math.min(e.target.scrollHeight, 240);
                                e.target.style.height = newHeight + 'px';
                            }}
                            onFocus={e => {
                                e.target.style.height = 'auto';
                                const newHeight = Math.min(e.target.scrollHeight, 240);
                                e.target.style.height = newHeight + 'px';
                            }}
                            className="bg-bg-subtle/50 px-3 py-2 rounded-xl border border-border-default text-sm flex-grow outline-none focus:border-primary-300 w-full min-h-[64px] max-h-[240px] transition-all overflow-y-auto resize-none"
                            rows={1}
                        />
                        {rule.field === 'text' && (
                            <label className="flex items-center gap-2 text-xs text-text-muted whitespace-nowrap cursor-pointer hover:text-text-default shrink-0 bg-bg-surface border border-border-default px-3 py-2.5 rounded-xl shadow-sm">
                                <input 
                                    type="checkbox" 
                                    checked={rule.searchAllProfiles !== false}
                                    onChange={e => onChange(rule.id, 'searchAllProfiles', e.target.checked)}
                                    className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                                />
                                חיפוש בכל הפרופילים
                            </label>
                        )}
                    </div>
                );
            case 'job_type':
            case 'job_type_missing':
                return (
                    <div className="flex-grow flex gap-2 items-center">
                        <button 
                            onClick={() => setJobModalOpen(true)}
                            className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition"
                        >
                            {rule.value && rule.value.length > 0 
                                ? `נבחרו ${rule.value.length} תחומי עניין`
                                : 'בחר תחומי התעניינות...'}
                        </button>
                        {isJobModalOpen && (
                            <JobFieldSelector 
                                isModalOpen={true} 
                                setIsModalOpen={setJobModalOpen}
                                isMulti={true}
                                value={rule.value || []}
                                onChange={(vals) => {
                                    onChange(rule.id, 'value', vals);
                                    onChange(rule.id, 'textValue', `נבחרו ${vals.length} תחומי עניין`);
                                }}
                            />
                        )}
                        {rule.value && rule.value.length > 0 && (
                            <div className="w-48">
                                <DateRangeSelector value={rule.dateRange || null} onChange={(r) => onChange(rule.id, 'dateRange', r)} placeholder="טווח תאריכים" />
                            </div>
                        )}
                    </div>
                );
            case 'specific_job':
                return (
                    <div className="flex-grow flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <button 
                                onClick={() => setSpecificJobModalOpen(true)}
                                className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition flex-shrink-0"
                            >
                                {rule.textValue || 'בחר משרה...'}
                            </button>
                            {isSpecificJobModalOpen && (
                                <JobSelectorModal 
                                    isOpen={true} onClose={() => setSpecificJobModalOpen(false)} 
                                    onSelect={(job: any) => {
                                        onChange(rule.id, 'value', job.id);
                                        onChange(rule.id, 'textValue', job.title);
                                        setSpecificJobModalOpen(false);
                                    }}
                                />
                            )}
                            
                            {rule.value && (
                                <>
                                    <select 
                                        value={rule.candidateStatus || ''} 
                                        onChange={e => onChange(rule.id, 'candidateStatus', e.target.value)}
                                        className="bg-bg-subtle/50 px-2 py-1.5 rounded-lg border border-border-default text-xs flex-grow outline-none focus:border-primary-300"
                                    >
                                        <option value=""> -- לבחור סטאטוס מועמד -- </option>
                                        {SPECIFIC_JOB_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    
                                    <div className="w-48 flex-shrink-0">
                                        <DateRangeSelector value={rule.dateRange || null} onChange={(r) => onChange(rule.id, 'dateRange', r)} placeholder="טווח תאריכים" />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            case 'job_referrals':
                return (
                    <div className="flex-grow flex gap-2 items-center overflow-x-auto">
                        <button 
                            onClick={() => setSpecificJobModalOpen(true)}
                            className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition shrink-0 h-[60px]"
                        >
                            {rule.value?.length ? `נבחרו ${rule.value.length} משרות` : 'בחר משרות...'}
                        </button>
                        {isSpecificJobModalOpen && (
                            <JobSelectorModal 
                                isOpen={true} onClose={() => setSpecificJobModalOpen(false)} 
                                isMulti={true} selectedIds={Array.isArray(rule.value) ? rule.value.map((j: any) => j.id) : []}
                                onSelect={(jobs: any[]) => {
                                    onChange(rule.id, 'value', jobs);
                                    onChange(rule.id, 'textValue', `נבחרו ${jobs.length} משרות`);
                                    setSpecificJobModalOpen(false);
                                }}
                            />
                        )}
                        {rule.value && rule.value.length > 0 && (
                            <>
                                <div className="w-48 shrink-0">
                                    <DateRangeSelector value={rule.dateRange || null} onChange={(r) => onChange(rule.id, 'dateRange', r)} placeholder="טווח תאריכים" />
                                </div>
                                <MultiSelect options={JOB_STATUSES} value={rule.jobStatuses} onChange={(v: string[]) => onChange(rule.id, 'jobStatuses', v)} placeholder="סטטוס משרה" />
                                <MultiSelect options={RECRUITERS} value={rule.recruiters} onChange={(v: string[]) => onChange(rule.id, 'recruiters', v)} placeholder="רכז מפנה" />
                            </>
                        )}
                    </div>
                );
            case 'disqualification_reasons':
                return (
                    <div className="flex-grow flex gap-2 items-center overflow-x-auto">
                        <MultiSelect options={DISQUALIFICATION_REASONS} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />
                        {rule.value && rule.value.length > 0 && (
                            <>
                                <button
                                    onClick={() => setSpecificJobModalOpen(true)}
                                    className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition shrink-0"
                                >
                                    {rule.secondaryValue?.length ? `נבחרו ${rule.secondaryValue.length} משרות` : 'בחירת משרות...'}
                                </button>
                                {isSpecificJobModalOpen && (
                                    <JobSelectorModal
                                        isOpen={true} onClose={() => setSpecificJobModalOpen(false)}
                                        isMulti={true} selectedIds={Array.isArray(rule.secondaryValue) ? rule.secondaryValue.map((j: any) => j.id) : []}
                                        onSelect={(jobs: any[]) => {
                                            onChange(rule.id, 'secondaryValue', jobs);
                                            setSpecificJobModalOpen(false);
                                        }}
                                    />
                                )}
                                
                                <MultiSelect options={RECRUITERS} value={rule.recruiters} onChange={(v: string[]) => onChange(rule.id, 'recruiters', v)} placeholder="רכזים פוסלים..." />
                                
                                <div className="w-48 shrink-0">
                                    <DateRangeSelector value={rule.dateRange || null} onChange={(r) => onChange(rule.id, 'dateRange', r)} placeholder="טווח תאריכים" />
                                </div>
                            </>
                        )}
                    </div>
                );
            case 'mobility':
                return <MultiSelect options={MOBILITY} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />;
            case 'driving_license':
                return <MultiSelect options={LICENSES} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />;
            case 'recruitment_source':
                return (
                    <div className="flex-grow flex gap-2 items-center">
                        <select 
                            value={rule.sourceMode || 'נוכחי'} 
                            onChange={e => onChange(rule.id, 'sourceMode', e.target.value)}
                            className="bg-bg-subtle/50 px-2 py-1 rounded-lg border border-border-default text-xs outline-none focus:border-primary-400 font-semibold h-[60px]"
                        >
                            <option value="נוכחי">נוכחי</option>
                            <option value="ראשוני">ראשוני</option>
                        </select>
                        <MultiSelect options={SOURCES} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />
                    </div>
                );
            case 'distribution_channels':
                return (
                    <div className="flex-grow flex gap-2 items-center">
                        <select 
                            value={rule.channelStatus || 'פעיל'} 
                            onChange={e => onChange(rule.id, 'channelStatus', e.target.value)}
                            className="bg-bg-subtle/50 px-2 py-1 rounded-lg border border-border-default text-xs outline-none focus:border-primary-400 font-semibold h-[60px]"
                        >
                            <option value="פעיל">פעיל</option>
                            <option value="חסום">חסום</option>
                        </select>
                        <MultiSelect options={CHANNELS} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />
                    </div>
                );
            case 'candidate_status':
                return <MultiSelect options={STATUSES} value={rule.value} onChange={(v: string[]) => onChange(rule.id, 'value', v)} />;
            case 'events':
            case 'events_missing':
                return (
                    <div className="flex-grow flex gap-2 items-center overflow-x-auto">
                        <button 
                            onClick={() => setEventModalOpen(true)}
                            className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition shrink-0"
                        >
                            {rule.value && rule.value.length > 0 ? `נבחרו ${rule.value.length} סוגי אירועים` : 'בחירת אירועים...'}
                        </button>
                        {isEventModalOpen && (
                            <EventSelectorModal 
                                isOpen={true} onClose={() => setEventModalOpen(false)} 
                                isMulti={true} selectedIds={Array.isArray(rule.value) ? rule.value.map((ev: any) => ev.id) : []}
                                onSelect={(events: any[]) => {
                                    onChange(rule.id, 'value', events);
                                    onChange(rule.id, 'textValue', `נבחרו ${events.length} אירועים`);
                                    setEventModalOpen(false);
                                }}
                            />
                        )}
                        
                        {rule.value && rule.value.length > 0 && (
                            <>
                                <MultiSelect 
                                    options={CLIENTS}
                                    value={rule.clientValue || CLIENTS} 
                                    onChange={(v: string[]) => onChange(rule.id, 'clientValue', v)}
                                    placeholder="בחירת לקוחות..."
                                    allowSelectAll={true}
                                />
                                
                                <button
                                    onClick={() => setSpecificJobModalOpen(true)}
                                    className="bg-white border border-border-default px-2 py-1.5 rounded-lg text-xs font-medium text-text-default hover:bg-bg-subtle transition shrink-0 min-h-[60px]"
                                >
                                    {rule.secondaryValue ? rule.secondaryValue.title : 'משימה/משרה'}
                                </button>
                                {isSpecificJobModalOpen && (
                                    <JobSelectorModal
                                        isOpen={true} onClose={() => setSpecificJobModalOpen(false)}
                                        onSelect={(job: any) => {
                                            onChange(rule.id, 'secondaryValue', job);
                                            setSpecificJobModalOpen(false);
                                        }}
                                    />
                                )}
                                
                                <MultiSelect options={RECRUITERS} value={rule.recruiters} onChange={(v: string[]) => onChange(rule.id, 'recruiters', v)} placeholder="משתמש מעדכן" />

                                <div className="w-48 shrink-0">
                                    <DateRangeSelector value={rule.dateRange || null} onChange={(r) => onChange(rule.id, 'dateRange', r)} placeholder="תאריכים..." />
                                </div>
                            </>
                        )}
                    </div>
                );
        case 'missing_tag':
                return (
                    <div className="flex-grow flex gap-2 items-center">
                        <button 
                            onClick={() => setTagModalOpen(true)}
                            className="bg-bg-subtle border border-border-default px-3 py-1.5 rounded-lg text-xs font-semibold text-text-default hover:bg-bg-hover transition max-w-[200px] truncate"
                        >
                            {rule.value && rule.value.length > 0 ? `נבחרו ${rule.value.length} תגיות (${rule.value.join(', ')})` : 'בחר תגית חסרה...'}
                        </button>
                        {isTagModalOpen && (
                            <TagSelectorModal 
                                isOpen={true} onClose={() => setTagModalOpen(false)} 
                                onSave={(selectedTags: string[]) => {
                                    onChange(rule.id, 'value', selectedTags);
                                    onChange(rule.id, 'textValue', selectedTags.join(', '));
                                    setTagModalOpen(false);
                                }}
                                existingTags={Array.isArray(rule.value) ? rule.value : (rule.value ? [rule.value] : [])}
                            />
                        )}
                    </div>
                );
            case 'update_date':
            case 'candidate_update_date':
                return (
                    <div className="flex-grow flex gap-3 items-center w-full">
                        <MultiSelect 
                            options={UPDATE_TYPES} 
                            value={rule.updaterTypes} 
                            onChange={(v: string[]) => onChange(rule.id, 'updaterTypes', v)} 
                            placeholder="סוג עדכון" 
                            className="w-[200px] shrink-0"
                        />
                        {rule.updaterTypes && rule.updaterTypes.length > 0 && (
                            <div className="flex-grow max-w-[280px] animate-in fade-in zoom-in duration-200">
                                <DateRangeSelector 
                                    value={rule.dateRange || null} 
                                    onChange={(r) => onChange(rule.id, 'dateRange', r)} 
                                    placeholder="טווח תאריכים" 
                                />
                            </div>
                        )}
                    </div>
                );
            case 'registration_date':
                return (
                    <div className="flex-grow max-w-sm">
                        <DateRangeSelector value={rule.value || null} onChange={(r) => onChange(rule.id, 'value', r)} />
                    </div>
                );
            default:
                return (
                    <input 
                        type="text" placeholder="ערך..." value={rule.value || ''}
                        onChange={e => onChange(rule.id, 'value', e.target.value)}
                        className="bg-bg-subtle/50 px-2 py-1.5 rounded-lg border border-border-default text-xs flex-grow outline-none focus:border-primary-300"
                    />
                );
        }
    };

    return (
        <div className="flex flex-col gap-2">
        {isFirstRule && rule.operator === 'OR' && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                שורה ראשונה עם «או»: התוצאות יכללו מועמדים שעונים על הסינון למעלה (גיל, שכר וכו׳) או על תנאי השורה הזו — לא רק שניהם יחד.
            </p>
        )}
        <div className="flex flex-col md:flex-row md:items-center gap-3 bg-bg-card p-3 md:p-2 rounded-2xl border border-border-default shadow-sm animate-fade-in text-sm group hover:border-primary-300 transition-all relative">
            <div className="flex items-center justify-between">
                <span className={`text-[11px] font-black px-2.5 py-1.5 rounded-lg w-auto md:w-20 text-center shadow-sm uppercase tracking-wide shrink-0 ${rule.operator === 'AND' ? 'bg-blue-600 text-white' : rule.operator === 'OR' ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {rule.operator === 'AND' ? 'וגם' : rule.operator === 'OR' ? 'או' : 'ללא'}
                </span>
                <button onClick={() => onRemove(rule.id)} className="md:hidden text-text-subtle hover:text-red-500 p-2 rounded-xl hover:bg-red-50 transition">
                    <XMarkIcon className="w-5 h-5"/>
                </button>
            </div>
            
            <div className="flex flex-col md:flex-row md:items-center flex-grow gap-3">
                <FieldSelector 
                    value={rule.field || ''}
                    onChange={handleFieldChange}
                />
                
                <div className="hidden md:flex bg-border-default w-[1px] h-8 mx-1"></div>
                
                <div className="flex-grow flex items-center">
                    {renderInput()}
                </div>
            </div>
            
            <button onClick={() => onRemove(rule.id)} className="hidden md:block text-text-subtle hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition opacity-0 group-hover:opacity-100">
                <XMarkIcon className="w-4 h-4"/>
            </button>
        </div>
        </div>
    );
};

export type ComplexQueryBuilderProps = {
    rules: ComplexFilterRule[];
    onChange: (rules: ComplexFilterRule[]) => void;
    className?: string;
    title?: string;
};

/** Full complex-query panel: rule rows + AND/OR/NOT add buttons. */
export const ComplexQueryBuilder: React.FC<ComplexQueryBuilderProps> = ({
    rules,
    onChange,
    className = '',
    title = 'שאילתות מורכבות (שכבת סינון נוספת)',
}) => {
    const handleAddRule = useCallback(
        (operator: ComplexQueryOperator) => {
            onChange([...rules, createEmptyComplexRule(operator)]);
        },
        [rules, onChange],
    );

    const handleRemoveRule = useCallback(
        (id: string) => {
            onChange(rules.filter((r) => r.id !== id));
        },
        [rules, onChange],
    );

    const handleRuleChange = useCallback(
        (id: string, field: keyof ComplexFilterRule, value: unknown) => {
            onChange(
                rules.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
            );
        },
        [rules, onChange],
    );

    const handleRulePatch = useCallback(
        (id: string, patch: Partial<ComplexFilterRule>) => {
            onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
        },
        [rules, onChange],
    );

    return (
        <div className={`bg-bg-subtle/40 rounded-xl p-3 border border-border-default/50 mt-2 ${className}`}>
            <div className="flex items-center gap-2 mb-2">
                <FunnelIcon className="w-4 h-4 text-primary-500" />
                <h4 className="text-xs font-bold text-primary-700 uppercase tracking-wide">{title}</h4>
            </div>

            {rules.length > 0 && (
                <div className="space-y-2 mb-3">
                    {rules.map((rule, index) => (
                        <ComplexRuleRow
                            key={rule.id}
                            rule={rule}
                            isFirstRule={index === 0}
                            onChange={handleRuleChange}
                            onPatch={handleRulePatch}
                            onRemove={handleRemoveRule}
                        />
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => handleAddRule('AND')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200 hover:bg-blue-100 transition-colors"
                >
                    <PlusIcon className="w-3 h-3" /> וגם (AND)
                </button>
                <button
                    type="button"
                    onClick={() => handleAddRule('OR')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-bold border border-orange-200 hover:bg-orange-100 transition-colors"
                >
                    <PlusIcon className="w-3 h-3" /> או (OR)
                </button>
                <button
                    type="button"
                    onClick={() => handleAddRule('NOT')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-bold border border-red-200 hover:bg-red-100 transition-colors"
                >
                    <MinusIcon className="w-3 h-3" /> ללא (NOT)
                </button>
            </div>
        </div>
    );
};

