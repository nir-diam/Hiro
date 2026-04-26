
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, ArrowPathIcon, InformationCircleIcon, CheckCircleIcon, CalendarIcon, NoSymbolIcon, ArrowUturnLeftIcon, ArchiveBoxIcon, TargetIcon, SparklesIcon, XMarkIcon, Cog6ToothIcon, TableCellsIcon, Squares2X2Icon } from './Icons';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import UpdateStatusModal, { type UpdateStatusFormData } from './UpdateStatusModal';
import JobDetailsDrawer from './JobDetailsDrawer';
import { Job } from './JobsView';
import { useLanguage } from '../context/LanguageContext';


type Status = 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון' | 'חדש';

interface MatchDetails {
  positive: string[];
  negative: string[];
  summary: string;
}

interface JobInterest {
  /** job_candidates.id */
  linkId: string;
  /** jobs.id */
  jobId: string;
  industry: string;
  role: string;
  jobTitle: string;
  company: string;
  location: string;
  lastUpdated: string;
  status: Status | string;
  matchScore: number;
  matchDetails: MatchDetails;
  lastAnalyzed: string;
  linkSource?: string | null;
  internalNote: string;
  dueDate: string;
  dueTime: string;
  inviteCandidate: boolean;
  inviteClient: boolean;
}

type LinkedJobApiRow = {
  jobCandidateId: string;
  jobId: string;
  status?: string | null;
  source?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  job: Record<string, unknown>;
  workflowMeta?: Record<string, unknown>;
};

function mapLinkedJobRow(row: LinkedJobApiRow): JobInterest {
  const job = row.job || {};
  const wm =
    row.workflowMeta && typeof row.workflowMeta === 'object' && !Array.isArray(row.workflowMeta)
      ? row.workflowMeta
      : {};
  const title = String(job.title || job.publicJobTitle || '').trim() || '—';
  const city = String(job.city || '').trim();
  const loc = String(job.location || '').trim();
  const location = [city, loc].filter(Boolean).join(', ') || '—';
  const updatedRaw = row.updatedAt || row.createdAt;
  const lastUpdated = updatedRaw
    ? new Date(updatedRaw).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  const desc = typeof job.description === 'string' ? job.description.trim().slice(0, 400) : '';
  const rating = typeof job.rating === 'number' ? job.rating : 0;
  return {
    linkId: row.jobCandidateId,
    jobId: row.jobId,
    industry: String(job.field || '').trim(),
    role: String(job.role || '').trim(),
    jobTitle: title,
    company: String(job.client || '').trim() || '—',
    location,
    lastUpdated,
    status: String(row.status || 'חדש').trim() || 'חדש',
    matchScore: Math.min(100, Math.max(0, rating ? Math.round((rating / 5) * 100) : 0)),
    matchDetails: {
      positive: [],
      negative: [],
      summary: desc || '—',
    },
    lastAnalyzed: lastUpdated,
    linkSource: row.source,
    internalNote: wm.internalNote != null ? String(wm.internalNote) : '',
    dueDate: wm.dueDate != null ? String(wm.dueDate) : '',
    dueTime: wm.dueTime != null ? String(wm.dueTime) : '',
    inviteCandidate: Boolean(wm.inviteCandidate),
    inviteClient: Boolean(wm.inviteClient),
  };
}

