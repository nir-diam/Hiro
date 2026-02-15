
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    AvatarIcon, ArrowLeftIcon, PhoneIcon, MapPinIcon, EnvelopeIcon, 
    BriefcaseIcon, UserIcon, ClockIcon, DocumentTextIcon, 
    TrashIcon, NoSymbolIcon, PencilIcon, CheckCircleIcon 
} from './Icons';
import ResumeViewer from './ResumeViewer';
import ActivityLogModal from './ActivityLogModal'; // Reuse existing logs logic

// Mock Logs
const mockSystemLogs = [
    { date: '2025-11-20T10:00:00', action: 'פרופיל נוצר (ייבוא מקובץ)', user: 'מערכת' },
    { date: '2025-11-20T10:05:00', action: 'ניתוח AI הושלם בהצלחה', user: 'System AI' },
    { date: '2025-11-21T09:30:00', action: 'נשלח SMS אימות (נכשל)', user: 'מערכת' },
    { date: '2025-11-21T14:00:00', action: 'עודכן סטטוס ל"פעיל" ע"י דנה כהן', user: 'דנה כהן' },
];

const defaultTagForm = {
    tagKey: '',
    displayNameHe: '',
    raw_type: 'Role',
    context: 'Core',
    is_current: true,
    is_in_summary: false,
    confidence_score: 1,
};

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

const AdminCandidateProfileView: React.FC = () => {
    const { candidateId } = useParams<{ candidateId: string }>();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'overview' | 'resume' | 'logs'>('overview');
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [candidate, setCandidate] = useState<any | null>(null);
    const [resumeText, setResumeText] = useState<string>('');
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
            setResumeText(data.searchText || data.professionalSummary || '');
        } catch (err: any) {
            setError(err.message || 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [apiBase, candidateId]);

    useEffect(() => {
        loadCandidate();
    }, [loadCandidate]);

    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [editForm, setEditForm] = useState<{ fullName: string; phone: string; email: string; address: string; source: string; status: string }>({
        fullName: '',
        phone: '',
        email: '',
        address: '',
        source: '',
        status: '',
    });

    useEffect(() => {
        if (candidate) {
            setEditForm({
                fullName: candidate.fullName || candidate.name || '',
                phone: candidate.phone || '',
                email: candidate.email || '',
                address: candidate.address || '',
                source: candidate.source || candidate.sourceDetail || '',
                status: candidate.status || '',
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
            const res = await fetch(`${apiBase}/api/admin/candidate-tags?candidateId=${candidateIdentifier}`);
            if (!res.ok) throw new Error('Failed to load candidate tags');
            const data = await res.json();
            setCandidateTags(data);
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
            fullName: editForm.fullName,
            phone: editForm.phone,
            email: editForm.email,
            address: editForm.address,
            source: editForm.source,
            status: editForm.status,
        };
        try {
            const res = await fetch(`${apiBase}/api/candidates/${candidateId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
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
                    <TabButton title="לוג מערכת" icon={<ClockIcon className="w-5 h-5"/>} isActive={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
                </nav>
            </div>

            {/* Content Area */}
            <main>
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        
                        {/* Left Column: Basic Info */}
                        <div className="space-y-6">
                            <div className="bg-bg-card rounded-2xl border border-border-default p-6 shadow-sm">
                                <h3 className="font-bold text-lg text-text-default mb-4 flex items-center gap-2">
                                    <UserIcon className="w-5 h-5 text-primary-500" /> פרטי קשר ומידע
                                </h3>
                                <div className="space-y-4 text-sm">
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">שם מלא</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.fullName} onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium">{editForm.fullName}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">טלפון</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium flex items-center gap-2">{candidate.phone} <a href={`tel:${candidate.phone}`} className="p-1 bg-green-50 text-green-600 rounded-full"><PhoneIcon className="w-3 h-3"/></a></p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">אימייל</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium flex items-center gap-2">{candidate.email || 'לא צוין'} <a href={`mailto:${candidate.email}`} className="p-1 bg-blue-50 text-blue-600 rounded-full"><EnvelopeIcon className="w-3 h-3"/></a></p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">מקור הגעה</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.source} onChange={(e) => setEditForm(prev => ({ ...prev, source: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium bg-bg-subtle px-2 py-1 rounded inline-block text-xs mt-1">{candidate.source || candidate.sourceDetail}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">כתובת</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.address} onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium">{candidate.address}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">סטטוס</p>
                                        {isEditingDetails ? (
                                            <input value={editForm.status} onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm" />
                                        ) : (
                                            <p className="font-medium">{candidate.status}</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-text-muted text-xs font-bold uppercase">תאריך הרשמה</p>
                                        <p className="font-medium">{candidate.createdAt}</p>
                                    </div>
                                </div>
                            </div>
                            
                            
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
                                                <th className="p-4">לקוח</th>
                                                <th className="p-4">משרה</th>
                                                <th className="p-4">סטטוס</th>
                                                <th className="p-4">תאריך</th>
                                                <th className="p-4">רכז מטפל</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-default">
                                            {Array.isArray(candidate.workExperience) && candidate.workExperience.length > 0 ? (
                                                candidate.workExperience.map((we: any, idx: number) => (
                                                    <tr key={idx} className="hover:bg-bg-hover">
                                                        <td className="p-4 font-bold">{we.company || 'לא צוין'}</td>
                                                        <td className="p-4 text-primary-600">{we.title || we.role || 'תפקיד לא צוין'}</td>
                                                        <td className="p-4">
                                                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs font-bold">
                                                                {we.status || 'ניסיון'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-text-muted">
                                                            {we.startDate ? new Date(we.startDate).toLocaleDateString('he-IL') : ''}
                                                            {we.endDate ? ` - ${we.endDate === 'Present' ? 'כיום' : new Date(we.endDate).toLocaleDateString('he-IL')}` : ''}
                                                        </td>
                                                        <td className="p-4 text-text-muted">{we.coordinator || ''}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="p-6 text-center text-text-muted">אין היסטוריית פעילות זמינה</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>



                        
                    </div>




                )}


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
                                                    <th className="p-2">Confidence</th>
                                                    <th className="p-2">Weight</th>
                                                    <th className="p-2">Final Score</th>
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
                                raw: resumeText 
                            }} 
                            className="h-full border-0 shadow-none" 
                        />
                    </div>
                )}

                {activeTab === 'logs' && (
                    <div className="bg-bg-card rounded-2xl border border-border-default overflow-hidden shadow-sm animate-fade-in">
                         <div className="p-5 border-b border-border-default bg-bg-subtle/30">
                            <h3 className="font-bold text-lg text-text-default">לוג פעולות מערכת (System Audit)</h3>
                        </div>
                        <div className="divide-y divide-border-default">
                            {mockSystemLogs.map((log, i) => (
                                <div key={i} className="p-4 flex items-center justify-between hover:bg-bg-hover transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-bg-subtle rounded-full text-text-muted">
                                            <ClockIcon className="w-4 h-4"/>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm text-text-default">{log.action}</p>
                                            <p className="text-xs text-text-muted">בוצע ע"י: {log.user}</p>
                                        </div>
                                    </div>
                                    <div className="text-xs font-mono text-text-subtle">
                                        {new Date(log.date).toLocaleString('he-IL')}
                                    </div>
                                </div>
                            ))}
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