import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    approveOrgProfileUpdate,
    countOrgProfileUpdatesHandled,
    fetchOrgProfileUpdates,
    fetchOrgProfileUpdatesHandled,
    formatOrgProfileFieldValue,
    industryDisplayFromFields,
    ORG_PROFILE_FIELD_LABELS,
    rejectOrgProfileUpdate,
    type OrgProfileFields,
    type OrgProfileUpdateDto,
} from '../services/organizationProfileUpdatesApi';
import { CheckCircleIcon, XMarkIcon, MagnifyingGlassIcon } from './Icons';

const FIELD_KEYS: (keyof OrgProfileFields)[] = [
    'mainField',
    'mainField2',
    'subField',
    'secondaryField',
    'employeeCount',
    'structure',
    'subsidiaries',
    'location',
    'additionalLocations',
    'website',
];

/** Points earned from this specific update (not the client’s running total). */
function gamificationPointsForRecord(status: OrgProfileUpdateDto['status']): number | null {
    if (status === 'approved') return 1;
    return null;
}

function changedFieldKeys(row: OrgProfileUpdateDto): (keyof OrgProfileFields)[] {
    const prev = row.previousFields || {};
    const next = row.proposedFields || {};
    return FIELD_KEYS.filter((key) => {
        const a = formatOrgProfileFieldValue(key, prev[key]);
        const b = formatOrgProfileFieldValue(key, next[key]);
        return a !== b;
    });
}

type AdminListFilter = 'pending' | 'handled';

interface AdminOrgProfileUpdatesPanelProps {
    onPendingCountChange?: (count: number) => void;
}

function UpdateDetailsBlock({ row, changed }: { row: OrgProfileUpdateDto; changed: (keyof OrgProfileFields)[] }) {
    return (
        <div className="border-t border-border-default bg-bg-subtle p-4 text-sm space-y-3">
            <div className="font-bold text-text-default">תעשייה (מוצע)</div>
            <div>{industryDisplayFromFields(row.proposedFields || {})}</div>
            {changed.map((key) => (
                <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-border-default pt-2">
                    <div>
                        <div className="text-xs text-text-muted mb-1">{ORG_PROFILE_FIELD_LABELS[key]}</div>
                        <div className="text-text-muted line-through">
                            {key === 'mainField'
                                ? industryDisplayFromFields(row.previousFields || {})
                                : formatOrgProfileFieldValue(key, row.previousFields?.[key])}
                        </div>
                    </div>
                    <div>
                        <div className="text-xs text-text-muted mb-1">ערך מוצע</div>
                        <div className="font-semibold text-emerald-800">
                            {key === 'mainField'
                                ? industryDisplayFromFields(row.proposedFields || {})
                                : formatOrgProfileFieldValue(key, row.proposedFields?.[key])}
                        </div>
                    </div>
                </div>
            ))}
            {row.reviewNote && (
                <div className="border-t border-border-default pt-2 text-xs text-text-muted">
                    הערת מנהל: {row.reviewNote}
                </div>
            )}
        </div>
    );
}

