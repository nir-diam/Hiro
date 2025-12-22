import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Cog6ToothIcon, DocumentArrowDownIcon } from './Icons';

// --- TYPES ---
interface SourceReport {
  id: number;
  sourceName: string;
  initial: number;
  current: number;
  candidates: number;
  placements: number;
  referrals: number;
  accepted: number;
}

// --- MOCK DATA ---
const sourcesList = [
  '(לא מוגדר)',
  '(לא מזוהה)',
  'AllJobs',
  'Facebook',
  'Indeed',
  'JobMaster',
  'JobNet',
  'mploy',
  'ג\'וב קרוב',
  'חבר מביא חבר',
  'LinkedIn',
  'לשכת התעסוקה',
  'מובטל',
  'נגב ג\'ובס',
  'פורטל דרושים',
  'סחבק',
  'Jobhunt',
  'יבוא',
  'הומלס',
  'techit',
  'Hiro'
];

const mockSourceReportData: SourceReport[] = sourcesList.map((source, index) => ({
  id: index + 1,
  sourceName: source,
  initial: Math.floor(Math.random() * 2500),
  current: Math.floor(Math.random() * 2800),
  candidates: Math.floor(Math.random() * 3000),
  placements: Math.floor(Math.random() * 3500),
  referrals: Math.floor(Math.random() * 500),
  accepted: Math.floor(Math.random() * 10),
}));

// Adjusting some numbers to match the screenshot for realism
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.initial = 2346;
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.current = 2758;
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.candidates = 2830;
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.placements = 3469;
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.referrals = 475;
mockSourceReportData.find(s => s.sourceName === 'AllJobs')!.accepted = 8;

mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.initial = 77;
mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.current = 31;
mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.candidates = 83;
mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.placements = 88;
mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.referrals = 15;
mockSourceReportData.find(s => s.sourceName === '(לא מזוהה)')!.accepted = 1;

mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.initial = 4;
mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.current = 0;
mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.candidates = 0;
mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.placements = 0;
mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.referrals = 0;
mockSourceReportData.find(s => s.sourceName === '(לא מוגדר)')!.accepted = 0;

mockSourceReportData.find(s => s.sourceName === 'Indeed')!.initial = 0;
mockSourceReportData.find(s => s.sourceName === 'Indeed')!.current = 0;
mockSourceReportData.find(s => s.sourceName === 'Indeed')!.candidates = 0;
mockSourceReportData.find(s => s.sourceName === 'Indeed')!.placements = 0;
mockSourceReportData.find(s => s.sourceName === 'Indeed')!.referrals = 0;
mockSourceReportData.find(s => s.sourceName === 'Indeed')!.accepted = 0;

mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.initial = 0;
mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.current = 0;
mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.candidates = 0;
mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.placements = 0;
mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.referrals = 0;
mockSourceReportData.find(s => s.sourceName === 'LinkedIn')!.accepted = 0;

// Order based on screenshot from right to left
const allColumns: { key: keyof SourceReport; label: string; isNumeric: boolean }[] = [
    { key: 'sourceName', label: 'שם מקור הגיוס', isNumeric: false },
    { key: 'accepted', label: 'התקבלו', isNumeric: true },
    { key: 'referrals', label: 'הפניות', isNumeric: true },
    { key: 'placements', label: 'קליטות', isNumeric: true },
    { key: 'candidates', label: 'מועמדים', isNumeric: true },
    { key: 'current', label: 'נוכחי', isNumeric: true },
    { key: 'initial', label: 'ראשוני', isNumeric: true },
];
const defaultVisibleColumns = allColumns.map(c => c.key);


