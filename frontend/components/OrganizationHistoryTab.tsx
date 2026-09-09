import React, { useEffect, useState } from 'react';
import { ClockIcon } from './Icons';
import AuditHistoryRow from './AuditHistoryRow';
import { authHeaders } from '../utils/authHeaders';
import { resolveEntryTimestamp } from '../utils/auditHistoryFormat';
import {
    formatCompanyHistoryActionType,
    formatCompanyHistoryDescription,
    type CompanyHistoryEntryLike,
} from '../utils/companyHistoryText';

interface OrganizationHistoryTabProps {
    organizationId: string;
    organizationName?: string;
}

const OrganizationHistoryTab: React.FC<OrganizationHistoryTabProps> = ({
    organizationId,
    organizationName,
}) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [entries, setEntries] = useState<CompanyHistoryEntryLike[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!apiBase || !organizationId) return;
        const controller = new AbortController();
        let active = true;
        setLoading(true);
        setError(null);

        fetch(`${apiBase}/api/organizations/${encodeURIComponent(organizationId)}/history`, {
            headers: authHeaders(),
            cache: 'no-store',
            signal: controller.signal,
        })
            .then((res) => {
                if (!res.ok) throw new Error('טעינת ההיסטוריה נכשלה');
                return res.json();
            })
            .then((payload) => {
                if (!active) return;
                setEntries(Array.isArray(payload) ? payload : []);
            })
            .catch((err: unknown) => {
                if (!active || (err as Error).name === 'AbortError') return;
                setError(err instanceof Error ? err.message : 'טעינת ההיסטוריה נכשלה');
                setEntries([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [apiBase, organizationId]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-4 sm:p-6">
            <header className="flex items-center gap-2 mb-4 pb-4 border-b border-border-default">
                <ClockIcon className="w-5 h-5 text-primary-600" />
                <div>
                    <h2 className="text-lg font-bold text-text-default">היסטוריית לקוח</h2>
                    <p className="text-xs text-text-muted">
                        {organizationName
                            ? `שינויים ועדכונים של ${organizationName} בלבד`
                            : 'שינויים ועדכונים של הארגון הנוכחי בלבד'}
                    </p>
                </div>
            </header>

            {loading && (
                <div className="py-12 text-center text-text-muted text-sm">טוען היסטוריה...</div>
            )}

            {!loading && error && (
                <div className="py-8 text-center text-red-600 text-sm">{error}</div>
            )}

            {!loading && !error && entries.length === 0 && (
                <div className="py-12 text-center text-text-muted text-sm">אין היסטוריית פעילות להצגה</div>
            )}

            {!loading && !error && entries.length > 0 && (
                <div className="space-y-3">
                    <div className="hidden md:grid md:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_100px_minmax(0,2fr)] gap-4 px-4 pb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                        <span>מתי</span>
                        <span>מי</span>
                        <span>פעולה</span>
                        <span>תיאור השינוי</span>
                    </div>
                    {entries.map((entry) => (
                        <AuditHistoryRow
                            key={entry.id}
                            timestamp={resolveEntryTimestamp(entry as Record<string, unknown>)}
                            actor={entry.actor}
                            actorDisplayName={entry.actorDisplayName}
                            userName={entry.userName}
                            userEmail={entry.userEmail}
                            actionLabel={formatCompanyHistoryActionType(entry)}
                            description={formatCompanyHistoryDescription(entry)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default OrganizationHistoryTab;
