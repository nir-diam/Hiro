import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ClockIcon, ArrowLeftIcon, UserIcon } from './Icons';

const apiBase = import.meta.env.VITE_API_BASE || '';

const STATUS_COLOR: Record<string, string> = {
    'בוצע':  'bg-green-100 text-green-700 border-green-200',
    'בוטל':  'bg-red-100   text-red-700   border-red-200',
    'עתידי': 'bg-blue-100  text-blue-700  border-blue-200',
};

const AdminCandidateLogsView: React.FC = () => {
    const { candidateId } = useParams<{ candidateId: string }>();

    const [candidate, setCandidate] = useState<any | null>(null);
    const [events, setEvents]       = useState<any[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!candidateId) return;
        setLoading(true);
        setError(null);
        try {
            const [cRes, eRes] = await Promise.all([
                fetch(`${apiBase}/api/candidates/${candidateId}`, { credentials: 'include' }),
                fetch(`${apiBase}/api/candidates/${candidateId}/events`, { credentials: 'include' }),
            ]);
            if (!cRes.ok) throw new Error('Candidate load failed');
            const [cData, eData] = await Promise.all([cRes.json(), eRes.ok ? eRes.json() : []]);
            setCandidate(cData);
            setEvents(Array.isArray(eData) ? eData : []);
        } catch (err: any) {
            setError(err.message || 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [candidateId]);

    useEffect(() => { void load(); }, [load]);

    const name = candidate?.fullName || candidate?.name || candidateId;

    return (
        <div className="min-h-screen bg-bg-subtle p-6 font-sans" dir="rtl">
            {/* Header */}
            <header className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-black text-sm">
                        {name?.slice(0, 2) || '??'}
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-text-default">לוג מערכת — {name}</h1>
                        <p className="text-xs text-text-muted">
                            {loading ? 'טוען...' : `${events.length} אירועים מתועדים`}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => void load()}
                        className="px-3 py-1.5 text-xs font-bold border border-border-default rounded-lg text-text-muted hover:bg-bg-hover transition"
                    >
                        ↻ רענן
                    </button>
                    <button
                        onClick={() => window.close()}
                        className="px-3 py-1.5 text-xs font-bold border border-border-default rounded-lg text-text-muted hover:bg-bg-hover transition"
                    >
                        סגור
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-4">{error}</div>
                )}

                {loading ? (
                    <div className="flex flex-col gap-3">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="bg-white rounded-2xl border border-border-default p-5 animate-pulse">
                                <div className="h-4 bg-bg-subtle rounded w-1/3 mb-2" />
                                <div className="h-3 bg-bg-subtle rounded w-2/3" />
                            </div>
                        ))}
                    </div>
                ) : events.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-border-default p-12 text-center">
                        <ClockIcon className="w-10 h-10 text-text-muted mx-auto mb-3" />
                        <p className="text-text-muted font-semibold">אין אירועים מתועדים עדיין</p>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute right-[22px] top-0 bottom-0 w-px bg-border-default" />

                        <div className="flex flex-col gap-3">
                            {events.map((ev: any, i: number) => {
                                const types: string[] = Array.isArray(ev.type) ? ev.type : ev.type ? [String(ev.type)] : [];
                                const dateStr = ev.date
                                    ? new Date(ev.date).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })
                                    : '';
                                const timeStr = ev.date
                                    ? new Date(ev.date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
                                    : '';
                                const statusClass = ev.status ? (STATUS_COLOR[ev.status] || 'bg-bg-subtle text-text-muted border-border-default') : '';

                                return (
                                    <div key={ev.id || i} className="flex gap-4 relative">
                                        {/* Timeline dot */}
                                        <div className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-full bg-white border-2 border-border-default z-10">
                                            <ClockIcon className="w-4 h-4 text-text-muted" />
                                        </div>

                                        {/* Card */}
                                        <div className="flex-1 bg-white rounded-2xl border border-border-default p-5 shadow-sm hover:shadow-md transition-shadow mb-2">
                                            {/* Top row: types + status + date */}
                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {types.map((t, ti) => (
                                                        <span key={ti} className="text-[11px] font-bold bg-primary-50 text-primary-700 px-2.5 py-0.5 rounded-full border border-primary-100">
                                                            {t}
                                                        </span>
                                                    ))}
                                                    {ev.status && (
                                                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusClass}`}>
                                                            {ev.status}
                                                        </span>
                                                    )}
                                                </div>
                                                {dateStr && (
                                                    <div className="text-left flex-shrink-0">
                                                        <p className="text-xs font-semibold text-text-default">{dateStr}</p>
                                                        {timeStr && <p className="text-[10px] text-text-muted">{timeStr}</p>}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Description */}
                                            {ev.description && (
                                                <p className="text-sm font-semibold text-text-default mb-1">{ev.description}</p>
                                            )}
                                            {ev.notes && (
                                                <p className="text-xs text-text-muted leading-relaxed">{ev.notes}</p>
                                            )}

                                            {/* Footer: coordinator + linked jobs */}
                                            <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-subtle">
                                                <span className="flex items-center gap-1">
                                                    <UserIcon className="w-3 h-3" />
                                                    {ev.coordinator || 'מערכת'}
                                                </span>
                                                {ev.linkedTo?.length > 0 && (
                                                    <span>משרות: {ev.linkedTo.join(', ')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            <style>{`
                @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
                .animate-pulse { animation: pulse 1.5s ease-in-out infinite; }
                body { background: var(--color-bg-subtle, #f8f9fb); }
            `}</style>
        </div>
    );
};

export default AdminCandidateLogsView;
