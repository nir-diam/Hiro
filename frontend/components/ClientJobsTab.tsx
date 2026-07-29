import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Cog6ToothIcon, TableCellsIcon, Squares2X2Icon } from './Icons';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchJobHealthPulse,
    type JobHealthColor,
    type JobHealthPulseDto,
    type JobPulseLevel,
} from '../services/jobHealthRulesApi';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'סגורה';

interface Job {
  id: number | string;
  /** Real DB UUID used for pulse lookup */
  jobUuid: string;
  title: string;
  field: string;
  role: string;
  daysOpen: number;
  lastActivity: string;
  creationDate: string;
  closeDate: string | null;
  status: JobStatus;
  submissionMethod: string;
  referrals24h: number;
  referralsWeek: number;
  referralsMonth: number;
  referralsTotal: number;
  healthProfile?: string;
}

const allColumns = [
    { id: 'health', header: 'דופק משרה' },
    { id: 'id', header: "מס' משרה" },
    { id: 'title', header: "כותרת המשרה" },
    { id: 'field', header: "תחום" },
    { id: 'role', header: "תפקיד" },
    { id: 'daysOpen', header: "מס׳ ימים פתוחה" },
    { id: 'lastActivity', header: "פעילות אחרונה" },
    { id: 'creationDate', header: "תאריך יצירה" },
    { id: 'closeDate', header: "תאריך סגירה" },
    { id: 'status', header: "סטטוס" },
    { id: 'submissionMethod', header: "אמצעי שליחה" },
    { id: 'referrals24h', header: "הפנ' 24ש'" },
    { id: 'referralsWeek', header: "הפנ' שבוע" },
    { id: 'referralsMonth', header: "הפנ' חודש" },
    { id: 'referralsTotal', header: "הפנ' סה\"כ" },
];

const defaultVisibleColumns = ['health', 'id', 'title', 'status', 'referralsWeek', 'referralsTotal', 'lastActivity'];

const statusStyles: { [key in JobStatus]: { bg: string, text: string } } = {
    'פתוחה': { bg: 'bg-green-100', text: 'text-green-800' },
    'מוקפאת': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'סגורה': { bg: 'bg-gray-200', text: 'text-gray-700' },
};

