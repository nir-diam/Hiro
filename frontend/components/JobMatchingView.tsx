
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, ChevronDownIcon, TargetIcon, PlusIcon, 
    ArrowLeftIcon, CheckCircleIcon, Squares2X2Icon, TableCellsIcon, SparklesIcon, XMarkIcon, ArrowPathIcon, FlagIcon
} from './Icons';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import AIFeedbackModal from './AIFeedbackModal';

// --- TYPES ---
type JobStatus = 'פתוחה' | 'מוקפאת';
type JobType = 'מלאה' | 'חלקית' | 'משמרות';
interface JobMatch {
  id: number;
  title: string;
  client: string;
  status: JobStatus;
  location: string;
  jobType: JobType;
  salaryRange: string;
  matchScore: number;
  description: string;
  matchDetails: {
      positive: string[];
      negative: string[];
      summary: string;
  };
  requirementsMet: boolean;
  matchType: 'application' | 'ai';
  lastAnalyzed: string;
}

// --- MOCK DATA ---
const jobMatchesData: JobMatch[] = [
    { id: 2, title: 'ראש/ת צוות שיווק', client: 'אל-על', status: 'פתוחה', location: 'לוד', jobType: 'מלאה', salaryRange: '20-25k ₪', matchScore: 85, description: 'ניהול צוות של משווקים, אחריות על אסטרטגיה השיווק של החברה לשוק האירופאי. עבודה מול ספקים ומשרדי פרסום.', matchDetails: { positive: ['ניסיון ניהולי מוכח', 'רקע בתחום התעופה - יתרון', 'שליטה באנגלית ברמת שפת אם'], negative: [], summary: 'התאמה גבוהה. המועמד עונה על דרישות הניהול והרקע המקצועי מתאים. מומלץ להמשיך בתהליך.' }, requirementsMet: true, matchType: 'ai', lastAnalyzed: '28/07/2025' },
    { id: 4, title: 'מנהל/ת מותג', client: 'תנובה', status: 'מוקפאת', location: 'רחובות', jobType: 'מלאה', salaryRange: '17-20k ₪', matchScore: 65, description: 'אחריות על בניית ותחזוקת המותג, השקות מוצרים חדשים, ניהול קמפיינים שיווקיים ועבודה מול ממשקים פנימיים וחיצוניים.', matchDetails: { positive: ['ניסיון בתחום ה-FMCG', 'יכולת עבודה תחת לחץ'], negative: ['חוסר ניסיון בניהול מותג דיגיטלי'], summary: 'התאמה בינונית. ניסיון רלוונטי בתחום הכללי אך חסר ניסיון ספציפי בעולמות הדיגיטל.' }, requirementsMet: true, matchType: 'ai', lastAnalyzed: '27/07/2025' },
    { id: 1, title: 'מנהל/ת שיווק דיגיטלי', client: 'בזק', status: 'פתוחה', location: 'תל אביב', jobType: 'מלאה', salaryRange: '18-22k ₪', matchScore: 95, description: 'ניהול כלל הפעילות הדיגיטלית של החברה, כולל קמפיינים ממומנים, SEO, וניהול נכסים דיגיטליים. אחריות על עמידה ביעדים והגדלת החשיפה למותג.', matchDetails: { positive: ['5 שנות ניסיון בשיווק דיגיטלי', 'ניסיון מוכח בניהול צוות', 'מגורים במרחק 15 ק"מ'], negative: [], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, requirementsMet: true, matchType: 'application', lastAnalyzed: '15.11.2025' },
    { id: 3, title: 'מנהל/ת קמפיינים PPC', client: 'Wix', status: 'פתוחה', location: 'הרצליה', jobType: 'מלאה', salaryRange: '16-19k ₪', matchScore: 78, description: 'דרוש/ה מנהל/ת קמפיינים PPC להצטרפות לצוות הליבה שלנו. העבודה כוללת ניהול קמפיינים בגוגל ופייסבוק, אופטימיזציה והפקת דוחות.', matchDetails: { positive: ['ניסיון מעמיק בגוגל אדס', 'היכרות עם שווקים בינלאומיים', 'יכולות אנליטיות גבוהות'], negative: [], summary: 'התאמה טובה. עונה על הדרישות הטכניות המרכזיות.' }, requirementsMet: true, matchType: 'application', lastAnalyzed: '25/07/2025' },
    { id: 5, title: 'מומחה/ית SEO', client: 'Zap Group', status: 'פתוחה', location: 'פתח תקווה', jobType: 'חלקית', salaryRange: '12-15k ₪', matchScore: 45, description: 'קידום אורגני של אתרי הקבוצה במנועי חיפוש. ביצוע מחקרי מילות מפתח, אופטימיזציה של תוכן ובניית קישורים.', matchDetails: { positive: [], negative: ['חסר ניסיון משמעותי ב-SEO טכני', 'ציפיות שכר גבוהות מהטווח'], summary: 'התאמה נמוכה. אינו עומד בדרישות הסף של התפקיד.' }, requirementsMet: false, matchType: 'application', lastAnalyzed: '24/07/2025' },
];


// --- MAIN VIEW COMPONENT ---
interface JobMatchingViewProps {
  onBack: () => void;
  candidateName: string;
}

const JobMatchingView: React.FC<JobMatchingViewProps> = ({ onBack, candidateName }) => {
    const [jobs, setJobs] = useState<JobMatch[]>(jobMatchesData);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdvancedSearchOpen, setIsAdvancedSearchOpen] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
    const [activePopoverId, setActivePopoverId] = useState<number | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [successfullyAssignedId, setSuccessfullyAssignedId] = useState<number | null>(null);
    const [assignedJobs, setAssignedJobs] = useState<Set<number>>(new Set());
    const [recalculatingId, setRecalculatingId] = useState<number | null>(null);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    const [advancedFilters, setAdvancedFilters] = useState({
        score: 0,
        jobType: 'הכל' as JobType | 'הכל',
        status: 'הכל' as JobStatus | 'הכל',
    });
    
    const handleFieldSelected = (selectedField: SelectedJobField) => {
        const newJobMatch: JobMatch = {
            id: Date.now(),
            title: `${selectedField.role} (יש לערוך)`,
            client: 'לא צוין',
            status: 'פתוחה',
            location: 'לא צוין',
            jobType: 'מלאה',
            salaryRange: 'N/A',
            matchScore: 30,
            description: 'התעניינות נוספה מבחירת תחום בלבד. יש לעדכן פרטים נוספים.',
            matchDetails: { positive: ['נוסף ידנית מתחום'], negative: ['נדרש למלא פרטים נוספים'], summary: 'התעניינות נוספה מבחירת תחום בלבד. יש לעדכן פרטים נוספים.'},
            requirementsMet: false,
            matchType: 'application',
            lastAnalyzed: new Date().toLocaleDateString('he-IL'),
        };
        setJobs(prev => [newJobMatch, ...prev]);
        setIsJobFieldSelectorOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (popoverRef.current && !popoverRef.current.contains(target) && !(target as HTMLElement).closest('[data-popover-trigger]')) {
                setActivePopoverId(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleAssignJob = (e: React.MouseEvent, jobId: number) => {
        e.stopPropagation();
        if (assignedJobs.has(jobId)) return;

        setSuccessfullyAssignedId(jobId);
        setAssignedJobs(prev => new Set(prev).add(jobId));

        setTimeout(() => {
            setSuccessfullyAssignedId(null);
        }, 2000);
    };
    
    const handleRecalculateMatch = async (jobId: number) => {
        setRecalculatingId(jobId);
        await new Promise(resolve => setTimeout(resolve, 1500));
        setJobs(prevJobs => prevJobs.map(job =>
            job.id === jobId
                ? { ...job, matchScore: Math.floor(Math.random() * 30) + 70, lastAnalyzed: new Date().toLocaleDateString('he-IL') }
                : job
        ));
        setRecalculatingId(null);
        setActivePopoverId(null);
    };

    const handleToggleDetails = (jobId: number) => {
        setExpandedJobId(prevId => (prevId === jobId ? null : jobId));
    };

    const handleScoreClick = (e: React.MouseEvent, jobId: number) => {
        e.stopPropagation(); 
        setActivePopoverId(currentId => currentId === jobId ? null : jobId);
    }

    const handleAdvancedFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setAdvancedFilters(prev => ({ ...prev, [name]: name === 'score' ? Number(value) : value }));
    };

    const handleResetAdvancedFilters = () => {
        setAdvancedFilters({
            score: 0,
            jobType: 'הכל',
            status: 'הכל',
        });
    };

    const filteredJobs = useMemo(() => {
        return jobs
            .filter(job => job.title.toLowerCase().includes(searchTerm.toLowerCase()) || job.client.toLowerCase().includes(searchTerm.toLowerCase()))
            .filter(job => job.matchScore >= advancedFilters.score)
            .filter(job => advancedFilters.jobType === 'הכל' || job.jobType === advancedFilters.jobType)
            .filter(job => advancedFilters.status === 'הכל' || job.status === advancedFilters.status);
    }, [jobs, searchTerm, advancedFilters]);
    
    const passedCount = filteredJobs.filter(j => j.requirementsMet).length;

    // --- SUB-COMPONENTS REDEFINED INSIDE FOR SCOPE ACCESS ---
    
    const JobMatchPopover: React.FC<{ job: JobMatch; onClose: () => void; onRecalculate: () => Promise<void>; }> = ({ job, onClose, onRecalculate }) => {
        const [isLoading, setIsLoading] = useState(false);

        const handleButtonClick = async () => {
            setIsLoading(true);
            try {
                await onRecalculate();
            } catch (error) {
                console.error("Recalculation failed", error);
            } finally {
                setIsLoading(false);
            }
        };
        
        return (
            <div ref={popoverRef} className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-80 bg-bg-card rounded-xl shadow-2xl border border-border-default z-30 p-4" style={{'--tw-shadow': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'} as React.CSSProperties}>
                <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-4 h-4 transform rotate-45 -mb-2 bg-bg-card border-b border-r border-border-default"></div>
                <div className="flex justify-between items-center mb-3">
                    <h4 className="font-bold text-text-default text-sm flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-primary-500" />
                        <span>ניתוח התאמת AI</span>
                    </h4>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-4 h-4 text-text-muted" />
                    </button>
                </div>
                <div className="space-y-2">
                    <p className="text-sm text-text-default">{job.matchDetails.summary}</p>
                </div>
                 <div className="mt-3 pt-3 border-t border-border-default">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-xs text-text-subtle">ניתוח אחרון: {job.lastAnalyzed}</p>
                         <button 
                            onClick={() => setIsFeedbackModalOpen(true)}
                            className="text-text-subtle hover:text-red-500 p-1 rounded transition-colors"
                            title="דווח על אי-דיוק"
                        >
                             <FlagIcon className="w-4 h-4" />
                        </button>
                    </div>
                    <button onClick={handleButtonClick} disabled={isLoading} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-purple-600 bg-purple-100/70 py-2 px-4 rounded-lg hover:bg-purple-200 transition disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-wait">
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                <span>מחשב מחדש...</span>
                            </>
                        ) : (
                            <>
                                <ArrowPathIcon className="w-4 h-4"/>
                                <span>חשב מחדש התאמה</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    };

    
    const JobMatchDetails: React.FC<{ job: JobMatch }> = ({ job }) => (
        <div className="p-4 bg-bg-subtle/70 text-right">
            <div className="space-y-4">
                <div>
                    <h5 className="font-bold text-text-muted mb-1 text-sm">תיאור המשרה</h5>
                    <p className="text-sm text-text-muted leading-relaxed">{job.description}</p>
                </div>
                <div>
                    <h5 className="font-bold text-text-muted mb-2 text-sm">דרישות עיקריות (התאמות שנמצאו)</h5>
                    <ul className="space-y-1">
                        {job.matchDetails.positive.map((req, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-text-default">
                                <CheckCircleIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <span>{req}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );

    const MatchProgressBar: React.FC<{ score: number }> = ({ score }) => {
        const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500';
        return (
            <div className="w-full bg-bg-subtle rounded-full h-2">
                <div className={`${color} h-2 rounded-full`} style={{ width: `${score}%` }}></div>
            </div>
        );
    };

    const JobCard: React.FC<{ job: JobMatch; isExpanded: boolean; onToggleDetails: () => void; }> = ({ job, isExpanded, onToggleDetails }) => (
        <div className="bg-bg-card border border-border-default rounded-xl hover:shadow-lg transition-shadow duration-300">
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="text-left relative">
                         <button 
                            onClick={(e) => handleScoreClick(e, job.id)} 
                            data-popover-trigger
                            className="font-extrabold text-3xl text-text-default"
                        >
                            {recalculatingId === job.id ? '...' : `${job.matchScore}%`}
                        </button>
                        {activePopoverId === job.id && <JobMatchPopover job={job} onClose={() => setActivePopoverId(null)} onRecalculate={() => handleRecalculateMatch(job.id)} />}
                        <p className={`text-xs font-semibold ${job.requirementsMet ? 'text-emerald-600' : 'text-red-600'}`}>{job.requirementsMet ? 'עבר תנאי סף' : 'לא עומד בדרישות'}</p>
                    </div>
                    <div className="text-right">
                        <h4 className="font-bold text-text-default text-base">{job.title}</h4>
                        <p className="text-sm text-text-muted flex items-center justify-end gap-2">
                            <span>{job.client}</span>
                            {job.matchType === 'ai' && (
                                <span className="text-xs font-bold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <SparklesIcon className="w-3 h-3" />
                                    <span>הצעת AI</span>
                                </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{job.status}</span>
                        </p>
                    </div>
                </div>
                <MatchProgressBar score={job.matchScore} />
                <div>
                    <p className="text-xs text-text-subtle">{job.location} | {job.jobType} | {job.salaryRange}</p>
                </div>
                <div className="flex items-center justify-end gap-4 pt-3 border-t border-border-subtle">
                    <button onClick={onToggleDetails} className="text-text-muted font-semibold py-1 px-3 text-sm rounded-md hover:bg-bg-hover transition flex items-center gap-1">
                        <span>{isExpanded ? 'הסתר פרטים' : 'צפה בפרטים'}</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {successfullyAssignedId === job.id ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-sm animate-fade-in py-2 px-4">
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>שויך בהצלחה!</span>
                        </div>
                    ) : (
                        <button 
                            onClick={(e) => handleAssignJob(e, job.id)} 
                            disabled={assignedJobs.has(job.id)}
                            className="bg-primary-500 text-white font-semibold py-2 px-4 text-sm rounded-lg hover:bg-primary-600 transition flex items-center gap-1.5 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="w-4 h-4" /> 
                            {assignedJobs.has(job.id) ? 'שויך' : 'שייך למשרה'}
                        </button>
                    )}
                </div>
            </div>
            {isExpanded && (
                <div className="border-t border-border-default">
                    <JobMatchDetails job={job} />
                </div>
            )}
        </div>
    );

    const JobRow: React.FC<{ job: JobMatch; isExpanded: boolean; onToggleDetails: () => void; }> = ({ job, isExpanded, onToggleDetails }) => (
        <tr onClick={onToggleDetails} className="bg-bg-card hover:bg-bg-hover transition-colors cursor-pointer">
            <td className="p-4">
                <div className="font-bold text-text-default text-base">{job.title}</div>
                <div className="text-sm text-text-muted flex items-center gap-2">
                    <span>{job.client}</span>
                    {job.matchType === 'ai' && (
                        <span className="text-xs font-bold text-primary-600 bg-primary-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <SparklesIcon className="w-3 h-3" />
                            <span>הצעת AI</span>
                        </span>
                    )}
                </div>
            </td>
            <td className="p-4">
                <div className="relative flex justify-start">
                    <button 
                        onClick={(e) => handleScoreClick(e, job.id)} 
                        data-popover-trigger 
                        className="flex items-center gap-2 cursor-pointer w-full"
                    >
                        <div className="w-16">
                             {recalculatingId === job.id ? (
                                <div className="w-full flex items-center justify-center h-2">
                                    <svg className="animate-spin h-4 w-4 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                </div>
                            ) : (
                                <MatchProgressBar score={job.matchScore} />
                            )}
                        </div>
                        <div className="font-bold text-text-default">{recalculatingId === job.id ? '' : `${job.matchScore}%`}</div>
                    </button>
                    {activePopoverId === job.id && <JobMatchPopover job={job} onClose={() => setActivePopoverId(null)} onRecalculate={() => handleRecalculateMatch(job.id)} />}
                </div>
            </td>
            <td className="p-4">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${job.status === 'פתוחה' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{job.status}</span>
            </td>
            <td className="p-4 text-text-muted text-sm">{job.location}</td>
            <td className="p-4">
                <div className="flex items-center justify-end gap-2">
                    <button onClick={(e) => { e.stopPropagation(); onToggleDetails(); }} className="text-text-muted font-semibold py-1 px-3 text-sm rounded-md hover:bg-bg-hover transition flex items-center gap-1">
                        <span>פרטים</span>
                        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                     {successfullyAssignedId === job.id ? (
                        <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-sm animate-fade-in py-1 px-3">
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>שויך!</span>
                        </div>
                    ) : (
                        <button 
                            onClick={(e) => handleAssignJob(e, job.id)} 
                            disabled={assignedJobs.has(job.id)}
                            className="bg-primary-500 text-white font-semibold py-1 px-3 text-sm rounded-md hover:bg-primary-600 transition flex items-center gap-1 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            <PlusIcon className="w-4 h-4" /> 
                            {assignedJobs.has(job.id) ? 'שויך' : 'שייך'}
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );

    return (
        <div className="bg-transparent rounded-2xl h-full flex flex-col">
            {/* Header Section with Close Button */}
            <div className="flex justify-between items-center mb-4 px-1">
                <h2 className="text-xl font-bold text-text-default">
                    התאמת משרות עבור <span className="text-primary-600">{candidateName}</span>
                </h2>
                <button 
                    onClick={onBack}
                    className="p-2 rounded-full bg-bg-card border border-border-default hover:bg-bg-hover text-text-muted transition-colors shadow-sm"
                    title="סגור חלונית התאמות"
                >
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-fade-in {
                    animation: fadeIn 0.3s ease-out forwards;
                }
            `}</style>
            
            {/* Main Content */}
            <main className="flex-1 overflow-y-auto space-y-4">
                {/* View Controls */}
                <div className="flex items-center justify-between bg-bg-card p-3 rounded-lg border border-border-default">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsJobFieldSelectorOpen(true)} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                            <PlusIcon className="w-5 h-5"/>
                            <span>הוספת תפקיד</span>
                        </button>
                        <button className="flex items-center gap-2 bg-primary-100/70 text-primary-700 font-semibold py-2 px-4 rounded-lg hover:bg-primary-200 transition">
                            <span>הוספת משרה</span>
                            <ChevronDownIcon className="w-4 h-4"/>
                        </button>
                    </div>
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input type="text" placeholder="חיפוש משרה או לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-64 bg-bg-subtle border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition" />
                    </div>
                </div>

                {/* Summary & Filters */}
                <div className="bg-bg-card p-3 rounded-lg border border-border-default sticky top-0 z-10">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-text-muted">
                            נמצאו <span className="text-primary-600 font-bold">{filteredJobs.length}</span> משרות | <span className="text-emerald-600 font-bold">{passedCount}</span> עברו תנאי סף
                        </div>
                         <div className="flex items-center gap-4">
                            <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                                <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                                <button onClick={() => setViewMode('table')} title="תצוגת שורות" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                            </div>
                            <button onClick={() => setIsAdvancedSearchOpen(!isAdvancedSearchOpen)} className="text-sm font-semibold text-primary-600 flex items-center gap-1">
                                <span>חיפוש מתקדם</span>
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedSearchOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    </div>
                     {isAdvancedSearchOpen && (
                        <div className="mt-4 pt-4 border-t border-border-default">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2">
                                <div className="lg:col-span-1">
                                    <label className="block text-xs font-semibold text-text-muted mb-1">ציון התאמה מינימלי: <span className="font-bold text-primary-600">{advancedFilters.score}%</span></label>
                                    <input type="range" min="0" max="100" value={advancedFilters.score} onChange={handleAdvancedFilterChange} name="score" className="w-full accent-primary-500"/>
                                </div>
                                <div className="lg:col-span-1">
                                    <label className="block text-xs font-semibold text-text-muted mb-1">סוג משרה</label>
                                    <select value={advancedFilters.jobType} onChange={handleAdvancedFilterChange} name="jobType" className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500 focus:border-primary-500">
                                        <option value="הכל">הכל</option>
                                        <option value="מלאה">מלאה</option>
                                        <option value="חלקית">חלקית</option>
                                        <option value="משמרות">משמרות</option>
                                    </select>
                                </div>
                                <div className="lg:col-span-1">
                                    <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס משרה</label>
                                    <select value={advancedFilters.status} onChange={handleAdvancedFilterChange} name="status" className="w-full p-2 border border-border-default rounded-lg text-sm bg-bg-input focus:ring-primary-500 focus:border-primary-500">
                                        <option value="הכל">הכל</option>
                                        <option value="פתוחה">פתוחה</option>
                                        <option value="מוקפאת">מוקפאת</option>
                                    </select>
                                </div>
                                <div className="flex items-end lg:col-span-1">
                                    <button onClick={handleResetAdvancedFilters} className="text-sm font-semibold text-text-muted hover:text-primary-600 py-2 px-4 rounded-lg hover:bg-bg-hover transition w-full text-center">
                                        איפוס
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Job List */}
                {filteredJobs.length > 0 ? (
                    viewMode === 'grid' ? (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredJobs.map(job => 
                                <JobCard 
                                    key={job.id} 
                                    job={job} 
                                    isExpanded={expandedJobId === job.id} 
                                    onToggleDetails={() => handleToggleDetails(job.id)}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="bg-bg-card rounded-lg border border-border-default">
                            <table className="w-full text-sm text-right">
                                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                    <tr>
                                        <th className="p-4 text-right">משרה</th>
                                        <th className="p-4 text-right">התאמה</th>
                                        <th className="p-4 text-right">סטטוס</th>
                                        <th className="p-4 text-right">מיקום</th>
                                        <th className="p-4 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredJobs.map(job => (
                                        <React.Fragment key={job.id}>
                                            <JobRow 
                                                job={job} 
                                                isExpanded={expandedJobId === job.id} 
                                                onToggleDetails={() => handleToggleDetails(job.id)} 
                                            />
                                            {expandedJobId === job.id && (
                                                <tr className="bg-bg-subtle/50">
                                                    <td colSpan={5}>
                                                        <JobMatchDetails job={job} />
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                ) : (
                    <div className="text-center py-16 flex flex-col items-center">
                        <TargetIcon className="w-16 h-16 text-text-subtle mb-4"/>
                        <h3 className="text-xl font-bold text-text-default">לא נמצאו משרות מתאימות</h3>
                        <p className="mt-2 text-text-muted">נסה להרחיב את החיפוש או לשנות את הקריטריונים.</p>
                    </div>
                )}
            </main>
            <JobFieldSelector
                value={null}
                onChange={handleFieldSelected}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
            
            <AIFeedbackModal 
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                context="Match Score Analysis"
            />
        </div>
    );
};

export default JobMatchingView;
