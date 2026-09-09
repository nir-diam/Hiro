import React, { useEffect, useMemo, useState } from 'react';
import { ClockIcon, XMarkIcon } from './Icons';
import AuditHistoryRow from './AuditHistoryRow';
import {
    fetchAuditLogsByEntity,
    type AuditEntityKind,
    type AuditLogEntry,
} from '../services/auditLogsApi';
import {
    formatAgentDecisionHistoryActionType,
    formatAgentDecisionHistoryDescription,
} from '../utils/agentDecisionHistoryText';

export interface AgentDecisionHistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    decisionId: string | null;
    entityKind: Extract<AuditEntityKind, 'tag-ai-decision' | 'organization-ai-decision'>;
    decisionLabel?: string;
}

const AgentDecisionHistoryDrawer: React.FC<AgentDecisionHistoryDrawerProps> = ({
    isOpen,
    onClose,
    decisionId,
    entityKind,
    decisionLabel,
}) => {
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
        if (!isOpen || !decisionId || !apiBase) {
            setEntries([]);
            setError(null);
            return;
        }
        let active = true;
        setLoading(true);
        setError(null);
        fetchAuditLogsByEntity(apiBase, token, entityKind, decisionId, { page: 1, pageSize: 500 })
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
    }, [apiBase, decisionId, entityKind, isOpen, token]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[220] flex items-center justify-end p-0 sm:p-4"
            onClick={onClose}
        >
            <div
                className="bg-bg-card w-full sm:max-w-2xl h-full sm:h-[min(90vh,820px)] sm:rounded-2xl shadow-2xl border border-border-default flex flex-col animate-fade-in"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <header className="flex items-start justify-between gap-3 p-5 border-b border-border-default shrink-0">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                            <ClockIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-text-default">היסטוריית החלטה</h3>
                            {decisionLabel ? (
                                <p className="text-sm text-text-muted mt-0.5 truncate">{decisionLabel}</p>
                            ) : null}
                            <p className="text-xs text-text-muted mt-1">
                                כל שינוי, הערה והחלטה — ומי ביצע
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-bg-hover text-text-muted shrink-0"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
                    {loading ? (
                        <div className="py-16 text-center text-text-muted text-sm">טוען היסטוריה…</div>
                    ) : null}
                    {!loading && error ? (
                        <div className="py-12 text-center text-red-600 text-sm">{error}</div>
                    ) : null}
                    {!loading && !error && entries.length === 0 ? (
                        <div className="py-16 text-center text-text-muted text-sm">
                            אין היסטוריית פעילות להצגה עדיין
                        </div>
                    ) : null}
                    {!loading && !error && entries.length > 0 ? (
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
                                    userName={entry.user.name}
                                    userEmail={entry.user.email}
                                    userAvatar={entry.user.avatar}
                                    actionLabel={formatAgentDecisionHistoryActionType(entry)}
                                    description={formatAgentDecisionHistoryDescription(entry)}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default AgentDecisionHistoryDrawer;
