import React, { useEffect, useMemo, useState } from 'react';
import { ClockIcon } from './Icons';
import AuditHistoryRow from './AuditHistoryRow';
import { fetchAuditLogsByEntity, type AuditLogEntry } from '../services/auditLogsApi';
import { formatClientHistoryActionType, formatClientHistoryDescription } from '../utils/clientHistoryText';

interface ClientHistoryTabProps {
    clientId: string;
    clientName?: string;
}

const ClientHistoryTab: React.FC<ClientHistoryTabProps> = ({ clientId }) => {
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [entries, setEntries] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const token = useMemo(() => {
        try {
            return localStorage.getItem('token');
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (!apiBase || !clientId) return;
        let active = true;
        setLoading(true);
        setError(null);
        fetchAuditLogsByEntity(apiBase, token, 'client', clientId, { page: 1, pageSize: 500 })
            .then((res) => {
                if (!active) return;
                setEntries(res.items || []);
            })
            .catch((err: Error) => {
                if (!active) return;
                setError(err.message || 'טעינת ההיסטוריה נכשלה');
                setEntries([]);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [apiBase, clientId, token]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm border border-border-default p-4 sm:p-6">
            <header className="flex items-center gap-2 mb-4 pb-4 border-b border-border-default">
                <ClockIcon className="w-5 h-5 text-primary-600" />
                <div>
                    <h2 className="text-lg font-bold text-text-default">היסטוריית לקוח</h2>
                    <p className="text-xs text-text-muted">כל שינויי הסטטוס, שלבי המכירה ופרטי הלקוח</p>
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
                            timestamp={entry.timestamp}
                            actor={entry.user.id || undefined}
                            userName={entry.user.name}
                            userEmail={entry.user.email}
                            userAvatar={entry.user.avatar}
                            actionLabel={formatClientHistoryActionType(entry)}
                            description={formatClientHistoryDescription(entry)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default ClientHistoryTab;
