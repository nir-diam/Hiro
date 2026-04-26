import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentTextIcon, MagnifyingGlassIcon, PencilIcon, PlusIcon, TrashIcon, XMarkIcon } from './Icons';
import {
    ReferenceInfoEntry,
    ReferenceInfoInput,
    createReferenceInfo,
    deleteReferenceInfo,
    fetchReferenceInfo,
    updateReferenceInfo,
} from '../services/referenceInfoApi';

const emptyForm: ReferenceInfoInput = { key: '', value: '', description: '' };

type FormState = ReferenceInfoInput;

interface EntryModalProps {
    isOpen: boolean;
    mode: 'create' | 'edit';
    initialValue: FormState;
    isSaving: boolean;
    error: string | null;
    onClose: () => void;
    onSubmit: (data: FormState) => Promise<void>;
}

const EntryModal: React.FC<EntryModalProps> = ({ isOpen, mode, initialValue, isSaving, error, onClose, onSubmit }) => {
    const [formData, setFormData] = useState<FormState>(initialValue);

    useEffect(() => {
        if (isOpen) {
            setFormData(initialValue);
        }
    }, [isOpen, initialValue]);

    if (!isOpen) return null;

    const title = mode === 'create' ? 'הוספת רשומה' : 'עריכת רשומה';
    const submitLabel = mode === 'create' ? 'שמור' : 'עדכן';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned: FormState = {
            key: formData.key.trim(),
            value: formData.value,
            description: formData.description,
        };
        if (!cleaned.key) return;
        await onSubmit(cleaned);
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={onClose}
            dir="rtl"
        >
            <form
                onSubmit={handleSubmit}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-default">
                    <h3 className="font-bold text-text-default">{title}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-text-muted hover:text-text-default p-1 rounded"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-text-default">מפתח (Key)</label>
                        <input
                            type="text"
                            required
                            value={formData.key}
                            onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                            className="w-full rounded-lg border border-border-default bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                            placeholder="לדוגמה: max_candidates_per_job"
                            dir="ltr"
                        />
                        <p className="text-xs text-text-muted">מזהה ייחודי. אין רשומות כפולות לאותו מפתח.</p>
                    </div>

                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-text-default">ערך (Value)</label>
                        <textarea
                            value={formData.value}
                            onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                            className="w-full rounded-lg border border-border-default bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 min-h-[80px]"
                            placeholder="הערך המלא (טקסט, מספר, JSON וכו׳)"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-sm font-semibold text-text-default">תיאור (Description)</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="w-full rounded-lg border border-border-default bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 min-h-[100px]"
                            placeholder="הסבר קצר - למה הרשומה משמשת"
                        />
                    </div>

                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 text-sm text-red-700 px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-border-default bg-bg-subtle flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:bg-bg-hover"
                        disabled={isSaving}
                    >
                        ביטול
                    </button>
                    <button
                        type="submit"
                        className="px-5 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-60"
                        disabled={isSaving || !formData.key.trim()}
                    >
                        {isSaving ? 'שומר...' : submitLabel}
                    </button>
                </div>
            </form>
        </div>
    );
};

