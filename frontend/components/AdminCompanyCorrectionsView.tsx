
import React, { useState, useMemo, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, LinkIcon, PlusIcon, TrashIcon, UserIcon, 
    ArrowTopRightOnSquareIcon, CheckCircleIcon, ExclamationTriangleIcon, 
    SparklesIcon, BuildingOffice2Icon, ArrowPathIcon, XMarkIcon, GlobeAmericasIcon,
    ClockIcon, FunnelIcon, Squares2X2Icon, AdjustmentsHorizontalIcon
} from './Icons';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';
import { useLanguage } from '../context/LanguageContext';

interface UnmatchedCompany {
    id: number;
    name: string; // The wrong name
    source: string;
    candidateId?: string | null;
    candidateName?: string;
    aiSuggestion?: string; // What the system thinks it is
    aiReason?: string; // Why?
    confidence: number; // 0-100
    occurrences: number; // How many times this wrong name appears
    isCompany?: boolean;
}

interface HistoryEntry {
    id: string;
    name: string;
    isCompany?: boolean;
    resolutionType?: string;
    resolvedValue?: string;
    createdAt: string;
    updatedAt?: string;
}

// Extended mock data
const mockUnmatchedCompanies: UnmatchedCompany[] = [
    ];
const mockExistingCompanies = ['Google', 'Meta', 'Microsoft', 'Amazon', 'AWS', 'Teva Pharmaceuticals', 'Apple', 'Intel', 'Wix', 'Monday.com'];

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string; subtext?: string; onClick?: () => void; isActive?: boolean }> = ({ title, value, icon, color, subtext, onClick, isActive }) => (
    <div 
        onClick={onClick}
        className={`bg-bg-card p-4 rounded-2xl border shadow-sm flex items-center justify-between transition-all cursor-pointer ${isActive ? 'ring-2 ring-primary-500 border-primary-500' : 'border-border-default hover:shadow-md'}`}
    >
        <div>
            <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">{title}</p>
            <div className="flex items-end gap-2">
                <p className="text-2xl font-black text-text-default">{value}</p>
                {subtext && <span className="text-xs font-medium text-text-subtle mb-1">{subtext}</span>}
            </div>
        </div>
        <div className={`p-3 rounded-xl ${color}`}>
            {icon}
        </div>
    </div>
);