const RecruitmentSourcesReportView: React.FC = () => {
    const today = new Date();
    const defaultEndDate = today.toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));
    const defaultStartDate = thirtyDaysAgo.toISOString().split('T')[0];

    const [filters, setFilters] = useState({
        startDate: defaultStartDate,
        endDate: defaultEndDate,
        source: 'הכל',
    });
    
    const [sortConfig, setSortConfig] = useState<{ key: keyof SourceReport; direction: 'asc' | 'desc' } | null>({ key: 'sourceName', direction: 'asc' });
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
            setIsSettingsOpen(false);
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const sortedData = useMemo(() => {
        let sortableItems = [...mockSourceReportData];
        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];
                if (typeof aVal === 'string' && typeof bVal === 'string') {
                     return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                }
                if (aVal < bVal) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (aVal > bVal) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [sortConfig]);
    
    const requestSort = (key: keyof SourceReport) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof SourceReport) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
    };
    
    const handleColumnToggle = (columnKey: string) => {
        setVisibleColumns(prev => {
            const isVisible = prev.includes(columnKey);
            if (isVisible) {
                return prev.length > 1 ? prev.filter(key => key !== columnKey) : prev;
            } else {
                const columnToAdd = allColumns.find(c => c.key === columnKey);
                if (columnToAdd) {
                    const newColumns = [...prev, columnKey];
                    newColumns.sort((a, b) => allColumns.findIndex(c => c.key === a) - allColumns.findIndex(c => c.key === b));
                    return newColumns;
                }
                return prev;
            }
        });
    };

    const handleDragStart = (index: number, colKey: string) => {
        dragItemIndex.current = index;
        setDraggingColumn(colKey);
    };
    const handleDragEnter = (index: number) => {
        if (dragItemIndex.current === null || dragItemIndex.current === index) return;
        const newVisibleColumns = [...visibleColumns];
        const draggedItem = newVisibleColumns.splice(dragItemIndex.current, 1)[0];
        newVisibleColumns.splice(index, 0, draggedItem);
        dragItemIndex.current = index;
        setVisibleColumns(newVisibleColumns);
    };
    const handleDragEnd = () => {
        dragItemIndex.current = null;
        setDraggingColumn(null);
    };
    
    return (
        <div className="space-y-6">
             <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
             <div className="bg-bg-subtle/70 rounded-xl p-4 space-y-4 -mx-6 -mt-6 mb-0">
                <div className="flex flex-wrap items-end gap-4 px-6">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">מתאריך</label>
                        <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"/>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">עד תאריך</label>
                        <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"/>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">מקור</label>
                        <select name="source" value={filters.source} onChange={handleFilterChange} className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm w-48">
                            <option value="הכל">הכל</option>
                            {sourcesList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <button className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition">חפש</button>
                </div>
            </div>

            <div className="bg-bg-card rounded-lg border border-border-default overflow-hidden">
                <div className="flex justify-between items-center p-4 border-b border-border-default">
                    <span className="text-sm font-semibold text-text-muted">{sortedData.length} שורות</span>
                     <div className="flex items-center gap-2">
                        <button title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><DocumentArrowDownIcon className="w-5 h-5"/></button>
                        <div className="relative" ref={settingsRef}>
                            <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                            {isSettingsOpen && (
                                <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                                    <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                                    <div className="space-y-2">
                                    {allColumns.map(column => (
                                        <label key={column.key} className="flex items-center gap-2 text-sm font-normal text-text-default capitalize cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={visibleColumns.includes(column.key as string)}
                                            onChange={() => handleColumnToggle(column.key as string)}
                                            className="w-4 h-4 text-primary-600"
                                        />
                                        {column.label}
                                        </label>
                                    ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[900px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                                {visibleColumns.map((colKey, index) => {
                                    const col = allColumns.find(c => c.key === colKey);
                                    if (!col) return null;
                                    return (
                                        <th 
                                            key={col.key} 
                                            className={`p-4 cursor-pointer hover:bg-bg-hover transition-colors ${draggingColumn === col.key ? 'dragging' : ''}`}
                                            onClick={() => requestSort(col.key)}
                                            draggable
                                            onDragStart={() => handleDragStart(index, col.key as string)}
                                            onDragEnter={() => handleDragEnter(index)}
                                            onDragEnd={handleDragEnd}
                                            onDrop={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>{col.label}</span>
                                                {getSortIndicator(col.key)}
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {sortedData.map(row => (
                            <tr key={row.id} className="hover:bg-bg-hover">
                                {visibleColumns.map(colKey => {
                                    const col = allColumns.find(c => c.key === colKey);
                                    if (!col) return null;
                                    return (
                                        <td key={col.key} className={`p-4 ${col.key === 'sourceName' ? 'text-text-default font-semibold' : 'text-text-muted'}`}>
                                            {row[col.key as keyof SourceReport].toLocaleString()}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default RecruitmentSourcesReportView;