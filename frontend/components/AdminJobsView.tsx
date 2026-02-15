
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    MagnifyingGlassIcon, CheckCircleIcon, XMarkIcon, BriefcaseIcon, 
    ClockIcon, FunnelIcon, AdjustmentsHorizontalIcon, 
    TrashIcon, ExclamationTriangleIcon,
    CalendarDaysIcon, EllipsisVerticalIcon,
    TableCellsIcon, Squares2X2Icon, BoltIcon, ChartBarIcon, GlobeAmericasIcon,
    Cog6ToothIcon, UserIcon, MapPinIcon, BuildingOffice2Icon, ChevronDownIcon
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import CompanyFilterPopover from './CompanyFilterPopover';
import JobDetailsDrawer from './JobDetailsDrawer';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה' | 'ממתין לאישור';

const statusStyles: { [key in JobStatus]: { text: string; bg: string; border: string; } } = {
  'פתוחה': { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  'מוקפאת': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  'מאוישת': { text: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
  'טיוטה': { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  'ממתין לאישור': { text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
};

// Define Columns
const allColumnsDef = [
    { id: 'select', label: '', static: true, width: '40px' },
    { id: 'title', label: 'שם משרה' },
    { id: 'client', label: 'לקוח' },
    { id: 'health', label: 'בריאות' },
    { id: 'progress', label: 'התקדמות' },
    { id: 'status', label: 'סטטוס' },
    { id: 'recruiter', label: 'רכז מטפל' },
    { id: 'openDate', label: 'תאריך פתיחה' },
    { id: 'source', label: 'מקור (System/Board)' },
    { id: 'actions', label: 'פעולות', static: true, width: '80px' },
];

const defaultVisibleColumns = ['select', 'title', 'client', 'health', 'progress', 'status', 'recruiter', 'openDate', 'actions'];

const mapJobDisplay = (job: any) => ({
    ...job,
    healthScore: job.healthScore ?? 50,
    pendingCandidates: job.pendingCandidates ?? 0,
    inProcessCandidates: job.inProcessCandidates ?? 0,
    isPublic: job.isPublic ?? true,
});

// --- COMPONENTS ---

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; trend?: string }> = ({ title, value, icon, color, trend }) => (
    <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow group">
        <div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{title}</p>
            <div className="flex items-end gap-2">
                <p className="text-2xl font-black text-text-default">{value}</p>
                {trend && <span className="text-xs font-bold text-green-600 mb-1">{trend}</span>}
            </div>
        </div>
        <div className={`p-3 rounded-xl ${color} group-hover:scale-110 transition-transform duration-300`}>
            {icon}
        </div>
    </div>
);

const JobHealthIndicator: React.FC<{ score: number }> = ({ score }) => {
    let color = 'bg-green-500';
    let text = 'תקין';
    
    if (score < 50) { color = 'bg-red-500'; text = 'קריטי'; }
    else if (score < 75) { color = 'bg-yellow-400'; text = 'דורש תשומת לב'; }

    return (
        <div className="flex items-center gap-1.5" title={`ציון בריאות: ${score}/100`}>
            <div className={`w-2.5 h-2.5 rounded-full ${color}`}></div>
            <span className="text-xs text-text-muted hidden xl:inline">{text}</span>
        </div>
    );
};

const ProcessBar: React.FC<{ pending: number; process: number; hired: number }> = ({ pending, process, hired }) => {
    const total = Math.max(pending + process + hired, 1);
    
    return (
        <div className="w-24 h-1.5 flex rounded-full overflow-hidden bg-bg-subtle">
            <div className="bg-blue-400" style={{ width: `${(pending / total) * 100}%` }} title={`ממתינים: ${pending}`}></div>
            <div className="bg-purple-500" style={{ width: `${(process / total) * 100}%` }} title={`בתהליך: ${process}`}></div>
            <div className="bg-green-500" style={{ width: `${(hired / total) * 100}%` }} title={`התקבלו: ${hired}`}></div>
        </div>
    );
};

interface AdminJobCardProps {
    job: any;
    isSelected: boolean;
    onSelect: () => void;
    onClick: () => void;
    onTitleClick: (e: React.MouseEvent) => void;
}

const AdminJobCard: React.FC<AdminJobCardProps> = ({ job, isSelected, onSelect, onClick, onTitleClick }) => {
    return (
        <div 
            onClick={onClick}
            className={`bg-bg-card rounded-2xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col h-full ${isSelected ? 'border-primary-500 ring-1 ring-primary-500 bg-primary-50/10' : 'border-border-default'}`}
        >
            <div className="absolute top-4 right-4 z-10" onClick={e => e.stopPropagation()}>
                <input 
                    type="checkbox" 
                    checked={isSelected} 
                    onChange={onSelect}
                    className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                />
            </div>

            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                     <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-200">
                        {job.client.charAt(0)}
                    </div>
                    <div>
                        <h3 
                            className="font-bold text-text-default text-base leading-tight truncate max-w-[150px] hover:text-primary-600 hover:underline transition-colors" 
                            title={job.title}
                            onClick={onTitleClick}
                        >
                            {job.title}
                        </h3>
                        <p className="text-xs text-text-muted">{job.client}</p>
                    </div>
                </div>
                 <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyles[job.status as JobStatus]?.bg} ${statusStyles[job.status as JobStatus]?.text} ${statusStyles[job.status as JobStatus]?.border}`}>
                    {job.status}
                </span>
            </div>

            <div className="space-y-3 flex-grow">
                 <div className="flex justify-between items-center text-xs">
                     <span className="text-text-muted">בריאות משרה</span>
                     {/* @ts-ignore */}
                     <JobHealthIndicator score={job.healthScore} />
                 </div>
                 
                 <div>
                     <div className="flex justify-between items-center text-xs mb-1">
                         <span className="text-text-muted">התקדמות</span>
                         {/* @ts-ignore */}
                         <span className="font-bold">{job.pendingCandidates + job.inProcessCandidates} מועמדים</span>
                     </div>
                     {/* @ts-ignore */}
                     <ProcessBar pending={job.pendingCandidates} process={job.inProcessCandidates} hired={job.status === 'מאוישת' ? 1 : 0} />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-2 text-xs text-text-muted mt-2 pt-2 border-t border-border-subtle">
                     <div className="flex items-center gap-1">
                         <UserIcon className="w-3 h-3"/>
                         <span className="truncate">{job.recruiter}</span>
                     </div>
                      <div className="flex items-center gap-1">
                         <MapPinIcon className="w-3 h-3"/>
                         <span className="truncate">{job.city}</span>
                     </div>
                     <div className="flex items-center gap-1">
                         <CalendarDaysIcon className="w-3 h-3"/>
                         <span>{new Date(job.openDate).toLocaleDateString('he-IL')}</span>
                     </div>
                      <div className="flex items-center gap-1">
                         <GlobeAmericasIcon className="w-3 h-3"/>
                         {/* @ts-ignore */}
                         <span>{job.isPublic ? 'לוח משרות' : 'פנימי'}</span>
                     </div>
                 </div>
            </div>
        </div>
    );
};

const AdminJobsView: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    
    // State
    const [searchTerm, setSearchTerm] = useState('');
    const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [activeContextTab, setActiveContextTab] = useState<'all' | 'public'>('all');
    const [jobs, setJobs] = useState<any[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const loadJobs = useCallback(async () => {
        if (!apiBase) return;
        setLoadingJobs(true);
        try {
            const res = await fetch(`${apiBase}/api/jobs`);
            if (res.ok) {
                const data = await res.json();
                setJobs(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('[AdminJobsView] loadJobs', err);
        } finally {
            setLoadingJobs(false);
        }
    }, [apiBase]);
    useEffect(() => {
        loadJobs();
    }, [loadJobs]);
    
    // Drawer State
    const [selectedJob, setSelectedJob] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Column Management
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    
    // New Filters (Advanced & Company)
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false);
    const [isCompanyFilterOpen, setIsCompanyFilterOpen] = useState(false);
    const [companyFilters, setCompanyFilters] = useState<{
        sizes: string[];
        sectors: string[];
        industry: string;
        field: string;
    }>({ sizes: [], sectors: [], industry: '', field: '' });
    
    const companyFilterButtonRef = useRef<HTMLButtonElement>(null);

    // Filters
    const [filters, setFilters] = useState({
        status: 'all',
        recruiter: '',
        client: '',
        priority: '',
        role: '',
        field: ''
    });

    // Sync Company Filters to Main Filters
    useEffect(() => {
        setFilters(prev => ({
            ...prev,
            field: companyFilters.industry // Mapping industry from popover to field filter in jobs
        }));
    }, [companyFilters]);

    // Sort
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'openDate', direction: 'desc' });

    const displayJobs = useMemo(() => jobs.map(mapJobDisplay), [jobs]);
    const stats = useMemo(() => ({
        total: displayJobs.length,
        newThisMonth: 12,
        pendingApproval: displayJobs.filter(j => j.status === 'ממתין לאישור').length,
        critical: displayJobs.filter(j => (j as any).healthScore < 50).length
    }), [displayJobs]);

    // Filter Logic
    const filteredJobs = useMemo(() => {
        return displayJobs.filter(job => {
            // Context Filter
            if (activeContextTab === 'public' && !job.isPublic) return false;

            const matchesSearch = !searchTerm || 
                job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                job.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
                job.postingCode.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = filters.status === 'all' || job.status === filters.status;
            const matchesRecruiter = !filters.recruiter || job.recruiter === filters.recruiter;
            const matchesClient = !filters.client || job.client === filters.client;
            const matchesPriority = !filters.priority || job.priority === filters.priority;
            
            // New matches for Role and Field
            const matchesRole = !filters.role || job.role.includes(filters.role);
            const matchesField = !filters.field || job.field.includes(filters.field);
            
            return matchesSearch && matchesStatus && matchesRecruiter && matchesClient && matchesPriority && matchesRole && matchesField;
        }).sort((a, b) => {
            if (!sortConfig) return 0;
            const aVal = (a as any)[sortConfig.key];
            const bVal = (b as any)[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [searchTerm, filters, sortConfig, activeContextTab]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) setSelectedIds(new Set(filteredJobs.map(j => j.id)));
        else setSelectedIds(new Set());
    };

    const handleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };
    
    // NAVIGATION HANDLERS
    const handleJobClick = (job: any) => {
        setSelectedJob(job);
        setIsDrawerOpen(true);
    };

    const handleTitleClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        navigate(`/jobs/edit/${id}`);
    };
    
    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        if (selectedField) {
            setFilters(prev => ({
                ...prev,
                role: selectedField.role,
                // field: selectedField.category // Optional: can sync category too
            }));
        }
        setIsJobFieldSelectorOpen(false);
    };

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };
    
    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-primary-500 font-bold ml-1">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const handleBulkDelete = () => {
        if (window.confirm(`האם למחוק ${selectedIds.size} משרות?`)) {
            alert('משרות נמחקו בהצלחה (סימולציה)');
            setSelectedIds(new Set());
        }
    };

    const handleApproveJob = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        alert(`משרה ${id} אושרה ופורסמה!`);
    };

    const handleClearFilters = () => {
        setFilters({status: 'all', recruiter: '', client: '', priority: '', role: '', field: ''});
        setSearchTerm('');
        setCompanyFilters({ sizes: [], sectors: [], industry: '', field: '' });
    };

    // Column Management Handlers
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
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
                newCols.sort((a, b) => allColumnsDef.findIndex(c => c.id === a) - allColumnsDef.findIndex(c => c.id === b));
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
    
    // Renderer for cell content
    const renderCell = (job: any, colId: string) => {
        switch(colId) {
            case 'select':
                return null; 
            case 'title':
                return (
                    <div 
                        onClick={(e) => handleTitleClick(e, job.id)}
                        className="font-bold text-text-default hover:text-primary-600 hover:underline cursor-pointer transition-colors"
                    >
                        {job.title}
                        <div className="text-[10px] font-mono text-text-subtle font-normal mt-0.5">#{job.postingCode}</div>
                    </div>
                );
            case 'client':
                 return (
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center text-xs font-bold text-gray-500 border border-gray-200">
                            {job.client.charAt(0)}
                        </div>
                        <span className="font-medium">{job.client}</span>
                    </div>
                );
            case 'health': return <JobHealthIndicator score={job.healthScore} />;
            case 'progress': 
                return (
                    <div>
                         <ProcessBar pending={job.pendingCandidates} process={job.inProcessCandidates} hired={job.status === 'מאוישת' ? 1 : 0} />
                         <div className="text-[10px] text-text-muted mt-1 flex justify-between w-24">
                            <span>{job.pendingCandidates + job.inProcessCandidates} פעילים</span>
                        </div>
                    </div>
                );
            case 'status':
                 return (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusStyles[job.status as JobStatus]?.bg} ${statusStyles[job.status as JobStatus]?.text} ${statusStyles[job.status as JobStatus]?.border}`}>
                        {job.status}
                    </span>
                );
            case 'recruiter': return <span className="text-text-muted text-xs">{job.recruiter}</span>;
            case 'openDate': return <span className="text-text-muted font-mono text-xs">{new Date(job.openDate).toLocaleDateString('he-IL')}</span>;
            case 'source': 
                return job.isPublic 
                    ? <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-100"><GlobeAmericasIcon className="w-3 h-3"/> Public Board</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200"><BriefcaseIcon className="w-3 h-3"/> Internal</span>;
            case 'actions':
                return (
                     <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {job.status === 'ממתין לאישור' ? (
                            <>
                                <button onClick={(e) => handleApproveJob(e, job.id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors" title="אשר משרה">
                                    <CheckCircleIcon className="w-4 h-4" />
                                </button>
                                <button onClick={(e) => {e.stopPropagation()}} className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors" title="דחה">
                                    <XMarkIcon className="w-4 h-4" />
                                </button>
                            </>
                        ) : (
                            <button onClick={(e) => {e.stopPropagation()}} className="p-1.5 hover:bg-bg-subtle rounded-lg text-text-muted transition-colors">
                                <EllipsisVerticalIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header & KPIs */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-black text-text-default">מגדל פיקוח משרות (System Admin)</h1>
                        <p className="text-sm text-text-muted">מבט על כלל המשרות בארגון, אישורים, חריגות ובקרה מערכתית.</p>
                    </div>
                    <button 
                        onClick={() => navigate('/jobs/new')} 
                        className="bg-primary-600 text-white font-bold py-2.5 px-5 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2"
                    >
                        <BoltIcon className="w-5 h-5"/>
                        <span>משרה חדשה</span>
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="סה״כ משרות במערכת" value={stats.total} icon={<BriefcaseIcon className="w-6 h-6 text-blue-600"/>} color="bg-blue-50" />
                    <StatCard title="משרות חדשות (החודש)" value={stats.newThisMonth} trend="+15%" icon={<ChartBarIcon className="w-6 h-6 text-green-600"/>} color="bg-green-50" />
                    <StatCard title="ממתינות לאישור (Pending)" value={stats.pendingApproval} icon={<ClockIcon className="w-6 h-6 text-orange-600"/>} color="bg-orange-50" />
                    <StatCard title="משרות בסיכון / חריגה" value={stats.critical} icon={<ExclamationTriangleIcon className="w-6 h-6 text-red-600"/>} color="bg-red-50" />
                </div>
            </div>
            
            {/* Context Switcher (Internal vs Public) */}
            <div className="border-b border-border-default mb-4">
                <nav className="flex space-x-6 space-x-reverse" aria-label="Tabs">
                     <button
                        onClick={() => setActiveContextTab('all')}
                        className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-bold text-sm ${
                           activeContextTab === 'all'
                            ? 'border-primary-500 text-primary-600'
                            : 'border-transparent text-text-muted hover:text-text-default hover:border-gray-300'
                        }`}
                      >
                         <BriefcaseIcon className="w-5 h-5" />
                         כל המשרות (ATS)
                      </button>
                       <button
                        onClick={() => setActiveContextTab('public')}
                        className={`py-3 px-1 inline-flex items-center gap-2 border-b-2 font-bold text-sm ${
                           activeContextTab === 'public'
                            ? 'border-purple-500 text-purple-600'
                            : 'border-transparent text-text-muted hover:text-text-default hover:border-gray-300'
                        }`}
                      >
                         <GlobeAmericasIcon className="w-5 h-5" />
                         לוח משרות (Public)
                      </button>
                </nav>
            </div>

            {/* Main Layout: Toolbar Row + Grid */}
            <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm z-20 relative space-y-4">
                
                {/* TOP ROW: Search & View Toggles & Advanced Button */}
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="relative flex-grow w-full md:w-auto">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="חיפוש משרה, לקוח, קוד משרה..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all" 
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 flex-shrink-0">
                         {/* Advanced Search Toggle (Added Here) */}
                        <button 
                            onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all whitespace-nowrap text-sm font-semibold ${isAdvancedFilterOpen ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-border-default text-text-default hover:bg-bg-subtle'}`}
                        >
                             <AdjustmentsHorizontalIcon className="w-4 h-4"/>
                            <span>סינון מתקדם</span>
                        </button>
                        
                        <div className="w-px h-6 bg-border-default mx-1 hidden md:block"></div>

                        <button onClick={() => setViewMode('table')} className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-bg-subtle text-primary-600' : 'text-text-muted hover:bg-bg-subtle'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-bg-subtle text-primary-600' : 'text-text-muted hover:bg-bg-subtle'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                        
                        <div className="relative" ref={settingsRef}>
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="p-2 text-text-muted rounded-lg hover:bg-bg-subtle" title="הגדרות עמודות"><Cog6ToothIcon className="w-5 h-5"/></button>
                            {isSettingsOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                    <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                    <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {allColumnsDef.filter(c => !c.static).map(column => (
                                        <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer hover:bg-bg-subtle p-1 rounded">
                                        <input type="checkbox" checked={visibleColumns.includes(column.id)} onChange={() => handleColumnToggle(column.id)} className="w-4 h-4 text-primary-600 rounded" />
                                        {column.label}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Collapsible Advanced Filters */}
                {isAdvancedFilterOpen && (
                    <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-border-default animate-fade-in">
                        {/* Status Filter */}
                        <select 
                            value={filters.status} 
                            onChange={e => setFilters({...filters, status: e.target.value})}
                            className="bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm min-w-[120px]"
                        >
                            <option value="all">כל הסטטוסים</option>
                            <option value="פתוחה">פתוחה</option>
                            <option value="מוקפאת">מוקפאת</option>
                            <option value="מאוישת">מאוישת</option>
                            <option value="טיוטה">טיוטה</option>
                            <option value="ממתין לאישור">ממתין לאישור</option>
                        </select>

                        {/* Recruiter Filter */}
                        <select 
                            value={filters.recruiter} 
                            onChange={e => setFilters({...filters, recruiter: e.target.value})}
                            className="bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm min-w-[130px]"
                        >
                            <option value="">כל הרכזים</option>
                            <option value="דנה כהן">דנה כהן</option>
                            <option value="אביב לוי">אביב לוי</option>
                        </select>

                        {/* Client Filter */}
                        <select 
                            value={filters.client} 
                            onChange={e => setFilters({...filters, client: e.target.value})}
                            className="bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm min-w-[130px]"
                        >
                            <option value="">כל הלקוחות</option>
                            <option value="בזק">בזק</option>
                            <option value="Wix">Wix</option>
                        </select>

                        {/* Priority Filter */}
                        <select 
                            value={filters.priority} 
                            onChange={e => setFilters({...filters, priority: e.target.value})}
                            className="bg-bg-input border border-border-default rounded-xl py-2 px-3 text-sm min-w-[120px]"
                        >
                            <option value="">כל הדחיפויות</option>
                            <option value="רגילה">רגילה</option>
                            <option value="דחופה">דחופה</option>
                            <option value="קריטית">קריטית</option>
                        </select>

                        {/* Industry / Sector Button */}
                        <div className="relative">
                            <button
                                ref={companyFilterButtonRef}
                                onClick={(e) => { e.stopPropagation(); setIsCompanyFilterOpen(prev => !prev); }}
                                className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-xl border transition-all whitespace-nowrap text-sm h-[38px] ${
                                    isCompanyFilterOpen || companyFilters.industry
                                        ? 'bg-primary-100 text-primary-700 border-primary-300'
                                        : 'bg-white text-text-default border-border-default hover:border-primary-300'
                                }`}
                                title="סינון לפי תעשייה/סקטור"
                            >
                                <BuildingOffice2Icon className="w-4 h-4" />
                                <span className="hidden xl:inline">{t('jobs.filter_industry_btn')}</span>
                            </button>
                            {isCompanyFilterOpen && (
                                <CompanyFilterPopover
                                    onClose={() => setIsCompanyFilterOpen(false)}
                                    filters={companyFilters}
                                    setFilters={setCompanyFilters}
                                />
                            )}
                        </div>

                        {/* Job Field / Role Button */}
                        <button 
                            onClick={() => setIsJobFieldSelectorOpen(true)}
                            className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-xl border transition-all whitespace-nowrap text-sm h-[38px] ${filters.role ? 'bg-primary-100 text-primary-700 border-primary-300' : 'bg-white text-text-default border-border-default hover:border-primary-300'}`}
                            title="סינון לפי תפקיד/תחום"
                        >
                            <BriefcaseIcon className="w-4 h-4" />
                            <span>{filters.role || t('jobs.filter_role')}</span>
                            {filters.role && <span onClick={(e) => {e.stopPropagation(); setFilters(prev => ({...prev, role: ''}))}} className="ml-1 hover:text-red-500"><XMarkIcon className="w-3 h-3"/></span>}
                        </button>

                        {/* Clear Button */}
                        {(filters.status !== 'all' || filters.recruiter || filters.client || filters.priority || filters.role || companyFilters.industry) && (
                            <button onClick={handleClearFilters} className="text-sm text-text-muted hover:text-red-500 font-medium px-2 underline">נקה הכל</button>
                        )}
                    </div>
                )}

                {selectedIds.size > 0 && (
                    <div className="mt-4 bg-primary-50 border border-primary-100 p-3 rounded-xl flex justify-between items-center animate-fade-in">
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-primary-900 text-sm">{selectedIds.size} נבחרו</span>
                            <div className="h-4 w-px bg-primary-200"></div>
                            <button onClick={handleBulkDelete} className="text-xs font-bold text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                <TrashIcon className="w-4 h-4"/> מחק
                            </button>
                        </div>
                        <button onClick={() => setSelectedIds(new Set())} className="text-text-muted hover:text-text-default"><XMarkIcon className="w-4 h-4"/></button>
                    </div>
                )}
            </div>

            {/* Content Area */}
             <div className="flex-1 overflow-hidden">
                {viewMode === 'table' ? (
                    <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-sm">
                                <thead className="bg-bg-subtle text-text-muted font-bold text-xs uppercase border-b border-border-default sticky top-0 z-10">
                                    <tr>
                                        {/* Select Column (Static First) */}
                                        <th className="p-4 w-12 text-center bg-bg-subtle">
                                             <input 
                                                type="checkbox" 
                                                onChange={handleSelectAll} 
                                                checked={filteredJobs.length > 0 && selectedIds.size === filteredJobs.length}
                                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                            />
                                        </th>

                                        {/* Dynamic Columns */}
                                        {visibleColumns.map((colId, index) => {
                                            const col = allColumnsDef.find(c => c.id === colId);
                                            if(!col || col.id === 'select') return null; // Skip select if found in dynamic list (handled above)
                                            return (
                                                <th 
                                                    key={col.id} 
                                                    className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors bg-bg-subtle ${draggingColumn === col.id ? 'opacity-50' : ''}`}
                                                    draggable={!col.static}
                                                    onClick={!col.static ? () => requestSort(col.id) : undefined}
                                                    onDragStart={() => !col.static && handleDragStart(index, col.id)}
                                                    onDragEnter={() => !col.static && handleDragEnter(index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={e => e.preventDefault()}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        {col.label} 
                                                        {getSortIndicator(col.id)}
                                                    </div>
                                                </th>
                                            )
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredJobs.map(job => (
                                        <tr key={job.id} onClick={() => handleJobClick(job)} className={`group hover:bg-bg-hover transition-colors cursor-pointer ${selectedIds.has(job.id) ? 'bg-primary-50/50' : ''}`}>
                                             {/* Select Cell (Static First) */}
                                            <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                                 <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(job.id)}
                                                    onChange={() => handleSelect(job.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                                />
                                            </td>

                                            {visibleColumns.map(colId => {
                                                if (colId === 'select') return null; // Skip select
                                                return (
                                                    <td key={colId} className="p-4">
                                                        {renderCell(job, colId)}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    // Grid View Implementation
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredJobs.map(job => (
                            <AdminJobCard 
                                key={job.id} 
                                job={job} 
                                isSelected={selectedIds.has(job.id)} 
                                onSelect={() => handleSelect(job.id)}
                                onClick={() => handleJobClick(job)}
                                onTitleClick={(e) => handleTitleClick(e, job.id)}
                            />
                        ))}
                    </div>
                )}
            </div>
            
            <JobFieldSelector
                value={null}
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
            
            <JobDetailsDrawer
                job={selectedJob}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />

             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
        </div>
    );
};

export default AdminJobsView;
