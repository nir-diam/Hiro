
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cog6ToothIcon, DocumentArrowDownIcon, ChevronDownIcon, ArrowUturnLeftIcon, PencilIcon, TableCellsIcon, Squares2X2Icon, CheckCircleIcon, XMarkIcon, ClockIcon, FunnelIcon, CalendarIcon, BriefcaseIcon, UserGroupIcon, MagnifyingGlassIcon } from './Icons';
import UpdateStatusModal from './UpdateStatusModal';
import ReReferModal from './ReReferModal';
import { type Job } from './JobsView';
import JobDetailsDrawer from './JobDetailsDrawer';
import { useLanguage } from '../context/LanguageContext';

type Status = 'התקבל לעבודה' | 'נדחה' | 'בהמתנה' | 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון';

interface ClientContact {
    id: number;
    name: string;
    email: string;
}

interface ActiveReferral {
  id: string;
  clientId: number | null;
  status: Status;
  source: string;
  coordinator: string;
  jobTitle: string;
  clientName: string;
  referralDate: string;
  contactDate: string;
  /** נמען · אימייל (ללא הערה פנימית) */
  recipientLine: string;
  internalNote: string;
  referralDueDate: string;
  referralDueTime: string;
  notes: string;
  clientContacts: ClientContact[];
  candidateName: string;
}

/** Row from GET /api/email-uploads/screening-cv-referrals */
interface ScreeningCvReferralApiRow {
  id: string;
  candidateId?: string | null;
  jobId?: string | null;
  candidateName?: string;
  jobTitle?: string;
  clientName?: string;
  clientId?: number | null;
  referralDate?: string;
  contactDate?: string;
  source?: string;
  coordinator?: string;
  status?: string;
  notes?: string;
  recipientLine?: string;
  internalNote?: string;
  dueDate?: string;
  dueTime?: string;
  clientContacts?: ClientContact[];
}

function mapScreeningCvRowToActiveReferral(row: ScreeningCvReferralApiRow): ActiveReferral {
  const rawStatus = String(row.status || 'חדש').trim();
  const status = (rawStatus in statusStyles ? rawStatus : 'חדש') as Status;
  const notes = String(row.notes || '');
  const recipientLine = String(row.recipientLine || '').trim() || (notes.includes('\n\n') ? notes.split('\n\n')[0] : notes);
  const internalNote = String(row.internalNote || '').trim();
  return {
    id: String(row.id),
    clientId: row.clientId != null && row.clientId !== undefined ? Number(row.clientId) : null,
    status,
    source: String(row.source || ''),
    coordinator: String(row.coordinator || ''),
    jobTitle: String(row.jobTitle || ''),
    clientName: String(row.clientName || ''),
    referralDate: row.referralDate ? String(row.referralDate) : new Date().toISOString(),
    contactDate: String(row.contactDate || ''),
    recipientLine,
    internalNote,
    referralDueDate: row.dueDate != null ? String(row.dueDate).trim() : '',
    referralDueTime: row.dueTime != null ? String(row.dueTime).trim() : '',
    notes,
    clientContacts: Array.isArray(row.clientContacts) ? row.clientContacts : [],
    candidateName: String(row.candidateName || ''),
  };
}

interface DisqualifiedReferral {
  id: string;
  candidateId?: string;
  candidateName: string;
  jobId?: string;
  jobTitle: string;
  clientName: string;
  eventDate: string;
  coordinator: string;
  screeningLevel: string;
  reason: string;
}

