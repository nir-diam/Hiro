
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseIcon, UserGroupIcon, MapPinIcon, Cog6ToothIcon, EyeIcon, ChartBarIcon, ArrowPathIcon, DocumentArrowDownIcon, MagnifyingGlassIcon, TableCellsIcon, Squares2X2Icon, ChevronDownIcon, XMarkIcon } from './Icons';
import LocationSelector, { LocationItem } from './LocationSelector';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';
import { fetchBoardPublications, type BoardPublicationRow } from '../services/publishingApi';
import { useAuth } from '../context/AuthContext';

// --- TYPES ---
interface JobPublication {
  id: string; // composite key jobId+sourceId
  jobId: string;
  company: string;
  jobTitle: string;
  domain: string;
  role: string;
  publicationDate: string;
  city: string;
  region: string;
  candidatesCount: number;
  views: number;
  board: string;
}

const allColumns = [
  { id: 'jobTitle', header: 'שם משרה', width: '20%' },
  { id: 'company', header: 'חברה', width: '15%' },
  { id: 'domain', header: 'תחום', width: '10%' },
  { id: 'board', header: 'לוח פרסום', width: '10%' },
  { id: 'city', header: 'עיר', width: '10%' },
  { id: 'candidatesCount', header: 'מועמדים', width: '10%' },
  { id: 'conversion', header: 'יחס המרה', width: '15%' },
  { id: 'publicationDate', header: 'תאריך פרסום', width: '10%' },
];

const defaultVisibleColumns = allColumns.map(c => c.id);

// --- COMPONENTS ---

