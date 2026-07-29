
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { 
    AvatarIcon, ArrowLeftIcon, PhoneIcon, MapPinIcon, EnvelopeIcon, 
    BriefcaseIcon, UserIcon, ClockIcon, DocumentTextIcon, 
    TrashIcon, NoSymbolIcon, PencilIcon, CheckCircleIcon,
    InformationCircleIcon, XMarkIcon, MagnifyingGlassIcon,
} from './Icons';
import ResumeViewer from './ResumeViewer';
import ActivityLogModal from './ActivityLogModal'; // Reuse existing logs logic

// Mock Logs

const defaultTagForm = {
    tagKey: '',
    displayNameHe: '',
    raw_type: 'Role',
    context: 'Core',
    is_current: true,
    is_in_summary: false,
    confidence_score: 1,
};

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
    value ? (
        <div className="flex items-start justify-between gap-2">
            <p className="text-text-muted text-xs font-bold uppercase shrink-0">{label}</p>
            <p className="font-medium text-text-default text-xs text-left">{value}</p>
        </div>
    ) : null;

const TabButton: React.FC<{ title: string; icon: React.ReactNode; isActive: boolean; onClick: () => void }> = ({ title, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-bold transition-colors ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-subtle'
        }`}
    >
        {icon}
        <span>{title}</span>
    </button>
);

const TagMetricHelp: React.FC<{ label: string; ariaLabel: string; children: React.ReactNode }> = ({
    label,
    ariaLabel,
    children,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    return (
        <div className="relative inline-flex items-center justify-center gap-1" ref={wrapRef}>
            <span>{label}</span>
            <button
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                className="inline-flex shrink-0 rounded text-primary-600 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
                <InformationCircleIcon className="w-3.5 h-3.5" />
            </button>
            {open && (
                <div
                    dir="rtl"
                    role="tooltip"
                    className="absolute z-[60] top-full mt-1 end-0 min-w-[14rem] max-w-[18rem] rounded-lg border border-border-default bg-bg-card p-2.5 text-[10px] font-normal normal-case leading-snug text-text-default shadow-lg whitespace-normal"
                >
                    {children}
                </div>
            )}
        </div>
    );
};

const AdminCandidateProfileView: React.FC = () => {
    const { candidateId } = useParams<{ candidateId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const searchHighlightKeywords = useMemo(() => {
        const st = location.state as { matchedTerms?: string[] } | null;
        return Array.isArray(st?.matchedTerms) ? st.matchedTerms.filter(Boolean) : [];
    }, [location.state]);
    const [activeTab, setActiveTab] = useState<'overview' | 'resume' | 'logs'>('overview');
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [auditLogsLoading, setAuditLogsLoading] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [candidate, setCandidate] = useState<any | null>(null);
    const [resumeText, setResumeText] = useState<string>('');
    const [resumeUrl, setResumeUrl] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [candidateTags, setCandidateTags] = useState<any[]>([]);
    const [tagForm, setTagForm] = useState<{ tagKey: string; displayNameHe: string; raw_type: string; context: string; is_current: boolean; is_in_summary: boolean; confidence_score: number }>(defaultTagForm);
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [tagFeedback, setTagFeedback] = useState<string | null>(null);
    const tagTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const candidateIdentifier = useMemo(() => candidate?.backendId || candidate?.id, [candidate]);

    const loadCandidate = useCallback(async () => {
        if (!apiBase || !candidateId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates/${candidateId}`);
            if (!res.ok) throw new Error('Failed to load candidate');
            const data = await res.json();
            setCandidate(data);
            setResumeText(data.resumeText || data.searchText || data.professionalSummary || '');
            setResumeUrl(data.resumeUrl || '');
        } catch (err: any) {
            setError(err.message || 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [apiBase, candidateId]);

    useEffect(() => {
        loadCandidate();
    }, [loadCandidate]);

    const loadAuditLogs = useCallback(async () => {
        if (!apiBase || !candidateId) return;
        setAuditLogsLoading(true);
        try {
            const res = await fetch(`${apiBase}/api/audit-logs/by-entity/candidate/${candidateId}?limit=200`);
            if (!res.ok) throw new Error('Failed to load logs');
            const data = await res.json();
            setAuditLogs(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
        } catch {
            setAuditLogs([]);
        } finally {
            setAuditLogsLoading(false);
        }
    }, [apiBase, candidateId]);

    useEffect(() => {
        if (activeTab === 'logs') loadAuditLogs();
    }, [activeTab, loadAuditLogs]);

    // ── Work-experience inline editing ───────────────────────────────────────
    const [editingExpIdx, setEditingExpIdx] = useState<number | null>(null);
    const [expSearch, setExpSearch] = useState('');
    const [expResults, setExpResults] = useState<{ id: string; name: string; nameEn?: string; location?: string }[]>([]);
    const [expSelected, setExpSelected] = useState<{ id: string; name: string } | null>(null);
    const [expEditTitle, setExpEditTitle] = useState('');
    const [expEditStartDate, setExpEditStartDate] = useState('');
    const [expEditEndDate, setExpEditEndDate] = useState('');
    const [expSaving, setExpSaving] = useState(false);
    const expSearchRef = useRef<HTMLInputElement>(null);

    const openExpEdit = (idx: number) => {
        const we = (candidate?.workExperience ?? [])[idx];
        setEditingExpIdx(idx);
        setExpSelected(null);
        setExpSearch(we?.company || '');
        setExpEditTitle(we?.title || we?.role || '');
        setExpEditStartDate(we?.startDate || '');
        setExpEditEndDate(we?.endDate === 'Present' ? '' : (we?.endDate || ''));
    };

    useEffect(() => {
        if (editingExpIdx === null) { setExpSearch(''); setExpResults([]); setExpSelected(null); return; }
        setTimeout(() => expSearchRef.current?.focus(), 50);
    }, [editingExpIdx]);

    useEffect(() => {
        if (!expSearch.trim() || expSearch.length < 2) { setExpResults([]); return; }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${apiBase}/api/organizations?search=${encodeURIComponent(expSearch)}&limit=8`, { signal: controller.signal, credentials: 'include' });
                if (!res.ok) return;
                const body = await res.json();
                const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
                setExpResults(list.map((o: any) => ({ id: String(o.id), name: o.name || '', nameEn: o.nameEn || '', location: o.location || '' })));
            } catch { /* aborted */ }
        }, 300);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [expSearch, apiBase]);

    const handleSaveExpOrg = async (expIdx: number) => {
        if (!candidateId || !apiBase) return;
        setExpSaving(true);
        try {
            const body: Record<string, string | null> = {
                title: expEditTitle.trim(),
                startDate: expEditStartDate.trim() || '',
                endDate: expEditEndDate.trim() || 'Present',
            };
            if (expSelected) {
                body.organizationId = expSelected.id;
                body.organizationName = expSelected.name;
            }
            const res = await fetch(`${apiBase}/api/candidates/${candidateId}/work-experience/${expIdx}/organization`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Save failed');
            setEditingExpIdx(null);
            await loadCandidate();
        } catch (err) {
            console.error('[handleSaveExpOrg]', err);
        } finally {
            setExpSaving(false);
        }
    };
    // ────────────────────────────────────────────────────────────────────────


    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editForm, setEditForm] = useState({
        // Basic identity
        fullName: '', phone: '', email: '', address: '', location: '',
        gender: '', birthYear: '', maritalStatus: '', idNumber: '',
        // Professional
        title: '', professionalSummary: '',
        availability: '', employmentType: '', jobScope: '',
        salaryMin: '', salaryMax: '',
        mobility: '', drivingLicense: '',
        // System
        source: '', status: '', statusExplanation: '', internalNotes: '',
    });

    const setField = (key: keyof typeof editForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setEditForm(prev => ({ ...prev, [key]: e.target.value }));

    useEffect(() => {
        if (candidate) {
            setEditForm({
                fullName:          candidate.fullName || candidate.name || '',
                phone:             candidate.phone || '',
                email:             candidate.email || '',
                address:           candidate.address || '',
                location:          candidate.location || '',
                gender:            candidate.gender || '',
                birthYear:         candidate.birthYear || '',
                maritalStatus:     candidate.maritalStatus || '',
                idNumber:          candidate.idNumber || '',
                title:             candidate.title || '',
                professionalSummary: candidate.professionalSummary || '',
                availability:      candidate.availability || '',
                employmentType:    candidate.employmentType || '',
                jobScope:          candidate.jobScope || '',
                salaryMin:         String(candidate.salaryMin || ''),
                salaryMax:         String(candidate.salaryMax || ''),
                mobility:          candidate.mobility || '',
                drivingLicense:    candidate.drivingLicense || '',
                source:            candidate.source || candidate.sourceDetail || '',
                status:            candidate.status || '',
                statusExplanation: candidate.statusExplanation || '',
                internalNotes:     candidate.internalNotes || '',
            });
        }
    }, [candidate]);

    const handleDelete = async () => {
        if (!candidateId || !apiBase) return;
        if (window.confirm('האם למחוק את המועמד לצמיתות?')) {
            try {
                await fetch(`${apiBase}/api/candidates/${candidateId}`, { method: 'DELETE' });
                navigate('/admin/candidates');
            } catch (err) {
                alert('מחיקה נכשלה');
            }
        }
    };

    const fetchCandidateTags = useCallback(async () => {
        if (!candidateIdentifier || !apiBase) return;
        try {
            const params = new URLSearchParams({
                candidateId: candidateIdentifier,
                limit: '2000',
                offset: '0',
            });
            const res = await fetch(`${apiBase}/api/admin/candidate-tags?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to load candidate tags');
            const body = await res.json();
            const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
            setCandidateTags(list);
        } catch (err) {
            console.error('Failed to load candidate tags', err);
        }
    }, [apiBase, candidateIdentifier]);

    useEffect(() => {
        void fetchCandidateTags();
    }, [fetchCandidateTags]);

    useEffect(() => {
        return () => {
            if (tagTimeoutRef.current) clearTimeout(tagTimeoutRef.current);
        };
    }, []);

    const flashTagFeedback = (text: string) => {
        setTagFeedback(text);
        if (tagTimeoutRef.current) clearTimeout(tagTimeoutRef.current);
        tagTimeoutRef.current = setTimeout(() => {
            setTagFeedback(null);
        }, 3000);
    };

    const handleSubmitTagForm = async () => {
        if (!candidateIdentifier || !apiBase || !tagForm.tagKey.trim()) return;
        const payload = {
            candidate_id: candidateIdentifier,
            tagKey: tagForm.tagKey.trim(),
            displayNameHe: tagForm.displayNameHe.trim(),
            raw_type: tagForm.raw_type,
            context: tagForm.context,
            is_current: tagForm.is_current,
            is_in_summary: tagForm.is_in_summary,
            confidence_score: tagForm.confidence_score,
        };
        try {
            const method = editingTagId ? 'PUT' : 'POST';
            const url = editingTagId
                ? `${apiBase}/api/admin/candidate-tags/${editingTagId}`
                : `${apiBase}/api/admin/candidate-tags`;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                throw new Error('הפעולה נכשלה');
            }
            await fetchCandidateTags();
            flashTagFeedback(editingTagId ? 'התגית עודכנה' : 'התגית נוצרה');
            setEditingTagId(null);
            setTagForm(defaultTagForm);
        } catch (err) {
            console.error('Tag form failed', err);
        }
    };

    const handleEditTag = (tag: any) => {
        setEditingTagId(tag.id);
        setTagForm({
            tagKey: tag.tag?.tagKey || '',
            displayNameHe: tag.tag?.displayNameHe || '',
            raw_type: tag.raw_type || 'Role',
            context: tag.context || 'Core',
            is_current: Boolean(tag.is_current),
            is_in_summary: Boolean(tag.is_in_summary),
            confidence_score: Number(tag.confidence_score ?? 1),
        });
    };

    const handleDeleteTag = async (id: string) => {
        if (!apiBase) return;
        if (!window.confirm('האם למחוק את התגית הזו?')) return;
        try {
            const res = await fetch(`${apiBase}/api/admin/candidate-tags/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            await fetchCandidateTags();
            flashTagFeedback('התגית נמחקה');
        } catch (err) {
            console.error('Failed to delete tag', err);
        }
    };

    const handleSaveDetails = async () => {
        if (!candidateId || !apiBase) return;
        const payload = {
            fullName:          editForm.fullName,
            phone:             editForm.phone,
            email:             editForm.email,
            address:           editForm.address,
            location:          editForm.location,
            gender:            editForm.gender,
            birthYear:         editForm.birthYear,
            maritalStatus:     editForm.maritalStatus,
            idNumber:          editForm.idNumber,
            title:             editForm.title,
            professionalSummary: editForm.professionalSummary,
            availability:      editForm.availability,
            employmentType:    editForm.employmentType,
            jobScope:          editForm.jobScope,
            salaryMin:         editForm.salaryMin ? Number(editForm.salaryMin) : null,
            salaryMax:         editForm.salaryMax ? Number(editForm.salaryMax) : null,
            mobility:          editForm.mobility,
            drivingLicense:    editForm.drivingLicense,
            source:            editForm.source,
            status:            editForm.status,
            statusExplanation: editForm.statusExplanation,
            internalNotes:     editForm.internalNotes,
        };
        try {
            const res = await fetch(`${apiBase}/api/candidates/${candidateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Save failed');
            setIsEditingDetails(false);
            await loadCandidate();
        } catch (err) {
            setError('עדכון נכשל');
        }
    };

    if (!candidate) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-bg-subtle rounded-2xl">
                <h1 className="text-xl font-bold text-text-default mb-4">{loading ? 'טוען...' : 'המועמד לא נמצא'}</h1>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button onClick={() => navigate('/admin/candidates')} className="text-primary-600 font-semibold hover:underline">
                    חזרה לרשימה
                </button>
            </div>
        );
    }
    
    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Header */}
            <header className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-5">
                    <AvatarIcon initials={(candidate.fullName || candidate.name || '??').slice(0,2)} size={80} fontSize={32} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                    <div>
                        <h1 className="text-3xl font-black text-text-default">{candidate.fullName || candidate.name}</h1>
                        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
                            <span className="font-semibold">{candidate.title || candidate.professionalSummary}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><MapPinIcon className="w-3.5 h-3.5"/> {candidate.address}</span>
                            <span>•</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${candidate.status === 'חדש' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
                                {candidate.status || 'active'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {!isEditingDetails ? (
                        <button onClick={() => setIsEditingDetails(true)} className="flex items-center gap-2 px-4 py-2 border border-border-default rounded-xl hover:bg-bg-subtle font-semibold text-sm transition text-text-default">
                            <PencilIcon className="w-4 h-4"/> עריכה
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button onClick={handleSaveDetails} className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition">
                                <CheckCircleIcon className="w-4 h-4"/> שמור
                            </button>
                            <button onClick={() => { setIsEditingDetails(false); setError(null); }} className="flex items-center gap-2 px-4 py-2 border border-border-default rounded-xl hover:bg-bg-subtle font-semibold text-sm transition text-text-default">
                                ביטול
                            </button>
                        </div>
                    )}
                    <button className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 font-semibold text-sm transition">
                        <NoSymbolIcon className="w-4 h-4"/> חסימה
                    </button>
                     <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 bg-white text-text-muted hover:text-red-500 border border-border-default rounded-xl hover:border-red-200 transition">
                        <TrashIcon className="w-4 h-4"/>
                    </button>
                    <div className="w-px h-8 bg-border-default mx-2 hidden md:block"></div>
                    <button onClick={() => navigate('/admin/candidates')} className="flex items-center gap-2 text-text-muted hover:text-primary-600 font-semibold text-sm px-2">
                        <ArrowLeftIcon className="w-4 h-4" /> חזרה לרשימה
                    </button>
                </div>
            </header>
            
            {/* Tabs */}
            <div className="bg-bg-card border-b border-border-default">
                <nav className="flex items-center px-4 overflow-x-auto">
                    <TabButton title="סקירה כללית" icon={<UserIcon className="w-5 h-5"/>} isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
                    <TabButton title="קורות חיים" icon={<DocumentTextIcon className="w-5 h-5"/>} isActive={activeTab === 'resume'} onClick={() => setActiveTab('resume')} />
                    <TabButton
                        title="לוג מערכת"
                        icon={<ClockIcon className="w-5 h-5"/>}
                        isActive={activeTab === 'logs'}
                        onClick={() => setActiveTab('logs')}
                    />
                </nav>
            </div>

            {/* Content Area */}
            <main>
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        
                        {/* Left Column: Full Candidate Details */}
                        <div className="space-y-5">

                            {/* ── Edit toolbar ── */}
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase text-text-muted tracking-wide">פרטי מועמד</span>
                                {!isEditingDetails ? (
                                    <button
                                        onClick={() => setIsEditingDetails(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border-default rounded-lg text-text-muted hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition"
                                    >
                                        <PencilIcon className="w-3.5 h-3.5" /> עריכה
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleSaveDetails}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                                        >
                                            <CheckCircleIcon className="w-3.5 h-3.5" /> שמור
                                        </button>
                                        <button
                                            onClick={() => { setIsEditingDetails(false); setError(null); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border border-border-default rounded-lg text-text-muted hover:bg-bg-hover transition"
                                        >
                                            ביטול
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* ── Section: פרטי זיהוי ── */}
                            <div className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm">
                                <h3 className="font-bold text-base text-text-default mb-4 flex items-center gap-2">
                                    <UserIcon className="w-4 h-4 text-primary-500" /> פרטי זיהוי
                                </h3>
                                {isEditingDetails ? (
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">שם מלא</label>
                                            <input value={editForm.fullName} onChange={setField('fullName')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">מגדר</label>
                                            <select value={editForm.gender} onChange={setField('gender')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                <option value="">לא צוין</option>
                                                <option value="זכר">זכר</option>
                                                <option value="נקבה">נקבה</option>
                                                <option value="אחר">אחר</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">שנת לידה</label>
                                            <input value={editForm.birthYear} onChange={setField('birthYear')} placeholder="1990" className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">מצב משפחתי</label>
                                            <select value={editForm.maritalStatus} onChange={setField('maritalStatus')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                <option value="">לא צוין</option>
                                                <option value="רווק/ה">רווק/ה</option>
                                                <option value="נשוי/אה">נשוי/אה</option>
                                                <option value="גרוש/ה">גרוש/ה</option>
                                                <option value="אלמן/ה">אלמן/ה</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">ת.ז.</label>
                                            <input value={editForm.idNumber} onChange={setField('idNumber')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" dir="ltr" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-sm">
                                        <InfoRow label="שם מלא" value={editForm.fullName} />
                                        <InfoRow label="מגדר" value={editForm.gender} />
                                        <InfoRow label="שנת לידה" value={editForm.birthYear} />
                                        <InfoRow label="מצב משפחתי" value={editForm.maritalStatus} />
                                        <InfoRow label="ת.ז." value={editForm.idNumber} />
                                        <InfoRow label="תאריך הרשמה" value={candidate.createdAt ? new Date(candidate.createdAt).toLocaleDateString('he-IL') : ''} />
                                    </div>
                                )}
                            </div>

                            {/* ── Section: פרטי קשר ── */}
                            <div className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm">
                                <h3 className="font-bold text-base text-text-default mb-4 flex items-center gap-2">
                                    <PhoneIcon className="w-4 h-4 text-primary-500" /> פרטי קשר
                                </h3>
                                {isEditingDetails ? (
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">טלפון</label>
                                            <input value={editForm.phone} onChange={setField('phone')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" dir="ltr" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">אימייל</label>
                                            <input value={editForm.email} onChange={setField('email')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" dir="ltr" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">כתובת</label>
                                            <input value={editForm.address} onChange={setField('address')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">עיר / אזור</label>
                                            <input value={editForm.location} onChange={setField('location')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex items-center justify-between">
                                            <p className="text-text-muted text-xs font-bold uppercase">טלפון</p>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium">{candidate.phone || 'לא צוין'}</p>
                                                {candidate.phone && <a href={`tel:${candidate.phone}`} className="p-1 bg-green-50 text-green-600 rounded-full"><PhoneIcon className="w-3 h-3"/></a>}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-text-muted text-xs font-bold uppercase">אימייל</p>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium truncate max-w-[160px]">{candidate.email || 'לא צוין'}</p>
                                                {candidate.email && <a href={`mailto:${candidate.email}`} className="p-1 bg-blue-50 text-blue-600 rounded-full"><EnvelopeIcon className="w-3 h-3"/></a>}
                                            </div>
                                        </div>
                                        <InfoRow label="כתובת" value={editForm.address} />
                                        <InfoRow label="עיר / אזור" value={editForm.location} />
                                    </div>
                                )}
                            </div>

                            {/* ── Section: פרופיל מקצועי ── */}
                            <div className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm">
                                <h3 className="font-bold text-base text-text-default mb-4 flex items-center gap-2">
                                    <BriefcaseIcon className="w-4 h-4 text-primary-500" /> פרופיל מקצועי
                                </h3>
                                {isEditingDetails ? (
                                    <div className="space-y-3 text-sm">
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">כותרת מקצועית</label>
                                            <input value={editForm.title} onChange={setField('title')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">סיכום מקצועי</label>
                                            <textarea value={editForm.professionalSummary} onChange={setField('professionalSummary')} rows={3} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm resize-none" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">זמינות</label>
                                                <select value={editForm.availability} onChange={setField('availability')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                    <option value="">לא צוין</option>
                                                    <option value="מיידי">מיידי</option>
                                                    <option value="עד חודש">עד חודש</option>
                                                    <option value="1-3 חודשים">1-3 חודשים</option>
                                                    <option value="3+ חודשים">3+ חודשים</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">סוג העסקה</label>
                                                <select value={editForm.employmentType} onChange={setField('employmentType')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                                    <option value="">לא צוין</option>
                                                    <option value="משרה מלאה">משרה מלאה</option>
                                                    <option value="משרה חלקית">משרה חלקית</option>
                                                    <option value="פרילנס">פרילנס</option>
                                                    <option value="חוזה">חוזה</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">היקף משרה</label>
                                                <input value={editForm.jobScope} onChange={setField('jobScope')} placeholder="לדוג׳ 100%" className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">ניידות</label>
                                                <input value={editForm.mobility} onChange={setField('mobility')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">שכר מינימום (₪)</label>
                                                <input type="number" value={editForm.salaryMin} onChange={setField('salaryMin')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" dir="ltr" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">שכר מקסימום (₪)</label>
                                                <input type="number" value={editForm.salaryMax} onChange={setField('salaryMax')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" dir="ltr" />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">רישיון נהיגה</label>
                                                <input value={editForm.drivingLicense} onChange={setField('drivingLicense')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-sm">
                                        <InfoRow label="כותרת" value={editForm.title} />
                                        {editForm.professionalSummary && (
                                            <p className="text-xs text-text-muted leading-relaxed line-clamp-4">{editForm.professionalSummary}</p>
                                        )}
                                        <InfoRow label="זמינות" value={editForm.availability} />
                                        <InfoRow label="סוג העסקה" value={editForm.employmentType} />
                                        <InfoRow label="היקף משרה" value={editForm.jobScope} />
                                        <InfoRow label="ניידות" value={editForm.mobility} />
                                        {(editForm.salaryMin || editForm.salaryMax) && (
                                            <InfoRow label="ציפיות שכר" value={[editForm.salaryMin && `₪${Number(editForm.salaryMin).toLocaleString()}`, editForm.salaryMax && `₪${Number(editForm.salaryMax).toLocaleString()}`].filter(Boolean).join(' – ')} />
                                        )}
                                        <InfoRow label="רישיון נהיגה" value={editForm.drivingLicense} />
                                    </div>
                                )}
                            </div>

                            {/* ── Section: ניהול פנימי ── */}
                            <div className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm">
                                <h3 className="font-bold text-base text-text-default mb-4 flex items-center gap-2">
                                    <DocumentTextIcon className="w-4 h-4 text-primary-500" /> ניהול פנימי
                                </h3>
                                {isEditingDetails ? (
                                    <div className="space-y-3 text-sm">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">סטטוס</label>
                                                <input value={editForm.status} onChange={setField('status')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">מקור הגעה</label>
                                                <input value={editForm.source} onChange={setField('source')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">הסבר סטטוס</label>
                                            <input value={editForm.statusExplanation} onChange={setField('statusExplanation')} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">הערות פנימיות</label>
                                            <textarea value={editForm.internalNotes} onChange={setField('internalNotes')} rows={4} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm resize-none" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 text-sm">
                                        <InfoRow label="סטטוס" value={editForm.status} />
                                        <InfoRow label="מקור הגעה" value={editForm.source} />
                                        {editForm.statusExplanation && <InfoRow label="הסבר סטטוס" value={editForm.statusExplanation} />}
                                        {editForm.internalNotes && (
                                            <div>
                                                <p className="text-text-muted text-xs font-bold uppercase mb-1">הערות פנימיות</p>
                                                <p className="text-xs text-text-default leading-relaxed whitespace-pre-wrap bg-yellow-50 border border-yellow-100 rounded-lg p-2">{editForm.internalNotes}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Bottom save bar (visible when editing) ── */}
                            {isEditingDetails && (
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleSaveDetails}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition shadow"
                                    >
                                        <CheckCircleIcon className="w-4 h-4" /> שמור שינויים
                                    </button>
                                    <button
                                        onClick={() => { setIsEditingDetails(false); setError(null); }}
                                        className="px-4 py-2.5 text-sm font-bold border border-border-default rounded-xl text-text-muted hover:bg-bg-hover transition"
                                    >
                                        ביטול
                                    </button>
                                </div>
                            )}
                            {error && isEditingDetails && (
                                <p className="text-xs text-red-600 font-semibold text-center">{error}</p>
                            )}

                        </div>

                        {/* Right Column: Activity */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm">
                                    <div className="p-5 border-b border-border-default bg-bg-subtle/30">
                                    <h3 className="font-bold text-lg text-text-default">היסטוריית פעילות</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-bg-subtle text-text-muted text-xs uppercase font-bold">
                                            <tr>
                                                <th className="p-4 w-[35%]">חברה</th>
                                                <th className="p-4">תפקיד</th>
                                                <th className="p-4">תאריכים</th>
                                                <th className="p-4 w-[90px]">פעולה</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-default">
                                            {Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0 ? (
                                                candidate.workExperience.map((we: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-bg-hover">
                                                        {editingExpIdx === idx ? (
                                                            /* ── Inline edit row spanning all columns ── */
                                                            <td colSpan={4} className="p-3 bg-primary-50/40 border-r-2 border-primary-400">
                                                                <div className="space-y-3">
                                                                    {/* Title */}
                                                                    <div>
                                                                        <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">תפקיד</label>
                                                                        <input type="text" value={expEditTitle} onChange={e => setExpEditTitle(e.target.value)}
                                                                            className="w-full bg-white border border-border-default rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-primary-500 outline-none" />
                                                                    </div>
                                                                    {/* Dates */}
                                                                    <div className="flex gap-3">
                                                                        <div className="flex-1">
                                                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">מתאריך</label>
                                                                            <input type="text" value={expEditStartDate} onChange={e => setExpEditStartDate(e.target.value)}
                                                                                placeholder="YYYY-MM-DD"
                                                                                className="w-full bg-white border border-border-default rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-primary-500 outline-none" />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">עד תאריך</label>
                                                                            <input type="text" value={expEditEndDate} onChange={e => setExpEditEndDate(e.target.value)}
                                                                                placeholder="YYYY-MM-DD או ריק = כיום"
                                                                                className="w-full bg-white border border-border-default rounded-lg py-1.5 px-2.5 text-xs focus:ring-1 focus:ring-primary-500 outline-none" />
                                                                        </div>
                                                                    </div>
                                                                    {/* Company org override */}
                                                                    <div>
                                                                        <label className="block text-[10px] font-bold uppercase text-text-muted mb-1">קישור לחברה במאגר (אופציונלי)</label>
                                                                        {expSelected ? (
                                                                            <div className="flex items-center gap-1.5 text-xs bg-primary-50 border border-primary-200 rounded-lg px-2 py-1.5">
                                                                                <span className="font-bold text-primary-700 truncate">{expSelected.name}</span>
                                                                                <button type="button" onClick={() => { setExpSelected(null); setExpSearch(''); }} className="flex-shrink-0 text-primary-400 hover:text-red-500">
                                                                                    <XMarkIcon className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="relative">
                                                                                <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                                                                <input
                                                                                    ref={expSearchRef}
                                                                                    type="text"
                                                                                    value={expSearch}
                                                                                    onChange={e => setExpSearch(e.target.value)}
                                                                                    placeholder="חפש חברה במאגר לקישור..."
                                                                                    className="w-full bg-white border border-border-default rounded-lg py-1.5 pr-8 pl-2 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                                                                                />
                                                                                {expResults.length > 0 && (
                                                                                    <div className="absolute top-full right-0 mt-1 w-72 bg-white border border-border-default rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                                                                        {expResults.map(org => (
                                                                                            <button key={org.id} type="button"
                                                                                                onClick={() => { setExpSelected(org); setExpSearch(''); setExpResults([]); }}
                                                                                                className="w-full text-right px-3 py-2 hover:bg-bg-hover flex items-start gap-2 border-b border-border-subtle last:border-0">
                                                                                                <div className="min-w-0">
                                                                                                    <p className="text-xs font-bold text-text-default truncate">{org.name}</p>
                                                                                                    {(org.nameEn || org.location) && (
                                                                                                        <p className="text-[10px] text-text-muted truncate">{[org.nameEn, org.location].filter(Boolean).join(' · ')}</p>
                                                                                                    )}
                                                                                                </div>
                                                                                            </button>
                                                                                        ))}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {/* Action buttons */}
                                                                    <div className="flex gap-2 pt-1">
                                                                        <button type="button" disabled={expSaving}
                                                                            onClick={() => void handleSaveExpOrg(idx)}
                                                                            className="px-4 py-1.5 text-xs font-bold bg-primary-600 text-white rounded-lg disabled:opacity-40 hover:bg-primary-700 transition">
                                                                            {expSaving ? 'שומר...' : '💾 שמור שינויים'}
                                                                        </button>
                                                                        <button type="button" onClick={() => setEditingExpIdx(null)}
                                                                            className="px-4 py-1.5 text-xs font-bold border border-border-default rounded-lg hover:bg-bg-hover transition">
                                                                            ביטול
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        ) : (
                                                            <>
                                                                {/* Company cell */}
                                                                <td className="p-3 align-top">
                                                                    <p className="font-bold text-sm text-text-default">{we.company || 'לא צוין'}</p>
                                                                    {we.organizationId && (
                                                                        <span className="text-[10px] text-emerald-600 font-semibold">✓ מקושר למאגר</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-3 align-top text-primary-600 text-sm">{we.title || we.role || 'תפקיד לא צוין'}</td>
                                                                <td className="p-3 align-top text-text-muted text-xs whitespace-nowrap">
                                                                    {we.startDate ? new Date(we.startDate).toLocaleDateString('he-IL') : ''}
                                                                    {we.endDate ? ` – ${we.endDate === 'Present' ? 'כיום' : new Date(we.endDate).toLocaleDateString('he-IL')}` : ''}
                                                                </td>
                                                                <td className="p-3 align-top">
                                                                    <button type="button" onClick={() => openExpEdit(idx)}
                                                                        className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold border border-border-default rounded-lg text-text-muted hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50 transition">
                                                                        <PencilIcon className="w-3 h-3" /> עריכה
                                                                    </button>
                                                                </td>
                                                            </>
                                                        )}
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={4} className="p-6 text-center text-text-muted">אין ניסיון תעסוקתי זמין</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>



                        
                    </div>




                )}

                {activeTab === 'overview' && (
<div className="w-full bg-bg-card rounded-2xl border border-border-default p-6 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-lg text-text-default flex items-center gap-2">
                                        <BriefcaseIcon className="w-5 h-5 text-primary-500" /> נתונים מקצועיים
                                    </h3>
                                    <span className="text-xs text-text-muted">הגדרות תגיות</span>
                                </div>
                                <form className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        placeholder="Tag Key"
                                        value={tagForm.tagKey}
                                        onChange={(e) => setTagForm((prev) => ({ ...prev, tagKey: e.target.value }))}
                                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                    />
                                    <input
                                        placeholder="שם תצוגה"
                                        value={tagForm.displayNameHe}
                                        onChange={(e) => setTagForm((prev) => ({ ...prev, displayNameHe: e.target.value }))}
                                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                    />
                                    <input
                                        placeholder="Raw Type"
                                        value={tagForm.raw_type}
                                        onChange={(e) => setTagForm((prev) => ({ ...prev, raw_type: e.target.value }))}
                                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                    />
                                    <input
                                        placeholder="Context"
                                        value={tagForm.context}
                                        onChange={(e) => setTagForm((prev) => ({ ...prev, context: e.target.value }))}
                                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                    />
                                    <div className="flex items-center gap-2 text-sm">
                                        <label>נוכחי</label>
                                        <input
                                            type="checkbox"
                                            checked={tagForm.is_current}
                                            onChange={(e) => setTagForm((prev) => ({ ...prev, is_current: e.target.checked }))}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 text-sm">
                                        <label>בסיכום</label>
                                        <input
                                            type="checkbox"
                                            checked={tagForm.is_in_summary}
                                            onChange={(e) => setTagForm((prev) => ({ ...prev, is_in_summary: e.target.checked }))}
                                        />
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Confidence"
                                        value={tagForm.confidence_score}
                                        onChange={(e) => setTagForm((prev) => ({ ...prev, confidence_score: Number(e.target.value) }))}
                                        className="bg-bg-input border border-border-default rounded-lg p-2 text-sm"
                                    />
                                </form>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleSubmitTagForm}
                                        className="px-3 py-2 rounded-md bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition"
                                    >
                                        {editingTagId ? 'עדכן תגית' : 'הוסף תגית'}
                                    </button>
                                    {editingTagId && (
                                        <button
                                            onClick={() => {
                                                setEditingTagId(null);
                                                setTagForm(defaultTagForm);
                                            }}
                                            className="px-3 py-2 rounded-md border border-border-default text-sm hover:bg-bg-hover transition"
                                        >
                                            ביטול עריכה
                                        </button>
                                    )}
                                </div>
                                {tagFeedback && <p className="text-xs text-green-700">{tagFeedback}</p>}
                                {candidateTags.length ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[11px] text-right">
                                            <thead className="bg-bg-subtle text-text-muted uppercase font-semibold">
                                                <tr>
                                                    <th className="p-2">Key</th>
                                                    <th className="p-2">Display</th>
                                                    <th className="p-2">Raw Type</th>
                                                    <th className="p-2">Context</th>
                                                    <th className="p-2">Current</th>
                                                    <th className="p-2">Summary</th>
                                                    <th className="p-2">
                                                        <TagMetricHelp
                                                            label="Confidence"
                                                            ariaLabel="הסבר על Confidence"
                                                        >
                                                            <p className="font-semibold text-text-default mb-1">Confidence (ביטחון)</p>
                                                            <p className="mb-1">
                                                                רמת הביטחון של המודל בזיהוי התגית במופע הזה (confidence_score).
                                                            </p>
                                                            <p className="mb-1">
                                                                <span className="text-text-muted">טווח טיפוסי:</span> לרוב בין 0 ל־1 (לא חובה טכנית).
                                                            </p>
                                                            <p>
                                                                <span className="text-text-muted">בחישוב הניקוד:</span> אם הערך חסר או לא מספר תקף — נחשב כ־TAG_MIN_CONFIDENCE (ברירת מחדל{' '}
                                                                <span className="font-mono">0.5</span>). גורם הביטחון = confidence ÷ TAG_MIN_CONFIDENCE; אם confidence ≤ 0 או TAG_MIN_CONFIDENCE ≤ 0 → הגורם הוא{' '}
                                                                <span className="font-mono">1</span>.
                                                            </p>
                                                        </TagMetricHelp>
                                                    </th>
                                                    <th className="p-2">
                                                        <TagMetricHelp label="Weight" ariaLabel="הסבר על Weight">
                                                            <p className="font-semibold text-text-default mb-1">Weight (משקל מבני)</p>
                                                            <p className="mb-1">
                                                                משקל התגית לפי סוג (raw_type), הקשר (context), והאם היא נוכחית ובסיכום הקורות (calculated_weight).
                                                            </p>
                                                            <p className="mb-1">
                                                                <span className="text-text-muted">טווח טיפוסי:</span> משקל בסיס מהטבלה (בערך{' '}
                                                                <span className="font-mono">0.5–1.0</span>) + חיזוקים: נוכחי (+TAG_CURRENT_BOOSTER, ברירת מחדל{' '}
                                                                <span className="font-mono">0.4</span>), בסיכום (+TAG_SUMMARY_BOOSTER, ברירת מחדל{' '}
                                                                <span className="font-mono">0.25</span>) → סכום גס בערך{' '}
                                                                <span className="font-mono">0.5–~1.65</span>.
                                                            </p>
                                                            <p>
                                                                <span className="text-text-muted">חישוב:</span> משקל בסיס לפי raw_type ו-context + (נוכחי ? חיזוק נוכחי : 0) + (בסיכום ? חיזוק סיכום : 0). לזוגות לא מוכרים — משקל בסיס ברירת מחדל{' '}
                                                                <span className="font-mono">0.65</span>.
                                                            </p>
                                                        </TagMetricHelp>
                                                    </th>
                                                    <th className="p-2">
                                                        <TagMetricHelp label="Final Score" ariaLabel="הסבר על Final Score">
                                                            <p className="font-semibold text-text-default mb-1">Final Score (ציון סופי)</p>
                                                            <p className="mb-1">
                                                                ציון דירוג לשימוש במיון תגיות (final_score).
                                                            </p>
                                                            <p className="mb-1">
                                                                <span className="text-text-muted">טווח טיפוסי:</span> תלוי במשקל ובגורם הביטחון; עם TAG_BASE_POINTS (ברירת מחדל{' '}
                                                                <span className="font-mono">100</span>) טווח גס בערך{' '}
                                                                <span className="font-mono">~50–~330</span> — לא גבול קשיח.
                                                            </p>
                                                            <p>
                                                                <span className="text-text-muted">חישוב:</span> TAG_BASE_POINTS × calculated_weight × גורם הביטחון (כפי שמחושב מה־confidence למעלה).
                                                            </p>
                                                            <p className="mt-1 text-text-muted">
                                                                עדכון ידני של משקל וציון סופי עלול לעקוף חישוב מחדש.
                                                            </p>
                                                        </TagMetricHelp>
                                                    </th>
                                                    <th className="p-2">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-default">
                                                {candidateTags.map((tag) => (
                                                    <tr key={tag.id} className="hover:bg-bg-hover">
                                                        <td className="py-2 px-1">{tag.tag?.tagKey || tag.tagKey}</td>
                                                        <td className="py-2 px-1">{tag.tag?.displayNameHe || tag.displayNameHe}</td>
                                                        <td className="py-2 px-1">{tag.raw_type || '-'}</td>
                                                        <td className="py-2 px-1">{tag.context || '-'}</td>
                                                        <td className="py-2 px-1">{tag.is_current ? 'כן' : 'לא'}</td>
                                                        <td className="py-2 px-1">{tag.is_in_summary ? 'כן' : 'לא'}</td>
                                                        <td className="py-2 px-1">{tag.confidence_score ?? '-'}</td>
                                                        <td className="py-2 px-1">
                                                            {typeof tag.calculated_weight === 'number'
                                                                ? tag.calculated_weight.toFixed(2)
                                                                : (tag.calculated_weight ?? '-')}
                                                        </td>
                                                        <td className="py-2 px-1">
                                                            {typeof tag.final_score === 'number'
                                                                ? tag.final_score.toFixed(2)
                                                                : (tag.final_score ?? '-')}
                                                        </td>
                                                        <td className="py-2 px-1 flex gap-2 justify-end">
                                                            <button
                                                                onClick={() => handleEditTag(tag)}
                                                                className="px-2 py-1 text-[11px] border border-primary-200 rounded text-primary-600 hover:bg-primary-50"
                                                            >
                                                                עדכן
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTag(tag.id)}
                                                                className="px-2 py-1 text-[11px] border border-red-200 rounded text-red-600 hover:bg-red-50"
                                                            >
                                                                מחק
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-text-muted text-sm italic">אין תגיות מקצועיות פרטניות כרגע.</p>
                                )}
                            </div>
                )}



                {activeTab === 'resume' && (
                    <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden h-[800px] shadow-sm animate-fade-in">
                        <ResumeViewer 
                            resumeData={{ 
                                name: candidate.fullName || candidate.name || '', 
                                contact: `${candidate.email || ''} ${candidate.phone || ''}`, 
                                summary: candidate.professionalSummary || '', 
                                experience: Array.isArray(candidate.workExperience) 
                                    ? candidate.workExperience.map((exp: any) => {
                                        const title = exp.title || '';
                                        const company = exp.company || '';
                                        const dates = [exp.startDate, exp.endDate && exp.endDate !== 'Present' ? exp.endDate : 'Present'].filter(Boolean).join(' - ');
                                        const desc = exp.description || '';
                                        return [dates, title, company, desc].filter(Boolean).join(' | ');
                                    })
                                    : [],
                                education: Array.isArray(candidate.education) 
                                    ? candidate.education.map((edu: any) => (typeof edu === 'string' ? edu : edu.value || ''))
                                    : [],
                                raw: resumeText,
                                candidateId: candidateIdentifier,
                            }} 
                            fullData={candidate}
                            resumeFileUrl={resumeUrl}
                            className="h-full border-0 shadow-none"
                            highlightKeywords={searchHighlightKeywords}
                        />
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        {/* Summary card */}
                        <div className="bg-bg-card rounded-2xl border border-border-default p-5 shadow-sm space-y-3">
                            <h3 className="font-bold text-sm text-text-default flex items-center gap-2">
                                <ClockIcon className="w-4 h-4 text-primary-500" /> סיכום לוג
                            </h3>
                            {auditLogsLoading ? (
                                <p className="text-text-muted text-xs">טוען...</p>
                            ) : (
                                <>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-text-muted">סה"כ רשומות</span>
                                        <span className="font-bold text-text-default">{auditLogs.length}</span>
                                    </div>
                                    {auditLogs[0] && (
                                        <div className="flex justify-between text-xs">
                                            <span className="text-text-muted">פעולה אחרונה</span>
                                            <span className="font-bold text-text-default">
                                                {new Date(auditLogs[0].createdAt || auditLogs[0].timestamp).toLocaleDateString('he-IL')}
                                            </span>
                                        </div>
                                    )}
                                    {(() => {
                                        const counts: Record<string, number> = {};
                                        auditLogs.forEach(l => { const a = l.action || 'אחר'; counts[a] = (counts[a] || 0) + 1; });
                                        return Object.entries(counts).map(([action, count]) => (
                                            <div key={action} className="flex justify-between text-xs">
                                                <span className="text-text-muted">{action}</span>
                                                <span className="font-semibold text-text-default bg-bg-subtle px-1.5 py-0.5 rounded">{count}</span>
                                            </div>
                                        ));
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Full log table — spans 2 cols */}
                        <div className="lg:col-span-2 bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
                                <h3 className="font-bold text-sm text-text-default flex items-center gap-2">
                                    <ClockIcon className="w-4 h-4 text-primary-500" /> היסטוריית פעולות
                                </h3>
                                <button onClick={loadAuditLogs} className="text-xs text-text-muted hover:text-primary-600 border border-border-default rounded-lg px-3 py-1.5 hover:bg-bg-hover transition">
                                    רענן
                                </button>
                            </div>
                            {auditLogsLoading ? (
                                <div className="p-8 text-center text-text-muted text-sm">טוען לוג...</div>
                            ) : auditLogs.length === 0 ? (
                                <div className="p-8 text-center text-text-muted text-sm">אין רשומות לוג למועמד זה.</div>
                            ) : (
                                <div className="overflow-y-auto max-h-[600px] [scrollbar-width:thin]">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-bg-subtle text-text-muted text-xs font-bold uppercase sticky top-0">
                                            <tr>
                                                <th className="px-4 py-3">תאריך</th>
                                                <th className="px-4 py-3">פעולה</th>
                                                <th className="px-4 py-3">משתמש</th>
                                                <th className="px-4 py-3">פרטים</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle">
                                            {auditLogs.map((log, i) => (
                                                <tr key={log.id || i} className="hover:bg-bg-hover transition-colors">
                                                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                                                        {new Date(log.createdAt || log.timestamp).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-50 text-primary-700 border border-primary-100">
                                                            {log.action || '—'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-text-muted">{log.actorName || log.actor || '—'}</td>
                                                    <td className="px-4 py-3 text-xs text-text-muted max-w-xs truncate" title={typeof log.changes === 'object' ? JSON.stringify(log.changes) : log.changes}>
                                                        {typeof log.changes === 'object' ? JSON.stringify(log.changes) : (log.changes || log.description || '—')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </main>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fadeIn 0.3s ease-out; }
            `}</style>
        </div>
    );
};

export default AdminCandidateProfileView;
