import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SparklesIcon } from './Icons';
import CandidateSummaryDrawer from './CandidateSummaryDrawer';

const AdminCandidateTagsView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [candidateId, setCandidateId] = useState('');
    const [tags, setTags] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [editingTag, setEditingTag] = useState<any | null>(null);
    const [formData, setFormData] = useState({
        tagKey: '',
        tagId: '',

        raw_type: '',
        context: '',
        is_current: true,
        is_in_summary: false,
        confidence_score: 1,
        calculated_weight: '',
        final_score: '',
        is_active: true,
    });
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [summaryCandidate, setSummaryCandidate] = useState<any | null>(null);

    const [tagOptions, setTagOptions] = useState<any[]>([]);

    useEffect(() => {
        const loadTags = async () => {
            try {
                const res = await fetch(`${apiBase}/api/tags`);
                if (!res.ok) throw new Error('Failed to load tag options');
                const data = await res.json();
                setTagOptions(Array.isArray(data) ? data : []);
            } catch (err) {
                console.warn('[AdminCandidateTagsView] tag options failed', err);
            }
        };
        loadTags();
    }, [apiBase]);

    const sortedTagOptions = useMemo(() => {
        return [...tagOptions].sort((a, b) => {
            const nameA = (a.displayNameHe || a.displayNameEn || a.tagKey || '').toString().toLowerCase();
            const nameB = (b.displayNameHe || b.displayNameEn || b.tagKey || '').toString().toLowerCase();
            return nameA.localeCompare(nameB);
        });
    }, [tagOptions]);

    const fetchTags = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const query = candidateId ? `?candidateId=${encodeURIComponent(candidateId)}` : '';
            const res = await fetch(`${apiBase}/api/admin/candidate-tags${query}`);
            if (!res.ok) throw new Error('Failed to load candidate tags');
            const data = await res.json();
            setTags(data);
            setLastUpdated(new Date().toISOString());
        } catch (err: any) {
            setError(err.message || 'Load failed');
            setTags([]);
        } finally {
            setLoading(false);
        }
    }, [apiBase, candidateId]);

    useEffect(() => {
        fetchTags();
    }, [fetchTags]);

    const formRef = useRef<HTMLDivElement | null>(null);

    const filteredTags = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return tags.filter((tag) => {
            if (statusFilter !== 'all') {
                const active = statusFilter === 'active';
                if (Boolean(tag.is_active) !== active) return false;
            }
            if (term) {
                const candidateName = tag.candidate?.fullName || '';
                const haystack = [
                    tag.tag?.tagKey || tag.tagKey || '',
                    tag.tag?.displayNameHe || tag.displayNameHe || '',
                    tag.raw_type || '',
                    tag.context || '',
                    candidateName,
                    tag.candidate_id || '',
                ]
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(term)) return false;
            }
            return true;
        });
    }, [tags, statusFilter, searchTerm]);

    const handleRefresh = () => {
        void fetchTags();
    };

    const handleStatusFilterChange = (value: 'all' | 'active' | 'inactive') => {
        setStatusFilter(value);
    };

    const handleSearchTermChange = (value: string) => {
        setSearchTerm(value);
    };

    const openSummary = (tag: any) => {
        const candidate = tag.candidate || null;
        const payload = candidate
            ? { backendId: candidate.id, id: candidate.id, name: candidate.fullName }
            : { backendId: tag.candidate_id, id: tag.candidate_id, name: 'מועמד' };
        setSummaryCandidate(payload);
        setIsDrawerOpen(true);
    };

    const toggleActive = async (entry: any) => {
        if (!entry?.id) return;
        try {
            const res = await fetch(`${apiBase}/api/admin/candidate-tags/${entry.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !entry.is_active }),
            });
            if (!res.ok) throw new Error('Update failed');
            const updated = await res.json();
            setTags((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        } catch (err) {
            alert((err as any)?.message || 'Unable to update tag');
        }
    };

    const startEdit = (entry: any) => {
        setEditingTag(entry);
        setFormData({
            tagKey: entry.tag?.tagKey || entry.tagKey,
            tagId: entry.tag?.id || '',

            raw_type: entry.raw_type || '',
            context: entry.context || '',
            is_current: entry.is_current ?? false,
            is_in_summary: entry.is_in_summary ?? false,
            confidence_score: entry.confidence_score ?? 0,
            calculated_weight: entry.calculated_weight?.toString() || '',
            final_score: entry.final_score?.toString() || '',
            is_active: entry.is_active ?? true,
        });
    };

    const handleEditSave = async () => {
        if (!editingTag?.id) return;
        try {
            const res = await fetch(`${apiBase}/api/admin/candidate-tags/${editingTag.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    tag_id: formData.tagId || undefined,
                }),
            });
            if (!res.ok) throw new Error('Update failed');
            const updated = await res.json();
            setTags((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            setEditingTag(null);
            void fetchTags();
        } catch (err: any) {
            alert(err?.message || 'Unable to save changes');
        }
    };

    const handleDelete = async (entry: any) => {
        if (!entry?.id) return;
        if (!window.confirm('להמשיך למחוק את הרשומה הזו?')) return;
        try {
            const res = await fetch(`${apiBase}/api/admin/candidate-tags/${entry.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            setTags((prev) => prev.filter((item) => item.id !== entry.id));
        } catch (err: any) {
            alert(err?.message || 'Unable to delete tag');
        }
    };

    const cancelEdit = () => {
        setEditingTag(null);
        setFormData({
            tagKey: '',
            tagId: '',
            raw_type: '',
            context: '',
            is_current: true,
            is_in_summary: false,
            confidence_score: 1,
            is_active: true,
        });
    };

    useEffect(() => {
        if (editingTag && formRef.current) {
            formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [editingTag]);

    return (
        <>
        <div className="space-y-6">
            <header className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                    <SparklesIcon className="w-6 h-6 text-primary-600" />
                    <div>
                        <h1 className="text-2xl font-black text-text-default">תגיות מועמדים</h1>
                        <p className="text-sm text-text-muted">מעקב אחר התגיות שנוצרו עבור מועמדים וסטטוס ההפעלה שלהן.</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                   
                    <div className="flex gap-2 flex-wrap">
                    <input
                            value={searchTerm}
                            onChange={(e) => handleSearchTermChange(e.target.value)}
                            placeholder="חיפוש חופשי"
                            className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-default focus:ring-1 focus:ring-primary-500 outline-none min-w-[200px]"
                        />
                        <select
                            value={statusFilter}
                            onChange={(e) => handleStatusFilterChange(e.target.value as any)}
                            className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                        >
                            <option value="all">כל הסטטוסים</option>
                            <option value="active">פעיל</option>
                            <option value="inactive">לא פעיל</option>
                        </select>
                       
                    </div>
                </div>
            </header>

            <section ref={formRef} className="bg-bg-card border border-border-default rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-text-default">עריכת תגית נבחרת</h2>
                    {editingTag && (
                        <button onClick={cancelEdit} className="px-3 py-1 text-xs font-semibold rounded-full border border-border-default text-text-muted hover:bg-bg-hover">ביטול</button>
                    )}
                </div>
                {editingTag ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">תגית קיימת</label>
                            <select
                                value={formData.tagKey}
                                onChange={(e) => {
                                    const key = e.target.value;
                                    const selected = sortedTagOptions.find((t) => t.tagKey === key);
                                    setFormData((prev) => ({
                                        ...prev,
                                        tagKey: key,
                                        tagId: selected?.id || '',
                                        raw_type: selected?.type || prev.raw_type,
                                    }));
                                }}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            >
                                <option value="">— בחר תגית —</option>
                                {sortedTagOptions.map((tag) => (
                                    <option key={tag.id} value={tag.tagKey}>
                                        {tag.displayNameHe || tag.displayNameEn || tag.tagKey}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Tag Key</label>
                            <input
                                value={formData.tagKey}
                                onChange={(e) => setFormData((prev) => ({ ...prev, tagKey: e.target.value }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Raw Type</label>
                            <input
                                value={formData.raw_type}
                                onChange={(e) => setFormData((prev) => ({ ...prev, raw_type: e.target.value }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Context</label>
                            <input
                                value={formData.context}
                                onChange={(e) => setFormData((prev) => ({ ...prev, context: e.target.value }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <label>נוכחי</label>
                            <input
                                type="checkbox"
                                checked={formData.is_current}
                                onChange={(e) => setFormData((prev) => ({ ...prev, is_current: e.target.checked }))}
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <label>בסיכום</label>
                            <input
                                type="checkbox"
                                checked={formData.is_in_summary}
                                onChange={(e) => setFormData((prev) => ({ ...prev, is_in_summary: e.target.checked }))}
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Confidence</label>
                            <input
                                type="number"
                                value={formData.confidence_score}
                                onChange={(e) => setFormData((prev) => ({ ...prev, confidence_score: Number(e.target.value) }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Weight</label>
                            <input
                                type="number"
                                value={formData.calculated_weight}
                                onChange={(e) => setFormData((prev) => ({ ...prev, calculated_weight: e.target.value }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] uppercase tracking-wide text-text-muted">Final</label>
                            <input
                                type="number"
                                value={formData.final_score}
                                onChange={(e) => setFormData((prev) => ({ ...prev, final_score: e.target.value }))}
                                className="bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <label>פעיל</label>
                            <input
                                type="checkbox"
                                checked={formData.is_active}
                                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleEditSave}
                                className="px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
                            >
                                שמור שינויים
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-text-muted">בחר תגית בטבלה כדי לערוך אותה.</p>
                )}
            </section>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 text-sm text-red-700 px-4 py-2">
                    {error}
                </div>
            )}

                    {loading ? (
                        <div className="text-sm text-text-muted">טוען...</div>
                    ) : (
                        <>
                            {filteredTags.length ? (
                                <div className="overflow-x-auto bg-bg-card border border-border-default rounded-2xl shadow-sm">
                                    <table className="w-full text-sm text-right">
                                        <thead className="bg-bg-subtle text-text-muted uppercase text-xs font-semibold">
                                            <tr>
                                                <th className="p-3">מועמד</th>
                                                <th className="p-3">Tag Key</th>
                                                <th className="p-3">שם בעברית</th>
                                                <th className="p-3">Raw Type</th>
                                                <th className="p-3">Context</th>
                                                <th className="p-3">Current</th>
                                                <th className="p-3">Summary</th>
                                                <th className="p-3">Confidence</th>
                                                <th className="p-3">Weight</th>
                                                <th className="p-3">Final</th>
                                                <th className="p-3">Active</th>
                                                <th className="p-3">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-default">
                                            {filteredTags.map((tag) => {
                                                const candidateName = tag.candidate?.fullName || 'מועמד';
                                                return (
                                                    <tr key={tag.id} className="hover:bg-bg-hover">
                                                        <td className="py-2 px-2">
                                                            <button
                                                                onClick={() => openSummary(tag)}
                                                                className="text-left text-sm font-semibold text-primary-600 hover:underline"
                                                            >
                                                                {candidateName}
                                                            </button>
                                                        </td>
                                                        <td className="py-2 px-2 font-semibold">{tag.tag?.tagKey || tag.tagKey}</td>
                                                        <td className="py-2 px-2" dir="rtl">{tag.tag?.displayNameHe ?? tag.displayNameHe ?? '-'}</td>
                                                        <td className="py-2 px-2">{tag.raw_type || '-'}</td>
                                                        <td className="py-2 px-2">{tag.context || '-'}</td>
                                                        <td className="py-2 px-2">{tag.is_current ? 'כן' : 'לא'}</td>
                                                        <td className="py-2 px-2">{tag.is_in_summary ? 'כן' : 'לא'}</td>
                                                        <td className="py-2 px-2">{tag.confidence_score ?? '-'}</td>
                                                        <td className="py-2 px-2">{tag.calculated_weight?.toFixed ? tag.calculated_weight.toFixed(2) : (tag.calculated_weight ?? '-')}</td>
                                                        <td className="py-2 px-2">{tag.final_score?.toFixed ? tag.final_score.toFixed(2) : (tag.final_score ?? '-')}</td>
                                                        <td className="py-2 px-2">
                                                            {tag.is_active ? (
                                                                <span className="text-xs font-semibold text-primary-600">פעיל</span>
                                                            ) : (
                                                                <span className="text-xs font-semibold text-text-muted">לא פעיל</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-2 flex flex-col gap-2">
                                                            <button
                                                                onClick={() => toggleActive(tag)}
                                                                className="px-2 py-1 text-xs rounded-xl border border-primary-200 text-primary-600 hover:bg-primary-50"
                                                            >
                                                                {tag.is_active ? 'סגור' : 'הפעל'}
                                                            </button>
                                                            <button
                                                                onClick={() => startEdit(tag)}
                                                                className="px-2 py-1 text-xs rounded-xl border border-primary-200 text-text-default hover:bg-bg-hover"
                                                            >
                                                                ערוך
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(tag)}
                                                                className="px-2 py-1 text-xs rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                                                            >
                                                                מחק
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="rounded-xl border border-border-default bg-white/80 p-6 text-sm text-text-muted text-center">
                                    {!candidateId ? 'הכנס מזהה מועמד כדי להציג תגיות' : 'לא נמצאו תגיות עבור מועמד זה.'}
                                </div>
                            )}
                            {lastUpdated && (
                                <p className="text-xs text-text-muted mt-2">עודכן לאחרונה: {new Date(lastUpdated).toLocaleString()}</p>
                            )}
                        </>
                    )}
        </div>
        <CandidateSummaryDrawer
            candidate={summaryCandidate}
            isOpen={isDrawerOpen && Boolean(summaryCandidate)}
            onClose={() => setIsDrawerOpen(false)}
            isFavorite={false}
            onToggleFavorite={() => {}}
        />
        </>
    );
};

export default AdminCandidateTagsView;

