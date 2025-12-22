import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BriefcaseIcon, UserGroupIcon, MapPinIcon, Cog6ToothIcon } from './Icons';


// --- TYPES ---
interface JobPublication {
  id: number;
  company: string;
  jobTitle: string;
  domain: string;
  role: string;
  creationDate: string;
  publicationDate: string;
  city: string;
  region: string;
  jobType: 'מלאה' | 'חלקית' | 'פרילנס' | 'משמרות';
  candidatesCount: number;
}

// --- MOCK DATA ---
const mockJobsData: JobPublication[] = [
  { id: 1, company: 'בזק', jobTitle: 'מנהל/ת שיווק דיגיטלי', domain: 'שיווק', role: 'מנהל שיווק', creationDate: '2025-07-15', publicationDate: '2025-07-16', city: 'תל אביב', region: 'מרכז', jobType: 'מלאה', candidatesCount: 25 },
  { id: 2, company: 'Wix', jobTitle: 'מפתח/ת Fullstack', domain: 'טכנולוגיה', role: 'מהנדס תוכנה', creationDate: '2025-07-12', publicationDate: '2025-07-12', city: 'תל אביב', region: 'מרכז', jobType: 'מלאה', candidatesCount: 42 },
  { id: 3, company: 'Fiverr', jobTitle: 'מעצב/ת UX/UI', domain: 'עיצוב', role: 'מעצב', creationDate: '2025-06-28', publicationDate: '2025-07-01', city: 'חיפה', region: 'צפון', jobType: 'חלקית', candidatesCount: 18 },
  { id: 4, company: 'אלביט מערכות', jobTitle: 'מהנדס/ת QA', domain: 'טכנולוגיה', role: 'בודק תוכנה', creationDate: '2025-05-10', publicationDate: '2025-05-11', city: 'חיפה', region: 'צפון', jobType: 'מלאה', candidatesCount: 31 },
  { id: 5, company: 'תנובה', jobTitle: 'נציג/ת מכירות שטח', domain: 'מכירות', role: 'איש מכירות', creationDate: '2025-07-20', publicationDate: '2025-07-20', city: 'רחובות', region: 'מרכז', jobType: 'מלאה', candidatesCount: 15 },
  { id: 6, company: 'אל-על', jobTitle: 'ראש/ת צוות BI', domain: 'טכנולוגיה', role: 'אנליסט BI', creationDate: '2025-07-05', publicationDate: '2025-07-06', city: 'לוד', region: 'מרכז', jobType: 'מלאה', candidatesCount: 22 },
  { id: 7, company: 'מיטב דש', jobTitle: 'אנליסט/ית פיננסי/ת', domain: 'פיננסים', role: 'אנליסט', creationDate: '2025-06-30', publicationDate: '2025-07-02', city: 'גבעתיים', region: 'מרכז', jobType: 'מלאה', candidatesCount: 12 },
  { id: 8, company: 'Zap Group', jobTitle: 'מומחה/ית SEO', domain: 'שיווק', role: 'מומחה SEO', creationDate: '2025-07-18', publicationDate: '2025-07-19', city: 'פתח תקווה', region: 'מרכז', jobType: 'חלקית', candidatesCount: 9 },
  { id: 9, company: 'Nisha', jobTitle: 'רכז/ת גיוס טכנולוגי', domain: 'משאבי אנוש', role: 'רכז גיוס', creationDate: '2025-07-14', publicationDate: '2025-07-14', city: 'באר שבע', region: 'דרום', jobType: 'מלאה', candidatesCount: 28 },
  { id: 10, company: 'GotFriends', jobTitle: 'מנהל/ת לקוחות', domain: 'מכירות', role: 'מנהל לקוחות', creationDate: '2025-07-11', publicationDate: '2025-07-12', city: 'הרצליה', region: 'שרון', jobType: 'מלאה', candidatesCount: 17 },
];

const StatCard: React.FC<{ title: string; value: string | React.ReactNode; icon: React.ReactNode; }> = ({ title, value, icon }) => (
    <div className="bg-bg-subtle p-4 rounded-xl border border-border-default">
        <h3 className="text-sm font-semibold text-text-muted flex items-center gap-2">
            {icon}
            {title}
        </h3>
        <p className="text-xl font-bold text-primary-600 mt-2 truncate">{value}</p>
    </div>
);

const allColumns = [
  { id: 'company', header: 'חברה' },
  { id: 'jobTitle', header: 'שם משרה' },
  { id: 'domain', header: 'תחום' },
  { id: 'role', header: 'תפקיד' },
  { id: 'city', header: 'עיר' },
  { id: 'region', header: 'אזור' },
  { id: 'jobType', header: 'סוג משרה' },
  { id: 'candidatesCount', header: 'מס׳ מועמדים' },
  { id: 'creationDate', header: 'תאריך יצירה' },
  { id: 'publicationDate', header: 'תאריך פרסום' },
];