const statusStyles: Partial<Record<Status, { text: string; bg: string; border: string; icon: any }>> = {
    'התקבל לעבודה': { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircleIcon },
    'התקבל': { text: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200', icon: CheckCircleIcon },
    'נדחה': { text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: XMarkIcon },
    'בהמתנה': { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: ClockIcon },
    'חדש': { text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: CalendarIcon },
    'בבדיקה': { text: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', icon: FunnelIcon },
    'ראיון': { text: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', icon: UserGroupIcon },
    'הצעה': { text: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200', icon: DocumentArrowDownIcon },
};

const StatCard: React.FC<{ title: string; value: number; icon: any; colorClass: string }> = ({ title, value, icon: Icon, colorClass }) => (
    <div className={`bg-bg-card border border-border-default rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow`}>
        <div>
            <p className="text-sm font-semibold text-text-muted mb-1">{title}</p>
            <h3 className="text-2xl font-extrabold text-text-default">{value}</h3>
        </div>
        <div className={`p-3 rounded-xl ${colorClass}`}>
            <Icon className="w-6 h-6" />
        </div>
    </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode; colorClass: string; tooltip: string; onClick?: (e: React.MouseEvent) => void; }> = ({ icon, colorClass, tooltip, onClick }) => (
    <button onClick={onClick} title={tooltip} className={`p-2 rounded-lg hover:bg-bg-hover transition-colors ${colorClass}`}>
        {icon}
    </button>
);

const ReferralCard: React.FC<{ referral: ActiveReferral; onToggleDetails: () => void; isExpanded: boolean; onStatusClick: (e: React.MouseEvent, referral: ActiveReferral) => void; onJobTitleClick: () => void; onClientClick: (e: React.MouseEvent) => void; }> = ({ referral, onToggleDetails, isExpanded, onStatusClick, onJobTitleClick, onClientClick }) => {
    const style = statusStyles[referral.status] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200', icon: ClockIcon };
    const StatusIcon = style.icon;

    return (
        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-5 hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-3">
                <div>
                     <h3 className="font-bold text-text-default text-lg mb-1">{referral.candidateName}</h3>
                     <button onClick={onJobTitleClick} className="text-sm font-medium text-primary-600 hover:underline block">{referral.jobTitle}</button>
                     {referral.clientId != null ? (
                        <button type="button" onClick={onClientClick} className="text-xs text-text-muted hover:text-text-default block mt-1">{referral.clientName}</button>
                     ) : (
                        <span className="text-xs text-text-muted block mt-1">{referral.clientName || '—'}</span>
                     )}
                </div>
                <button 
                    onClick={(e) => onStatusClick(e, referral)} 
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${style.bg} ${style.text} ${style.border} transition-transform active:scale-95`}
                >
                    <StatusIcon className="w-3.5 h-3.5" />
                    {referral.status}
                </button>
            </div>
            
            <div className="flex items-center gap-4 text-xs text-text-subtle mt-4 pt-4 border-t border-border-subtle">
                <span className="flex items-center gap-1">
                    <ClockIcon className="w-3.5 h-3.5" />
                    {new Date(referral.referralDate).toLocaleDateString('he-IL')}
                </span>
                <span className="flex items-center gap-1">
                    <BriefcaseIcon className="w-3.5 h-3.5" />
                    {referral.source}
                </span>
                 <div className="flex-grow"></div>
                 <button onClick={onToggleDetails} className="flex items-center gap-1 font-semibold text-text-muted hover:text-primary-600">
                    <span>{isExpanded ? 'סגור' : 'פרטים'}</span>
                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>
            </div>
        </div>
    );
};

const ReferralsView: React.FC<{
    onOpenNewTask: () => void;
    /** When set (candidate profile), only referrals for this candidate are shown. */
    candidateId?: string | null;
}> = ({ onOpenNewTask, candidateId }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [activeReferrals, setActiveReferrals] = useState<ActiveReferral[]>([]);
    const [activeReferralsLoading, setActiveReferralsLoading] = useState(false);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
    
    // Columns definitions using useMemo to react to language changes
    const allActiveColumns = useMemo(() => [
        { id: 'status', header: t('referrals_view.col_status') },
        { id: 'candidateName', header: t('referrals_view.col_candidateName') },
        { id: 'jobTitle', header: t('referrals_view.col_jobTitle') },
        { id: 'clientName', header: t('referrals_view.col_clientName') },
        { id: 'referralDate', header: t('referrals_view.col_referralDate') },
        { id: 'source', header: t('referrals_view.col_source') },
        { id: 'coordinator', header: t('referrals_view.col_coordinator') },
    ], [t]);

    const defaultVisibleColumns = useMemo(() => allActiveColumns.map(c => c.id as string), [allActiveColumns]);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [editingReferral, setEditingReferral] = useState<ActiveReferral | null>(null);
    const [reReferModal, setReReferModal] = useState<{ isOpen: boolean; referral: ActiveReferral | null }>({ isOpen: false, referral: null });
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [jobCatalog, setJobCatalog] = useState<Job[]>([]);
    const [jobCatalogLoading, setJobCatalogLoading] = useState(false);
    const [disqualifiedReferrals, setDisqualifiedReferrals] = useState<DisqualifiedReferral[]>([]);
    const [disqualifiedLoading, setDisqualifiedLoading] = useState(false);
    
    // Filters & Sorting
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'quarter' | 'custom'>('month');
    const [searchTerm, setSearchTerm] = useState('');

    const settingsRef = useRef<HTMLDivElement>(null);
    const dragItemIndex = useRef<number | null>(null);
    
    const [activeSortConfig, setActiveSortConfig] = useState<{ key: keyof ActiveReferral; direction: 'asc' | 'desc' } | null>({ key: 'referralDate', direction: 'desc' });
    const [disqualifiedSortConfig, setDisqualifiedSortConfig] = useState<{ key: keyof DisqualifiedReferral; direction: 'asc' | 'desc' } | null>(null);

    const scopeCandidateId =
        candidateId != null && String(candidateId).trim() !== '' ? String(candidateId).trim() : null;

    // Initial load - set default date range (Month)
    useEffect(() => {
        applyDatePreset('month');
    }, []);

    useEffect(() => {
        if (!apiBase) return;
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
                console.error('[ReferralsView] failed to load jobs', err);
            } finally {
                if (isActive) setJobCatalogLoading(false);
            }
        })();
        return () => { isActive = false; };
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) {
            setDisqualifiedReferrals([]);
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setDisqualifiedReferrals([]);
            return;
        }
        let isActive = true;
        setDisqualifiedLoading(true);
        fetch(`${apiBase}/api/candidates/screening-rejections`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: DisqualifiedReferral[]) => {
                if (isActive && Array.isArray(data)) {
                    const rows = scopeCandidateId
                        ? data.filter((r) => String(r.candidateId || '').trim() === scopeCandidateId)
                        : data;
                    setDisqualifiedReferrals(rows);
                }
            })
            .catch(() => {
                if (isActive) setDisqualifiedReferrals([]);
            })
            .finally(() => {
                if (isActive) setDisqualifiedLoading(false);
            });
        return () => { isActive = false; };
    }, [apiBase, scopeCandidateId]);

    useEffect(() => {
        if (!apiBase) {
            setActiveReferrals([]);
            return;
        }
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setActiveReferrals([]);
            return;
        }
        let isActive = true;
        setActiveReferralsLoading(true);
        fetch(`${apiBase}/api/email-uploads/screening-cv-referrals`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((data: ScreeningCvReferralApiRow[]) => {
                if (isActive && Array.isArray(data)) {
                    const rows = scopeCandidateId
                        ? data.filter((r) => String(r.candidateId || '').trim() === scopeCandidateId)
                        : data;
                    setActiveReferrals(rows.map(mapScreeningCvRowToActiveReferral));
                }
            })
            .catch(() => {
                if (isActive) setActiveReferrals([]);
            })
            .finally(() => {
                if (isActive) setActiveReferralsLoading(false);
            });
        return () => { isActive = false; };
    }, [apiBase, scopeCandidateId]);
    
    // Update visible columns if language changes
    useEffect(() => {
        setVisibleColumns(prev => {
             // Just update labels if IDs match, or reset to defaults if needed.
             // Here we keep IDs so selection persists, but labels update in render.
             return prev;
        });
    }, [t]);

    const applyDatePreset = (preset: 'today' | 'week' | 'month' | 'quarter') => {
        const end = new Date();
        const start = new Date();
        
        if (preset === 'week') start.setDate(end.getDate() - 7);
        if (preset === 'month') start.setDate(end.getDate() - 30);
        if (preset === 'quarter') start.setDate(end.getDate() - 90);
        
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
        setActivePreset(preset);
    };

    const handleClientClick = (e: React.MouseEvent, clientId: number | null) => {
        e.stopPropagation();
        if (clientId == null) return;
        navigate(`/clients/${clientId}`);
    };

    const sortedActiveReferrals = useMemo(() => {
        let items = activeReferrals.filter(item => {
            const date = new Date(item.referralDate);
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            
            // Adjust end date to include the full day
            if (end) end.setHours(23, 59, 59, 999);

            const matchesDate = (!start || date >= start) && (!end || date <= end);
            const matchesSearch = searchTerm === '' || 
                item.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.jobTitle.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesDate && matchesSearch;
        });

        if (activeSortConfig !== null) {
            items.sort((a, b) => {
                if (a[activeSortConfig.key] < b[activeSortConfig.key]) return activeSortConfig.direction === 'asc' ? -1 : 1;
                if (a[activeSortConfig.key] > b[activeSortConfig.key]) return activeSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [activeReferrals, activeSortConfig, startDate, endDate, searchTerm]);

    const sortedDisqualifiedReferrals = useMemo(() => {
        let sortableItems = [...disqualifiedReferrals];
        if (disqualifiedSortConfig !== null) {
            sortableItems.sort((a, b) => {
                const av = a[disqualifiedSortConfig.key];
                const bv = b[disqualifiedSortConfig.key];
                if (disqualifiedSortConfig.key === 'eventDate') {
                    const at = new Date(String(av)).getTime();
                    const bt = new Date(String(bv)).getTime();
                    return disqualifiedSortConfig.direction === 'asc' ? at - bt : bt - at;
                }
                if (av < bv) return disqualifiedSortConfig.direction === 'asc' ? -1 : 1;
                if (av > bv) return disqualifiedSortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return sortableItems;
    }, [disqualifiedReferrals, disqualifiedSortConfig]);

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
        return <span className="text-primary-500 font-bold">{config.direction === 'asc' ? ' ▲' : ' ▼'}</span>;
    };

    const toggleRow = (id: string) => setExpandedRowId(prevId => (prevId === id ? null : id));

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
    
    // Drag handlers...
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

    const handleSaveStatusUpdate = async (data: any) => {
        if (!editingReferral) return;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        if (!apiBase || !token) {
            setActiveReferrals(prev => prev.map(r => (r.id === editingReferral.id ? { ...r, status: data.status } : r)));
            setIsStatusModalOpen(false);
            setEditingReferral(null);
            return;
        }
        const payload: Record<string, unknown> = {
            status: data.status,
            dueDate: data.dueDate || null,
            dueTime: data.dueTime || null,
        };
        const noteLine = data.note != null && String(data.note).trim() !== '' ? String(data.note).trim() : '';
        if (noteLine) payload.note = noteLine;

        const res = await fetch(`${apiBase}/api/email-uploads/screening-cv-referrals/${editingReferral.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'שמירה נכשלה');
        }
        const recipientLine = editingReferral.recipientLine || (editingReferral.notes.includes('\n\n') ? editingReferral.notes.split('\n\n')[0] : editingReferral.notes);
        const nextInternal = noteLine ? noteLine : editingReferral.internalNote;
        const combinedNotes = nextInternal ? `${recipientLine}\n\n${nextInternal}` : recipientLine;
        setActiveReferrals(prev =>
            prev.map(r =>
                r.id !== editingReferral.id
                    ? r
                    : {
                          ...r,
                          status: data.status,
                          internalNote: nextInternal,
                          recipientLine,
                          notes: combinedNotes,
                          referralDueDate: String(data.dueDate || ''),
                          referralDueTime: String(data.dueTime || ''),
                      },
            ),
        );
        setIsStatusModalOpen(false);
        setEditingReferral(null);
    };

    const handleOpenReReferModal = (e: React.MouseEvent, referral: ActiveReferral) => {
        e.stopPropagation();
        setReReferModal({ isOpen: true, referral });
    };

    const handleSendReReferral = (data: { notes: string; nextStatus: string; contacts: number[] }) => {
        setReReferModal({ isOpen: false, referral: null });
        setActiveReferrals(prev => prev.map(r => r.id === reReferModal.referral?.id ? { ...r, status: data.nextStatus as Status, notes: data.notes } : r));
    };

    const buildFallbackJob = (jobTitle: string, clientName: string): Job => ({
        id: Date.now(),
        title: jobTitle,
        client: clientName,
        field: 'לא צויין',
        role: 'לא צויין',
        priority: 'רגילה',
        clientType: 'כללי',
        city: 'לא צויין',
        region: 'לא צויין',
        gender: 'לא משנה',
        mobility: false,
        licenseType: 'לא צויין',
        postingCode: '',
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
        location: 'לא צויין',
        jobType: 'לא צויין',
        description: 'פרטי משרה לא זמינים',
        requirements: [],
        rating: 0,
        healthProfile: 'standard',
    });

    const handleOpenJobDrawer = (jobTitle: string, clientName: string) => {
         const job = jobCatalog.find(j => j.title === jobTitle);
        const jobMap: {[key: string]: number} = { 'מפתח/ת Fullstack בכיר/ה': 2, 'מנהל/ת מוצר לחטיבת הפינטק': 7, 'מעצב/ת UX/UI': 3 }
        const fallbackJob = jobCatalog.find(j => j.id === (jobMap[jobTitle] || 1));

        if (job || fallbackJob) {
            setSelectedJob(job || fallbackJob || null);
            setIsDrawerOpen(true);
            return;
        }

        setSelectedJob(buildFallbackJob(jobTitle, clientName));
        setIsDrawerOpen(true);
    };

    // Calculate Stats
    const stats = useMemo(() => {
        const total = sortedActiveReferrals.length;
        const active = sortedActiveReferrals.filter(r => !['התקבל לעבודה', 'נדחה', 'בארכיון'].includes(r.status)).length;
        const hired = sortedActiveReferrals.filter(r => r.status === 'התקבל לעבודה').length;
        const rejected = sortedActiveReferrals.filter(r => r.status === 'נדחה').length;
        return { total, active, hired, rejected };
    }, [sortedActiveReferrals]);

    const renderCell = (referral: ActiveReferral, columnId: string) => {
        const styles = statusStyles[referral.status] || { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200', icon: ClockIcon };
        const StatusIcon = styles.icon;

        switch (columnId) {
            case 'status': return (
                <button onClick={(e) => handleOpenStatusModal(e, referral)} className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border ${styles.bg} ${styles.text} ${styles.border} transition-transform hover:scale-105`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {referral.status}
                </button>
            );
            case 'jobTitle': return <button onClick={(e) => { e.stopPropagation(); handleOpenJobDrawer(referral.jobTitle, referral.clientName) }} className="font-semibold text-primary-700 hover:underline text-right">{referral.jobTitle}</button>;
            case 'clientName':
                return referral.clientId != null ? (
                    <button type="button" onClick={(e) => handleClientClick(e, referral.clientId)} className="font-semibold text-text-default hover:text-primary-700 hover:underline">{referral.clientName}</button>
                ) : (
                    <span className="font-semibold text-text-default">{referral.clientName || '—'}</span>
                );
            case 'candidateName': return <span className="font-bold text-text-default">{referral.candidateName}</span>;
            case 'referralDate': return <span className="text-text-muted text-sm">{new Date(referral.referralDate).toLocaleDateString('he-IL')}</span>;
            default: return (referral as any)[columnId];
        }
    };

    return (
        <div className="space-y-6">
            
            {/* Header & Filters */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-6 bg-bg-card p-6 rounded-2xl shadow-sm border border-border-default">
                <div className="w-full xl:w-auto">
                    <h1 className="text-2xl font-black text-text-default mb-2">{t('referrals_view.title')}</h1>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Quick Date Presets */}
                         <div className="flex bg-bg-subtle p-1 rounded-lg border border-border-default">
                            <button onClick={() => applyDatePreset('today')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activePreset === 'today' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>היום</button>
                            <button onClick={() => applyDatePreset('week')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activePreset === 'week' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>השבוע</button>
                            <button onClick={() => applyDatePreset('month')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activePreset === 'month' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>החודש</button>
                            <button onClick={() => applyDatePreset('quarter')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activePreset === 'quarter' ? 'bg-white shadow text-primary-600' : 'text-text-muted hover:text-text-default'}`}>רבעון</button>
                        </div>
                        
                        <div className="flex items-center gap-2">
                             <div className="relative">
                                <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">מתאריך</span>
                                <input type="date" value={startDate} onChange={(e) => {setStartDate(e.target.value); setActivePreset('custom')}} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px] w-36"/>
                            </div>
                            <span className="text-text-muted">-</span>
                            <div className="relative">
                                <span className="absolute -top-2 right-2 text-[10px] font-bold text-text-muted bg-bg-card px-1">עד תאריך</span>
                                <input type="date" value={endDate} onChange={(e) => {setEndDate(e.target.value); setActivePreset('custom')}} className="bg-bg-input border border-border-default rounded-lg py-1.5 px-3 text-sm focus:ring-1 focus:ring-primary-500 outline-none h-[38px] w-36"/>
                            </div>
                        </div>

                         <div className="relative flex-grow min-w-[200px]">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder={t('referrals_view.search_placeholder')} 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-1 focus:ring-primary-500 h-[38px]" 
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full xl:w-auto flex-shrink-0">
                     <StatCard title="סה״כ הפניות" value={stats.total} icon={DocumentArrowDownIcon} colorClass="bg-blue-100 text-blue-600" />
                     <StatCard title="תהליכים פעילים" value={stats.active} icon={ClockIcon} colorClass="bg-amber-100 text-amber-600" />
                     <StatCard title="השמות" value={stats.hired} icon={CheckCircleIcon} colorClass="bg-green-100 text-green-600" />
                     <StatCard title="נדחו / הוסרו" value={stats.rejected} icon={XMarkIcon} colorClass="bg-red-100 text-red-600" />
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default overflow-hidden">
                <header className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/30">
                     <div className="flex items-center gap-2">
                        <div className="flex items-center bg-bg-subtle p-1 rounded-lg border border-border-default">
                            <button onClick={() => setViewMode('table')} className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><TableCellsIcon className="w-5 h-5"/></button>
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary-600' : 'text-text-muted hover:text-text-default'}`}><Squares2X2Icon className="w-5 h-5"/></button>
                        </div>
                        <span className="text-sm font-semibold text-text-muted border-r border-border-default pr-3 mr-1">מציג {sortedActiveReferrals.length} רשומות</span>
                    </div>

                    <div className="relative" ref={settingsRef}>
                        <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className="flex items-center gap-2 text-sm font-semibold text-text-muted hover:text-primary-600 bg-white border border-border-default px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                            <Cog6ToothIcon className="w-4 h-4"/>
                            <span>{t('candidates.customize_columns')}</span>
                        </button>
                        {isSettingsOpen && (
                            <div className="absolute top-full left-0 mt-2 w-56 bg-bg-card rounded-xl shadow-xl border border-border-default z-20 p-4 animate-fade-in">
                                <p className="font-bold text-text-default mb-3 text-sm border-b border-border-default pb-2">הצג עמודות</p>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {allActiveColumns.map(c => (
                                        <label key={c.id} className="flex items-center gap-2 text-sm text-text-default hover:bg-bg-hover p-1 rounded cursor-pointer">
                                            <input type="checkbox" checked={visibleColumns.includes(c.id as string)} onChange={() => handleColumnToggle(c.id as string)} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                                            {c.header}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                {viewMode === 'table' ? (
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-right min-w-[900px]">
                            <thead className="text-xs text-text-muted uppercase bg-bg-subtle/50 font-bold sticky top-0 z-10 backdrop-blur-sm">
                                <tr>
                                    {visibleColumns.map((colId) => {
                                        const col = allActiveColumns.find(c => c.id === colId);
                                        if (!col) return null;
                                        return (
                                            <th key={col.id} className="p-4 cursor-pointer hover:bg-bg-hover transition-colors" onClick={() => requestSort('active', col.id as keyof ActiveReferral)}>
                                                <div className="flex items-center gap-1">
                                                    {col.header} {getSortIndicator('active', col.id as keyof ActiveReferral)}
                                                </div>
                                            </th>
                                        )
                                    })}
                                    <th className="p-4 text-center w-24">{t('clients.col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {activeReferralsLoading ? (
                                    <tr>
                                        <td colSpan={visibleColumns.length + 1} className="p-16 text-center text-text-muted text-sm">טוען הפניות משליחת קו״ח מסינון…</td>
                                    </tr>
                                ) : sortedActiveReferrals.length === 0 ? (
                                    <tr>
                                        <td colSpan={visibleColumns.length + 1} className="p-16 text-center text-text-muted text-sm">
                                            {activeReferrals.length === 0
                                                ? 'אין רשומות. שליחות קו״ח ממסך סינון יופיעו כאן לאחר התחברות.'
                                                : 'אין רשומות בטווח התאריכים או בחיפוש הנוכחי.'}
                                        </td>
                                    </tr>
                                ) : (
                                sortedActiveReferrals.map(referral => (
                                    <React.Fragment key={referral.id}>
                                        <tr onClick={() => toggleRow(referral.id)} className="hover:bg-primary-50/30 cursor-pointer group transition-colors">
                                            {visibleColumns.map(colId => (
                                                <td key={colId} className="p-4 text-text-default">
                                                    {renderCell(referral, colId)}
                                                </td>
                                            ))}
                                            <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ActionButton icon={<ArrowUturnLeftIcon className="w-4 h-4"/>} colorClass="text-orange-500 bg-orange-50 hover:bg-orange-100" tooltip="הפניה מחדש" onClick={(e) => handleOpenReReferModal(e, referral)} />
                                                    <ActionButton icon={<PencilIcon className="w-4 h-4"/>} colorClass="text-text-subtle hover:text-primary-600" tooltip="ערוך" onClick={(e) => handleOpenStatusModal(e, referral)} />
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedRowId === referral.id && (
                                            <tr className="bg-bg-subtle/30 shadow-inner">
                                                <td colSpan={visibleColumns.length + 1} className="p-6">
                                                    <div className="flex gap-4 text-sm bg-white p-4 rounded-xl border border-border-default">
                                                        <div className="flex-shrink-0 mt-1"><ClockIcon className="w-5 h-5 text-primary-500" /></div>
                                                        <div>
                                                            <h4 className="font-bold text-text-default mb-1">הערות ותקציר:</h4>
                                                            <p className="text-text-muted leading-relaxed">{referral.notes}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                )))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 bg-bg-subtle/30">
                        {activeReferralsLoading ? (
                            <div className="col-span-full flex items-center justify-center py-16 text-text-muted text-sm">טוען הפניות…</div>
                        ) : sortedActiveReferrals.length === 0 ? (
                            <div className="col-span-full flex items-center justify-center py-16 text-text-muted text-sm">
                                {activeReferrals.length === 0
                                    ? 'אין רשומות. שליחות קו״ח ממסך סינון יופיעו כאן לאחר התחברות.'
                                    : 'אין רשומות בטווח התאריכים או בחיפוש הנוכחי.'}
                            </div>
                        ) : (
                        sortedActiveReferrals.map(referral => (
                            <ReferralCard 
                                key={referral.id} 
                                referral={referral} 
                                onToggleDetails={() => toggleRow(referral.id)} 
                                isExpanded={expandedRowId === referral.id} 
                                onStatusClick={handleOpenStatusModal}
                                onJobTitleClick={() => handleOpenJobDrawer(referral.jobTitle, referral.clientName)}
                                onClientClick={(e) => handleClientClick(e, referral.clientId)}
                            />
                        )))}
                    </div>
                )}
            </div>

            {/* Disqualified — job_candidate_screening.rejected from API */}
            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-6 opacity-80 hover:opacity-100 transition-opacity">
                <h3 className="text-lg font-bold text-text-default mb-4 flex items-center gap-2">
                    <XMarkIcon className="w-5 h-5 text-red-500" />
                    פסילות בסינון ראשוני
                    <span className="text-sm font-normal text-text-muted mr-2">
                        ({disqualifiedLoading ? '…' : sortedDisqualifiedReferrals.length})
                    </span>
                </h3>
                <div className="overflow-x-auto border border-border-default rounded-xl">
                    {disqualifiedLoading ? (
                        <div className="flex items-center justify-center py-16 text-text-muted text-sm">טוען פסילות…</div>
                    ) : sortedDisqualifiedReferrals.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-text-muted text-sm">אין פסילות רשומות (מסך סינון).</div>
                    ) : (
                    <table className="w-full text-sm text-right min-w-[800px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle font-bold">
                            <tr>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'candidateName')}>מועמד {getSortIndicator('disqualified', 'candidateName')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'jobTitle')}>משרה {getSortIndicator('disqualified', 'jobTitle')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'clientName')}>לקוח {getSortIndicator('disqualified', 'clientName')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'eventDate')}>תאריך {getSortIndicator('disqualified', 'eventDate')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'reason')}>סיבה {getSortIndicator('disqualified', 'reason')}</th>
                                <th className="p-3">שלב</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('disqualified', 'coordinator')}>רכז גיוס {getSortIndicator('disqualified', 'coordinator')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {sortedDisqualifiedReferrals.map((item) => (
                                <tr key={item.id} className="hover:bg-bg-hover">
                                    <td className="p-3 font-semibold text-text-default">{item.candidateName || '—'}</td>
                                    <td className="p-3 font-medium text-text-default">{item.jobTitle}</td>
                                    <td className="p-3 text-text-muted">{item.clientName || '—'}</td>
                                    <td className="p-3 text-text-muted whitespace-nowrap">{new Date(item.eventDate).toLocaleString('he-IL')}</td>
                                    <td className="p-3 text-red-600 max-w-xs">{item.reason}</td>
                                    <td className="p-3"><span className="bg-bg-subtle px-2 py-0.5 rounded text-xs border border-border-default">{item.screeningLevel}</span></td>
                                    <td className="p-3 text-text-muted">{item.coordinator || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    )}
                </div>
            </div>

            {/* Modals */}
            {editingReferral && (
                <UpdateStatusModal
                    isOpen={isStatusModalOpen}
                    onClose={() => setIsStatusModalOpen(false)}
                    onSave={handleSaveStatusUpdate}
                    initialStatus={editingReferral.status}
                    onOpenNewTask={onOpenNewTask}
                    contextPrimary={editingReferral.candidateName}
                    contextSecondary={[editingReferral.jobTitle, editingReferral.clientName].filter(Boolean).join(' · ')}
                    initialNote={editingReferral.internalNote}
                    initialDueDate={editingReferral.referralDueDate}
                    initialDueTime={editingReferral.referralDueTime}
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
