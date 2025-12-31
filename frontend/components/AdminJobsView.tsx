
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, CheckCircleIcon, XMarkIcon } from './Icons';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה' | 'ממתין לאישור';

const statusStyles: { [key in JobStatus]: { text: string; bg: string; } } = {
  'פתוחה': { text: 'text-green-800', bg: 'bg-green-100' },
  'מוקפאת': { text: 'text-amber-800', bg: 'bg-amber-100' },
  'מאוישת': { text: 'text-gray-700', bg: 'bg-gray-200' },
  'טיוטה': { text: 'text-indigo-800', bg: 'bg-indigo-100' },
  'ממתין לאישור': { text: 'text-orange-800', bg: 'bg-orange-100' },
};

type JobItem = {
    id: string;
    title: string;
    client?: string;
    status?: JobStatus;
    associatedCandidates?: number;
    openDate?: string;
    recruiter?: string;
};

const AdminJobsView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [jobs, setJobs] = useState<JobItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`${apiBase}/api/jobs`);
                if (!res.ok) throw new Error('טעינת משרות נכשלה');
                const data = await res.json();
                // Normalize fields
                const mapped: JobItem[] = data.map((j: any) => ({
                    id: j.id,
                    title: j.title || 'ללא כותרת',
                    client: j.client || j.clientName || '',
                    status: (j.status || 'פתוחה') as JobStatus,
                    associatedCandidates: j.associatedCandidates || 0,
                    openDate: j.createdAt || j.openDate,
                    recruiter: j.recruiter || j.accountManager || '',
                }));
                setJobs(mapped);
            } catch (e: any) {
                setError(e.message || 'שגיאה בטעינה');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [apiBase]);

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

    const sortedAndFilteredJobs = useMemo(() => {
        let filtered = jobs.filter(job => {
            const client = job.client || '';
            return (
                (job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                client.toLowerCase().includes(searchTerm.toLowerCase())) &&
                (filterStatus === 'all' || (filterStatus === 'pending' && job.status === 'ממתין לאישור'))
            );
        });
        
        if (sortConfig) {
            filtered.sort((a, b) => {
                const aVal = (a as any)[sortConfig.key];
                const bVal = (b as any)[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [searchTerm, sortConfig, filterStatus]);

    if (loading) {
        return <div className="p-6 text-text-muted">טוען משרות...</div>;
    }

    if (error) {
        return <div className="p-6 text-red-600">{error}</div>;
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div className="relative w-full max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="חיפוש לפי שם משרה או לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm" />
                </div>
                <div className="flex bg-bg-subtle p-1 rounded-lg">
                    <button 
                        onClick={() => setFilterStatus('all')} 
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition ${filterStatus === 'all' ? 'bg-bg-card shadow text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                    >
                        כל המשרות
                    </button>
                    <button 
                        onClick={() => setFilterStatus('pending')} 
                        className={`px-4 py-1.5 text-sm font-semibold rounded-md transition flex items-center gap-2 ${filterStatus === 'pending' ? 'bg-bg-card shadow text-orange-700' : 'text-text-muted hover:text-text-default'}`}
                    >
                        ממתינות לאישור
                        {jobs.filter(j => j.status === 'ממתין לאישור').length > 0 && (
                            <span className="bg-orange-500 text-white text-xs px-1.5 rounded-full">
                                {jobs.filter(j => j.status === 'ממתין לאישור').length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right min-w-[1000px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                        <tr>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('title')}>שם משרה {getSortIndicator('title')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('client')}>לקוח {getSortIndicator('client')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('status')}>סטטוס {getSortIndicator('status')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('associatedCandidates')}>מועמדים {getSortIndicator('associatedCandidates')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('openDate')}>ת. פתיחה {getSortIndicator('openDate')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('recruiter')}>רכז {getSortIndicator('recruiter')}</th>
                            {filterStatus === 'pending' && <th className="p-3">פעולות</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                    {sortedAndFilteredJobs.map(job => (
                        <tr key={job.id} onClick={() => navigate(`/jobs/edit/${job.id}`)} className="hover:bg-bg-hover cursor-pointer">
                            <td className="p-3 font-semibold text-primary-700">{job.title}</td>
                            <td className="p-3 text-text-default">{job.client}</td>
                            <td className="p-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[job.status as JobStatus]?.bg} ${statusStyles[job.status as JobStatus]?.text}`}>{job.status}</span></td>
                            <td className="p-3 text-text-muted">{job.associatedCandidates}</td>
                            <td className="p-3 text-text-muted">{new Date(job.openDate).toLocaleDateString('he-IL')}</td>
                            <td className="p-3 text-text-muted">{job.recruiter}</td>
                            {filterStatus === 'pending' && (
                                <td className="p-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <button className="p-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200" title="אשר משרה">
                                        <CheckCircleIcon className="w-4 h-4" />
                                    </button>
                                    <button className="p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200" title="דחה משרה">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                </td>
                            )}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminJobsView;