const PublicationsReportView: React.FC = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

    const [filters, setFilters] = useState({
        startDate: thirtyDaysAgo.toISOString().split('T')[0],
        endDate: today.toISOString().split('T')[0],
    });
    
    const [columns, setColumns] = useState(allColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);

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
        const isVisible = columns.some(c => c.id === columnId);
        if (isVisible) {
            setColumns(prev => prev.filter(c => c.id !== columnId));
        } else {
            const columnToAdd = allColumns.find(c => c.id === columnId);
            if (columnToAdd) {
                const newColumns = [...columns];
                const originalIndex = allColumns.findIndex(c => c.id === columnId);
                let insertAtIndex = newColumns.length;
                for (let i = 0; i < newColumns.length; i++) {
                    const currentColId = newColumns[i].id;
                    const originalIndexOfCurrent = allColumns.findIndex(c => c.id === currentColId);
                    if (originalIndexOfCurrent > originalIndex) {
                        insertAtIndex = i;
                        break;
                    }
                }
                newColumns.splice(insertAtIndex, 0, columnToAdd);
                setColumns(newColumns);
            }
        }
    };
    
    const handleDragStart = (index: number) => {
        dragItemIndex.current = index;
    };

    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) {
            return;
        }
        const newColumns = [...columns];
        const draggedItem = newColumns.splice(dragItemIndex.current, 1)[0];
        newColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setColumns(newColumns);
    };

    const handleDragEnd = () => {
        dragItemIndex.current = null;
    };

    const handleDrop = () => {
        dragItemIndex.current = null;
    };


    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const stats = useMemo(() => {
        const domainCounts = mockJobsData.reduce((acc, job) => {
            acc[job.domain] = (acc[job.domain] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const leadingDomain = Object.keys(domainCounts).reduce((a, b) => domainCounts[a] > domainCounts[b] ? a : b, '');

        const roleCounts = mockJobsData.reduce((acc, job) => {
            acc[job.role] = (acc[job.role] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const leadingRoles = Object.entries(roleCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(entry => entry[0]);

        const regionCounts = mockJobsData.reduce((acc, job) => {
            acc[job.region] = (acc[job.region] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const leadingRegion = Object.keys(regionCounts).reduce((a, b) => regionCounts[a] > regionCounts[b] ? a : b, '');

        return { leadingDomain, leadingRoles, leadingRegion };
    }, []);

    const renderCell = (job: JobPublication, columnId: string) => {
        switch (columnId) {
            case 'creationDate':
            case 'publicationDate':
                 // @ts-ignore
                return new Date(job[columnId]).toLocaleDateString('he-IL');
            case 'jobTitle':
                return <span className="font-semibold text-primary-700">{job.jobTitle}</span>;
            case 'candidatesCount':
                return <span className="font-semibold text-text-default text-center block">{job.candidatesCount}</span>
            default:
                 // @ts-ignore
                return job[columnId];
        }
    };


    return (
        <div className="space-y-6">
            <style>{`
                .dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); }
                th[draggable] { user-select: none; }
            `}</style>
             <header>
                <h1 className="text-2xl font-bold text-text-default">דוח פרסומים</h1>
            </header>
            
            <div className="bg-bg-card p-4 rounded-xl border border-border-default space-y-4">
                <h2 className="text-lg font-bold text-text-default">פרמטרים לחישוב</h2>
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">מ-תאריך</label>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"/>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">עד-תאריך</label>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"/>
                    </div>
                </div>
            </div>
            
            {/* Statistics Section */}
            <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard 
                    title="תחום מוביל" 
                    value={stats.leadingDomain} 
                    icon={<BriefcaseIcon className="w-5 h-5"/>} 
                />
                <StatCard 
                    title="תפקידים מובילים" 
                    value={stats.leadingRoles.length > 0 ? stats.leadingRoles.join(', ') : '-'}
                    icon={<UserGroupIcon className="w-5 h-5"/>} 
                />
                <StatCard 
                    title="אזור מוביל" 
                    value={stats.leadingRegion} 
                    icon={<MapPinIcon className="w-5 h-5"/>} 
                />
            </div>

            {/* Detailed Table */}
            <div className="bg-bg-card rounded-lg border border-border-default overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[1000px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                               {columns.map((col, index) => (
                                    <th
                                        key={col.id}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={handleDrop}
                                        className="p-4 cursor-move"
                                        title={`גרור כדי לשנות סדר`}
                                    >
                                        {col.header}
                                    </th>
                                ))}
                                <th scope="col" className="px-2 py-3 sticky left-0 bg-bg-subtle w-16">
                                    <div className="relative" ref={settingsRef}>
                                        <button 
                                            onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
                                            className="p-1.5 text-text-muted hover:text-primary-600 hover:bg-bg-hover rounded-full"
                                            title="התאם עמודות"
                                        >
                                            <Cog6ToothIcon className="w-5 h-5" />
                                        </button>
                                        {isSettingsOpen && (
                                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                            <div className="space-y-2">
                                            {allColumns.map(column => (
                                                <label key={column.id} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
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
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {mockJobsData.map(job => (
                            <tr key={job.id} className="hover:bg-bg-hover group">
                                {columns.map(col => (
                                    <td key={col.id} className="p-4 text-text-muted">
                                        {renderCell(job, col.id)}
                                    </td>
                                ))}
                                <td className="px-2 py-4 sticky left-0 bg-bg-card group-hover:bg-bg-hover transition-colors w-16"></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PublicationsReportView;