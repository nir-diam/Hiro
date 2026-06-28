import React, { useEffect, useState, useCallback } from 'react';
import {
    fetchOrgAiDecisionStats,
    resolveOrgAiDecision,
    type OrgAiDecisionStats,
} from '../services/organizationCorrectionsApi';

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSparkles = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5z" clipRule="evenodd" />
    </svg>
);

const IconCheck = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const IconClock = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const IconExclamation = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
);

const IconBuilding = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
);

const IconLink = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
);

const IconGrid = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
);

const IconRefresh = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

const IconUndo = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('he-IL');

const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const getHesitationBand = (level: number | null) => {
    if (level === null || level === undefined) return { label: 'נמוך', color: 'text-rose-600', bg: 'bg-rose-50', confidence: 0 };
    const conf = 100 - level;
    if (level < 30) return { label: 'ודאי', color: 'text-emerald-600', bg: 'bg-emerald-50', confidence: conf };
    if (level < 60) return { label: 'בינוני', color: 'text-amber-600', bg: 'bg-amber-50', confidence: conf };
    return { label: 'נמוך', color: 'text-rose-600', bg: 'bg-rose-50', confidence: conf };
};

const getDecisionConfig = (d: string) => {
    if (d === 'create_company') return { label: 'יצירה', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-100', icon: <IconBuilding className="w-3 h-3" /> };
    if (d === 'merge_company')  return { label: 'מיזוג',  color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-100',  icon: <IconLink    className="w-3 h-3" /> };
    return                             { label: 'כללי',  color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-100',  icon: <IconGrid    className="w-3 h-3" /> };
};

const getStatusConfig = (s: string) => {
    if (s === 'approved')       return { label: 'אושר',      color: 'text-emerald-700', dot: 'bg-emerald-500' };
    if (s === 'pending_review') return { label: 'בבדיקה',    color: 'text-amber-700',   dot: 'bg-amber-400'   };
    if (s === 'manual')         return { label: 'ידני',       color: 'text-rose-700',    dot: 'bg-rose-500'    };
    return                             { label: 'שונה',       color: 'text-slate-600',   dot: 'bg-slate-400'   };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: number;
    sub?: string;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    accent: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, sub, icon, iconBg, iconColor, accent }) => (
    <div className={`bg-white border rounded-xl p-5 flex items-center gap-4 shadow-sm ${accent}`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
            <div className="text-2xl font-bold text-text-default tabular-nums">{fmt(value)}</div>
            <div className="text-sm font-medium text-text-default mt-0.5">{label}</div>
            {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
        </div>
    </div>
);

interface BarSectionProps {
    label: string;
    value: number;
    total: number;
    color: string;
    labelColor: string;
}

const BarSection: React.FC<BarSectionProps> = ({ label, value, total, color, labelColor }) => {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div className="flex items-center gap-3">
            <div className="w-20 text-right text-xs font-semibold text-text-muted shrink-0">{label}</div>
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className={`text-xs font-bold w-10 shrink-0 ${labelColor}`}>{pct}%</div>
            <div className="text-xs text-text-muted w-8 shrink-0 tabular-nums">{fmt(value)}</div>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const AdminCompanyAgentDashboard: React.FC = () => {
    const [stats, setStats] = useState<OrgAiDecisionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [undoingId, setUndoingId] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState(new Date());

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchOrgAiDecisionStats();
            setStats(data);
            setLastRefresh(new Date());
        } catch (e: any) {
            setError(e.message || 'שגיאה בטעינת הנתונים');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleUndo = async (id: string) => {
        setUndoingId(id);
        try {
            await resolveOrgAiDecision(id, { reviewStatus: 'pending_review', reviewerAction: 'reverted' });
            await load();
        } catch {
            // silent
        } finally {
            setUndoingId(null);
        }
    };

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center h-64 text-text-muted gap-3">
                <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                <span>טוען נתוני סוכן...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-rose-600">
                <IconExclamation className="w-8 h-8" />
                <p className="text-sm font-medium">{error}</p>
                <button onClick={load} className="text-xs underline hover:no-underline">נסה שוב</button>
            </div>
        );
    }

    if (!stats) return null;

    const totalDecisions = stats.byDecision.create_company + stats.byDecision.merge_company + stats.byDecision.map_generic;

    return (
        <div className="space-y-6 pb-8" dir="rtl">
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-l from-slate-50 to-indigo-50 border border-indigo-100 rounded-2xl p-6 flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-md shadow-indigo-200 flex-shrink-0">
                        <IconSparkles className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-lg font-bold text-text-default">סוכן AI — ניהול ישויות חברה</h2>
                            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                פעיל
                            </span>
                        </div>
                        <p className="text-sm text-text-muted">מעבד ביטויי חברה חדשים מקורות חיים בזמן אמת — מסווג, ממזג ויוצר חברות אוטומטית.</p>
                        <p className="text-xs text-text-subtle mt-1">
                            עודכן לאחרונה: {fmtTime(lastRefresh.toISOString())}
                        </p>
                    </div>
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-xs font-semibold text-text-muted bg-white border border-border-default px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors disabled:opacity-50 shrink-0"
                >
                    <IconRefresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    רענן
                </button>
            </div>

            {/* ── Stats Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    label="סה״כ עובד"
                    value={stats.total}
                    sub={`${stats.todayCount} היום`}
                    icon={<IconSparkles className="w-6 h-6" />}
                    iconBg="bg-indigo-100"
                    iconColor="text-indigo-600"
                    accent="border-indigo-100"
                />
                <StatCard
                    label='ודאי — אושרו'
                    value={stats.byHesitation.vodai}
                    sub="ביטחון ≥ 70%"
                    icon={<IconCheck className="w-6 h-6" />}
                    iconBg="bg-emerald-100"
                    iconColor="text-emerald-600"
                    accent="border-emerald-100"
                />
                <StatCard
                    label="בינוני — בבדיקה"
                    value={stats.byHesitation.binoni}
                    sub="ביטחון 40–70%"
                    icon={<IconClock className="w-6 h-6" />}
                    iconBg="bg-amber-100"
                    iconColor="text-amber-600"
                    accent="border-amber-100"
                />
                <StatCard
                    label="נמוך — תור ידני"
                    value={stats.byHesitation.namuch}
                    sub="ביטחון < 40%"
                    icon={<IconExclamation className="w-6 h-6" />}
                    iconBg="bg-rose-100"
                    iconColor="text-rose-600"
                    accent="border-rose-100"
                />
            </div>

            {/* ── Middle row: breakdown cards ─────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Decision types */}
                <div className="bg-white border border-border-default rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-text-default mb-4">סוג החלטה</h3>
                    <div className="space-y-3">
                        <BarSection label="יצירה חדשה" value={stats.byDecision.create_company} total={totalDecisions} color="bg-emerald-400" labelColor="text-emerald-700" />
                        <BarSection label="מיזוג" value={stats.byDecision.merge_company} total={totalDecisions} color="bg-indigo-400" labelColor="text-indigo-700" />
                        <BarSection label="כללי" value={stats.byDecision.map_generic} total={totalDecisions} color="bg-orange-400" labelColor="text-orange-700" />
                    </div>
                    <div className="mt-4 pt-3 border-t border-border-default text-xs text-text-muted flex gap-4">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> יצירה: {fmt(stats.byDecision.create_company)}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" /> מיזוג: {fmt(stats.byDecision.merge_company)}</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> כללי: {fmt(stats.byDecision.map_generic)}</span>
                    </div>
                </div>

                {/* Status breakdown */}
                <div className="bg-white border border-border-default rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-text-default mb-4">סטטוס טיפול</h3>
                    <div className="space-y-3">
                        <BarSection label="אושרו" value={stats.byStatus.approved} total={stats.total} color="bg-emerald-400" labelColor="text-emerald-700" />
                        <BarSection label="בבדיקה" value={stats.byStatus.pending_review} total={stats.total} color="bg-amber-400" labelColor="text-amber-700" />
                        <BarSection label="תור ידני" value={stats.byStatus.manual} total={stats.total} color="bg-rose-400" labelColor="text-rose-700" />
                        <BarSection label="שונו" value={stats.byStatus.changed} total={stats.total} color="bg-slate-400" labelColor="text-slate-700" />
                    </div>
                </div>
            </div>

            

            {/* ── Recent activity feed ──────────────────────────────────── */}
            <div className="bg-white border border-border-default rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-border-default flex items-center justify-between">
                    <h3 className="text-sm font-bold text-text-default">פעילות אחרונה (10 אחרונות)</h3>
                    <span className="text-xs text-text-muted">ניתן לבטל החלטות שנמצאות בסטטוס "אושר"</span>
                </div>
                {stats.recentActivity.length === 0 ? (
                    <div className="py-12 text-center text-text-muted text-sm">אין פעילות עדיין</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-bg-subtle text-xs text-text-muted">
                            <tr>
                                <th className="text-right font-semibold px-4 py-2.5">תאריך</th>
                                <th className="text-right font-semibold px-4 py-2.5">ביטוי מקורי</th>
                                <th className="text-center font-semibold px-4 py-2.5">החלטה</th>
                                <th className="text-center font-semibold px-4 py-2.5">ביטחון</th>
                                <th className="text-center font-semibold px-4 py-2.5">סטטוס</th>
                                <th className="text-center font-semibold px-4 py-2.5">ביטול</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                            {stats.recentActivity.map((row) => {
                                const hes = getHesitationBand(row.hesitationLevel);
                                const dec = getDecisionConfig(row.aiDecision);
                                const st  = getStatusConfig(row.reviewStatus);
                                return (
                                    <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                                        <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{fmtTime(row.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-semibold text-text-default">{row.originalTerm}</span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1 border text-xs font-bold px-2.5 py-0.5 rounded-full ${dec.bg} ${dec.color}`}>
                                                {dec.icon}
                                                {dec.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${hes.bg} ${hes.color}`}>
                                                {hes.label}: {hes.confidence}%
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${st.color}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                                                {st.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {row.reviewStatus !== 'pending_review' ? (
                                                <button
                                                    onClick={() => handleUndo(row.id)}
                                                    disabled={undoingId === row.id}
                                                    title="בטל החלטה — החזר למצב ממתין לבדיקה"
                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
                                                >
                                                    <IconUndo className="w-3.5 h-3.5" />
                                                    {undoingId === row.id ? 'מבטל...' : 'בטל'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-text-subtle">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

        
        </div>
    );
};

export default AdminCompanyAgentDashboard;
