
import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon } from './Icons';
import { BUSINESS_FIELD_CATEGORY_ID } from '../services/picklistValuesApi';

export interface CompanyFilters {
    sizes: string[];
    sectors: string[];
    industries: string[];
    fields: string[];
    roles: string[];
}

interface CompanyFilterPopoverProps {
    onClose: () => void;
    filters: CompanyFilters;
    setFilters: React.Dispatch<React.SetStateAction<CompanyFilters>>;
    onApply?: () => void;
}

const companySizeOptions = [
    { value: '1-50',      label: '1–50' },
    { value: '51-200',    label: '51–200' },
    { value: '200-1000',  label: '200–1,000' },
    { value: '1000+',     label: '1,000+' },
];

const companySectorOptions = ['פרטי', 'ציבורי', 'ממשלתי', 'מלכ"ר'];

type IndustryCategory = { id: string; name: string };
type FieldValue      = { id: string; label: string; value: string; displayName?: string | null };

const authHeader = (): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const CheckItem: React.FC<{
    label: string;
    checked: boolean;
    onToggle: () => void;
    className?: string;
}> = ({ label, checked, onToggle, className = '' }) => (
    <button
        onClick={onToggle}
        className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2.5 group ${
            checked
                ? 'bg-primary-50 text-primary-700 font-bold border border-primary-100'
                : 'text-text-default hover:bg-bg-hover font-medium border border-transparent'
        } ${className}`}
    >
        <span className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            checked ? 'bg-primary-600 border-primary-600' : 'border-border-strong bg-white group-hover:border-primary-400'
        }`}>
            {checked && (
                <svg viewBox="0 0 10 8" className="w-2.5 h-2.5 fill-white">
                    <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            )}
        </span>
        <span className="truncate flex-1">{label}</span>
    </button>
);