export const jobsData: JobInterest[] = [
  { linkId: 'mock-1', jobId: 'mock-job-1', industry: 'לוגיסטיקה', role: 'מחסנאי/ת', jobTitle: 'דרוש/ה מחסנאי/ת למפעל מוביל', company: 'תנובה', location: 'רחובות', lastUpdated: '14/07/2025', status: 'פעיל', matchScore: 92, matchDetails: { positive: ['5+ שנות ניסיון בניהול מחסן ממוחשב', 'ניסיון עבודה עם מערכת WMS', 'רישיון מלגזה בתוקף'], negative: ['לא צוין ניסיון עם מערכת SAP'], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, lastAnalyzed: '15.11.2025', internalNote: '', dueDate: '', dueTime: '', inviteCandidate: false, inviteClient: false },
  { linkId: 'mock-2', jobId: 'mock-job-2', industry: 'שיווק', role: 'מנהל/ת שיווק דיגיטלי', jobTitle: 'מנהל/ת קמפיינים PPC', company: 'בזק', location: 'תל אביב', lastUpdated: '10/07/2025', status: 'הוזמן לראיון', matchScore: 85, matchDetails: { positive: ['ניסיון מוכח בניהול קמפיינים בגוגל ופייסבוק', 'שליטה מלאה ב-Google Analytics', 'תואר ראשון רלוונטי'], negative: ['ניסיון של 3 שנים בלבד (נדרש 4+)', 'לא צוין ניסיון עם Taboola/Outbrain'], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, lastAnalyzed: '27/07/2025', internalNote: '', dueDate: '', dueTime: '', inviteCandidate: false, inviteClient: false },
  { linkId: 'mock-3', jobId: 'mock-job-3', industry: 'פיננסים', role: 'אנליסט/ית', jobTitle: 'אנליסט/ית לחברת השקעות', company: 'מיטב דש', location: 'גבעתיים', lastUpdated: '05/07/2025', status: 'מועמד משך עניין', matchScore: 68, matchDetails: { positive: ['תואר ראשון בכלכלה', 'שליטה מעולה באקסל'], negative: ['חוסר ניסיון בשוק ההון', 'ניסיון מועט בניתוח דוחות כספיים'], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, lastAnalyzed: '26/07/2025', internalNote: '', dueDate: '', dueTime: '', inviteCandidate: false, inviteClient: false },
  { linkId: 'mock-4', jobId: 'mock-job-4', industry: 'טכנולוגיה', role: 'מהנדס/ת תוכנה', jobTitle: 'Fullstack Developer (React & Node)', company: 'Wix', location: 'הרצליה', lastUpdated: '01/07/2025', status: 'לא רלוונטי', matchScore: 45, matchDetails: { positive: ['ניסיון עם React'], negative: ['אין ניסיון עם Node.js', 'אין ניסיון בעבודה עם TypeScript', 'רק שנתיים ניסיון בתעשייה'], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, lastAnalyzed: '25/07/2025', internalNote: '', dueDate: '', dueTime: '', inviteCandidate: false, inviteClient: false },
  { linkId: 'mock-5', jobId: 'mock-job-5', industry: 'קמעונאות', role: 'מנהל/ת סניף', jobTitle: 'מנהל/ת סניף לרשת אופנה', company: 'קסטרו', location: 'ירושלים', lastUpdated: '28/06/2025', status: 'בארכיון', matchScore: 20, matchDetails: { positive: ['ניסיון ניהולי כללי'], negative: ['אין ניסיון מתחום הקמעונאות', 'אין ניסיון בניהול צוות של מעל 5 עובדים', 'אין היכרות עם עולם האופנה'], summary: 'התאמה גבוהה מאוד. המועמד עונה על כל דרישות החובה ורוב הדרישות הרצויות. מומלץ להמשיך בתהליך.' }, lastAnalyzed: '24/07/2025', internalNote: '', dueDate: '', dueTime: '', inviteCandidate: false, inviteClient: false },
];

const statusStyles: { [key in Status]: { bg: string; text: string; icon: React.ReactElement<{ className?: string }> } } = {
  'חדש': { bg: 'bg-sky-100', text: 'text-sky-800', icon: <InformationCircleIcon className="w-4 h-4 text-sky-600" /> },
  'פעיל': { bg: 'bg-accent-100', text: 'text-accent-800', icon: <CheckCircleIcon className="w-4 h-4 text-accent-600" /> },
  'הוזמן לראיון': { bg: 'bg-secondary-100', text: 'text-secondary-800', icon: <CalendarIcon className="w-4 h-4 text-secondary-600" /> },
  'לא רלוונטי': { bg: 'bg-gray-200', text: 'text-gray-700', icon: <NoSymbolIcon className="w-4 h-4 text-gray-500" /> },
  'מועמד משך עניין': { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <ArrowUturnLeftIcon className="w-4 h-4 text-yellow-600" /> },
  'בארכיון': { bg: 'bg-bg-card border border-border-default', text: 'text-text-muted', icon: <ArchiveBoxIcon className="w-4 h-4 text-text-subtle" /> },
};

const StatusBadge: React.FC<{ status: string; onClick: () => void }> = ({ status, onClick }) => {
  const { bg, text, icon } = statusStyles[status as Status] ?? statusStyles['חדש'];
  return (
    <button onClick={onClick} className={`flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full w-fit ${bg} ${text} hover:scale-105 transition-transform`}>
      {icon}
      <span>{status}</span>
    </button>
  );
};

const MatchScore: React.FC<{ score: number }> = ({ score }) => {
    const size = 40;
    const strokeWidth = 4;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;

    const scoreColor = score > 75 ? 'text-accent-500' : score > 50 ? 'text-yellow-500' : 'text-red-500';
    const trackColor = score > 75 ? 'bg-accent-100' : score > 50 ? 'bg-yellow-100' : 'bg-red-100';

    return (
        <div className="relative flex items-center justify-center group" title="לחץ לניתוח התאמה מבוסס AI">
            <div className={`absolute inset-0 ${trackColor} rounded-full`}></div>
            <svg className="transform -rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle
                    className="text-bg-card"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                <circle
                    className={`${scoreColor} transition-all duration-500 ease-in-out`}
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <span className={`absolute text-xs font-bold ${scoreColor}`}>
                {score}%
            </span>
        </div>
    );
};

const MatchScorePopover: React.FC<{ details: MatchDetails; onClose: () => void; onRecalculate: () => Promise<void>; lastAnalyzed: string; }> = ({ details, onClose, onRecalculate, lastAnalyzed }) => {
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
        <div className="absolute bottom-full right-1/2 translate-x-1/2 mb-2 w-80 bg-bg-card rounded-xl shadow-2xl border border-border-default z-30 p-4 transition-opacity duration-200" style={{'--tw-shadow': '0 25px 50px -12px rgba(0, 0, 0, 0.25)'} as React.CSSProperties}>
             <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-4 h-4 transform rotate-45 -mb-2 bg-bg-card border-b border-r border-border-default"></div>
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-text-default text-sm flex items-center gap-2">
                    <SparklesIcon className="w-5 h-5 text-purple-500" />
                    ניתוח התאמת AI
                </h4>
                <button onClick={onClose} className="p-1 rounded-full hover:bg-bg-hover" aria-label="סגור">
                    <XMarkIcon className="w-4 h-4 text-text-muted" />
                </button>
            </div>
             <div className="space-y-2">
                <p className="text-sm text-text-default">{details.summary}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-border-default text-center">
                 <p className="text-xs text-text-subtle mb-3">
                    ניתוח אחרון: {lastAnalyzed}
                </p>
                 <button 
                    onClick={handleButtonClick} 
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-purple-600 bg-purple-100/70 py-2 px-4 rounded-lg hover:bg-purple-200 transition disabled:bg-bg-subtle disabled:text-text-muted disabled:cursor-wait"
                >
                    {isLoading ? (
                         <>
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
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

const JobInterestCard: React.FC<{ job: JobInterest; onStatusClick: () => void; onTitleClick: () => void }> = ({ job, onStatusClick, onTitleClick }) => (
    <div className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 hover:shadow-md transition-shadow flex flex-col justify-between">
        <div>
            <div className="flex justify-between items-start">
                <button onClick={onTitleClick} className="font-semibold text-primary-700 hover:underline text-right">{job.jobTitle}</button>
                <MatchScore score={job.matchScore} />
            </div>
            <p className="text-sm text-text-muted">{job.company}</p>
        </div>
        <div className="mt-4 flex justify-between items-end">
            <StatusBadge status={job.status} onClick={onStatusClick} />
            <p className="text-xs text-text-subtle">עדכון אחרון: {job.lastUpdated}</p>
        </div>
    </div>
);


const InterestedInJobs: React.FC<{
    onOpenNewTask: () => void;
    candidateId?: string | null;
    candidatePhone?: string | null;
    candidateEmail?: string | null;
}> = ({
    onOpenNewTask,
    candidateId = null,
    candidatePhone = null,
    candidateEmail = null,
}) => {
    const { t } = useLanguage();
    const [jobs, setJobs] = useState<JobInterest[]>([]);
    const [linkedJobsLoading, setLinkedJobsLoading] = useState(false);
    const [linkedJobsError, setLinkedJobsError] = useState<string | null>(null);
    const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [recalculatingId, setRecalculatingId] = useState<string | null>(null);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    
    // New state for advanced table features & modals
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    
    const allColumns = useMemo(() => [
        { id: 'jobTitle', header: t('interested_jobs.col_jobTitle') },
        { id: 'company', header: t('interested_jobs.col_company') },
        { id: 'location', header: t('interested_jobs.col_location') },
        { id: 'status', header: t('interested_jobs.col_status') },
        { id: 'matchScore', header: t('interested_jobs.col_matchScore') },
        { id: 'lastUpdated', header: t('interested_jobs.col_lastUpdated') },
        { id: 'industry', header: t('interested_jobs.col_industry') },
        { id: 'role', header: t('interested_jobs.col_role') },
    ], [t]);

    const defaultVisibleColumns = useMemo(() => allColumns.map(c => c.id), [allColumns]);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingInterest, setEditingInterest] = useState<JobInterest | null>(null);
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [jobCatalog, setJobCatalog] = useState<Job[]>([]);
    const [jobCatalogLoading, setJobCatalogLoading] = useState(false);
    useEffect(() => {
        if (!apiBase) {
            return;
        }
        let isActive = true;
        setJobCatalogLoading(true);
        (async () => {
            try {
                const res = await fetch(`${apiBase}/api/jobs`);
                if (!res.ok) throw new Error('Failed to load jobs');
                const data = await res.json();
                if (isActive) {
                    setJobCatalog(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('[InterestedInJobs] failed to fetch jobs', err);
            } finally {
                if (isActive) {
                    setJobCatalogLoading(false);
                }
            }
        })();
        return () => {
            isActive = false;
        };
    }, [apiBase]);

    useEffect(() => {
        const id = candidateId != null && String(candidateId).trim() ? String(candidateId).trim() : '';
        if (!apiBase || !id) {
            setJobs([]);
            setLinkedJobsLoading(false);
            setLinkedJobsError(null);
            return;
        }
        let cancelled = false;
        setLinkedJobsLoading(true);
        setLinkedJobsError(null);
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        fetch(`${apiBase}/api/candidates/${encodeURIComponent(id)}/linked-jobs`, {
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error('טעינת התעניינות במשרות נכשלה'))))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                setJobs(list.map((r) => mapLinkedJobRow(r as LinkedJobApiRow)));
            })
            .catch((err: Error) => {
                if (!cancelled) setLinkedJobsError(err.message || 'שגיאה');
            })
            .finally(() => {
                if (!cancelled) setLinkedJobsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, candidateId]);

    // Sorting logic
    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };
    
    const sortedJobs = useMemo(() => {
        let sortableItems = [...jobs];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = (a as any)[sortConfig.key];
                const bVal = (b as any)[sortConfig.key];
                if (aVal < bVal) { return sortConfig.direction === 'asc' ? -1 : 1; }
                if (aVal > bVal) { return sortConfig.direction === 'asc' ? 1 : -1; }
                return 0;
            });
        }
        return sortableItems;
    }, [jobs, sortConfig]);

    // Column management logic
     useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
          const target = event.target as Node;
          if (popoverRef.current && !popoverRef.current.contains(target) && !(target as HTMLElement).closest('[data-popover-trigger]')) {
              setActivePopoverId(null);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allColumns.findIndex(c => c.id === a) - allColumns.findIndex(c => c.id === b));
                return newCols;
            }
        });
    };

    const handleDragStart = (index: number, colId: string) => { dragItemIndex.current = index; setDraggingColumn(colId); };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newCols = [...visibleColumns];
        const draggedItem = newCols.splice(dragItemIndex.current, 1)[0];
        newCols.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newCols);
    };
    const handleDragEnd = () => { dragItemIndex.current = null; setDraggingColumn(null); };

    // Existing component logic
    const handleScoreClick = (e: React.MouseEvent, linkId: string) => {
        e.stopPropagation();
        setActivePopoverId((currentId) => (currentId === linkId ? null : linkId));
    };

    const handleRecalculateMatch = async (linkId: string) => {
        setRecalculatingId(linkId);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        setJobs((prevJobs) =>
            prevJobs.map((job) =>
                job.linkId === linkId
                    ? {
                          ...job,
                          matchScore: Math.floor(Math.random() * 30) + 70,
                          lastAnalyzed: new Date().toLocaleDateString('he-IL'),
                      }
                    : job,
            ),
        );
        setRecalculatingId(null);
        setActivePopoverId(null);
    };

    const handleFieldSelected = (selectedField: SelectedJobField | null) => {
        if (!selectedField) {
            setIsJobFieldSelectorOpen(false);
            return;
        }
        const newInterest: JobInterest = {
            linkId: `local-${Date.now()}`,
            jobId: '',
            industry: selectedField.category,
            role: selectedField.role,
            jobTitle: `${selectedField.role} (יש לערוך)`,
            company: 'לא צוין',
            location: 'לא צוין',
            lastUpdated: new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            status: 'פעיל',
            matchScore: 30,
            matchDetails: {
                positive: ['נוסף ידנית מתחום'],
                negative: ['נדרש למלא פרטים נוספים'],
                summary: 'התעניינות נוספה מבחירת תחום בלבד. יש לעדכן פרטים נוספים.',
            },
            lastAnalyzed: new Date().toLocaleDateString('he-IL'),
            internalNote: '',
            dueDate: '',
            dueTime: '',
            inviteCandidate: false,
            inviteClient: false,
        };
        setJobs((prevJobs) => [newInterest, ...prevJobs]);
        setIsJobFieldSelectorOpen(false);
    };

    const handleOpenStatusModal = (interest: JobInterest) => {
        setEditingInterest(interest);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatus = async (data: any) => {
        if (!editingInterest) return;
        const apiBase = import.meta.env.VITE_API_BASE || '';
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!apiBase || !token) {
            setJobs((prev) =>
                prev.map((job) =>
                    job.linkId === editingInterest.linkId
                        ? {
                              ...job,
                              status: data.status,
                              lastUpdated: new Date().toLocaleDateString('he-IL'),
                              internalNote: data.note != null ? String(data.note) : '',
                              dueDate: data.dueDate != null ? String(data.dueDate) : '',
                              dueTime: data.dueTime != null ? String(data.dueTime) : '',
                              inviteCandidate: Boolean(data.inviteCandidate),
                              inviteClient: Boolean(data.inviteClient),
                          }
                        : job,
                ),
            );
            setIsStatusModalOpen(false);
            setEditingInterest(null);
            return;
        }
        const res = await fetch(`${apiBase}/api/candidates/linked-jobs/${editingInterest.linkId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                status: data.status,
                internalNote: data.note != null ? String(data.note) : '',
                dueDate: data.dueDate || null,
                dueTime: data.dueTime || null,
                inviteCandidate: Boolean(data.inviteCandidate),
                inviteClient: Boolean(data.inviteClient),
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'שמירה נכשלה');
        }
        setJobs((prev) =>
            prev.map((job) =>
                job.linkId === editingInterest.linkId
                    ? {
                          ...job,
                          status: data.status,
                          lastUpdated: new Date().toLocaleDateString('he-IL'),
                          internalNote: data.note != null ? String(data.note) : '',
                          dueDate: data.dueDate != null ? String(data.dueDate) : '',
                          dueTime: data.dueTime != null ? String(data.dueTime) : '',
                          inviteCandidate: Boolean(data.inviteCandidate),
                          inviteClient: Boolean(data.inviteClient),
                      }
                    : job,
            ),
        );
        setIsStatusModalOpen(false);
        setEditingInterest(null);
    };
    
    const buildFallbackJob = (interest: JobInterest): Job => ({
        id: 0,
        title: interest.jobTitle,
        client: interest.company,
        field: interest.industry,
        role: interest.role,
        priority: 'רגילה',
        clientType: 'כללי',
        city: interest.location,
        region: 'לא צויין',
        gender: 'לא משנה',
        mobility: false,
        licenseType: 'לא צויין',
        postingCode: interest.jobId || '',
        validityDays: 30,
        recruitingCoordinator: 'מערכת',
        accountManager: 'מערכת',
        salaryMin: 0,
        salaryMax: 0,
        ageMin: 18,
        ageMax: 65,
        openPositions: 1,
        status: 'טיוטה',
        associatedCandidates: 0,
        waitingForScreening: 0,
        activeProcess: 0,
        openDate: new Date().toISOString(),
        recruiter: 'מערכת',
        location: interest.location,
        jobType: 'לא צויין',
        description: interest.matchDetails.summary,
        requirements: [],
        rating: 0,
        healthProfile: 'standard',
    } as Job);

    const handleOpenJobDrawer = (jobId: string) => {
        if (!jobId) return;
        const jobFromCatalog = jobCatalog.find((j) => String(j.id) === String(jobId));
        if (jobFromCatalog) {
            setSelectedJob(jobFromCatalog);
            setIsDrawerOpen(true);
            return;
        }
        const interest = jobs.find((i) => i.jobId === jobId);
        if (interest) {
            const jobByTitle = jobCatalog.find((j) => j.title === interest.jobTitle);
            if (jobByTitle) {
                setSelectedJob(jobByTitle);
                setIsDrawerOpen(true);
                return;
            }
            setSelectedJob(buildFallbackJob(interest));
            setIsDrawerOpen(true);
        }
    };

    const renderCell = (job: JobInterest, columnId: string) => {
        switch(columnId) {
            case 'jobTitle':
                return (
                    <button
                        onClick={() => handleOpenJobDrawer(job.jobId)}
                        className="font-semibold text-primary-700 hover:underline cursor-pointer text-right"
                    >
                        {job.jobTitle}
                    </button>
                );
            case 'status':
                return <StatusBadge status={job.status} onClick={() => handleOpenStatusModal(job)} />;
            case 'matchScore':
                return (
                    <div className="relative" data-popover-trigger>
                        <button onClick={(e) => handleScoreClick(e, job.linkId)} disabled={recalculatingId === job.linkId}>
                            {recalculatingId === job.linkId ? (
                                <div className="w-10 h-10 flex items-center justify-center">
                                    <svg className="animate-spin h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                </div>
                            ) : (
                                <MatchScore score={job.matchScore} />
                            )}
                        </button>
                        {activePopoverId === job.linkId && (
                            <div ref={popoverRef}>
                                <MatchScorePopover 
                                    details={job.matchDetails} 
                                    onClose={() => setActivePopoverId(null)}
                                    onRecalculate={() => handleRecalculateMatch(job.linkId)}
                                    lastAnalyzed={job.lastAnalyzed}
                                />
                            </div>
                        )}
                    </div>
                );
            default:
                return (job as any)[columnId];
        }
    }
    
    return (
        <div className="bg-bg-card rounded-2xl shadow-sm">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            {linkedJobsError && (
                <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-2">
                    {linkedJobsError}
                </div>
            )}
            {/* Toolbar */}
            <header className="flex items-center justify-between p-3 border-b border-border-default bg-bg-card">
                 <div className="flex items-center gap-3">
                    <button onClick={() => setIsJobFieldSelectorOpen(true)} className="flex items-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                        <PlusIcon className="w-5 h-5"/>
                        <span>{t('interested_jobs.add_button')}</span>
                    </button>
                    <div className="relative">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input type="text" placeholder={t('interested_jobs.search_placeholder')} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition" />
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-text-muted ml-3">
                        {linkedJobsLoading ? t('interested_jobs.loading') || 'טוען…' : t('candidates.found_count', { count: jobs.length })}
                    </span>
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} title={t('candidates.view_list')} className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} title={t('candidates.view_grid')} className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                </div>
            </header>

            {/* Content */}
            {viewMode === 'table' ? (
                <table className="w-full text-sm text-right min-w-[1000px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80">
                        <tr>
                            {visibleColumns.map((colId, index) => {
                                const col = allColumns.find(c => c.id === colId);
                                if (!col) return null;
                                return (
                                    <th key={col.id} draggable onDragStart={() => handleDragStart(index, col.id)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDrop={handleDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestSort(col.id)} className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingColumn === col.id ? 'dragging' : ''}`}>
                                        <div className="flex items-center gap-1">{col.header} {getSortIndicator(col.id)}</div>
                                    </th>
                                );
                            })}
                            <th className="p-4 sticky left-0 bg-bg-subtle/80 w-16">
                                <div className="relative" ref={settingsRef}>
                                    <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title={t('candidates.customize_columns')} className="p-2 hover:bg-bg-hover rounded-full"><Cog6ToothIcon className="w-5 h-5"/></button>
                                    {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                        <p className="font-bold text-text-default mb-2 text-sm">{t('candidates.customize_columns')}</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">{allColumns.map(c => (<label key={c.id} className="flex items-center gap-2 text-sm font-normal text-text-default"><input type="checkbox" checked={visibleColumns.includes(c.id)} onChange={() => handleColumnToggle(c.id)} className="w-4 h-4 text-primary-600" />{c.header}</label>))}</div>
                                    </div>
                                    )}
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {sortedJobs.map(job => (
                            <tr key={job.linkId} className="hover:bg-bg-hover">
                                {visibleColumns.map(colId => (
                                    <td key={colId} className="p-4 text-text-muted">{renderCell(job, colId)}</td>
                                ))}
                                <td className="p-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover w-16"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedJobs.map(job => (
                        <JobInterestCard 
                            key={job.linkId} 
                            job={job} 
                            onStatusClick={() => handleOpenStatusModal(job)}
                            onTitleClick={() => handleOpenJobDrawer(job.jobId)}
                        />
                    ))}
                </div>
            )}
            
            <JobFieldSelector
                value={null}
                onChange={handleFieldSelected}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />

            {editingInterest && (
                <UpdateStatusModal
                    isOpen={isStatusModalOpen}
                    onClose={() => setIsStatusModalOpen(false)}
                    onSave={handleSaveStatus}
                    initialStatus={editingInterest.status as UpdateStatusFormData['status']}
                    onOpenNewTask={onOpenNewTask}
                    contextPrimary={editingInterest.jobTitle}
                    contextSecondary={[editingInterest.company, editingInterest.location].filter(Boolean).join(' · ')}
                    initialNote={editingInterest.internalNote}
                    initialDueDate={editingInterest.dueDate}
                    initialDueTime={editingInterest.dueTime}
                    initialInviteCandidate={editingInterest.inviteCandidate}
                    initialInviteClient={editingInterest.inviteClient}
                    candidatePhone={candidatePhone}
                    candidateEmail={candidateEmail}
                />
            )}
            
            <JobDetailsDrawer
                job={selectedJob}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
        </div>
    );
};

export default InterestedInJobs;
