import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Cog6ToothIcon, TableCellsIcon, Squares2X2Icon, ChevronDownIcon } from './Icons';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'סגורה';

interface Job {
  id: number;
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
}

const mockClientJobsData: Job[] = [
  { id: 101, title: 'רכז/ת לוגיסטיקה', field: 'לוגיסטיקה', role: 'רכז', daysOpen: 42, lastActivity: 'לפני יומיים', creationDate: '2025-06-10', closeDate: null, status: 'פתוחה', submissionMethod: 'מייל', referrals24h: 2, referralsWeek: 8, referralsMonth: 25, referralsTotal: 50 },
  { id: 102, title: 'מנהל/ת מחסן', field: 'לוגיסטיקה', role: 'מנהל', daysOpen: 120, lastActivity: 'לפני חודש', creationDate: '2025-03-15', closeDate: '2025-07-15', status: 'סגורה', submissionMethod: 'מייל', referrals24h: 0, referralsWeek: 0, referralsMonth: 5, referralsTotal: 88 },
  { id: 103, title: 'נהג/ת חלוקה', field: 'שינוע', role: 'נהג', daysOpen: 95, lastActivity: 'לפני שבוע', creationDate: '2025-04-20', closeDate: null, status: 'מוקפאת', submissionMethod: 'ווטסאפ', referrals24h: 0, referralsWeek: 1, referralsMonth: 10, referralsTotal: 30 },
];

const allColumns = [
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

const defaultVisibleColumns = ['id', 'title', 'status', 'referralsWeek', 'referralsTotal', 'lastActivity'];

const statusStyles: { [key in JobStatus]: { bg: string, text: string } } = {
    'פתוחה': { bg: 'bg-green-100', text: 'text-green-800' },
    'מוקפאת': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'סגורה': { bg: 'bg-gray-200', text: 'text-gray-700' },
};

const JobCard: React.FC<{ job: Job }> = ({ job }) => {
    const { bg, text } = statusStyles[job.status];
    return (
        <div className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-semibold text-primary-700">{job.title}</p>
                    <p className="text-sm text-text-muted">#{job.id} &middot; {job.role}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${bg} ${text}`}>{job.status}</span>
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


const ClientJobsTab: React.FC = () => {
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
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
        let sortableItems = [...mockClientJobsData];
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
    }, [sortConfig]);

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
                <h2 className="text-xl font-bold">משרות ({sortedJobs.length})</h2>
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
            
            <main className="mt-4">
                {viewMode === 'table' ? (
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
                                                className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.id ? 'dragging' : ''}`}
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
                                    <tr key={job.id} className="hover:bg-bg-hover">
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
                            <JobCard key={job.id} job={job} />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ClientJobsTab;