// --- Quick Create Modal ---
const QuickCreateCompanyModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    initialName: string;
    onSave: (data: any) => void;
}> = ({ isOpen, onClose, initialName, onSave }) => {
    const [name, setName] = useState(initialName);
    const [industry, setIndustry] = useState('');
    const [website, setWebsite] = useState('');
    const [alias, setAlias] = useState('');

    useEffect(() => {
        if(isOpen) {
            setName(initialName);
            setIndustry('');
            setWebsite('');
                setAlias('');
        }
    }, [isOpen, initialName]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-xl w-full max-w-md border border-border-default animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-5 border-b border-border-default bg-bg-subtle/30">
                    <h3 className="font-bold text-lg text-text-default">הקמת חברה חדשה</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-text-muted hover:bg-bg-hover"><XMarkIcon className="w-5 h-5"/></button>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">שם החברה</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-primary-500" autoFocus />
                        <p className="text-[10px] text-text-muted mt-1">שם זה יתווסף למאגר החברות הגלובאלי.</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">תעשייה / תחום</label>
                        <input type="text" value={industry} onChange={e => setIndustry(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="לדוגמה: הייטק, פיננסים" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">אתר אינטרנט</label>
                        <input type="text" value={website} onChange={e => setWebsite(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="https://..." dir="ltr" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">שם קצר / Alley (alias)</label>
                        <input type="text" value={alias} onChange={e => setAlias(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="לדוגמה: אלדן" />
                    </div>
                </div>
                <div className="p-5 border-t border-border-default flex justify-end gap-3 bg-bg-subtle/10">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover rounded-lg transition-colors">ביטול</button>
                    <button onClick={() => onSave({ name, industry, website, alias })} className="px-6 py-2 text-sm font-bold text-white bg-primary-600 rounded-lg hover:bg-primary-700 shadow-sm transition-all flex items-center gap-2">
                        <PlusIcon className="w-4 h-4" />
                        צור חברה
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Toast Notification Component ---
const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bg = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-gray-800';
    const icon = type === 'success' ? <CheckCircleIcon className="w-5 h-5"/> : <ExclamationTriangleIcon className="w-5 h-5"/>;

    return (
        <div className={`fixed bottom-6 left-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white ${bg} animate-slide-up`}>
            {icon}
            <span className="text-sm font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100"><XMarkIcon className="w-4 h-4"/></button>
        </div>
    );
};


const AdminCompanyCorrectionsView: React.FC = () => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    
    // View State
    const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
    const [notification, setNotification] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

    // Data State
    const [unmatched, setUnmatched] = useState<UnmatchedCompany[]>([]);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

    // Flags for manual isCompany overrides
    const [companyFlags, setCompanyFlags] = useState<Record<number, boolean>>({});
    
    // Selection State
    const [selected, setSelected] = useState<UnmatchedCompany | null>(null);
    const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
    
    // UI State
    const [searchTerm, setSearchTerm] = useState('');
    const [linkSearchTerm, setLinkSearchTerm] = useState('');
    const [selectedExistingCompany, setSelectedExistingCompany] = useState<{ id: string; name: string } | null>(null);
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [sortBy, setSortBy] = useState<'confidence' | 'occurrences' | 'name'>('confidence');
    
    // Filters
    const [minConfidence, setMinConfidence] = useState(0); 
    
    // Drawer State
    const [drawerCandidate, setDrawerCandidate] = useState<any | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Derived Data
    const stats = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return {
            total: unmatched.length,
            highConfidence: unmatched.filter(u => u.confidence > 90).length,
            totalOccurrences: unmatched.reduce((acc, curr) => acc + curr.occurrences, 0),
            resolvedToday: historyEntries.filter(entry => new Date(entry.createdAt).getTime() >= today.getTime()).length,
        };
    }, [unmatched, historyEntries]);

    const companyFlagClass = (isCompany?: boolean) => (
        isCompany ? 'bg-green-500' : 'bg-red-500'
    );

    const mapTmpEntry = (entry: any): UnmatchedCompany => ({
        id: entry.id,
        name: entry.name || 'לא ידוע',
        source: entry.source || 'AI Detection',
        candidateId: entry.candidateId || null,
        candidateName: entry.candidate?.fullName || entry.candidateName || 'לא ידוע',
        aiSuggestion: entry.aiSuggestion || entry.nameEn || '',
        aiReason: entry.aiReason || entry.description || '',
        confidence: entry.confidence ?? 80,
        occurrences: entry.occurrences ?? 1,
        isCompany: entry.isCompany ?? false,
    });

    const loadUnmatched = async () => {
        try {
            const res = await fetch(`${apiBase}/api/organizations/tmp`);
            if (!res.ok) throw new Error('Failed to load corrections');
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) {
                setUnmatched(mockUnmatchedCompanies);
                return;
            }
            setUnmatched(data.map(mapTmpEntry));
        } catch (err) {
            console.error('Unable to fetch organization corrections', err);
            if (!unmatched.length) setUnmatched(mockUnmatchedCompanies);
        }
    };

    const loadOrganizationsData = async () => {
        try {
            const res = await fetch(`${apiBase}/api/organizations`);
            if (!res.ok) throw new Error('Failed to load organizations');
            const data = await res.json();
            if (Array.isArray(data)) {
                setOrganizations(
                    data
                        .filter((org) => org.name)
                        .map((org) => ({ id: org.id, name: org.name }))
                );
            }
        } catch (err) {
            console.error('Unable to fetch organizations', err);
        }
    };

    const loadHistory = async () => {
        try {
            const res = await fetch(`${apiBase}/api/organizations/tmp/history`);
            if (!res.ok) throw new Error('Failed to load history');
            const data = await res.json();
            if (Array.isArray(data)) {
                setHistoryEntries(data);
            }
        } catch (err) {
            console.error('Unable to fetch organization history', err);
        }
    };

    const resolveTmpEntries = async (
        ids: number[],
        add: boolean,
        actionType: 'link' | 'create' | 'delete',
        flags: { id: number; isCompany?: boolean }[],
        resolvedValue?: string,
    ) => {
        if (!ids.length) return;
        const payload: Record<string, any> = { ids, add, actionType, flags };
        if (resolvedValue) payload.resolvedValue = resolvedValue;
        const res = await fetch(`${apiBase}/api/organizations/tmp/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(body || 'הסרת החברה נכשלה');
        }
    };

    const filteredUnmatched = useMemo(() => {
        let items = unmatched.filter(u => 
            u.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
            u.confidence >= minConfidence
        );
        
        // Sorting Logic
        return items.sort((a, b) => {
            if (sortBy === 'confidence') return b.confidence - a.confidence;
            if (sortBy === 'occurrences') return b.occurrences - a.occurrences;
            return a.name.localeCompare(b.name);
        });
    }, [unmatched, searchTerm, minConfidence, sortBy]);

    const filteredHistory = useMemo(() =>
        historyEntries.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [historyEntries, searchTerm]
    );

    const filteredExisting = useMemo(() =>
        linkSearchTerm
            ? organizations.filter((org) => org.name.toLowerCase().includes(linkSearchTerm.toLowerCase()))
            : [],
        [linkSearchTerm, organizations]
    );

    useEffect(() => {
        loadUnmatched();
        loadHistory();
        loadOrganizationsData();
    }, []);

    const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setNotification({ message, type });
    };
    
    // Handlers
    const handleToggleCheck = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        setCheckedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            
            // If we just unchecked the last item, switch selection back to regular selection if exists
            if (newSet.size === 0 && selected?.id === id) {
                 // No op, keep selected
            }
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setCheckedIds(new Set(filteredUnmatched.map(u => u.id)));
        } else {
            setCheckedIds(new Set());
        }
    };
    
    // Bulk Logic
    const isBulkMode = checkedIds.size > 1;
    const selectedItemsForAction = isBulkMode 
        ? unmatched.filter(u => checkedIds.has(u.id)) 
        : (selected ? [selected] : []);

    const addAliasToOrganization = async (orgId: string, alias: string) => {
        if (!orgId || !alias) return;
        try {
            const res = await fetch(`${apiBase}/api/organizations/${orgId}`);
            if (!res.ok) throw new Error('Failed to load organization');
            const org = await res.json();
            const aliases = Array.isArray(org.aliases) ? [...org.aliases] : [];
            if (aliases.includes(alias)) return;
            aliases.push(alias);
            const updateRes = await fetch(`${apiBase}/api/organizations/${orgId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aliases }),
            });
            if (!updateRes.ok) {
                const body = await updateRes.text().catch(() => '');
                throw new Error(body || 'Failed to update organization aliases');
            }
        } catch (err: any) {
            console.error('Alias sync failed', err);
            // swallow the error: we still want to remove the tmp entry
        }
    };

    const handleResolve = async (action: 'link' | 'create' | 'delete') => {
        if (selectedItemsForAction.length === 0) return;

        if (action === 'link') {
            if (!selectedExistingCompany) {
                showNotification('אנא בחר חברה קיימת למיזוג.', 'error');
                return;
            }
            await addAliasToOrganization(selectedExistingCompany.id, selected.name);
            showNotification(`${selectedItemsForAction.length} חברות מוזגו בהצלחה ל-${selectedExistingCompany.name}`);
            await finalizeAction(false, 'link', selectedItemsForAction, selectedExistingCompany.name);
        } else if (action === 'create') {
            setIsCreateModalOpen(true);
        } else if (action === 'delete') {
            if (window.confirm(`האם אתה בטוח שברצונך להתעלם מ-${selectedItemsForAction.length} הפריטים המסומנים?`)) {
                showNotification(`${selectedItemsForAction.length} פריטים הוסרו`, 'info');
                await finalizeAction(false, 'delete', selectedItemsForAction);
            }
        }
    };

    const finalizeAction = async (
        add: boolean,
        actionType: 'link' | 'create' | 'delete',
        items: UnmatchedCompany[],
        resolvedValue?: string,
    ) => {
         const idsToRemove = items.map(u => u.id);
         const flagPayload = items
             .map(item => {
                 const override = companyFlags[item.id];
                 if (typeof override !== 'undefined') {
                     return { id: item.id, isCompany: override };
                 }
                 return null;
             })
             .filter(Boolean);

         setUnmatched(prev => prev.filter(u => !idsToRemove.includes(u.id)));
         setSelected(null);
         setCheckedIds(new Set());
         setLinkSearchTerm('');
         setSelectedExistingCompany(null);

        try {
            await resolveTmpEntries(idsToRemove, add, actionType, flagPayload, resolvedValue);
             await loadUnmatched();
             await loadHistory();
         } catch (err: any) {
             showNotification(err.message || 'הפעולה נכשלה', 'error');
         } finally {
             setCompanyFlags(prev => {
                 const next = { ...prev };
                 idsToRemove.forEach(id => delete next[id]);
                 return next;
             });
         }
    };

    const handleCreateNewCompany = async (data: any) => {
        setIsCreateModalOpen(false);
        showNotification(`החברה "${data.name}" נוצרה והפריטים שויכו בהצלחה`);
        try {
            const payload = {
                name: data.name,
                mainField: data.industry || undefined,
                website: data.website || undefined,
                aliases: data.alias ? [data.alias] : [],
            };
            const res = await fetch(`${apiBase}/api/organizations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(body || 'יצירת החברה נכשלה');
            }
        } catch (err: any) {
            showNotification(err.message || 'יצירת החברה נכשלה', 'error');
            return;
        }
        await finalizeAction(true, 'create', selectedItemsForAction, data.name);
    };

    const handleSelectForMerge = (company: { id: string; name: string }) => {
        setSelectedExistingCompany(company);
        setLinkSearchTerm(company.name);
    };

    const handleOpenCandidateDrawer = (candidateId?: string | null) => {
        if (!candidateId) return;
        setDrawerCandidate({
            id: candidateId,
            backendId: candidateId,
            name: selected?.candidateName || 'מועמד',
        });
        setIsDrawerOpen(true);
    };
    
    // Auto-select first item if none selected and in pending view
    useEffect(() => {
        if (viewMode === 'pending' && !selected && filteredUnmatched.length > 0 && checkedIds.size === 0) {
            setSelected(filteredUnmatched[0]);
        }
    }, [filteredUnmatched, selected, viewMode, checkedIds]);

    // Auto-fill AI suggestion into search when selected changes (Single Mode Only)
    useEffect(() => {
        if (!isBulkMode && selected?.aiSuggestion) {
            setLinkSearchTerm(selected.aiSuggestion);
            const exactMatch = mockExistingCompanies.find(c => c.toLowerCase() === selected.aiSuggestion?.toLowerCase());
            if (exactMatch) setSelectedExistingCompany(exactMatch);
            else setSelectedExistingCompany(null);
        } else if (!isBulkMode) {
            setLinkSearchTerm('');
            setSelectedExistingCompany(null);
        }
    }, [selected, isBulkMode]);

    return (
        <div className="space-y-6 h-full flex flex-col pb-6 relative">
            {notification && <Toast message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}
            
            {/* Header & Stats */}
            <div className="flex flex-col gap-6 flex-shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black text-text-default">בקרת איכות דאטה (Data Quality)</h1>
                        <p className="text-sm text-text-muted">תיקון ומיזוג שמות חברות שזוהו מקורות חיים</p>
                    </div>
                    <div className="flex bg-bg-subtle p-1 rounded-xl border border-border-default">
                        <button 
                            onClick={() => setViewMode('pending')}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'pending' ? 'bg-white text-primary-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                        >
                            <ExclamationTriangleIcon className="w-4 h-4"/>
                            ממתין לטיפול
                            <span className="bg-primary-100 text-primary-800 text-xs px-1.5 rounded-full">{unmatched.length}</span>
                        </button>
                        <button 
                            onClick={() => setViewMode('history')}
                            className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'history' ? 'bg-white text-primary-700 shadow-sm' : 'text-text-muted hover:text-text-default'}`}
                        >
                            <ClockIcon className="w-4 h-4"/>
                            היסטוריית תיקונים
                            <span className="bg-bg-card border border-border-default text-text-muted text-xs px-1.5 rounded-full">{historyEntries.length}</span>
                        </button>
                    </div>
                </div>

                {viewMode === 'pending' && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <StatCard 
                            title="סה״כ שגיאות" 
                            value={stats.total} 
                            icon={<ExclamationTriangleIcon className="w-6 h-6 text-orange-600"/>} 
                            color="bg-orange-50" 
                            isActive={minConfidence === 0}
                            onClick={() => setMinConfidence(0)}
                        />
                       
                    </div>
                )}
            </div>

            {/* Main Work Area */}
            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
                
                {/* LEFT COLUMN: List */}
                <div className={`w-full ${viewMode === 'pending' ? 'lg:w-1/3' : 'w-full'} bg-bg-card rounded-2xl border border-border-default flex flex-col overflow-hidden shadow-sm transition-all duration-300`}>
                    <div className="p-4 border-b border-border-default flex flex-col gap-3">
                         <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                placeholder={viewMode === 'pending' ? "סינון רשימה..." : "חיפוש בהיסטוריה..."}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-2 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all"
                            />
                        </div>
                        {viewMode === 'pending' && (
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                     <input 
                                        type="checkbox" 
                                        id="selectAll"
                                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                        onChange={handleSelectAll}
                                        checked={filteredUnmatched.length > 0 && checkedIds.size === filteredUnmatched.length}
                                    />
                                    <label htmlFor="selectAll" className="text-xs font-semibold text-text-muted cursor-pointer select-none">בחר הכל</label>
                                </div>
                                <div className="flex items-center gap-2">
                                     {checkedIds.size > 0 && (
                                         <button onClick={() => setCheckedIds(new Set())} className="text-xs font-bold text-red-500 hover:underline">נקה בחירה</button>
                                     )}
                                     <div className="w-px h-4 bg-border-default mx-1"></div>
                                     <select 
                                        value={sortBy} 
                                        onChange={(e) => setSortBy(e.target.value as any)} 
                                        className="bg-transparent text-xs font-semibold text-text-muted focus:outline-none cursor-pointer"
                                    >
                                        <option value="confidence">מיין לפי ביטחון</option>
                                        <option value="occurrences">מיין לפי שכיחות</option>
                                        <option value="name">מיין לפי א-ב</option>
                                    </select>
                                    <AdjustmentsHorizontalIcon className="w-4 h-4 text-text-subtle"/>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                        {viewMode === 'pending' ? (
                            // PENDING LIST
                            filteredUnmatched.map(item => {
                                const displayIsCompany = companyFlags[item.id] ?? item.isCompany;
                                return (
                                    <div 
                                        key={item.id} 
                                        onClick={() => { setSelected(item); }}
                                        className={`p-3 rounded-xl cursor-pointer border transition-all relative group flex items-start gap-3 ${
                                            selected?.id === item.id && checkedIds.size === 0
                                            ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-100' 
                                            : checkedIds.has(item.id) 
                                                ? 'bg-purple-50 border-purple-200 shadow-sm'
                                                : 'bg-white border-transparent hover:bg-bg-subtle hover:border-border-default'
                                        }`}
                                    >
                                        <div className="pt-1">
                                            <input 
                                                type="checkbox" 
                                                checked={checkedIds.has(item.id)}
                                                onClick={(e) => handleToggleCheck(e, item.id)}
                                                onChange={() => {}}
                                                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`w-2.5 h-2.5 rounded-full ${companyFlagClass(displayIsCompany)}`}></span>
                                                    <h4 className="font-bold text-text-default text-base truncate" title={item.name}>{item.name}</h4>
                                                </div>
                                                {item.occurrences > 1 && (
                                                    <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex-shrink-0">
                                                        x{item.occurrences}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="text-xs text-text-muted flex items-center gap-1 max-w-[100px]">
                                                        <UserIcon className="w-3 h-3"/>
                                                        <span className="truncate">{item.candidateName}</span>
                                                    </div>
                                                    {item.aiReason && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200 truncate max-w-[80px]" title={item.aiReason}>
                                                            {item.aiReason}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0 ${
                                                    item.confidence > 90 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {item.confidence > 90 && <SparklesIcon className="w-3 h-3"/>}
                                                    {item.confidence}%
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-2 flex-wrap text-[10px]">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setCompanyFlags(prev => ({ ...prev, [item.id]: true })); }}
                                                    className={`px-2 py-1 rounded-full border ${displayIsCompany ? 'bg-green-100 border-green-200 text-green-700' : 'border-gray-200 text-text-muted hover:border-border-default hover:bg-bg-subtle'}`}
                                                >
                                                    חברה
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setCompanyFlags(prev => ({ ...prev, [item.id]: false })); }}
                                                    className={`px-2 py-1 rounded-full border ${displayIsCompany ? 'border-gray-200 text-text-muted hover:border-border-default hover:bg-bg-subtle' : 'bg-red-100 border-red-200 text-red-700'}`}
                                                >
                                                    לא חברה
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            // HISTORY LIST
                            <div className="space-y-0 divide-y divide-border-subtle">
                                {filteredHistory.map(entry => (
                                    <div key={entry.id} className="p-4 hover:bg-bg-subtle/50 transition-colors">
                                         <div className="flex items-center justify-between">
                                             <div>
                                                 <div className="flex items-center gap-2">
                                                     <span className={`w-2.5 h-2.5 rounded-full ${companyFlagClass(entry.isCompany)}`}></span>
                                                     {entry.resolvedValue ? (
                                                         <>
                                                             <span className="font-bold text-text-default line-through text-opacity-60">{entry.name}</span>
                                                             <ArrowTopRightOnSquareIcon className="w-3 h-3 text-text-subtle" />
                                                             <span className="font-bold text-green-700">{entry.resolvedValue}</span>
                                                         </>
                                                     ) : (
                                                         <span className="font-bold text-text-default">{entry.name}</span>
                                                     )}
                                                 </div>
                                                 <div className="text-[10px] text-text-muted mt-1 flex items-center gap-2">
                                                     <span className="capitalize bg-bg-subtle px-1.5 rounded">{entry.resolutionType || 'הוסר'}</span>
                                                     <span>•</span>
                                                     <span>{new Date(entry.createdAt).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
                                                 </div>
                                             </div>
                                             <div className="text-[10px] text-text-muted">{new Date(entry.createdAt).toLocaleDateString('he-IL')}</div>
                                         </div>
                                    </div>
                                ))}
                                {filteredHistory.length === 0 && <div className="text-center p-10 text-text-muted">אין היסטוריה להצגה</div>}
                            </div>
                        )}
                        
                        {viewMode === 'pending' && filteredUnmatched.length === 0 && (
                            <div className="text-center p-8 text-text-muted text-sm">
                                {minConfidence > 0 ? 'אין שגיאות בביטחון גבוה' : 'אין שגיאות לטיפול!'}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Action Workspace (Only visible in pending mode) */}
                {viewMode === 'pending' && (
                    <div className="w-full lg:w-2/3 flex flex-col gap-4">
                        {isBulkMode ? (
                            // BULK MODE UI
                             <div className="bg-bg-card rounded-2xl border border-purple-200 shadow-sm flex-1 flex flex-col relative overflow-hidden animate-fade-in ring-1 ring-purple-100">
                                <div className="p-6 bg-purple-50 border-b border-purple-100">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-purple-200 text-purple-700 rounded-lg">
                                            <Squares2X2Icon className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-xl font-black text-purple-900">טיפול מרוכז (Batch)</h2>
                                    </div>
                                    <p className="text-purple-800 text-sm">
                                        נבחרו <span className="font-bold">{checkedIds.size}</span> פריטים למיזוג. כולם יאוחדו תחת שם חברה אחד.
                                    </p>
                                </div>
                                
                                <div className="p-6 space-y-8 flex-1 overflow-y-auto">
                                    {/* Selected Items Chips */}
                                    <div className="flex flex-wrap gap-2">
                                        {selectedItemsForAction.map(item => (
                                            <div key={item.id} className="bg-white border border-purple-200 text-purple-800 text-sm px-3 py-1.5 rounded-full shadow-sm flex items-center gap-2">
                                                <span>{item.name}</span>
                                                <button onClick={(e) => handleToggleCheck(e as any, item.id)} className="text-purple-400 hover:text-purple-700"><XMarkIcon className="w-3 h-3"/></button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Merge Action */}
                                    <div className="bg-white p-6 rounded-xl border border-border-default shadow-sm">
                                        <label className="block text-sm font-bold text-text-default mb-3 flex items-center gap-2">
                                            <LinkIcon className="w-5 h-5 text-primary-500"/>
                                            בחר חברת יעד למיזוג כולם
                                        </label>
                                        <div className="relative max-w-lg mb-2">
                                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                            <input 
                                                type="text" 
                                                placeholder="חפש חברה במאגר..."
                                                value={linkSearchTerm}
                                                onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all font-medium"
                                                autoFocus
                                            />
                                        </div>
                                         {/* Dropdown Results */}
                                        {linkSearchTerm && !selectedExistingCompany && (
                                            <div className="border border-border-default rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto max-w-lg mb-4">
                                            {filteredExisting.length > 0 ? (
                                                filteredExisting.map((company) => (
                                                    <button 
                                                        key={company.id}
                                                        onClick={() => handleSelectForMerge(company)}
                                                        className="w-full text-right p-3 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors border-b border-border-subtle last:border-0 flex justify-between items-center group"
                                                    >
                                                        <span>{company.name}</span>
                                                        <span className="text-xs text-text-subtle group-hover:text-primary-500">בחר</span>
                                                    </button>
                                                ))
                                            ) : (
                                                    <div className="p-4 text-center text-sm text-text-muted">לא נמצאו חברות תואמות</div>
                                                )}
                                            </div>
                                        )}
                                        
                                        {selectedExistingCompany && (
                                            <div className="flex gap-3 animate-fade-in mt-4">
                                                <button 
                                                    onClick={() => handleResolve('link')} 
                                                    className="bg-primary-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 flex items-center gap-2"
                                                >
                                                    <CheckCircleIcon className="w-5 h-5"/>
                                                    מזג {checkedIds.size} פריטים ל-{selectedExistingCompany?.name}
                                                </button>
                                                <button 
                                                    onClick={() => { setSelectedExistingCompany(null); setLinkSearchTerm(''); }}
                                                    className="bg-bg-subtle text-text-default font-bold py-3 px-4 rounded-xl hover:bg-bg-hover transition border border-border-default"
                                                >
                                                    ביטול
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="flex justify-end pt-4 border-t border-border-subtle">
                                         <button 
                                            onClick={() => handleResolve('delete')} 
                                            className="flex items-center gap-2 text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition font-medium"
                                        >
                                            <TrashIcon className="w-4 h-4"/>
                                            מחק / התעלם מכולם
                                        </button>
                                    </div>
                                </div>
                             </div>
                        ) : selected ? (
                            // SINGLE ITEM UI (Existing)
                            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm flex-1 flex flex-col relative overflow-hidden animate-fade-in">
                                {/* Background Pattern */}
                                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-bg-subtle to-transparent z-0"></div>
                                
                                <div className="p-8 relative z-10 flex flex-col items-center text-center">
                                    <div className="w-16 h-16 bg-white rounded-2xl border-2 border-border-default shadow-sm flex items-center justify-center text-2xl font-bold text-text-subtle mb-4">
                                        ?
                                    </div>
                                    <h2 className="text-3xl font-black text-text-default mb-2">"{selected.name}"</h2>
                                    <div className="flex items-center gap-2 text-sm text-text-muted bg-white px-3 py-1.5 rounded-full border border-border-default shadow-sm">
                                        <span>מקור: <strong>{selected.source}</strong></span>
                                        <span className="w-1 h-1 rounded-full bg-border-default"></span>
                                        <button
                                            onClick={() => handleOpenCandidateDrawer(selected.candidateId)}
                                            className="flex items-center gap-1 cursor-pointer hover:text-primary-600 transition-colors text-xs text-text-muted underline decoration-dotted"
                                        >
                                            <UserIcon className="w-3.5 h-3.5"/>
                                            {selected.candidateName || 'מועמד'}
                                        </button>
                                    </div>
                                </div>

                                <div className="flex-1 bg-white p-6 sm:p-8 space-y-8 overflow-y-auto custom-scrollbar">
                                    {/* Suggestion Box */}
                                    <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-start gap-4 shadow-sm relative overflow-hidden">
                                        <div className="bg-purple-100 p-3 rounded-full text-purple-600 z-10 shrink-0">
                                            <SparklesIcon className="w-6 h-6"/>
                                        </div>
                                        <div className="z-10 flex-1">
                                            <p className="text-xs font-bold text-purple-800 uppercase tracking-wide mb-1">זיהוי חכם (AI Suggestion)</p>
                                            <div className="flex items-center gap-3 mb-2">
                                                 <span className="text-2xl font-black text-gray-900">{selected.aiSuggestion}</span>
                                                 <span className="text-xs font-bold bg-white text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{selected.confidence}% ביטחון</span>
                                            </div>
                                            {selected.aiReason && (
                                                <p className="text-xs text-purple-700 bg-purple-100/50 p-2 rounded-lg border border-purple-100 inline-block">
                                                    💡 סיבה: <strong>{selected.aiReason}</strong>
                                                </p>
                                            )}
                                        </div>
                                        {/* Decorative BG */}
                                        <div className="absolute -right-4 -top-10 w-24 h-24 bg-purple-200/50 rounded-full blur-2xl"></div>
                                    </div>

                                    {/* Action: Link */}
                                    <div>
                                        <label className="block text-sm font-bold text-text-default mb-2 flex items-center gap-2">
                                            <LinkIcon className="w-4 h-4 text-primary-500"/>
                                            מיזוג לחברה קיימת (הוספה כ-Alias)
                                        </label>
                                        <div className="relative max-w-lg">
                                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                            <input 
                                                type="text" 
                                                placeholder="חפש חברה במאגר..."
                                                value={linkSearchTerm}
                                                onChange={e => { setLinkSearchTerm(e.target.value); setSelectedExistingCompany(null); }}
                                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all font-medium"
                                            />
                                        </div>
                                        
                                        {/* Dropdown Results */}
                                        {linkSearchTerm && !selectedExistingCompany && (
                                            <div className="mt-2 border border-border-default rounded-xl bg-white shadow-lg max-h-48 overflow-y-auto max-w-lg animate-fade-in">
                                                {filteredExisting.length > 0 ? (
                                                    filteredExisting.map(company => (
                                                        <button 
                                                            key={company.id}
                                                            onClick={() => handleSelectForMerge(company)}
                                                            className="w-full text-right p-3 text-sm hover:bg-primary-50 hover:text-primary-700 transition-colors border-b border-border-subtle last:border-0 flex justify-between items-center group"
                                                        >
                                                            <span>{company.name}</span>
                                                            <span className="text-xs text-text-subtle group-hover:text-primary-500">בחר</span>
                                                        </button>
                                                    ))
                                                ) : (
                                                    <div className="p-4 text-center text-sm text-text-muted">לא נמצאו חברות תואמות</div>
                                                )}
                                            </div>
                                        )}

                                        {selectedExistingCompany && (
                                            <div className="mt-4 animate-fade-in">
                                                <div className="flex gap-3">
                                                     <button 
                                                        onClick={() => handleResolve('link')} 
                                                        className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/30 flex items-center gap-2"
                                                    >
                                                    <CheckCircleIcon className="w-5 h-5"/>
                                                    תקן ל-{selectedExistingCompany.name}
                                                    </button>
                                                     <button 
                                                        onClick={() => { setSelectedExistingCompany(null); setLinkSearchTerm(''); }}
                                                        className="bg-bg-subtle text-text-default font-bold py-2.5 px-4 rounded-xl hover:bg-bg-hover transition border border-border-default"
                                                    >
                                                        ביטול
                                                    </button>
                                                </div>
                                                {selected.occurrences > 1 && (
                                                    <p className="text-xs text-text-muted mt-2 mr-1">
                                                        * יעדכן אוטומטית {selected.occurrences} מופעים של "{selected.name}" במערכת.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="h-px bg-border-subtle w-full"></div>

                                    {/* Alternative Actions */}
                                    <div>
                                        <p className="text-xs font-bold text-text-muted uppercase mb-3 tracking-wide">אפשרויות נוספות</p>
                                        <div className="flex flex-wrap gap-3">
                                            <button 
                                                onClick={() => handleResolve('create')} 
                                                className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-bg-subtle transition shadow-sm"
                                            >
                                                <PlusIcon className="w-4 h-4 text-green-600"/>
                                                <span>צור כחברה חדשה במאגר</span>
                                            </button>
                                             <button 
                                                onClick={() => handleResolve('delete')} 
                                                className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2 px-4 rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition shadow-sm"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                                <span>מחק / התעלם</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm h-full flex flex-col items-center justify-center p-12 text-center text-text-muted">
                                <div className="w-20 h-20 bg-bg-subtle rounded-full flex items-center justify-center mb-6">
                                    <LinkIcon className="w-10 h-10 opacity-30"/>
                                </div>
                                <h3 className="text-xl font-bold text-text-default mb-2">בחר שגיאה לטיפול</h3>
                                <p className="max-w-xs">בחר שם חברה מהרשימה מימין כדי לראות את הצעות המערכת ולבצע מיזוג או יצירה.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Candidate Context Drawer */}
            <CandidateSummaryDrawer 
                candidate={drawerCandidate} 
                isOpen={isDrawerOpen} 
                onClose={() => setIsDrawerOpen(false)}
                isFavorite={false} // Add logic if needed
                onToggleFavorite={() => {}} 
            />

            {/* Quick Create Modal */}
            <QuickCreateCompanyModal 
                isOpen={isCreateModalOpen} 
                onClose={() => setIsCreateModalOpen(false)}
                initialName={selected?.name || ''}
                onSave={handleCreateNewCompany}
            />
        </div>
    );
};

export default AdminCompanyCorrectionsView;