const StatCard: React.FC<{ title: string; value: string | number; subValue?: string; icon: React.ReactNode; color: string }> = ({ title, value, subValue, icon, color }) => (
    <div className="bg-bg-card p-4 rounded-2xl border border-border-default shadow-sm flex items-center justify-between hover:shadow-md transition-shadow cursor-default">
        <div>
            <p className="text-sm font-semibold text-text-muted mb-1">{title}</p>
            <p className="text-2xl font-extrabold text-text-default">{value}</p>
            {subValue && <p className="text-xs text-text-subtle mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

const ConversionBar: React.FC<{ candidates: number; views: number }> = ({ candidates, views }) => {
    const rate = views > 0 ? (candidates / views) * 100 : 0;
    let colorClass = "bg-red-500";
    if (rate > 4) colorClass = "bg-green-500";
    else if (rate > 1.5) colorClass = "bg-yellow-500";

    return (
        <div className="flex flex-col w-full max-w-[140px]">
            <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-text-default">{rate.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-bg-subtle rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${Math.min(rate * 10, 100)}%` }}></div>
            </div>
        </div>
    );
};

// NEW CARD COMPONENT
const JobPublicationCard: React.FC<{ job: JobPublication; onNavigate: (jobId: string) => void }> = ({ job, onNavigate }) => (
    <div className="bg-bg-card border border-border-default rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
        <div className="flex justify-between items-start">
            <div>
                <button onClick={() => onNavigate(job.jobId)} className="text-right group/cardtitle">
                    <h3 className="font-bold text-lg text-primary-700 group-hover/cardtitle:text-primary-900 group-hover/cardtitle:underline leading-tight mb-1">{job.jobTitle}</h3>
                </button>
                <p className="text-sm text-text-default font-medium">{job.company}</p>
            </div>
            <span className="text-[10px] bg-bg-subtle px-2 py-0.5 rounded-full border border-border-default text-text-muted whitespace-nowrap">
                {new Date(job.publicationDate).toLocaleDateString('he-IL')}
            </span>
        </div>
        
        <div className="grid grid-cols-3 gap-2 bg-bg-subtle/30 p-2 rounded-lg">
             <div className="flex flex-col items-center justify-center p-1">
                <span className="text-xs text-text-muted mb-1">חשיפות</span>
                <span className="font-bold text-text-default">{job.views.toLocaleString()}</span>
             </div>
             <div className="flex flex-col items-center justify-center border-r border-border-subtle p-1">
                <span className="text-xs text-text-muted mb-1">מועמדים</span>
                <span className="font-bold text-text-default">{job.candidatesCount}</span>
             </div>
             <div className="flex flex-col items-center justify-center border-r border-border-subtle p-1 w-full">
                <span className="text-xs text-text-muted mb-1">המרה</span>
                <div className="w-full px-1">
                     <ConversionBar candidates={job.candidatesCount} views={job.views} />
                </div>
             </div>
        </div>

        <div className="flex items-center justify-between text-xs text-text-muted mt-auto pt-2 border-t border-border-subtle">
            <div className="flex gap-2">
                 <span className="flex items-center gap-1">
                    <MapPinIcon className="w-3 h-3" />
                    {job.city}
                 </span>
                 <span className="flex items-center gap-1 font-bold text-primary-600">
                    {job.board}
                 </span>
            </div>
            <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-md font-semibold">
                {job.domain}
            </span>
        </div>
    </div>
);

const DomainJobsPopup: React.FC<{
    domain: string;
    jobs: JobPublication[];
    onClose: () => void;
    onNavigate: (jobId: string) => void;
}> = ({ domain, jobs, onClose, onNavigate }) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div className="bg-bg-card rounded-2xl shadow-2xl border border-border-default w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
                    <div>
                        <h3 className="font-bold text-text-default text-base">{domain}</h3>
                        <p className="text-xs text-text-muted mt-0.5">{jobs.length} משרות בתחום זה</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-muted">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="overflow-y-auto custom-scrollbar flex-1">
                    {jobs.map((job) => (
                        <button
                            key={job.id}
                            onClick={() => { onNavigate(job.jobId); onClose(); }}
                            className="w-full text-right flex items-center justify-between px-5 py-3.5 hover:bg-bg-hover transition-colors border-b border-border-subtle last:border-0 group"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-primary-700 group-hover:text-primary-900 truncate">{job.jobTitle}</p>
                                <p className="text-xs text-text-muted truncate">{job.company} · {job.city}</p>
                            </div>
                            <div className="flex items-center gap-2 mr-3 shrink-0">
                                {job.candidatesCount > 0 && (
                                    <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">{job.candidatesCount} מועמדים</span>
                                )}
                                <span className="text-xs text-text-subtle bg-bg-subtle border border-border-default px-2 py-0.5 rounded-full">{job.board}</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

const DomainPerformanceChart: React.FC<{ data: JobPublication[]; onNavigate: (jobId: string) => void }> = ({ data, onNavigate }) => {
    const [popup, setPopup] = useState<{ domain: string; jobs: JobPublication[] } | null>(null);

    const domainMap = useMemo(() => {
        return data.reduce((acc, job) => {
            if (!acc[job.domain]) acc[job.domain] = { candidates: 0, views: 0, count: 0, jobs: [] };
            acc[job.domain].candidates += job.candidatesCount;
            acc[job.domain].views += job.views;
            acc[job.domain].count += 1;
            acc[job.domain].jobs.push(job);
            return acc;
        }, {} as Record<string, { candidates: number; views: number; count: number; jobs: JobPublication[] }>);
    }, [data]);

    type DomainStat = { candidates: number; views: number; count: number; jobs: JobPublication[] };
    const sortedDomains = (Object.entries(domainMap) as [string, DomainStat][])
        .sort(([, a], [, b]) => b.candidates - a.candidates)
        .slice(0, 5);

    const maxVal = Math.max(...sortedDomains.map(([, s]) => s.candidates), 1);

    return (
        <>
            {popup && (
                <DomainJobsPopup
                    domain={popup.domain}
                    jobs={popup.jobs}
                    onClose={() => setPopup(null)}
                    onNavigate={onNavigate}
                />
            )}
            <div className="bg-bg-card p-6 rounded-2xl border border-border-default shadow-sm h-full flex flex-col">
                <h3 className="text-lg font-bold text-text-default mb-6 flex items-center gap-2">
                    <ChartBarIcon className="w-5 h-5 text-primary-500" />
                    ביצועים לפי תחום (Top 5)
                </h3>
                <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {sortedDomains.map(([domain, stats]) => (
                        <div key={domain} className="group">
                            <div className="flex justify-between text-sm mb-1.5">
                                <span className="font-bold text-text-default">{domain}</span>
                                <button
                                    onClick={() => setPopup({ domain, jobs: stats.jobs })}
                                    className="text-text-muted text-xs bg-bg-subtle px-2 py-0.5 rounded-full border border-border-default hover:border-primary-400 hover:text-primary-700 hover:bg-primary-50 transition-colors cursor-pointer"
                                >
                                    {stats.count} משרות
                                </button>
                            </div>
                            <div className="relative h-9 bg-bg-subtle rounded-lg overflow-hidden flex items-center">
                                <div
                                    className="absolute top-0 right-0 h-full bg-primary-100 group-hover:bg-primary-200 transition-colors duration-500"
                                    style={{ width: `${(stats.candidates / maxVal) * 100}%` }}
                                />
                                <div className="relative z-10 w-full flex justify-between px-3 text-xs">
                                    <span className="font-bold text-primary-900">{stats.candidates.toLocaleString()} מועמדים</span>
                                    <span className="text-text-subtle hidden sm:inline font-medium">{stats.views.toLocaleString()} חשיפות</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {sortedDomains.length === 0 && <div className="text-center text-text-muted py-8">אין נתונים להצגה</div>}
                </div>
            </div>
        </>
    );
};

const PublicationsReportView: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';

    const today = new Date();
    const ninetyDaysAgo = new Date(new Date().setDate(today.getDate() - 90));

    const [filters, setFilters] = useState({
        startDate: ninetyDaysAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0],
        searchTerm: '',
        domain: '',
        board: '',
        locations: [] as LocationItem[]
    });

    const [allData, setAllData] = useState<JobPublication[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    
    const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => window.innerWidth < 1024 ? 'grid' : 'table');

    const [activePreset, setActivePreset] = useState<'month' | 'week' | 'today' | 'quarter' | 'custom'>('quarter');
    const [columns, setColumns] = useState(allColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'publicationDate', direction: 'desc' });
    
    // New State for Mobile Toggle
    const [showMobileStats, setShowMobileStats] = useState(false);
    const [isJobFieldSelectorOpen, setIsJobFieldSelectorOpen] = useState(false); // Job Field Selector State

    const settingsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load real board publications from the backend
    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await fetchBoardPublications({
                startDate: filters.startDate,
                endDate: filters.endDate,
                clientId: isPlatformAdmin ? null : (user?.clientId ?? null),
            });
            const mapped: JobPublication[] = rows.map((r: BoardPublicationRow) => ({
                id: `${r.jobId}-${r.sourceId}`,
                jobId: r.jobId,
                company: r.company || '',
                jobTitle: r.jobTitle || '',
                domain: r.domain || '',
                role: r.role || '',
                publicationDate: r.publicationDate ? String(r.publicationDate).split('T')[0] : '',
                city: r.city || '',
                region: r.region || '',
                candidatesCount: Number(r.candidatesCount) || 0,
                views: 0,
                board: r.sourceName || '',
            }));
            setAllData(mapped);
        } catch (e: unknown) {
            setLoadError((e as Error).message || 'שגיאה בטעינת הדוח');
            setAllData([]);
        } finally {
            setLoading(false);
        }
    }, [filters.startDate, filters.endDate, isPlatformAdmin, user?.clientId]);

    useEffect(() => { void loadData(); }, [loadData]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
        if (e.target.name === 'startDate' || e.target.name === 'endDate') {
            setActivePreset('custom');
        }
    };

    const handleLocationChange = (newLocations: LocationItem[]) => {
        setFilters(prev => ({ ...prev, locations: newLocations }));
    };

    const handleJobFieldSelect = (selectedField: SelectedJobField | null) => {
        if (selectedField) {
            // Mapping the selected category/role to the domain filter
            // In a real app, this might filter by category OR role explicitly
            setFilters(prev => ({ ...prev, domain: selectedField.category })); 
        }
        setIsJobFieldSelectorOpen(false);
    };

    const clearDomainFilter = (e: React.MouseEvent) => {
        e.stopPropagation();
        setFilters(prev => ({ ...prev, domain: '' }));
    };

    const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        const end = new Date();
        const start = new Date();
        
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);
        
        setFilters(prev => ({
            ...prev,
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        }));
        setActivePreset(preset);
    };

    const handleColumnToggle = (columnId: string) => {
        const isVisible = columns.some(c => c.id === columnId);
        if (isVisible) {
             if (columns.length > 2) setColumns(prev => prev.filter(c => c.id !== columnId));
        } else {
            const columnToAdd = allColumns.find(c => c.id === columnId);
            if (columnToAdd) setColumns(prev => [...prev, columnToAdd]);
        }
    };
    
    const uniqueBoards = useMemo(() => Array.from(new Set(allData.map(j => j.board))).filter(Boolean), [allData]);

    // Process Data (Filter & Sort)
    const processedData = useMemo(() => {
        let data = allData.filter(job => {
            const matchesSearch = !filters.searchTerm || 
                job.jobTitle.toLowerCase().includes(filters.searchTerm.toLowerCase()) || 
                job.company.toLowerCase().includes(filters.searchTerm.toLowerCase());
            
            // Loose matching for domain since job selector might return broad categories
            const matchesDomain = !filters.domain || job.domain.includes(filters.domain) || filters.domain.includes(job.domain);
            const matchesBoard = !filters.board || job.board === filters.board; 
            
            const matchesLocation = filters.locations.length === 0 || 
                filters.locations.some(loc => 
                    (loc.type === 'city' && job.city === loc.value) ||
                    (loc.type === 'region' && job.region === loc.value)
                );

            const jobDate = new Date(job.publicationDate);
            const start = new Date(filters.startDate);
            const end = new Date(filters.endDate);
            // Ensure comparison includes the full end day
            end.setHours(23, 59, 59, 999);
            start.setHours(0, 0, 0, 0);

            const matchesDate = jobDate >= start && jobDate <= end;

            return matchesSearch && matchesDomain && matchesBoard && matchesLocation && matchesDate;
        });

        if (sortConfig) {
            data.sort((a, b) => {
                let aVal: unknown = (a as Record<string, unknown>)[sortConfig.key];
                let bVal: unknown = (b as Record<string, unknown>)[sortConfig.key];
                if (sortConfig.key === 'conversion') {
                    aVal = (a.candidatesCount || 0) / (a.views || 1);
                    bVal = (b.candidatesCount || 0) / (b.views || 1);
                }
                if ((aVal ?? '') < (bVal ?? '')) return sortConfig.direction === 'asc' ? -1 : 1;
                if ((aVal ?? '') > (bVal ?? '')) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return data;
    }, [allData, filters, sortConfig]);

    // Stats Calculation
    const stats = useMemo(() => {
        const totalViews = processedData.reduce((acc, job) => acc + job.views, 0);
        const totalCandidates = processedData.reduce((acc, job) => acc + job.candidatesCount, 0);
        const avgConversion = totalViews > 0 ? ((totalCandidates / totalViews) * 100).toFixed(1) : '0';
        const activeJobs = processedData.length;
        return { totalViews, totalCandidates, avgConversion, activeJobs };
    }, [processedData]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const renderCell = (job: JobPublication, columnId: string) => {
        switch (columnId) {
            case 'publicationDate':
                return job.publicationDate ? new Date(job.publicationDate).toLocaleDateString('he-IL') : '—';
            case 'jobTitle':
                return (
                    <button
                        onClick={() => navigate(`/jobs/edit/${job.jobId}`)}
                        className="text-right group/jobtitle"
                    >
                        <span className="font-bold text-primary-700 group-hover/jobtitle:text-primary-900 group-hover/jobtitle:underline block text-sm">{job.jobTitle}</span>
                        <span className="text-xs text-text-muted">{job.role}</span>
                    </button>
                );
            case 'company':
                return <span className="font-medium text-text-default">{job.company}</span>;
            case 'domain':
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">{job.domain || '—'}</span>;
            case 'board':
                return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">{job.board}</span>;
            case 'views':
                return <span className="text-text-muted font-mono">{job.views.toLocaleString()}</span>;
            case 'candidatesCount':
                return <span className="font-bold text-text-default text-base">{job.candidatesCount}</span>;
            case 'conversion':
                return <ConversionBar candidates={job.candidatesCount} views={job.views} />;
            default:
                return String((job as unknown as Record<string, unknown>)[columnId] ?? '');
        }
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-2">
             <div className="flex flex-col gap-1">
                 <h1 className="text-2xl font-extrabold text-text-default">דוח פרסומים</h1>
                 <p className="text-text-muted text-sm">ניתוח ביצועי משרות, חשיפה ויחסי המרה בזמן אמת</p>
            </div>

            {loadError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
                    <span>{loadError}</span>
                    <button type="button" onClick={() => void loadData()} className="underline text-xs">נסה שוב</button>
                </div>
            )}

             {/* Mobile Stats Toggle */}
            <div className="lg:hidden">
                <button 
                    onClick={() => setShowMobileStats(!showMobileStats)}
                    className="w-full flex items-center justify-between p-3 bg-bg-card border border-border-default rounded-xl shadow-sm text-sm font-bold text-text-default"
                >
                    <span>{showMobileStats ? 'הסתר מדדים' : 'הצג מדדים וסטטיסטיקה'}</span>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${showMobileStats ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Statistics Section (Moved to top, collapsible on mobile) */}
            <div className={`${showMobileStats ? 'grid' : 'hidden'} lg:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in`}>
                <StatCard 
                    title="סה״כ מועמדים" 
                    value={stats.totalCandidates.toLocaleString()} 
                    subValue="לפי הסינון הנוכחי"
                    icon={<UserGroupIcon className="w-6 h-6 text-primary-600"/>} 
                    color="bg-primary-100"
                />
                <StatCard 
                    title="סה״כ חשיפות" 
                    value={stats.totalViews.toLocaleString()}
                    subValue="צפיות בדפי המשרה"
                    icon={<EyeIcon className="w-6 h-6 text-blue-600"/>} 
                    color="bg-blue-100"
                />
                 <StatCard 
                    title="יחס המרה ממוצע" 
                    value={`${stats.avgConversion}%`} 
                    subValue="מצפייה להגשה"
                    icon={<ArrowPathIcon className="w-6 h-6 text-green-600"/>} 
                    color="bg-green-100"
                />
                 <StatCard 
                    title="משרות בחתך" 
                    value={stats.activeJobs}
                    icon={<BriefcaseIcon className="w-6 h-6 text-orange-600"/>} 
                    color="bg-orange-100"
                />
            </div>

            {/* Search & Filters Bar */}
            <div className="bg-bg-card p-3 rounded-2xl border border-border-default shadow-sm lg:sticky lg:top-0 z-20">
                <div className="flex flex-col lg:flex-row items-center gap-3">
                    
                    {/* Date Presets - Right aligned for RTL */}
                    <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default overflow-x-auto no-scrollbar w-full lg:w-auto">
                        <button onClick={() => applyDatePreset('today')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${activePreset === 'today' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>היום</button>
                        <button onClick={() => applyDatePreset('week')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${activePreset === 'week' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>השבוע</button>
                        <button onClick={() => applyDatePreset('month')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${activePreset === 'month' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>החודש</button>
                        <button onClick={() => applyDatePreset('quarter')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${activePreset === 'quarter' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>רבעון</button>
                    </div>

                    <div className="h-8 w-px bg-border-default hidden lg:block mx-1"></div>

                    {/* Inputs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:flex gap-3 w-full lg:w-auto items-center flex-grow">
                         <div className="relative w-full lg:flex-grow">
                             <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                             <input 
                                type="text" 
                                name="searchTerm" 
                                placeholder="חיפוש משרה או חברה..."
                                value={filters.searchTerm} 
                                onChange={handleFilterChange} 
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pr-9 pl-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px]"
                            />
                        </div>
                        
                        {/* Domain (Field) Selector Button - Replaces native select */}
                         <div className="relative w-full lg:w-40">
                             <button
                                onClick={() => setIsJobFieldSelectorOpen(true)}
                                className={`w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm flex justify-between items-center h-[38px] focus:ring-1 focus:ring-primary-500 outline-none hover:border-primary-300 transition-colors ${!filters.domain ? 'text-text-muted' : 'text-text-default font-medium'}`}
                             >
                                <span className="truncate">{filters.domain || 'כל התחומים'}</span>
                                {filters.domain ? (
                                    <div onClick={clearDomainFilter} className="p-0.5 hover:bg-bg-subtle rounded-full text-text-subtle">
                                        <XMarkIcon className="w-3.5 h-3.5" />
                                    </div>
                                ) : (
                                    <ChevronDownIcon className="w-4 h-4 text-text-subtle flex-shrink-0" />
                                )}
                             </button>
                        </div>
                        
                        {/* Board Filter - Styled like a button for consistency */}
                        <div className="relative w-full lg:w-40">
                             <select 
                                name="board" 
                                value={filters.board} 
                                onChange={handleFilterChange} 
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px] appearance-none cursor-pointer"
                             >
                                <option value="">כל הלוחות</option>
                                {uniqueBoards.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>

                        <div className="w-full lg:w-48">
                            <LocationSelector 
                                selectedLocations={filters.locations} 
                                onChange={handleLocationChange} 
                                placeholder="כל האזורים" 
                                className="w-full"
                            />
                        </div>

                        {/* Date Range - Stacked on Mobile to fix "Glitch" */}
                        <div className="relative w-full lg:w-auto flex flex-col sm:flex-row items-center gap-3 sm:gap-2">
                             <div className="relative w-full sm:w-auto">
                                <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מ-</span>
                                <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px] w-full sm:w-32"/>
                             </div>
                             <div className="relative w-full sm:w-auto">
                                <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">עד-</span>
                                <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px] w-full sm:w-32"/>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
                {/* Visual Chart */}
                <div className="lg:col-span-1 h-full hidden lg:block">
                     <DomainPerformanceChart data={processedData} onNavigate={(jobId) => navigate(`/jobs/edit/${jobId}`)} />
                </div>

                {/* Detailed Table / Grid */}
                <div className="lg:col-span-2 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex flex-col h-full">
                     <div className="flex justify-between items-center p-4 border-b border-border-default bg-bg-subtle/30">
                        <div className="flex items-center gap-2">
                             <TableCellsIcon className="w-5 h-5 text-text-muted"/>
                             <h3 className="font-bold text-text-default">פירוט פרסומים ({processedData.length})</h3>
                             {loading && <ArrowPathIcon className="w-4 h-4 text-text-muted animate-spin" />}
                        </div>
                        <div className="flex items-center gap-2">
                            {/* View Mode Toggle Buttons */}
                            <div className="flex items-center bg-bg-subtle p-1 rounded-lg border border-border-default">
                                <button 
                                    onClick={() => setViewMode('table')} 
                                    title="תצוגת טבלה" 
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                >
                                    <TableCellsIcon className="w-4 h-4"/>
                                </button>
                                <button 
                                    onClick={() => setViewMode('grid')} 
                                    title="תצוגת כרטיסיות" 
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}
                                >
                                    <Squares2X2Icon className="w-4 h-4"/>
                                </button>
                            </div>
                            
                            <div className="w-px h-5 bg-border-default mx-1 hidden sm:block"></div>

                            <button title="רענן" className="p-2 text-text-muted rounded-full hover:bg-bg-hover transition-colors" onClick={() => void loadData()}>
                                <ArrowPathIcon className="w-5 h-5"/>
                            </button>
                            <button title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover transition-colors" onClick={() => alert('Exporting to Excel...')}>
                                <DocumentArrowDownIcon className="w-5 h-5"/>
                            </button>
                            <div className="relative" ref={settingsRef}>
                                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                                {isSettingsOpen && (
                                    <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                        <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                        {allColumns.map(column => (
                                            <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer hover:bg-bg-subtle p-1 rounded">
                                            <input
                                                type="checkbox"
                                                checked={columns.some(c => c.id === column.id)}
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
                        </div>
                     </div>

                    <div className="flex-1 overflow-auto custom-scrollbar bg-bg-default/50 p-0 md:p-0">
                        {viewMode === 'table' ? (
                            <table className="w-full text-sm text-right min-w-[800px]">
                                <thead className="bg-bg-subtle/80 text-text-muted font-bold sticky top-0 z-10 backdrop-blur-md border-b border-border-default">
                                    <tr>
                                    {columns.map((col, index) => (
                                            <th
                                                key={col.id}
                                                onClick={() => requestSort(col.id as any)}
                                                className="p-4 cursor-pointer hover:bg-bg-hover transition-colors select-none"
                                                style={{ width: (col as any).width }}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {col.header}
                                                    {sortConfig.key === col.id && <span className="text-primary-500">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-default bg-bg-card">
                                {processedData.map(job => (
                                    <tr key={job.id} className="hover:bg-bg-hover/50 group transition-colors">
                                        {columns.map(col => (
                                            <td key={col.id} className="p-4 align-middle">
                                                {renderCell(job, col.id)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                                {processedData.map(job => (
                                    <JobPublicationCard key={job.id} job={job} onNavigate={(jobId) => navigate(`/jobs/edit/${jobId}`)} />
                                ))}
                            </div>
                        )}
                        
                        {loading && processedData.length === 0 && (
                            <div className="p-12 text-center text-text-muted">
                                <ArrowPathIcon className="w-8 h-8 opacity-30 animate-spin mx-auto mb-2"/>
                                <span>טוען נתונים…</span>
                            </div>
                        )}
                        {!loading && processedData.length === 0 && (
                            <div className="p-12 text-center text-text-muted">
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <MagnifyingGlassIcon className="w-8 h-8 opacity-20"/>
                                    <span>אין פרסומים פעילים בטווח התאריכים שנבחר.</span>
                                    <span className="text-xs">סמן מקור כ-"פורסם" במשרה כדי שיופיע כאן.</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
             <JobFieldSelector
                value={null} // Controlled locally if needed, or null for general usage
                onChange={handleJobFieldSelect}
                isModalOpen={isJobFieldSelectorOpen}
                setIsModalOpen={setIsJobFieldSelectorOpen}
            />
        </div>
    );
};

export default PublicationsReportView;
