
import React, { useCallback, useEffect, useState } from 'react';
import AccordionSection from './AccordionSection';
import { InformationCircleIcon, TrashIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    createRecruitmentSource,
    deleteRecruitmentSource,
    fetchRecruitmentSources,
    updateRecruitmentSource,
    type RecruitmentSourceDto,
} from '../services/recruitmentSourcesApi';

interface Source {
    id: string;
    name: string;
    addresses: string;
    exclusivityMonths: number;
    isActive: boolean;
}

function dtoToSource(d: RecruitmentSourceDto): Source {
    return {
        id: d.id,
        name: d.name,
        addresses: d.addresses ?? '',
        exclusivityMonths: Number(d.exclusivityMonths) || 0,
        isActive: d.isActive !== false,
    };
}

const emptyNewSource = (): Omit<Source, 'id'> => ({
    name: '',
    addresses: '',
    exclusivityMonths: 0,
    isActive: true,
});

const RecruitmentSourcesSettingsView: React.FC = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const ownClientId = user?.clientId ?? null;

    // Admin can pick a different client; regular users are locked to their own clientId
    const [adminClientId, setAdminClientId] = useState<string | null>(null);
    const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [clientsLoading, setClientsLoading] = useState(false);

    const clientId = isPlatformAdmin ? adminClientId : ownClientId;

    const [sources, setSources] = useState<Source[]>([]);
    const [baseline, setBaseline] = useState<Record<string, Source>>({});
    const [newSource, setNewSource] = useState(emptyNewSource);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
    const [adding, setAdding] = useState(false);

    // Load client list for admin users
    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
    useEffect(() => {
        if (!isPlatformAdmin || !apiBase) {
            setClientOptions([]);
            return;
        }
        let cancelled = false;
        setClientsLoading(true);
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetch(`${apiBase}/api/clients?activeOnly=true`, {
            headers: {
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : [];
                const opts = list
                    .map((c: Record<string, unknown>) => ({
                        id: String(c.id ?? ''),
                        label: String((c.displayName as string) || (c.name as string) || '').trim(),
                    }))
                    .filter((o) => o.id && o.label)
                    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
                setClientOptions(opts);
            })
            .catch(() => { if (!cancelled) setClientOptions([]); })
            .finally(() => { if (!cancelled) setClientsLoading(false); });
        return () => { cancelled = true; };
    }, [apiBase, isPlatformAdmin]);

    const load = useCallback(async () => {
        if (!clientId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await fetchRecruitmentSources(clientId);
            const list = rows.map(dtoToSource);
            setSources(list);
            const b: Record<string, Source> = {};
            for (const s of list) {
                b[s.id] = { ...s };
            }
            setBaseline(b);
        } catch (e: unknown) {
            setLoadError(e instanceof Error ? e.message : t('sources.load_error'));
        } finally {
            setLoading(false);
        }
    }, [clientId, t]);

    useEffect(() => {
        if (!clientId) {
            setSources([]);
            setBaseline({});
            setLoadError(null);
            return;
        }
        void load();
    }, [clientId, load]);

    const handleUpdate = (id: string, field: keyof Omit<Source, 'id'>, value: string | number | boolean) => {
        setSources((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    };

    const handleToggleActive = async (id: string, checked: boolean) => {
        if (!clientId) return;
        const s = sources.find((x) => x.id === id);
        if (!s) return;
        // Optimistically update UI
        setSources((prev) => prev.map((x) => (x.id === id ? { ...x, isActive: checked } : x)));
        setRowBusy((m) => ({ ...m, [id]: true }));
        try {
            const saved = await updateRecruitmentSource(clientId, id, {
                name: s.name.trim(),
                addresses: s.addresses,
                exclusivityMonths: s.exclusivityMonths,
                isActive: checked,
            });
            // If the backend doesn't yet have the is_active column (migration pending),
            // isActive will be absent from the response — fall back to what we intended.
            const next: Source = {
                ...dtoToSource(saved),
                isActive: saved.isActive !== undefined ? saved.isActive !== false : checked,
            };
            setSources((prev) => prev.map((x) => (x.id === id ? next : x)));
            setBaseline((prev) => ({ ...prev, [id]: { ...next } }));
        } catch (e: unknown) {
            // Revert optimistic update on failure
            setSources((prev) => prev.map((x) => (x.id === id ? { ...x, isActive: !checked } : x)));
            window.alert(e instanceof Error ? e.message : t('sources.save_error'));
        } finally {
            setRowBusy((m) => ({ ...m, [id]: false }));
        }
    };

    const handleCancel = (id: string) => {
        const b = baseline[id];
        if (!b) return;
        setSources((prev) => prev.map((s) => (s.id === id ? { ...b } : s)));
    };

    const handleSaveRow = async (id: string) => {
        if (!clientId) return;
        const s = sources.find((x) => x.id === id);
        if (!s) return;
        if (!s.name.trim()) {
            window.alert(t('sources.name_required'));
            return;
        }
        setRowBusy((m) => ({ ...m, [id]: true }));
        try {
            const saved = await updateRecruitmentSource(clientId, id, {
                name: s.name.trim(),
                addresses: s.addresses,
                exclusivityMonths: s.exclusivityMonths,
                isActive: s.isActive,
            });
            const next = dtoToSource(saved);
            setSources((prev) => prev.map((x) => (x.id === id ? next : x)));
            setBaseline((prev) => ({ ...prev, [id]: { ...next } }));
        } catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : t('sources.save_error'));
        } finally {
            setRowBusy((m) => ({ ...m, [id]: false }));
        }
    };

    const handleDelete = async (id: string) => {
        if (!clientId) return;
        if (!window.confirm(t('sources.delete_confirm'))) return;
        setRowBusy((m) => ({ ...m, [id]: true }));
        try {
            await deleteRecruitmentSource(clientId, id);
            setSources((prev) => prev.filter((s) => s.id !== id));
            setBaseline((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        } catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : t('sources.delete_error'));
        } finally {
            setRowBusy((m) => {
                const n = { ...m };
                delete n[id];
                return n;
            });
        }
    };

    const handleNewSourceChange = (field: keyof Omit<Source, 'id'>, value: string | number | boolean) => {
        setNewSource((prev) => ({ ...prev, [field]: value }));
    };

    const handleAddNewSource = async () => {
        if (!clientId) return;
        if (!newSource.name.trim()) {
            window.alert(t('sources.name_required'));
            return;
        }
        setAdding(true);
        try {
            const created = await createRecruitmentSource(clientId, {
                name: newSource.name.trim(),
                addresses: newSource.addresses,
                exclusivityMonths: newSource.exclusivityMonths,
                isActive: newSource.isActive,
            });
            const next = dtoToSource(created);
            setSources((prev) => [...prev, next]);
            setBaseline((prev) => ({ ...prev, [next.id]: { ...next } }));
            setNewSource(emptyNewSource());
        } catch (e: unknown) {
            window.alert(e instanceof Error ? e.message : t('sources.save_error'));
        } finally {
            setAdding(false);
        }
    };

    const renderExistingRow = (source: Source) => {
        const busy = !!rowBusy[source.id];
        return (
            <tr
                key={source.id}
                className={`bg-bg-card hover:bg-bg-hover ${!source.isActive ? 'opacity-60' : ''}`}
            >
                <td className="p-2">
                    <input
                        type="text"
                        value={source.name}
                        disabled={busy}
                        onChange={(e) => handleUpdate(source.id, 'name', e.target.value)}
                        className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2"
                    />
                </td>
                <td className="p-2">
                    <input
                        type="text"
                        value={source.addresses}
                        disabled={busy}
                        onChange={(e) => handleUpdate(source.id, 'addresses', e.target.value)}
                        className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2"
                    />
                </td>
                <td className="p-2">
                    <input
                        type="number"
                        min={0}
                        disabled={busy}
                        value={source.exclusivityMonths}
                        onChange={(e) =>
                            handleUpdate(source.id, 'exclusivityMonths', parseInt(e.target.value, 10) || 0)
                        }
                        className="w-24 bg-bg-input border border-border-default text-sm rounded-md p-2 text-center"
                    />
                </td>
                <td className="p-2 text-center">
                    <input
                        type="checkbox"
                        checked={source.isActive}
                        disabled={busy}
                        onChange={(e) => void handleToggleActive(source.id, e.target.checked)}
                        className="w-4 h-4 rounded accent-primary-600 cursor-pointer disabled:opacity-50"
                        title={t('sources.col_active')}
                    />
                </td>
                <td className="p-2">
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleSaveRow(source.id)}
                            className="text-xs font-semibold text-text-default border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover disabled:opacity-50"
                        >
                            {t('sources.save')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleCancel(source.id)}
                            className="text-xs font-semibold text-text-muted hover:text-text-default disabled:opacity-50"
                        >
                            {t('sources.cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleDelete(source.id)}
                            className="p-2 text-text-subtle hover:text-red-600 disabled:opacity-50"
                            aria-label={t('sources.delete_aria')}
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    </div>
                </td>
            </tr>
        );
    };

    const renderNewRow = () => (
        <tr key="new-source" className="bg-primary-50/50">
            <td className="p-2">
                <input
                    type="text"
                    value={newSource.name}
                    placeholder={t('sources.new_name_placeholder')}
                    disabled={adding || !clientId}
                    onChange={(e) => handleNewSourceChange('name', e.target.value)}
                    className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2"
                />
            </td>
            <td className="p-2">
                <input
                    type="text"
                    value={newSource.addresses}
                    disabled={adding || !clientId}
                    onChange={(e) => handleNewSourceChange('addresses', e.target.value)}
                    className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2"
                />
            </td>
            <td className="p-2">
                <input
                    type="number"
                    min={0}
                    disabled={adding || !clientId}
                    value={newSource.exclusivityMonths}
                    onChange={(e) =>
                        handleNewSourceChange('exclusivityMonths', parseInt(e.target.value, 10) || 0)
                    }
                    className="w-24 bg-bg-input border border-border-default text-sm rounded-md p-2 text-center"
                />
            </td>
            <td className="p-2 text-center">
                <input
                    type="checkbox"
                    checked={newSource.isActive}
                    disabled={adding || !clientId}
                    onChange={(e) => handleNewSourceChange('isActive', e.target.checked)}
                    className="w-4 h-4 rounded accent-primary-600 cursor-pointer"
                    title={t('sources.col_active')}
                />
            </td>
            <td className="p-2">
                <div className="flex items-center justify-center gap-2">
                    <button
                        type="button"
                        disabled={adding || !clientId}
                        onClick={() => void handleAddNewSource()}
                        className="text-sm font-semibold text-primary-600 bg-primary-100 py-1.5 px-4 rounded-md hover:bg-primary-200 disabled:opacity-50"
                    >
                        {t('sources.add')}
                    </button>
                </div>
            </td>
        </tr>
    );

    if (!isPlatformAdmin && !ownClientId) {
        return (
            <div className="space-y-6">
                <h1 className="text-2xl font-bold text-text-default">{t('sources.title')}</h1>
                <p className="text-sm text-text-muted">{t('sources.no_client')}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-text-default">{t('sources.title')}</h1>

            {/* Admin client selector */}
            {isPlatformAdmin && (
                <div className="flex items-center gap-3">
                    <label className="text-sm font-semibold text-text-muted whitespace-nowrap">
                        {t('sources.admin_client_label')}:
                    </label>
                    <select
                        value={adminClientId ?? ''}
                        disabled={clientsLoading}
                        onChange={(e) => {
                            const val = e.target.value;
                            setAdminClientId(val || null);
                        }}
                        className="bg-bg-input border border-border-default text-sm rounded-md p-2 min-w-[220px] disabled:opacity-50"
                    >
                        <option value="">{t('sources.admin_all_clients')}</option>
                        {clientOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                        ))}
                    </select>
                    {clientsLoading && (
                        <span className="text-xs text-text-muted">{t('sources.loading')}</span>
                    )}
                </div>
            )}

            {loadError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{loadError}</div>
            )}

            <AccordionSection title={t('sources.instructions_title')} icon={<InformationCircleIcon className="w-5 h-5" />}>
                <div className="text-sm text-text-muted space-y-2 bg-amber-50 p-4 rounded-lg border border-amber-200">
                    <p><strong className="text-text-default">שם המקור:</strong> חייב להיות שם לא ריק וייחודי בתוך החברה.</p>
                    <p><strong className="text-text-default">כתובת של המקור:</strong> רשימה של מפרידים על ידי נקודה-פסיק, כאשר כל עצם יכול להיות אחת מ-3 אופציות:
                        <ul className="list-disc pr-6 mt-1 space-y-1">
                            <li>כתובת דוא&quot;ל המקושרת למקור הגיוס (לדוגמה: <span className="font-mono">name@example.com</span>).</li>
                            <li>החלק של אותו דוא&quot;ל אחרי ה-@ (לדוגמה: <span className="font-mono">@example.com</span>).</li>
                            <li>שם הדומיין (לדוגמה: <span className="font-mono">example</span>).</li>
                        </ul>
                    </p>
                    <p className="mt-2">כל עצם יכול להיות כתובת דוא&quot;ל בתוך כתובת דוא&quot;ל. כלומר, אם תזינו כתובת דוא&quot;ל <span className="font-mono">@example.com</span>, המערכת תתעלם מרווחים חוקיים, שיכולים להיות בתוך כתובת דוא&quot;ל (נמחקים אוטומטית).</p>
                    <p>אם אותה כתובת דוא&quot;ל מדווחת בעצמה על מקורות שונים, אז אחד מהם מדווח בצורה שרירותית. אם הרשימה ריקה עבור המקורות שכבר לא בשימוש, או עבור מקורות שלא ניתן לזהות על פי כתובת מייל של מועמד.</p>
                    <p><strong className="text-text-default">חודשי בלעדיות:</strong> ניתן לקבוע לכמה חודשים המקור יהיה בלעדי. חייב להיות מספר שלם חיובי או 0.</p>
                    <p><strong className="text-text-default">מחיקה:</strong> ניתן למחוק מקור גיוס בלחיצה על אייקון הפח האדום. אזהרה! מחיקת המקור הינה לצמיתות ללא אפשרות שחזור. מומלץ לוודא שלא קיימים מועמדים שמשויכים אליהם, מאחר וזה ישפיע על מחיקת מקור הגיוס מהמועמדים.</p>
                </div>
            </AccordionSection>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right min-w-[900px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle sticky top-0 z-10">
                        <tr>
                            <th className="p-3 w-1/4">{t('sources.col_name')}</th>
                            <th className="p-3 w-1/2">{t('sources.col_addresses')}</th>
                            <th className="p-3">{t('sources.col_exclusivity')}</th>
                            <th className="p-3 text-center">{t('sources.col_active')}</th>
                            <th className="p-3 text-center">{t('sources.col_actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {loading && sources.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-6 text-center text-text-muted">
                                    {t('sources.loading')}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {sources.map(renderExistingRow)}
                                {renderNewRow()}
                            </>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                    className="bg-bg-card text-text-default font-bold py-2.5 px-6 rounded-lg border border-border-default hover:bg-bg-hover transition disabled:opacity-50"
                >
                    {t('sources.refresh')}
                </button>
            </div>
        </div>
    );
};

export default RecruitmentSourcesSettingsView;