const CompanyFilterPopover: React.FC<CompanyFilterPopoverProps> = ({ onClose, filters, setFilters, onApply }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    // ── Internal draft — only committed to parent on Apply ────────────────────
    const [draft, setDraft] = useState<CompanyFilters>(() => ({ ...filters }));

    // Search state per column
    const [industrySearch, setIndustrySearch] = useState('');
    const [fieldSearch,    setFieldSearch]    = useState('');

    // Data
    const [industries, setIndustries] = useState<IndustryCategory[]>([]);
    const [fieldMap,   setFieldMap]   = useState<Record<string, FieldValue[]>>({});

    // Stable ref tracking which industry IDs have already been (or are being) fetched
    const fetchedRef = useRef<Set<string>>(new Set());

    // ── Load industries ───────────────────────────────────────────────────────
    useEffect(() => {
        if (!apiBase) return;
        const ctrl = new AbortController();
        fetch(`${apiBase}/api/picklists/categories/${BUSINESS_FIELD_CATEGORY_ID}/subcategories`, {
            signal: ctrl.signal,
            headers: authHeader(),
        })
            .then((r) => r.ok ? r.json() : [])
            .then((data: IndustryCategory[]) => setIndustries(data || []))
            .catch(() => {});
        return () => ctrl.abort();
    }, [apiBase]);

    // ── Load sub-fields — stable callback (no fieldMap dep) ──────────────────
    const loadFieldsForIndustry = useCallback(async (ind: IndustryCategory) => {
        if (!apiBase || fetchedRef.current.has(ind.id)) return;
        fetchedRef.current.add(ind.id);
        try {
            const res = await fetch(`${apiBase}/api/picklists/categories/${ind.id}/values`, { headers: authHeader() });
            if (!res.ok) { fetchedRef.current.delete(ind.id); return; }
            const data: FieldValue[] = await res.json();
            setFieldMap((prev) => ({ ...prev, [ind.id]: data || [] }));
        } catch {
            fetchedRef.current.delete(ind.id); // allow retry
        }
    }, [apiBase]); // stable — no fieldMap in deps

    useEffect(() => {
        const inds = industries.filter((i) => draft.industries.includes(i.name));
        inds.forEach(loadFieldsForIndustry);
    }, [draft.industries, industries, loadFieldsForIndustry]);

    // ── ESC to close ──────────────────────────────────────────────────────────
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    // ── Computed lists ────────────────────────────────────────────────────────
    const filteredIndustries = useMemo(() =>
        industries.filter((i) => i.name.toLowerCase().includes(industrySearch.toLowerCase())),
    [industries, industrySearch]);

    const availableFields = useMemo(() => {
        const selectedInds = industries.filter((i) => draft.industries.includes(i.name));
        const all: FieldValue[] = [];
        const seen = new Set<string>();
        for (const ind of selectedInds) {
            for (const f of (fieldMap[ind.id] || [])) {
                const label = f.displayName || f.label;
                if (!seen.has(label)) { seen.add(label); all.push(f); }
            }
        }
        return all.filter((f) =>
            (f.displayName || f.label).toLowerCase().includes(fieldSearch.toLowerCase()),
        );
    }, [draft.industries, industries, fieldMap, fieldSearch]);

    // ── Draft toggle helpers (no API call, no parent state change) ────────────
    const toggleIndustry = (name: string) =>
        setDraft((prev) => ({
            ...prev,
            industries: prev.industries.includes(name)
                ? prev.industries.filter((x) => x !== name)
                : [...prev.industries, name],
        }));

    const toggleField = (label: string) =>
        setDraft((prev) => ({
            ...prev,
            fields: prev.fields.includes(label) ? prev.fields.filter((x) => x !== label) : [...prev.fields, label],
        }));

    const toggleSize = (size: string) =>
        setDraft((prev) => ({
            ...prev,
            sizes: prev.sizes.includes(size) ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size],
        }));

    const handleSectorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = e.target.value;
        setDraft((prev) => ({ ...prev, sectors: v ? [v] : [] }));
    };

    // Clear only the draft (no parent state change)
    const handleClear = () =>
        setDraft({ sizes: [], sectors: [], industries: [], fields: [], roles: [] }); // roles kept for API compat

    // Commit draft to parent and trigger search — only on Apply click
    const handleApply = () => {
        setFilters(draft);
        onApply?.();
        onClose();
    };

    // ── Active filter counts (based on draft) ─────────────────────────────────
    const activeCount =
        draft.industries.length + draft.fields.length +
        draft.sizes.length + draft.sectors.length;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div
                ref={popoverRef}
                className="relative bg-bg-card rounded-xl shadow-2xl border border-border-default flex flex-col w-full max-w-4xl h-[82vh] overflow-hidden animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex justify-between items-center p-4 border-b border-border-default flex-shrink-0 bg-bg-subtle/30">
                    <div>
                        <h3 className="font-bold text-lg text-text-default">סינון לפי רקע תעסוקתי</h3>
                        <p className="text-xs text-text-muted">בחר תעשיות, תחומים ומאפייני חברה לסינון מועמדים</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {activeCount > 0 && (
                            <span className="bg-primary-600 text-white text-xs font-bold rounded-full px-2.5 py-0.5">
                                {activeCount} נבחרו
                            </span>
                        )}
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* Body — 3 columns */}
                <main className="flex-1 overflow-hidden min-h-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border-default h-full">

                        {/* Col 1: Industries */}
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="px-3 pt-3 pb-2 border-b border-border-default bg-bg-subtle/20 flex-shrink-0">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-2">תעשייה</p>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="חיפוש..."
                                        value={industrySearch}
                                        onChange={(e) => setIndustrySearch(e.target.value)}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-1.5 pl-2.5 pr-7 text-xs focus:ring-1 focus:ring-primary-500"
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-grow custom-scrollbar p-1.5 space-y-0.5">
                                {filteredIndustries.map((ind) => (
                                    <CheckItem
                                        key={ind.id}
                                        label={ind.name}
                                        checked={draft.industries.includes(ind.name)}
                                        onToggle={() => toggleIndustry(ind.name)}
                                    />
                                ))}
                            </div>
                            {draft.industries.length > 0 && (
                                <div className="px-2 py-1.5 border-t border-border-default bg-bg-subtle/30 flex-shrink-0">
                                    <div className="flex flex-wrap gap-1">
                                        {draft.industries.map((i) => (
                                            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-primary-100 text-primary-700 font-bold px-2 py-0.5 rounded-full">
                                                {i}
                                                <button onClick={() => toggleIndustry(i)} className="hover:text-red-500"><XMarkIcon className="w-2.5 h-2.5" /></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Col 2: Sub-fields */}
                        <div className="flex flex-col h-full overflow-hidden bg-bg-subtle/10">
                            <div className="px-3 pt-3 pb-2 border-b border-border-default bg-bg-subtle/20 flex-shrink-0">
                                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-2">תחום</p>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-3.5 h-3.5 text-text-subtle absolute right-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="חיפוש..."
                                        value={fieldSearch}
                                        onChange={(e) => setFieldSearch(e.target.value)}
                                        disabled={!draft.industries.length}
                                        className="w-full bg-bg-input border border-border-default rounded-lg py-1.5 pl-2.5 pr-7 text-xs focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
                                    />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-grow custom-scrollbar p-1.5 space-y-0.5">
                                {!draft.industries.length ? (
                                    <p className="text-center text-xs text-text-muted opacity-60 mt-8 px-3">בחר תעשייה כדי לראות תחומים</p>
                                ) : availableFields.length === 0 ? (
                                    <p className="text-center text-xs text-text-muted opacity-60 mt-8">לא נמצאו תחומים</p>
                                ) : (
                                    availableFields.map((f) => {
                                        const label = f.displayName || f.label;
                                        return (
                                            <CheckItem
                                                key={f.id}
                                                label={label}
                                                checked={draft.fields.includes(label)}
                                                onToggle={() => toggleField(label)}
                                            />
                                        );
                                    })
                                )}
                            </div>
                            {draft.fields.length > 0 && (
                                <div className="px-2 py-1.5 border-t border-border-default bg-bg-subtle/30 flex-shrink-0">
                                    <div className="flex flex-wrap gap-1">
                                        {draft.fields.map((f) => (
                                            <span key={f} className="inline-flex items-center gap-1 text-[10px] bg-sky-100 text-sky-700 font-bold px-2 py-0.5 rounded-full">
                                                {f}
                                                <button onClick={() => toggleField(f)} className="hover:text-red-500"><XMarkIcon className="w-2.5 h-2.5" /></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Col 3: Properties */}
                        <div className="flex flex-col h-full overflow-hidden p-4 space-y-5 bg-bg-subtle/5">
                            {/* Employee count */}
                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2.5 tracking-wide">
                                    מס' עובדים בחברה
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {companySizeOptions.map(({ value, label }) => (
                                        <button
                                            key={value}
                                            onClick={() => toggleSize(value)}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                                draft.sizes.includes(value)
                                                    ? 'bg-primary-600 text-white border-primary-600 shadow-md scale-105'
                                                    : 'bg-white text-text-default border-border-default hover:border-primary-300 hover:bg-primary-50'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Sector */}
                            <div>
                                <label className="block text-[10px] font-bold text-text-muted uppercase mb-2.5 tracking-wide">
                                    סקטור / מגזר
                                </label>
                                <select
                                    value={draft.sectors[0] || ''}
                                    onChange={handleSectorChange}
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl p-2.5 focus:ring-2 focus:ring-primary-500 cursor-pointer"
                                >
                                    <option value="">כל הסקטורים</option>
                                    {companySectorOptions.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Summary */}
                            {activeCount > 0 && (
                                <div className="mt-auto bg-primary-50 border border-primary-100 rounded-xl p-3 text-xs space-y-1 text-primary-700">
                                    <span className="block font-bold text-primary-800 mb-1">סיכום:</span>
                                    {draft.industries.length > 0 && <p>• תעשיות: {draft.industries.join(', ')}</p>}
                                    {draft.fields.length > 0 && <p>• תחומים: {draft.fields.join(', ')}</p>}
                                    {draft.sizes.length > 0 && <p>• עובדים: {draft.sizes.join(', ')}</p>}
                                    {draft.sectors.length > 0 && <p>• סקטור: {draft.sectors.join(', ')}</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </main>

                {/* Footer */}
                <footer className="flex justify-between items-center p-4 border-t border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <button onClick={handleClear} className="text-sm font-bold text-text-muted hover:text-red-500 transition-colors px-2">
                        נקה הכל
                    </button>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-text-muted hover:bg-bg-hover transition-colors">
                            ביטול
                        </button>
                        <button
                            onClick={handleApply}
                            className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
                        >
                            החל סינון{activeCount > 0 && ` (${activeCount})`}
                        </button>
                    </div>
                </footer>

                <style>{`
                    @keyframes fade-in { from { opacity:0; transform:scale(0.98) } to { opacity:1; transform:scale(1) } }
                    .animate-fade-in { animation: fade-in 0.2s cubic-bezier(0.16,1,0.3,1) forwards }
                    .custom-scrollbar::-webkit-scrollbar { width: 4px }
                    .custom-scrollbar::-webkit-scrollbar-track { background: transparent }
                    .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8 }
                `}</style>
            </div>
        </div>,
        document.body,
    );
};

export default CompanyFilterPopover;