/** Display styles for the matched rule color (not collapsed traffic-light level). */
const pulseColorStyles: Record<JobHealthColor, { dot: string; badge: string; label: string }> = {
    green: { dot: 'bg-green-500', badge: 'bg-green-50 text-green-800 border-green-200', label: 'ירוק' },
    yellow: { dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-800 border-yellow-200', label: 'צהוב' },
    red: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-800 border-red-200', label: 'אדום' },
    orange: { dot: 'bg-orange-500', badge: 'bg-orange-50 text-orange-800 border-orange-200', label: 'כתום' },
    blue: { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-800 border-blue-200', label: 'כחול' },
    purple: { dot: 'bg-purple-500', badge: 'bg-purple-50 text-purple-800 border-purple-200', label: 'סגול' },
    gray: { dot: 'bg-gray-400', badge: 'bg-gray-50 text-gray-700 border-gray-200', label: 'אפור' },
};

const levelToColor = (level: JobPulseLevel): JobHealthColor => {
    if (level === 'red') return 'red';
    if (level === 'yellow') return 'yellow';
    return 'green';
};

const JobHealthBadge: React.FC<{ data?: JobHealthPulseDto | null; status: JobStatus }> = ({ data, status }) => {
    if (status !== 'פתוחה') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold bg-gray-50 text-gray-600 border-gray-200">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                —
            </span>
        );
    }
    const rawColor = String(data?.color || '').toLowerCase() as JobHealthColor;
    const color: JobHealthColor =
        rawColor in pulseColorStyles
            ? rawColor
            : levelToColor((data?.level || 'green') as JobPulseLevel);
    const style = pulseColorStyles[color];
    const message = data?.message || 'תקין';
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${style.badge}`}
            title={message}
        >
            <span className={`w-2 h-2 rounded-full ${style.dot} ${data?.pulse ? 'animate-pulse' : ''}`} />
            {style.label}
        </span>
    );
};

const normalizeStatus = (raw: unknown): JobStatus => {
    const s = String(raw || '');
    if (s === 'מוקפאת' || s.toLowerCase() === 'frozen' || s.toLowerCase() === 'paused') return 'מוקפאת';
    if (s === 'סגורה' || s === 'מאוישת' || s.toLowerCase() === 'closed') return 'סגורה';
    if (s === 'טיוטה') return 'מוקפאת';
    return 'פתוחה';
};

const daysBetween = (from: string | null | undefined) => {
    if (!from) return 0;
    const start = new Date(from).getTime();
    if (Number.isNaN(start)) return 0;
    return Math.max(0, Math.floor((Date.now() - start) / 86400000));
};

const formatRelative = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '—';
    const days = Math.floor((Date.now() - t) / 86400000);
    if (days <= 0) return 'היום';
    if (days === 1) return 'אתמול';
    if (days < 7) return `לפני ${days} ימים`;
    if (days < 30) return `לפני ${Math.floor(days / 7)} שבועות`;
    return `לפני ${Math.floor(days / 30)} חודשים`;
};

const mapApiJob = (row: any): Job => {
    const openDate = row.openDate || row.createdAt || null;
    const updatedAt = row.updatedAt || openDate;
    const jobUuid = String(row.id || '');
    return {
        id: row.postingCode || row.id,
        jobUuid,
        title: String(row.title || row.publicJobTitle || 'משרה'),
        field: String(row.field || ''),
        role: String(row.role || ''),
        daysOpen: daysBetween(openDate),
        lastActivity: formatRelative(updatedAt),
        creationDate: openDate ? String(openDate).slice(0, 10) : '—',
        closeDate: row.closeDate ? String(row.closeDate).slice(0, 10) : null,
        status: normalizeStatus(row.status),
        submissionMethod: '—',
        referrals24h: 0,
        referralsWeek: 0,
        referralsMonth: 0,
        referralsTotal: Number(row.associatedCandidates || 0),
        healthProfile: row.healthProfile ? String(row.healthProfile) : 'standard',
    };
};

const JobCard: React.FC<{ job: Job; pulse?: JobHealthPulseDto | null }> = ({ job, pulse }) => {
    const { bg, text } = statusStyles[job.status];
    return (
        <div className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start gap-2">
                <div>
                    <p className="font-semibold text-primary-700">{job.title}</p>
                    <p className="text-sm text-text-muted">#{job.id} &middot; {job.role}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <JobHealthBadge data={pulse} status={job.status} />
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>{job.status}</span>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-text-muted">הפניות (שבוע)</p><p className="font-bold text-text-default">{job.referralsWeek}</p></div>
                <div><p className="text-text-muted">הפניות (סה"כ)</p><p className="font-bold text-text-default">{job.referralsTotal}</p></div>
                <div><p className="text-text-muted">פתוחה (ימים)</p><p className="font-bold text-text-default">{job.daysOpen}</p></div>
                <div><p className="text-text-muted">פעילות אחרונה</p><p className="font-bold text-text-default">{job.lastActivity}</p></div>
            </div>
        </div>
    );
};

interface ClientJobsTabProps {
    /** When set, loads jobs for this single organization (optionally scoped by clientId). */
    organizationId?: string;
    clientId?: string;
    /** Admin: load jobs for every organization linked to this client. */
    allLinkedOrganizations?: boolean;
}

const ClientJobsTab: React.FC<ClientJobsTabProps> = ({
    organizationId,
    clientId,
    allLinkedOrganizations = false,
}) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const useLiveJobs = Boolean(allLinkedOrganizations ? clientId : organizationId);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [loading, setLoading] = useState(useLiveJobs);
    const [error, setError] = useState<string | null>(null);
    const [jobPulseById, setJobPulseById] = useState<Record<string, JobHealthPulseDto>>({});

    useEffect(() => {
        if (!apiBase) return;
        const linkedUrl = allLinkedOrganizations && clientId
            ? `${apiBase}/api/clients/${encodeURIComponent(clientId)}/linked-jobs`
            : null;
        const orgUrl = !linkedUrl && organizationId
            ? `${apiBase}/api/organizations/${encodeURIComponent(organizationId)}/jobs${
                clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
              }`
            : null;
        const url = linkedUrl || orgUrl;
        if (!url) {
            setJobs([]);
            setLoading(false);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        fetch(url, { headers: authHeaders(true) })
            .then((r) => {
                if (!r.ok) throw new Error('Failed to load jobs');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const rows = Array.isArray(data) ? data.map(mapApiJob) : [];
                setJobs(rows);
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Failed to load jobs');
                setJobs([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, organizationId, clientId, allLinkedOrganizations]);

    useEffect(() => {
        if (!clientId || !jobs.length) {
            setJobPulseById({});
            return;
        }
        let active = true;
        void fetchJobHealthPulse(clientId, organizationId || null)
            .then((data) => {
                if (!active) return;
                setJobPulseById(data.byJobId || {});
            })
            .catch(() => {
                if (!active) return;
                setJobPulseById({});
            });
        return () => { active = false; };
    }, [clientId, organizationId, jobs]);

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const sortedJobs = useMemo(() => {
        let sortableItems = [...jobs];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aValue = (a as any)[sortConfig.key];
                const bValue = (b as any)[sortConfig.key];

                if (aValue === null || aValue === undefined) return 1;
                if (bValue === null || bValue === undefined) return -1;
                
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
    }, [sortConfig, jobs]);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            const isCurrentlyVisible = prev.includes(columnId);
            if (isCurrentlyVisible) {
                return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            } else {
                const columnToAdd = allColumns.find(c => c.id === columnId);
                if (!columnToAdd) return prev;
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
        const newColumns = [...visibleColumns];
        const draggedItem = newColumns.splice(dragItemIndex.current, 1)[0];
        newColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newColumns);
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
            case 'health':
                return (
                    <div className="flex justify-center">
                        <JobHealthBadge data={jobPulseById[job.jobUuid]} status={job.status} />
                    </div>
                );
            case 'title':
                return <span className="font-semibold text-primary-700">{job.title}</span>;
            case 'status':
                const { bg, text } = statusStyles[job.status];
                return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>{job.status}</span>;
            default:
                return (job as any)[columnId] ?? '-';
        }
    };

    return (
        <div className="bg-bg-card p-6 rounded-lg border border-border-default">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">משרות ({loading ? '…' : sortedJobs.length})</h2>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} title="תצוגת טבלה" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                     <div className="relative" ref={settingsRef}>
                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2.5 bg-bg-subtle text-text-muted rounded-lg hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                        {isSettingsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto">
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
            </header>

            {error && (
                <p className="text-sm text-red-600 mb-3">{error}</p>
            )}
            {loading && (
                <p className="text-sm text-text-muted mb-3">טוען משרות...</p>
            )}
            
            <main className="mt-4">
                {!loading && !error && sortedJobs.length === 0 ? (
                    <p className="text-sm text-text-muted text-center py-8">אין משרות לארגון זה.</p>
                ) : viewMode === 'table' ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right min-w-[800px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                <tr>
                                    {visibleColumns.map((colId, index) => {
                                        const col = allColumns.find(c => c.id === colId);
                                        if (!col) return null;
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
                                                className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''} ${col.id === 'health' ? 'text-center' : ''}`}
                                                title="גרור לשינוי סדר"
                                            >
                                                <div className="flex items-center gap-1">
                                                    <span>{col.header}</span>
                                                    {getSortIndicator(col.id)}
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {sortedJobs.map(job => (
                                    <tr key={job.jobUuid || String(job.id)} className="hover:bg-bg-hover">
                                        {visibleColumns.map(colId => (
                                            <td key={colId} className="p-4 text-text-muted">{renderCell(job, colId)}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {sortedJobs.map(job => (
                            <JobCard
                                key={job.jobUuid || String(job.id)}
                                job={job}
                                pulse={jobPulseById[job.jobUuid]}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ClientJobsTab;