const AdminReferenceInfoView: React.FC = () => {
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const [entries, setEntries] = useState<ReferenceInfoEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
    const [modalInitial, setModalInitial] = useState<FormState>(emptyForm);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const getToken = useCallback(() => {
        return typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    }, []);

    const flashSuccess = (text: string) => {
        setSuccessMessage(text);
        setTimeout(() => setSuccessMessage(null), 2500);
    };

    const loadEntries = useCallback(async () => {
        if (!apiBase) {
            setListError('חסרה הגדרת שרת (VITE_API_BASE).');
            setIsLoading(false);
            setEntries([]);
            return;
        }
        setIsLoading(true);
        setListError(null);
        try {
            const rows = await fetchReferenceInfo(apiBase, getToken());
            setEntries(rows);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'שגיאה בטעינה';
            setListError(msg);
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiBase, getToken]);

    useEffect(() => {
        void loadEntries();
    }, [loadEntries]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return entries;
        return entries.filter((e) =>
            e.key.toLowerCase().includes(term) ||
            e.value.toLowerCase().includes(term) ||
            e.description.toLowerCase().includes(term),
        );
    }, [entries, search]);

    const openCreate = () => {
        setModalMode('create');
        setEditingId(null);
        setModalInitial(emptyForm);
        setModalError(null);
        setIsModalOpen(true);
    };

    const openEdit = (entry: ReferenceInfoEntry) => {
        setModalMode('edit');
        setEditingId(entry.id);
        setModalInitial({
            key: entry.key,
            value: entry.value,
            description: entry.description,
        });
        setModalError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        if (isSaving) return;
        setIsModalOpen(false);
        setModalError(null);
    };

    const handleSubmit = async (data: FormState) => {
        setIsSaving(true);
        setModalError(null);
        try {
            if (modalMode === 'create') {
                const created = await createReferenceInfo(apiBase, getToken(), data);
                setEntries((prev) => [...prev, created].sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key)));
                flashSuccess('הרשומה נוספה.');
            } else if (editingId) {
                const updated = await updateReferenceInfo(apiBase, getToken(), editingId, data);
                setEntries((prev) => prev.map((e) => (e.id === editingId ? updated : e)));
                flashSuccess('הרשומה עודכנה.');
            }
            setIsModalOpen(false);
        } catch (err) {
            setModalError(err instanceof Error ? err.message : 'שמירה נכשלה');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (entry: ReferenceInfoEntry) => {
        const confirmed = window.confirm(`האם למחוק את הרשומה "${entry.key}"?`);
        if (!confirmed) return;
        setDeletingId(entry.id);
        try {
            await deleteReferenceInfo(apiBase, getToken(), entry.id);
            setEntries((prev) => prev.filter((e) => e.id !== entry.id));
            flashSuccess('הרשומה נמחקה.');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'המחיקה נכשלה';
            setListError(msg);
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="p-6 max-w-[1400px] mx-auto" dir="rtl">
            <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                        <DocumentTextIcon className="w-6 h-6 text-primary-600" />
                        מידע עזר
                    </h1>
                    <p className="text-text-muted text-sm">
                        ניהול רשומות מפתח/ערך/תיאור - מידע עזר כללי לשימוש במערכת.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-4 rounded-xl hover:bg-primary-700 shadow-sm"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>רשומה חדשה</span>
                </button>
            </header>

            {successMessage && (
                <div className="mb-4 rounded-md border border-green-200 bg-green-50 text-sm text-green-700 px-3 py-2">
                    {successMessage}
                </div>
            )}

            {listError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 text-sm text-red-700 px-3 py-2">
                    {listError}
                </div>
            )}

            <div className="mb-4 relative max-w-md">
                <MagnifyingGlassIcon className="w-4 h-4 text-text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="חיפוש לפי מפתח / ערך / תיאור"
                    className="w-full rounded-lg border border-border-default bg-white pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
            </div>

            <div className="bg-bg-card border border-border-default rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-bg-subtle text-text-default">
                            <tr>
                                <th className="text-right font-bold px-4 py-3 w-[22%]">מפתח</th>
                                <th className="text-right font-bold px-4 py-3 w-[28%]">ערך</th>
                                <th className="text-right font-bold px-4 py-3">תיאור</th>
                                <th className="text-center font-bold px-4 py-3 w-[110px]">פעולות</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan={4} className="text-center text-text-muted py-8">
                                        טוען רשומות...
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="text-center text-text-muted py-10">
                                        {search
                                            ? 'לא נמצאו רשומות התואמות את החיפוש.'
                                            : 'אין רשומות כרגע. לחצו "רשומה חדשה" כדי להוסיף.'}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((entry) => (
                                    <tr key={entry.id} className="border-t border-border-default hover:bg-bg-subtle/40">
                                        <td className="px-4 py-3 align-top font-mono text-text-default break-all" dir="ltr">
                                            {entry.key}
                                        </td>
                                        <td className="px-4 py-3 align-top text-text-default whitespace-pre-wrap break-words">
                                            {entry.value || <span className="text-text-muted italic">—</span>}
                                        </td>
                                        <td className="px-4 py-3 align-top text-text-muted whitespace-pre-wrap break-words">
                                            {entry.description || <span className="italic">—</span>}
                                        </td>
                                        <td className="px-4 py-3 align-top">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(entry)}
                                                    className="p-2 rounded-lg text-text-muted hover:text-primary-600 hover:bg-primary-50"
                                                    title="עריכה"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDelete(entry)}
                                                    disabled={deletingId === entry.id}
                                                    className="p-2 rounded-lg text-text-muted hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
                                                    title="מחיקה"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <EntryModal
                isOpen={isModalOpen}
                mode={modalMode}
                initialValue={modalInitial}
                isSaving={isSaving}
                error={modalError}
                onClose={closeModal}
                onSubmit={handleSubmit}
            />
        </div>
    );
};

export default AdminReferenceInfoView;
