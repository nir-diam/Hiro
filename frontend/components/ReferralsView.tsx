import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cog6ToothIcon, DocumentArrowDownIcon, ChevronDownIcon, ArrowUturnLeftIcon, PencilIcon, TableCellsIcon, Squares2X2Icon } from './Icons';
import UpdateStatusModal from './UpdateStatusModal';
import ReReferModal from './ReReferModal';
import { type Job, jobsData } from './JobsView';
import JobDetailsDrawer from './JobDetailsDrawer';

type Status = 'התקבל לעבודה' | 'נדחה' | 'בהמתנה' | 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון';

interface ClientContact {
    id: number;
    name: string;
    email: string;
}

interface ActiveReferral {
  id: number;
  clientId: number;
  status: Status;
  source: string;
  coordinator: string;
  jobTitle: string;
  clientName: string;
  referralDate: string;
  contactDate: string;
  notes: string;
  clientContacts: ClientContact[];
  candidateName: string;
}

interface DisqualifiedReferral {
  id: number;
  jobTitle: string;
  eventDate: string;
  coordinator: string;
  screeningLevel: string;
  reason: string;
}

const activeReferralsData: ActiveReferral[] = [
    { id: 1, clientId: 1, candidateName: 'שפירא גדעון', status: 'התקבל לעבודה', source: 'AllJobs', coordinator: 'דנה כהן', jobTitle: 'מפתח/ת Fullstack בכיר/ה', clientName: 'Wix', referralDate: '14:32 28/05/2025', contactDate: '10:00 20/05/2025', notes: 'מועמד מצוין, עבר ראיון טכני בהצלחה. ממתינים להצעה.', clientContacts: [{id: 1, name: 'איתי לוי (ראש צוות)', email: 'itai@wix.com'}] },
    { id: 2, clientId: 2, candidateName: 'כהן מאיה', status: 'בהמתנה', source: 'חבר מביא חבר', coordinator: 'אביב לוי', jobTitle: 'מנהל/ת מוצר לחטיבת הפינטק', clientName: 'Rapyd', referralDate: '11:01 27/05/2025', contactDate: '09:30 27/05/2025', notes: 'נשלחו קו"ח ללקוח. ממתינים לתשובה.', clientContacts: [{id: 2, name: 'שרית לוי (מנהלת מוצר)', email: 'sarit@rapyd.com'}] },
    { id: 3, clientId: 3, candidateName: 'לוי דוד', status: 'נדחה', source: 'LinkedIn', coordinator: 'דנה כהן', jobTitle: 'מעצב/ת UX/UI', clientName: 'Fiverr', referralDate: '09:15 25/05/2025', contactDate: '16:00 24/05/2025', notes: 'המועמד לא עבר את שלב תיק העבודות. חוסר ניסיון רלוונטי.', clientContacts: [{id: 3, name: 'נעמה ברק (מנהלת עיצוב)', email: 'naama@fiverr.com'}] },
];

const disqualifiedReferralsData: DisqualifiedReferral[] = [
    { id: 1, jobTitle: 'מנהל/ת שיווק דיגיטלי', eventDate: '18:00 23/05/2025', coordinator: 'יעל שחר', screeningLevel: 'סינון קו"ח', reason: 'חוסר התאמה לדרישות התפקיד' },
    { id: 2, jobTitle: 'אנליסט/ית נתונים', eventDate: '12:45 22/05/2025', coordinator: 'יעל שחר', screeningLevel: 'שיחה טלפונית', reason: 'ציפיות שכר גבוהות מדי' },
];