const AdminOrgProfileUpdatesPanel: React.FC<AdminOrgProfileUpdatesPanelProps> = ({ onPendingCountChange }) => {
    const [listFilter, setListFilter] = useState<AdminListFilter>('pending');
    const [rows, setRows] = useState<OrgProfileUpdateDto[]>([]);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [handledTotal, setHandledTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            if (listFilter === 'handled') {
                const [res, pendingRes] = await Promise.all([
                    fetchOrgProfileUpdatesHandled({ limit: 100, search }),
                    fetchOrgProfileUpdates({ status: 'pending', limit: 1, search }),
                ]);
                setRows(res.data);
                setHandledTotal(res.total);
                setPendingTotal(pendingRes.total);
                onPendingCountChange?.(pendingRes.total);
            } else {
                const [res, handledTotal] = await Promise.all([
                    fetchOrgProfileUpdates({ status: 'pending', limit: 100, search }),
                    countOrgProfileUpdatesHandled(search),
                ]);
                setRows(res.data);
                setPendingTotal(res.total);
                setHandledTotal(handledTotal);
                onPendingCountChange?.(res.total);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'טעינה נכשלה');
        } finally {
            setLoading(false);
        }
    }, [search, listFilter, onPendingCountChange]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setExpandedId(null);
    }, [listFilter, search]);

    const handleApprove = async (id: string) => {
        setBusyId(id);
        try {
            await approveOrgProfileUpdate(id);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'אישור נכשל');
        } finally {
            setBusyId(null);
        }
    };

    const handleReject = async (id: string) => {
        setBusyId(id);
        try {
            await rejectOrgProfileUpdate(id);
            await load();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'דחייה נכשלה');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center gap-3 flex-shrink-0">
                <div className="relative flex-1 max-w-md">
                    <MagnifyingGlassIcon className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="חיפוש לפי לקוח / ארגון / שולח..."
                        className="w-full pr-10 pl-3 py-2.5 bg-bg-input border border-border-default rounded-lg text-sm"
                    />
                </div>
                <div className="flex items-center rounded-lg border border-border-default overflow-hidden flex-shrink-0">
                    <button
                        type="button"
                        onClick={() => setListFilter('pending')}
                        className={`text-xs font-bold px-3 py-2 transition-colors ${
                            listFilter === 'pending'
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-text-muted hover:bg-bg-subtle'
                        }`}
                    >
                        ממתינים ({pendingTotal})
                    </button>
                    <button
                        type="button"
                        onClick={() => setListFilter('handled')}
                        className={`text-xs font-bold px-3 py-2 border-r border-border-default transition-colors ${
                            listFilter === 'handled'
                                ? 'bg-primary-600 text-white'
                                : 'bg-white text-text-muted hover:bg-bg-subtle'
                        }`}
                    >
                        טופלו ({handledTotal})
                    </button>
                </div>
            </div>

            {error && <div className="text-sm font-semibold text-red-600">{error}</div>}

            {loading ? (
                <div className="text-sm text-text-muted py-8 text-center">טוען...</div>
            ) : rows.length === 0 ? (
                <div className="text-sm text-text-muted py-12 text-center bg-bg-subtle rounded-xl border border-border-default">
                    {listFilter === 'pending' ? 'אין עדכוני פרופיל ממתינים לאישור' : 'אין עדכונים שאושרו או נדחו'}
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
                    {rows.map((row) => {
                        const changed = changedFieldKeys(row);
                        const expanded = expandedId === row.id;
                        const isHandled = row.status === 'approved' || row.status === 'rejected';
                        const recordPoints = gamificationPointsForRecord(row.status);
                        return (
                            <div key={row.id} className="bg-white border border-border-default rounded-xl shadow-sm overflow-hidden">
                                <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <div className="font-bold text-text-default">
                                            {row.clientName || 'לקוח'}
                                            <span className="text-text-muted font-normal mx-2">·</span>
                                            {row.organizationName || 'ארגון'}
                                        </div>
                                        <div className="text-xs text-text-muted">
                                            הוגש {row.createdAt ? new Date(row.createdAt).toLocaleString('he-IL') : '—'}
                                            {row.submittedByName ? ` · ${row.submittedByName}` : ''}
                                            {isHandled && row.reviewedAt
                                                ? ` · טופל ${new Date(row.reviewedAt).toLocaleString('he-IL')}${row.reviewedByName ? ` · ${row.reviewedByName}` : ''}`
                                                : ''}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {row.status === 'pending' ? (
                                                <div className="text-xs text-amber-700 font-semibold bg-amber-50 inline-block px-2 py-0.5 rounded-full">
                                                    ממתין לאישור · {changed.length} שדות
                                                </div>
                                            ) : row.status === 'approved' ? (
                                                <div className="text-xs text-emerald-800 font-semibold bg-emerald-50 inline-block px-2 py-0.5 rounded-full">
                                                    אושר · {changed.length} שדות
                                                </div>
                                            ) : (
                                                <div className="text-xs text-rose-800 font-semibold bg-rose-50 inline-block px-2 py-0.5 rounded-full">
                                                    נדחה · {changed.length} שדות
                                                </div>
                                            )}
                                            {recordPoints != null && (
                                                <div className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                                                    {recordPoints} נק&apos;
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Link
                                            to={`/clients/${row.clientId}`}
                                            className="text-xs font-bold text-primary-600 hover:underline px-2 py-1"
                                        >
                                            לפרופיל לקוח
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expanded ? null : row.id)}
                                            className="text-xs font-bold text-text-muted hover:text-text-default px-2 py-1"
                                        >
                                            {expanded ? 'הסתר' : isHandled ? 'מה אושר / נדחה' : 'פרטים'}
                                        </button>
                                        {row.status === 'pending' && (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={busyId === row.id}
                                                    onClick={() => handleApprove(row.id)}
                                                    className="flex items-center gap-1 bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                                                >
                                                    <CheckCircleIcon className="w-4 h-4" />
                                                    אשר
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busyId === row.id}
                                                    onClick={() => handleReject(row.id)}
                                                    className="flex items-center gap-1 bg-rose-100 text-rose-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-rose-200 disabled:opacity-60"
                                                >
                                                    <XMarkIcon className="w-4 h-4" />
                                                    דחה
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                {expanded && <UpdateDetailsBlock row={row} changed={changed} />}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminOrgProfileUpdatesPanel;
