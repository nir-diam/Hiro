import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    MagnifyingGlassIcon, XMarkIcon, ArrowPathIcon, ExclamationTriangleIcon,
    InformationCircleIcon, BoltIcon, EyeIcon, ChevronLeftIcon, ChevronRightIcon,
    ClipboardDocumentListIcon, CodeBracketIcon, TrashIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon,
} from './Icons';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import Drawer from './Drawer';
import {
    AppLogEntry,
    AppLogLevel,
    AppLogStats,
    deleteAppLog,
    fetchAppLogSources,
    fetchAppLogStats,
    fetchAppLogs,
} from '../services/logsApi';

const PAGE_SIZE = 25;

const LevelBadge: React.FC<{ level: AppLogLevel }> = ({ level }) => {
    const styles: Record<AppLogLevel, string> = {
        debug: 'bg-slate-50 text-slate-600 border-slate-200',
        info: 'bg-blue-50 text-blue-700 border-blue-200',
        warn: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        error: 'bg-red-50 text-red-700 border-red-200',
        fatal: 'bg-red-100 text-red-900 border-red-300 font-black',
    };
    const icons: Record<AppLogLevel, React.ReactNode> = {
        debug: <CodeBracketIcon className="w-3.5 h-3.5" />,
        info: <InformationCircleIcon className="w-3.5 h-3.5" />,
        warn: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
        error: <XMarkIcon className="w-3.5 h-3.5" />,
        fatal: <BoltIcon className="w-3.5 h-3.5" />,
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] border uppercase tracking-wide ${styles[level]}`}>
            {icons[level]}
            {level}
        </span>
    );
};

const formatJsonBlock = (value: unknown) => {
    if (value == null) return '—';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
};

const resolveLogInput = (ctx: Record<string, unknown>) =>
    ctx.inputJson ?? ctx.input ?? null;

const resolveLogOutput = (ctx: Record<string, unknown>) =>
    ctx.outputJson ?? ctx.output ?? ctx.outputRaw ?? null;

const previewJson = (value: unknown, max = 80): string => {
    if (value == null) return '—';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length <= max ? text : `${text.slice(0, max)}…`;
};

const LOG_DRAWER_WIDTHS = ['max-w-md', 'max-w-2xl', 'max-w-4xl'] as const;

const LogDetailDrawer: React.FC<{ log: AppLogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
    const [widthIdx, setWidthIdx] = useState(0);

    useEffect(() => {
        if (log) setWidthIdx(0);
    }, [log?.id]);

    if (!log) return null;

    const ctx = (log.context && typeof log.context === 'object') ? log.context as Record<string, unknown> : {};
    const input = resolveLogInput(ctx);
    const output = resolveLogOutput(ctx);
    const isWidest = widthIdx >= LOG_DRAWER_WIDTHS.length - 1;

    return (
        <Drawer
            isOpen={!!log}
            onClose={onClose}
            title="פרטי לוג"
            maxWidthClass={LOG_DRAWER_WIDTHS[widthIdx]}
            headerActions={(
                <button
                    type="button"
                    onClick={() => setWidthIdx((i) => (i + 1) % LOG_DRAWER_WIDTHS.length)}
                    className="p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-primary-600"
                    title={isWidest ? 'צמצם מגירה' : 'הרחב מגירה'}
                    aria-label={isWidest ? 'צמצם מגירה' : 'הרחב מגירה'}
                >
                    {isWidest ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-5 h-5" />}
                </button>
            )}
            footer={<button onClick={onClose} className="w-full bg-bg-subtle hover:bg-bg-hover text-text-default py-2 rounded-lg font-bold">סגור</button>}
        >
            <div className="space-y-6">
                <div className="bg-bg-subtle p-4 rounded-xl border border-border-default space-y-3">
                    <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-col min-w-0">
                            <span className="text-xs font-mono text-text-muted break-all">{log.id}</span>
                            <h3 className="font-bold text-lg text-text-default break-words">{log.message}</h3>
                        </div>
                        <LevelBadge level={log.level} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-text-muted">זמן</span>
                            <span className="font-mono">{new Date(log.timestamp).toLocaleString('he-IL')}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-text-muted">מקור</span>
                            <span className="font-mono text-primary-700">{log.source}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-text-muted">משתמש</span>
                            <span>{log.userEmail || '—'}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-text-muted">Request ID</span>
                            <span className="font-mono text-xs break-all">{log.requestId || '—'}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <h4 className="font-bold text-sm text-text-default mb-2">Input</h4>
                    <pre className="bg-[#1e1e1e] text-blue-300 text-xs p-4 rounded-xl overflow-x-auto font-mono leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                        {formatJsonBlock(input)}
                    </pre>
                </div>

                <div>
                    <h4 className="font-bold text-sm text-text-default mb-2">Output</h4>
                    <pre className="bg-[#1e1e1e] text-green-400 text-xs p-4 rounded-xl overflow-x-auto font-mono leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap">
                        {formatJsonBlock(typeof ctx.error === 'string' && output == null ? { error: ctx.error } : output)}
                    </pre>
                </div>

                {log.stackTrace ? (
                    <div>
                        <h4 className="font-bold text-sm text-text-default mb-2">Stack trace</h4>
                        <pre className="bg-[#1e1e1e] text-red-300 text-xs p-4 rounded-xl overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap">
                            {log.stackTrace}
                        </pre>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
};

const AdminLogsView: React.FC = () => {
    const [logs, setLogs] = useState<AppLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<AppLogStats>({ logsToday: 0, errors24h: 0, activeSources: 0 });
    const [sources, setSources] = useState<string[]>([]);
    const [selectedLog, setSelectedLog] = useState<AppLogEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchDebounced, setSearchDebounced] = useState('');
    const [levelFilter, setLevelFilter] = useState('all');
    const [sourceFilter, setSourceFilter] = useState('all');
    const [dateRange, setDateRange] = useState<DateRange | null>(null);
    const [isLive, setIsLive] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const getToken = useCallback(
        () => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null),
        [],
    );
    const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const t = setTimeout(() => setSearchDebounced(searchTerm.trim()), 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchDebounced, levelFilter, sourceFilter, dateRange]);

    const queryParams = useMemo(() => ({
        page: currentPage,
        pageSize: PAGE_SIZE,
        search: searchDebounced || undefined,
        level: levelFilter,
        source: sourceFilter,
        from: dateRange?.from || undefined,
        to: dateRange?.to || undefined,
    }), [currentPage, searchDebounced, levelFilter, sourceFilter, dateRange]);

    const loadLogs = useCallback(async (silent = false) => {
        if (!apiBase) {
            setListError('חסרה הגדרת שרת (VITE_API_BASE).');
            setLoading(false);
            setLogs([]);
            setTotal(0);
            return;
        }
        if (!silent) setLoading(true);
        setListError(null);
        try {
            const result = await fetchAppLogs(apiBase, getToken(), queryParams);
            setLogs(result.items);
            setTotal(result.total);
        } catch (e: unknown) {
            setLogs([]);
            setTotal(0);
            setListError(e instanceof Error ? e.message : 'שגיאה בטעינה');
        } finally {
            if (!silent) setLoading(false);
        }
    }, [apiBase, getToken, queryParams]);

    const loadMeta = useCallback(async () => {
        if (!apiBase) return;
        try {
            const [s, src] = await Promise.all([
                fetchAppLogStats(apiBase, getToken()),
                fetchAppLogSources(apiBase, getToken()),
            ]);
            setStats(s);
            setSources(src);
        } catch {
            // best-effort
        }
    }, [apiBase, getToken]);

    useEffect(() => { void loadLogs(); }, [loadLogs]);
    useEffect(() => { void loadMeta(); }, [loadMeta, total]);

    useEffect(() => {
        if (liveTimerRef.current) clearInterval(liveTimerRef.current);
        if (isLive) {
            liveTimerRef.current = setInterval(() => {
                void loadLogs(true);
                void loadMeta();
            }, 5000);
        }
        return () => {
            if (liveTimerRef.current) clearInterval(liveTimerRef.current);
        };
    }, [isLive, loadLogs, loadMeta]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleDelete = async (id: string) => {
        if (!window.confirm('למחוק רשומת לוג זו?')) return;
        setDeletingId(id);
        try {
            await deleteAppLog(apiBase, getToken(), id);
            if (selectedLog?.id === id) setSelectedLog(null);
            await loadLogs(true);
            await loadMeta();
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : 'מחיקה נכשלה');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                        <ClipboardDocumentListIcon className="w-8 h-8 text-primary-600" />
                        לוגים
                    </h1>
                    <p className="text-sm text-text-muted">לוגים טכניים של המערכת — שגיאות, אזהרות ואירועי רקע.</p>
                </div>
                <div className="flex gap-3 items-center">
                    <button
                        onClick={() => { void loadLogs(); void loadMeta(); }}
                        className="p-2 bg-bg-subtle hover:bg-bg-hover text-text-default rounded-lg transition border border-border-default"
                        title="רענן"
                    >
                        <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={() => setIsLive(!isLive)}
                        className={`px-3 py-2 rounded-lg font-bold text-sm transition ${isLive ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-primary-600 text-white shadow-md hover:bg-primary-700'}`}
                    >
                        {isLive ? 'עצור חי' : 'מצב חי'}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-bg-card p-3 rounded-xl border border-border-default shadow-sm flex items-center justify-between">
                    <span className="text-xs font-bold text-text-muted uppercase">לוגים היום</span>
                    <span className="text-xl font-black text-text-default">{stats.logsToday}</span>
                </div>
                <div className="bg-red-50 p-3 rounded-xl border border-red-100 shadow-sm flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800 uppercase">שגיאות (24h)</span>
                    <span className="text-xl font-black text-red-700">{stats.errors24h}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-800 uppercase">מקורות פעילים</span>
                    <span className="text-xl font-black text-blue-700">{stats.activeSources}</span>
                </div>
            </div>

            <div className="bg-bg-card p-3 rounded-xl border border-border-default shadow-sm flex flex-col md:flex-row gap-3 items-center">
                <div className="relative flex-grow w-full md:w-auto">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="חפש לפי הודעה, מקור, אימייל או ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                </div>
                <select
                    value={levelFilter}
                    onChange={(e) => setLevelFilter(e.target.value)}
                    className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm min-w-[120px]"
                >
                    <option value="all">כל הרמות</option>
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                    <option value="fatal">fatal</option>
                </select>
                <select
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                    className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm min-w-[140px]"
                >
                    <option value="all">כל המקורות</option>
                    {sources.map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <DateRangeSelector value={dateRange} onChange={setDateRange} />
            </div>

            {listError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{listError}</div>
            ) : null}

            <div className="bg-bg-card border border-border-default rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-bg-subtle text-xs text-text-muted uppercase tracking-wide">
                            <tr>
                                <th className="p-3 text-right font-bold">זמן</th>
                                <th className="p-3 text-right font-bold">רמה</th>
                                <th className="p-3 text-right font-bold">מקור</th>
                                <th className="p-3 text-right font-bold">Input</th>
                                <th className="p-3 text-right font-bold">Output</th>
                                <th className="p-3 text-center font-bold w-24">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                            {loading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-muted">טוען...</td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-text-muted">אין לוגים להצגה</td>
                                </tr>
                            ) : (
                                logs.map((log) => {
                                    const ctx = (log.context && typeof log.context === 'object')
                                        ? log.context as Record<string, unknown>
                                        : {};
                                    const input = resolveLogInput(ctx);
                                    const output = resolveLogOutput(ctx);
                                    return (
                                    <tr key={log.id} className="hover:bg-bg-subtle/60 transition-colors">
                                        <td className="p-3 font-mono text-xs whitespace-nowrap text-text-muted">
                                            {new Date(log.timestamp).toLocaleString('he-IL')}
                                        </td>
                                        <td className="p-3"><LevelBadge level={log.level} /></td>
                                        <td className="p-3 font-mono text-xs text-primary-700">{log.source}</td>
                                        <td className="p-3 max-w-xs">
                                            <span className="line-clamp-2 break-all font-mono text-xs text-blue-700">
                                                {previewJson(input)}
                                            </span>
                                        </td>
                                        <td className="p-3 max-w-xs">
                                            <span className={`line-clamp-2 break-all font-mono text-xs ${output != null ? 'text-green-700' : 'text-text-muted'}`}>
                                                {previewJson(output)}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => setSelectedLog(log)}
                                                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-primary-600"
                                                    title="פרטים"
                                                >
                                                    <EyeIcon className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => void handleDelete(log.id)}
                                                    disabled={deletingId === log.id}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 text-text-muted hover:text-red-600 disabled:opacity-50"
                                                    title="מחק"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-border-default bg-bg-subtle/40">
                    <span className="text-xs text-text-muted">
                        {total} רשומות · עמוד {currentPage} מתוך {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            disabled={currentPage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            className="p-2 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover"
                        >
                            <ChevronRightIcon className="w-4 h-4" />
                        </button>
                        <button
                            disabled={currentPage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            className="p-2 rounded-lg border border-border-default disabled:opacity-40 hover:bg-bg-hover"
                        >
                            <ChevronLeftIcon className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default AdminLogsView;