const statusStyles: Partial<Record<Status, { text: string; bg: string }>> = {
    'התקבל לעבודה': { text: 'text-green-800', bg: 'bg-green-100' },
    'התקבל': { text: 'text-green-800', bg: 'bg-green-100' },
    'נדחה': { text: 'text-red-800', bg: 'bg-red-100' },
    'בהמתנה': { text: 'text-gray-800', bg: 'bg-gray-100' },
    'חדש': { text: 'text-primary-800', bg: 'bg-primary-100' },
    'בבדיקה': { text: 'text-yellow-800', bg: 'bg-yellow-100' },
    'ראיון': { text: 'text-secondary-800', bg: 'bg-secondary-100' },
    'הצעה': { text: 'text-blue-800', bg: 'bg-blue-100' },
    'פעיל': { text: 'text-green-800', bg: 'bg-green-100' },
    'הוזמן לראיון': { text: 'text-secondary-800', bg: 'bg-secondary-100' },
    'לא רלוונטי': { text: 'text-gray-700', bg: 'bg-gray-200' },
    'מועמד משך עניין': { text: 'text-yellow-800', bg: 'bg-yellow-100' },
    'בארכיון': { text: 'text-gray-700', bg: 'bg-gray-200' },
};


const allActiveColumns: { id: keyof ActiveReferral | 'actions'; header: string }[] = [
    { id: 'status', header: 'סטטוס' },
    { id: 'jobTitle', header: 'כותרת המשרה' },
    { id: 'clientName', header: 'שם הלקוח' },
    { id: 'referralDate', header: 'תאריך הפניה' },
    { id: 'source', header: 'מקור גיוס' },
    { id: 'coordinator', header: 'רכז' },
];

const defaultVisibleColumns = ['status', 'jobTitle', 'clientName', 'referralDate'];

const ActionButton: React.FC<{ icon: React.ReactNode; colorClass: string; tooltip: string; onClick?: (e: React.MouseEvent) => void; }> = ({ icon, colorClass, tooltip, onClick }) => (
    <button onClick={onClick} title={tooltip} className={`p-1.5 rounded-full hover:bg-bg-hover transition-colors ${colorClass}`}>
        {icon}
    </button>
);

