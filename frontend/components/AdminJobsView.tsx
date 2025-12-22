
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { jobsData } from './JobsView';
import { MagnifyingGlassIcon, CheckCircleIcon, XMarkIcon } from './Icons';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה' | 'ממתין לאישור';

const statusStyles: { [key in JobStatus]: { text: string; bg: string; } } = {
  'פתוחה': { text: 'text-green-800', bg: 'bg-green-100' },
  'מוקפאת': { text: 'text-amber-800', bg: 'bg-amber-100' },
  'מאוישת': { text: 'text-gray-700', bg: 'bg-gray-200' },
  'טיוטה': { text: 'text-indigo-800', bg: 'bg-indigo-100' },
  'ממתין לאישור': { text: 'text-orange-800', bg: 'bg-orange-100' },
};

// Extend mock data for admin view only
const extendedJobsData = [
    { ...jobsData[0] },
    { ...jobsData[1] },
    // Add a pending external job
    { 
        id: 999, 
        title: 'מנהל/ת משרד', 
        client: 'סטארטאפ חיצוני', 
        field: 'אדמיניסטרציה', 
        role: 'מנהל משרד', 
        priority: 'רגילה', 
        clientType: 'Startup', 
        city: 'תל אביב', 
        region: 'מרכז', 
        gender: 'לא משנה', 
        mobility: false, 
        licenseType: 'אין', 
        postingCode: 'EXT999', 
        validityDays: 30, 
        recruitingCoordinator: 'מערכת', 
        accountManager: 'מערכת', 
        salaryMin: 9000, 
        salaryMax: 11000, 
        ageMin: 20, 
        ageMax: 99, 
        openPositions: 1, 
        status: 'ממתין לאישור' as JobStatus, 
        associatedCandidates: 0, 
        openDate: '2025-11-16', 
        recruiter: 'חיצוני', 
        location: 'תל אביב', 
        jobType: 'משרה מלאה', 
        description: 'ניהול אדמיניסטרטיבי שוטף...', 
        requirements: [] 
    }
];

const AdminJobsView: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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
        let filtered = extendedJobsData.filter(job => 
            (job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            job.client.toLowerCase().includes(searchTerm.toLowerCase())) &&
            (filterStatus === 'all' || (filterStatus === 'pending' && job.status === 'ממתין לאישור'))
        );
        
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
                        {extendedJobsData.filter(j => j.status === 'ממתין לאישור').length > 0 && (
                            <span className="bg-orange-500 text-white text-xs px-1.5 rounded-full">
                                {extendedJobsData.filter(j => j.status === 'ממתין לאישור').length}
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
