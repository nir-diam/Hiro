
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, MagnifyingGlassIcon, BuildingOffice2Icon } from './Icons';

export interface WorkedAtCompanyFilters {
    organizationId: string;
    organizationName: string;
    yearsExperience: number | '';
    employmentStatus: 'all' | 'current' | 'past';
    yearsLeftAgo: number | '';
}

const defaultFilters: WorkedAtCompanyFilters = {
    organizationId: '',
    organizationName: '',
    yearsExperience: '',
    employmentStatus: 'all',
    yearsLeftAgo: '',
};

interface WorkedAtCompanyFilterPopoverProps {
    apiBase: string;
    onClose: () => void;
    filters: WorkedAtCompanyFilters;
    setFilters: React.Dispatch<React.SetStateAction<WorkedAtCompanyFilters>>;
    onSearch?: (filters: WorkedAtCompanyFilters) => void;
}

const employmentStatusOptions: { value: WorkedAtCompanyFilters['employmentStatus']; label: string }[] = [
    { value: 'all', label: 'הכל' },
    { value: 'current', label: 'עובד/ת נוכחי/ת' },
    { value: 'past', label: 'עובד/ת עבר' },
];

const WorkedAtCompanyFilterPopover: React.FC<WorkedAtCompanyFilterPopoverProps> = ({
    apiBase,
    onClose,
    filters,
    setFilters,
    onSearch,
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
    const [orgLoading, setOrgLoading] = useState(true);
    const [companySearchTerm, setCompanySearchTerm] = useState('');

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    useEffect(() => {
        if (!apiBase) return;
        (async () => {
            setOrgLoading(true);
            try {
                const res = await fetch(`${apiBase}/api/organizations`);
                if (!res.ok) throw new Error('Failed to load organizations');
                const data = await res.json();
                const list = Array.isArray(data)
                    ? data.map((o: any) => ({ id: String(o.id), name: String(o.name || o.display_name || '').trim() || 'ללא שם' }))
                    : [];
                setOrganizations(list);
            } catch (err) {
                console.error('Failed to fetch organizations', err);
                setOrganizations([]);
            } finally {
                setOrgLoading(false);
            }
        })();
    }, [apiBase]);

    const filteredOrganizations = useMemo(() => {
        if (!companySearchTerm.trim()) return organizations.slice(0, 100);
        const q = companySearchTerm.toLowerCase();
        return organizations.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 100);
    }, [organizations, companySearchTerm]);

    const handleSelectCompany = (org: { id: string; name: string }) => {
        const isSame = filters.organizationId === org.id;
        setFilters((prev) => ({
            ...prev,
            organizationId: isSame ? '' : org.id,
            organizationName: isSame ? '' : org.name,
        }));
    };

    const handleClear = () => {
        setFilters({ ...defaultFilters });
        setCompanySearchTerm('');
        onSearch?.({ ...defaultFilters });
    };

    const hasSelection = Boolean(filters.organizationId);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div
                ref={popoverRef}
                className="relative bg-bg-card rounded-xl shadow-2xl border border-border-default flex flex-col w-full max-w-lg max-h-[85vh] overflow-hidden animate-fade-in"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex justify-between items-center p-4 border-b border-border-default flex-shrink-0 bg-bg-subtle/30">
                    <div>
                        <h3 className="font-bold text-lg text-text-default">עבד/עובד בחברה</h3>
                        <p className="text-xs text-text-muted">בחר חברה כדי לסנן מועמדים לפי רקע בארגון</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                <main className="flex-grow overflow-y-auto p-4 space-y-4">
                    {/* Company selection */}
                    <div>
                        <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase tracking-wide">חברה</label>
                        <div className="relative mb-2">
                            <MagnifyingGlassIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="חפש חברה..."
                                value={companySearchTerm}
                                onChange={(e) => setCompanySearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-9 text-sm focus:ring-1 focus:ring-primary-500"
                            />
                        </div>
                        {orgLoading ? (
                            <div className="text-sm text-text-muted py-4 text-center">טוען רשימת חברות...</div>
                        ) : (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border-default custom-scrollbar">
                                {filteredOrganizations.length === 0 ? (
                                    <div className="p-4 text-sm text-text-muted text-center">לא נמצאו חברות</div>
                                ) : (
                                    filteredOrganizations.map((org) => (
                                        <button
                                            key={org.id}
                                            type="button"
                                            onClick={() => handleSelectCompany(org)}
                                            className={`w-full text-right px-3 py-2.5 text-sm transition-all flex items-center gap-2 border-b border-border-subtle last:border-b-0 ${
                                                filters.organizationId === org.id
                                                    ? 'bg-primary-50 text-primary-700 font-bold'
                                                    : 'hover:bg-bg-hover text-text-default'
                                            }`}
                                        >
                                            <BuildingOffice2Icon className="w-4 h-4 flex-shrink-0 text-text-subtle" />
                                            <span className="truncate">{org.name}</span>
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                        {hasSelection && (
                            <p className="text-xs text-primary-600 font-medium mt-1.5">
                                נבחר: {filters.organizationName}
                            </p>
                        )}
                    </div>

                    {/* Sub-panel: only when a company is selected */}
                    {hasSelection && (
                        <div className="pt-4 border-t border-border-default space-y-4 animate-fade-in">
                            <p className="text-xs font-bold text-text-muted uppercase tracking-wide">פרמטרים משלימים</p>

                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">מס׳ שנות ניסיון</label>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="לדוגמה: 2"
                                    value={filters.yearsExperience === '' ? '' : filters.yearsExperience}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setFilters((prev) => ({
                                            ...prev,
                                            yearsExperience: v === '' ? '' : Math.max(0, Number(v)),
                                        }));
                                    }}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס העסקה</label>
                                <select
                                    value={filters.employmentStatus}
                                    onChange={(e) =>
                                        setFilters((prev) => ({
                                            ...prev,
                                            employmentStatus: e.target.value as WorkedAtCompanyFilters['employmentStatus'],
                                        }))
                                    }
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                                >
                                    {employmentStatusOptions.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-text-muted mb-1">עזב/ה לפני מס׳ שנים</label>
                                <input
                                    type="number"
                                    min={0}
                                    placeholder="לדוגמה: 3"
                                    value={filters.yearsLeftAgo === '' ? '' : filters.yearsLeftAgo}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setFilters((prev) => ({
                                            ...prev,
                                            yearsLeftAgo: v === '' ? '' : Math.max(0, Number(v)),
                                        }));
                                    }}
                                    className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500"
                                />
                            </div>
                        </div>
                    )}
                </main>

                <footer className="flex justify-between items-center p-4 border-t border-border-default bg-bg-subtle/30">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="text-xs font-semibold text-text-muted hover:text-red-500 transition-colors"
                    >
                        נקה בחירה
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (filters.organizationId && onSearch) {
                                onSearch(filters);
                            }
                            onClose();
                        }}
                        disabled={!filters.organizationId}
                        className="bg-primary-600 text-white text-sm font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        חפש
                    </button>
                </footer>
            </div>
        </div>,
        document.body
    );
};

export default WorkedAtCompanyFilterPopover;