const ReferralCard: React.FC<{ referral: ActiveReferral; onToggleDetails: () => void; isExpanded: boolean; onStatusClick: (e: React.MouseEvent, referral: ActiveReferral) => void; onJobTitleClick: () => void; onClientClick: (e: React.MouseEvent) => void; }> = ({ referral, onToggleDetails, isExpanded, onStatusClick, onJobTitleClick, onClientClick }) => {
    const styles = statusStyles[referral.status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
    return (
        <div className="bg-bg-card rounded-lg border border-border-default shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
                <button onClick={onJobTitleClick} className="font-semibold text-primary-700 hover:underline text-right">{referral.jobTitle}</button>
                <button onClick={(e) => onStatusClick(e, referral)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}>{referral.status}</button>
            </div>
            <p className="text-sm text-text-muted">
                <button onClick={onClientClick} className="hover:underline">{referral.clientName}</button>
            </p>
            <div className="mt-4 flex justify-between items-end">
                <div className="text-xs text-text-subtle space-y-1">
                    <p><strong>תאריך הפניה:</strong> {referral.referralDate}</p>
                    <p><strong>מקור:</strong> {referral.source}</p>
                </div>
                <button onClick={onToggleDetails} className="flex items-center gap-1 text-xs font-semibold text-text-muted hover:text-primary-600">
                    <span>{isExpanded ? 'הסתר פרטים' : 'פרטים נוספים'}</span>
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
    );
};

const ReferralsView: React.FC<{ onOpenNewTask: () => void; }> = ({ onOpenNewTask }) => {
    const navigate = useNavigate();
    const [activeReferrals, setActiveReferrals] = useState<ActiveReferral[]>(activeReferralsData);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingReferral, setEditingReferral] = useState<ActiveReferral | null>(null);
    const [reReferModal, setReReferModal] = useState<{ isOpen: boolean; referral: ActiveReferral | null }>({ isOpen: false, referral: null });
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    
    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    
    const [activeSortConfig, setActiveSortConfig] = useState<{ key: keyof ActiveReferral; direction: 'asc' | 'desc' } | null>(null);
    const [disqualifiedSortConfig, setDisqualifiedSortConfig] = useState<{ key: keyof DisqualifiedReferral; direction: 'asc' | 'desc' } | null>(null);

    const handleClientClick = (e: React.MouseEvent, clientId: number) => {
        e.stopPropagation();
        navigate(`/clients/${clientId}`);
    };

    const sortedActiveReferrals = useMemo(() => {
        let sortableItems = [...activeReferrals];
        if (activeSortConfig !== null) {
            sortableItems.sort((a, b) => {
                if (a[activeSortConfig.key] < b[activeSortConfig.key]) return activeSortConfig.direction === 'asc' ? -1 : 1;
                if (a[activeSortConfig.key] > b[activeSortConfig.key]) return activeSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [activeReferrals, activeSortConfig]);

    const sortedDisqualifiedReferrals = useMemo(() => {
        let sortableItems = [...disqualifiedReferralsData];
        if (disqualifiedSortConfig !== null) {
            sortableItems.sort((a, b) => {
                if (a[disqualifiedSortConfig.key] < b[disqualifiedSortConfig.key]) return disqualifiedSortConfig.direction === 'asc' ? -1 : 1;
                if (a[disqualifiedSortConfig.key] > b[disqualifiedSortConfig.key]) return disqualifiedSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [disqualifiedSortConfig]);
    
    const requestSort = (list: 'active' | 'disqualified', key: any) => {
        const config = list === 'active' ? activeSortConfig : disqualifiedSortConfig;
        const setConfig = list === 'active' ? setActiveSortConfig : setDisqualifiedSortConfig;
        let direction: 'asc' | 'desc' = 'asc';
        if (config && config.key === key && config.direction === 'asc') direction = 'desc';
        // @ts-ignore
        setConfig({ key, direction });
    };
    
    const getSortIndicator = (list: 'active' | 'disqualified', key: any) => {
        const config = list === 'active' ? activeSortConfig : disqualifiedSortConfig;
        if (!config || config.key !== key) return null;
        return <span className="text-text-subtle">{config.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const toggleRow = (id: number) => setExpandedRowId(prevId => (prevId === id ? null : id));

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setIsSettingsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleColumnToggle = (columnId: string) => {
        setVisibleColumns(prev => {
            if (prev.includes(columnId)) return prev.length > 1 ? prev.filter(id => id !== columnId) : prev;
            else {
                const newCols = [...prev, columnId];
                newCols.sort((a, b) => allActiveColumns.findIndex(c => c.id === a) - allActiveColumns.findIndex(c => c.id === b));
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

    const handleOpenStatusModal = (e: React.MouseEvent, referral: ActiveReferral) => {
        e.stopPropagation();
        setEditingReferral(referral);
        setIsStatusModalOpen(true);
    };

    const handleSaveStatusUpdate = (data: any) => {
        if (!editingReferral) return;
        setActiveReferrals(prev => prev.map(r => r.id === editingReferral.id ? { ...r, status: data.status, lastUpdatedBy: 'עצמי' } : r));
        setIsStatusModalOpen(false);
        setEditingReferral(null);
    };

    const handleOpenReReferModal = (e: React.MouseEvent, referral: ActiveReferral) => {
        e.stopPropagation();
        setReReferModal({ isOpen: true, referral });
    };

    const handleSendReReferral = (data: { notes: string; nextStatus: string; contacts: number[] }) => {
        console.log('Re-referring with data:', data);
        setReReferModal({ isOpen: false, referral: null });
        // Here you would typically also update the referral status in your main state
        // FIX: Changed setReferrals to setActiveReferrals to correctly update state.
        setActiveReferrals(prev => prev.map(r => r.id === reReferModal.referral?.id ? { ...r, status: data.nextStatus as Status, notes: data.notes } : r));
    };

    const handleOpenJobDrawer = (jobTitle: string) => {
        const job = jobsData.find(j => j.title === jobTitle);
        // Fallback for mock data consistency
        const jobMap: {[key: string]: number} = {
            'מפתח/ת Fullstack בכיר/ה': 2,
            'מנהל/ת מוצר לחטיבת הפינטק': 7,
            'מעצב/ת UX/UI': 3,
        }
        const fallbackJob = jobsData.find(j => j.id === (jobMap[jobTitle] || 1));

        if (job || fallbackJob) {
            setSelectedJob(job || fallbackJob);
            setIsDrawerOpen(true);
        } else {
            console.warn(`Job with title "${jobTitle}" not found.`);
        }
    };

    const renderCell = (referral: ActiveReferral, columnId: string) => {
        const styles = statusStyles[referral.status] || { bg: 'bg-gray-100', text: 'text-gray-800' };
        switch (columnId) {
            case 'status': return <button onClick={(e) => handleOpenStatusModal(e, referral)} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${styles.bg} ${styles.text}`}>{referral.status}</button>;
            case 'jobTitle': return <button onClick={(e) => { e.stopPropagation(); handleOpenJobDrawer(referral.jobTitle) }} className="font-semibold text-primary-700 hover:underline">{referral.jobTitle}</button>;
            case 'clientName': return <button onClick={(e) => handleClientClick(e, referral.clientId)} className="font-semibold text-text-default hover:text-primary-700 hover:underline">{referral.clientName}</button>;
            default: return (referral as any)[columnId];
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm overflow-hidden">
            <style>{`.dragging { opacity: 0.5; background: rgb(var(--color-primary-100)); } th[draggable] { user-select: none; }`}</style>
            <header className="flex items-center justify-between p-3 border-b border-border-default bg-bg-card">
                <span className="text-sm font-semibold text-text-muted">{activeReferrals.length} שורות</span>
                <div className="flex items-center gap-2">
                    <div className="flex items-center bg-bg-subtle p-1 rounded-lg">
                        <button onClick={() => setViewMode('table')} title="תצוגת טבלה" className={`p-1.5 rounded-md ${viewMode === 'table' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><TableCellsIcon className="w-5 h-5"/></button>
                        <button onClick={() => setViewMode('grid')} title="תצוגת רשת" className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-bg-card shadow-sm text-primary-600' : 'text-text-muted'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                    </div>
                    <button title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><DocumentArrowDownIcon className="w-5 h-5"/></button>
                    <div className="relative" ref={settingsRef}>
                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} title="התאם עמודות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                        {isSettingsOpen && (
                        <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-lg shadow-xl border border-border-default z-20 p-4">
                            <p className="font-bold text-text-default mb-2 text-sm">הצג עמודות</p>
                            <div className="space-y-2 max-h-60 overflow-y-auto">{allActiveColumns.map(c => (<label key={c.id} className="flex items-center gap-2 text-sm font-normal text-text-default"><input type="checkbox" checked={visibleColumns.includes(c.id)} onChange={() => handleColumnToggle(c.id)} className="w-4 h-4 text-primary-600" />{c.header}</label>))}</div>
                        </div>
                        )}
                    </div>
                </div>
            </header>

            {viewMode === 'table' ? (
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[800px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80">
                            <tr>
                                {visibleColumns.map((colId, index) => {
                                    const col = allActiveColumns.find(c => c.id === colId);
                                    if (!col) return null;
                                    return <th key={col.id} draggable onDragStart={() => handleDragStart(index, col.id as string)} onDragEnter={() => handleDragEnter(index)} onDragEnd={handleDragEnd} onDrop={handleDragEnd} onDragOver={e => e.preventDefault()} onClick={() => requestSort('active', col.id as keyof ActiveReferral)} className={`p-4 cursor-pointer hover:bg-bg-hover ${draggingColumn === col.id ? 'dragging' : ''}`}><div className="flex items-center gap-1">{col.header} {getSortIndicator('active', col.id as keyof ActiveReferral)}</div></th>
                                })}
                                <th className="p-4">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {sortedActiveReferrals.map(referral => (
                            <React.Fragment key={referral.id}>
                                <tr onClick={() => toggleRow(referral.id)} className="hover:bg-bg-hover cursor-pointer group">
                                    {visibleColumns.map(colId => <td key={colId} className="p-4 text-text-muted">{renderCell(referral, colId)}</td>)}
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <ActionButton icon={<ArrowUturnLeftIcon className="w-4 h-4"/>} colorClass="text-orange-500" tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
                                        </div>
                                    </td>
                                </tr>
                                {expandedRowId === referral.id && (
                                    <tr className="bg-primary-50/20"><td colSpan={visibleColumns.length + 1} className="px-8 py-4 text-sm text-text-muted"><p><span className="font-bold">הערות:</span> {referral.notes}</p></td></tr>
                                )}
                            </React.Fragment>
                        ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedActiveReferrals.map(referral => (
                         <div key={referral.id}>
                            <ReferralCard 
                                referral={referral} 
                                onToggleDetails={() => toggleRow(referral.id)} 
                                isExpanded={expandedRowId === referral.id} 
                                onStatusClick={handleOpenStatusModal}
                                onJobTitleClick={() => handleOpenJobDrawer(referral.jobTitle)}
                                onClientClick={(e) => handleClientClick(e, referral.clientId)}
                            />
                            {expandedRowId === referral.id && (
                                <div className="p-3 bg-primary-50/20 text-sm text-text-muted rounded-b-lg">
                                    <p><span className="font-bold">הערות:</span> {referral.notes}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            <div className="mt-6 p-4">
                <h3 className="text-base font-bold text-text-default mb-3">רשימת פסילות בסינון ראשוני למשרות</h3>
                <div className="border border-border-default rounded-lg overflow-x-auto">
                    <table className="w-full text-sm text-right text-text-muted min-w-[600px]">
                        <thead className="text-xs text-text-default uppercase bg-bg-subtle/70">
                            <tr>
                                <th scope="col" className="px-4 py-3 cursor-pointer" onClick={() => requestSort('disqualified', 'jobTitle')}><div className="flex items-center gap-1"><span>כותרת משרה</span>{getSortIndicator('disqualified', 'jobTitle')}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer" onClick={() => requestSort('disqualified', 'eventDate')}><div className="flex items-center gap-1"><span>תאריך</span>{getSortIndicator('disqualified', 'eventDate')}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer" onClick={() => requestSort('disqualified', 'reason')}><div className="flex items-center gap-1"><span>סיבת פסילה</span>{getSortIndicator('disqualified', 'reason')}</div></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDisqualifiedReferrals.map(item => (
                                <tr key={item.id} className="bg-bg-card border-b border-border-subtle last:border-b-0 hover:bg-bg-hover">
                                    <td className="px-4 py-4 font-semibold text-text-default">{item.jobTitle}</td>
                                    <td className="px-4 py-4">{item.eventDate}</td>
                                    <td className="px-4 py-4">{item.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {editingReferral && (
                <UpdateStatusModal
                    isOpen={isStatusModalOpen}
                    onClose={() => setIsStatusModalOpen(false)}
                    onSave={handleSaveStatusUpdate}
                    initialStatus={editingReferral.status}
                    onOpenNewTask={onOpenNewTask}
                />
            )}
            <ReReferModal
                isOpen={reReferModal.isOpen}
                onClose={() => setReReferModal({ isOpen: false, referral: null })}
                onSend={handleSendReReferral}
                referral={reReferModal.referral}
            />
             <JobDetailsDrawer
                job={selectedJob}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
        </div>
    );
};

export default ReferralsView;
