import React, { useCallback, useEffect, useState } from 'react';
import ClientProfilePointsBadge from './ClientProfilePointsBadge';
import { XMarkIcon } from './Icons';
import { dispatchClientGamificationUpdated } from '../utils/clientGamification';
import {
    changedOrgProfileFieldKeys,
    fetchClientOrgProfileUpdateHistory,
    formatOrgProfileFieldValue,
    industryDisplayFromFields,
    ORG_PROFILE_FIELD_LABELS,
    ORG_PROFILE_UPDATE_STATUS_LABELS,
    type OrgProfileFields,
    type OrgProfileUpdateDto,
} from '../services/organizationProfileUpdatesApi';

interface ClientProfileUpdatesHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    clientId: string;
    points: number;
}

const ClientProfileUpdatesHistoryModal: React.FC<ClientProfileUpdatesHistoryModalProps> = ({
    isOpen,
    onClose,
    clientId,
    points,
}) => {
    const [rows, setRows] = useState<OrgProfileUpdateDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!clientId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchClientOrgProfileUpdateHistory(clientId, { limit: 50 });
            setRows(res.data);
            if (typeof res.clientGamificationPoints === 'number') {
                dispatchClientGamificationUpdated(clientId, res.clientGamificationPoints);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'טעינה נכשלה');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        if (!isOpen) return;
        setExpandedId(null);
        load();
    }, [isOpen, load]);

    if (!isOpen) return null;

    const renderFieldRow = (row: OrgProfileUpdateDto, key: keyof OrgProfileFields) => (
        <div key={key} className="grid grid-cols-1 md:grid-cols-2 gap-2 border-t border-border-default pt-2">
            <div>
                <div className="text-xs text-text-muted mb-1">{ORG_PROFILE_FIELD_LABELS[key]}</div>
                <div className="text-text-muted">
                    {key === 'mainField'
                        ? industryDisplayFromFields(row.previousFields || {})
                        : formatOrgProfileFieldValue(key, row.previousFields?.[key])}
                </div>
            </div>
            <div>
                <div className="text-xs text-text-muted mb-1">ערך מוצע</div>
                <div className="font-semibold text-text-default">
                    {key === 'mainField'
                        ? industryDisplayFromFields(row.proposedFields || {})
                        : formatOrgProfileFieldValue(key, row.proposedFields?.[key])}
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-bg-card w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh] border border-border-default"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <header className="flex items-start justify-between gap-4 p-5 border-b border-border-default bg-white">
                    <div className="flex items-center gap-3 min-w-0">
                        <ClientProfilePointsBadge points={points} size="md" />
                        <div className="min-w-0">
                            <h2 className="text-xl font-black text-text-default">היסטוריית עדכוני פרופיל</h2>
                            <p className="text-sm text-text-muted mt-0.5">
                                {points} נקודות · +1 לכל עדכון שאושר על ידי מנהל
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors shrink-0"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 bg-bg-subtle/30 space-y-3">
                    {loading && <div className="text-sm text-text-muted py-8 text-center">טוען...</div>}
                    {error && !loading && (
                        <div className="text-sm font-semibold text-red-600 text-center py-4">{error}</div>
                    )}
                    {!loading && !error && rows.length === 0 && (
                        <div className="text-sm text-text-muted py-12 text-center bg-white rounded-xl border border-border-default">
                            עדיין לא נשלחו עדכוני פרופיל לאישור.
                        </div>
                    )}
                    {!loading &&
                        rows.map((row) => {
                            const changed = changedOrgProfileFieldKeys(row);
                            const expanded = expandedId === row.id;
                            const statusMeta = ORG_PROFILE_UPDATE_STATUS_LABELS[row.status] || {
                                label: row.status,
                                className: 'bg-gray-100 text-gray-700',
                            };
                            const showFields = changed;
                            return (
                                <div
                                    key={row.id}
                                    className="bg-white border border-border-default rounded-xl shadow-sm overflow-hidden"
                                >
                                    <div className="p-4 flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-1.5 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span
                                                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${statusMeta.className}`}
                                                >
                                                    {statusMeta.label}
                                                </span>
                                                {row.status === 'approved' && (
                                                    <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                                                        +1 נקודה
                                                    </span>
                                                )}
                                                <span className="text-xs text-text-muted">
                                                    {showFields.length} שדות
                                                </span>
                                            </div>
                                            <div className="text-xs text-text-muted">
                                                הוגש{' '}
                                                {row.createdAt
                                                    ? new Date(row.createdAt).toLocaleString('he-IL')
                                                    : '—'}
                                                {row.submittedByName ? ` · ${row.submittedByName}` : ''}
                                            </div>
                                            {row.status !== 'pending' && row.reviewedAt && (
                                                <div className="text-xs text-text-muted">
                                                    {row.status === 'approved' ? 'אושר' : 'נדחה'}{' '}
                                                    {new Date(row.reviewedAt).toLocaleString('he-IL')}
                                                    {row.reviewedByName ? ` · ${row.reviewedByName}` : ''}
                                                </div>
                                            )}
                                            {row.reviewNote && (
                                                <div className="text-xs text-rose-700 bg-rose-50 px-2 py-1 rounded">
                                                    {row.reviewNote}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedId(expanded ? null : row.id)}
                                            className="text-xs font-bold text-primary-600 hover:underline px-2 py-1 shrink-0"
                                        >
                                            {expanded ? 'הסתר פרמטרים' : 'הצג פרמטרים'}
                                        </button>
                                    </div>
                                    {expanded && (
                                        <div className="border-t border-border-default bg-bg-subtle p-4 text-sm space-y-2">
                                            {showFields.length === 0 ? (
                                                <div className="text-text-muted text-xs">אין שדות להצגה</div>
                                            ) : (
                                                showFields.map((key) => renderFieldRow(row, key))
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            </div>
        </div>
    );
};

export default ClientProfileUpdatesHistoryModal;
