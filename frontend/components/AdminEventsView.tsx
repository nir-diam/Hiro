import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    MagnifyingGlassIcon, XMarkIcon,
    ArrowPathIcon, ExclamationTriangleIcon, InformationCircleIcon,
    CodeBracketIcon, BoltIcon, ShieldCheckIcon, EyeIcon, ArrowDownTrayIcon,
    ChevronLeftIcon, ChevronRightIcon
} from './Icons';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import Drawer from './Drawer';
import {
    AuditLogAction,
    AuditLogEntry,
    AuditLogLevel,
    AuditLogStats,
    fetchAuditLogStats,
    fetchAuditLogs,
} from '../services/auditLogsApi';

const PAGE_SIZE = 20;

// --- COMPONENTS ---

const StatusBadge: React.FC<{ level: AuditLogLevel }> = ({ level }) => {
    const styles = {
        info: 'bg-blue-50 text-blue-700 border-blue-200',
        warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        error: 'bg-red-50 text-red-700 border-red-200',
        critical: 'bg-red-100 text-red-900 border-red-300 font-black',
    };
    const icons = {
        info: <InformationCircleIcon className="w-3.5 h-3.5"/>,
        warning: <ExclamationTriangleIcon className="w-3.5 h-3.5"/>,
        error: <XMarkIcon className="w-3.5 h-3.5"/>,
        critical: <BoltIcon className="w-3.5 h-3.5"/>,
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] border uppercase tracking-wide ${styles[level]}`}>
            {icons[level]}
            {level}
        </span>
    );
};

const ActionBadge: React.FC<{ action: AuditLogAction }> = ({ action }) => {
    const styles: Record<string, string> = {
        create: 'text-green-600 bg-green-50',
        update: 'text-blue-600 bg-blue-50',
        delete: 'text-red-600 bg-red-50',
        login: 'text-purple-600 bg-purple-50',
        export: 'text-gray-600 bg-gray-50',
        system: 'text-orange-600 bg-orange-50',
    };
    return <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${styles[action]}`}>{action.toUpperCase()}</span>;
};

const LogDetailDrawer: React.FC<{ log: AuditLogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
    if (!log) return null;

    return (
        <Drawer
            isOpen={!!log}
            onClose={onClose}
            title="פרטי אירוע (Event Details)"
            footer={<button onClick={onClose} className="w-full bg-bg-subtle hover:bg-bg-hover text-text-default py-2 rounded-lg font-bold">סגור</button>}
        >
            <div className="space-y-6">
                <div className="bg-bg-subtle p-4 rounded-xl border border-border-default space-y-3">
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                             <span className="text-xs font-mono text-text-muted">{log.id}</span>
                             <h3 className="font-bold text-lg text-text-default">{log.description}</h3>
                        </div>
                        <StatusBadge level={log.level} />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="block text-xs text-text-muted">זמן ביצוע</span>
                            <span className="font-mono">{new Date(log.timestamp).toLocaleString('he-IL')}</span>
                        </div>
                        <div>
                             <span className="block text-xs text-text-muted">משתמש</span>
                             <div className="flex items-center gap-2">
                                {log.user.avatar ? (
                                    <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">{log.user.avatar}</div>
                                ) : null}
                                <span>{log.user.name || log.user.email || '—'}</span>
                             </div>
                        </div>
                    </div>
                </div>

                {log.changes && log.changes.length > 0 && (
                    <div>
                        <h4 className="font-bold text-sm text-text-default mb-3 flex items-center gap-2">
                            <ArrowPathIcon className="w-4 h-4"/> שינויים שבוצעו
                        </h4>
                        <div className="border border-border-default rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-bg-subtle text-xs text-text-muted">
                                    <tr>
                                        <th className="p-2 text-right">שדה</th>
                                        <th className="p-2 text-right">ערך ישן</th>
                                        <th className="p-2 text-right">ערך חדש</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-default">
                                    {log.changes.map((change, i) => (
                                        <tr key={i} className="bg-white">
                                            <td className="p-2 font-mono text-xs">{change.field}</td>
                                            <td className="p-2 text-red-600 bg-red-50/30 line-through decoration-red-300">{String(change.oldValue ?? '')}</td>
                                            <td className="p-2 text-green-600 bg-green-50/30 font-semibold">{String(change.newValue ?? '')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div>
                    <h4 className="font-bold text-sm text-text-default mb-3 flex items-center gap-2">
                        <CodeBracketIcon className="w-4 h-4"/> מטא-דאטה טכני
                    </h4>
                    <div className="bg-[#1e1e1e] p-4 rounded-xl border border-gray-700 overflow-x-auto">
                        <pre className="text-xs font-mono text-green-400 leading-relaxed">
{JSON.stringify({
    ip: log.user.ip || null,
    userAgent: log.metadata?.userAgent || log.metadata?.browser || null,
    os: log.metadata?.os || null,
    latency: log.metadata?.duration != null ? `${log.metadata.duration}ms` : null,
    status: log.metadata?.statusCode ?? null,
    entity: log.entity || null,
    metadata: log.metadata || {},
}, null, 2)}
                        </pre>
                    </div>
                </div>
            </div>
        </Drawer>
    );
};

const AdminEventsView: React.FC = () => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [stats, setStats] = useState<AuditLogStats>({ eventsToday: 0, errors24h: 0, activeUsers: 0 });
    const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [searchTermDebounced, setSearchTermDebounced] = useState('');
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | null>(null);
    const [isLive, setIsLive] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const getToken = useCallback(
        () => (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null),
        [],
    );
    const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Debounce free-text search
    useEffect(() => {
        const t = setTimeout(() => setSearchTermDebounced(searchTerm.trim()), 350);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // Reset to page 1 whenever a filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTermDebounced, levelFilter, actionFilter, dateRange]);

    const queryParams = useMemo(() => ({
        page: currentPage,
        pageSize: PAGE_SIZE,
        search: searchTermDebounced || undefined,
        level: levelFilter,
        action: actionFilter,
        from: dateRange?.from || undefined,
        to: dateRange?.to || undefined,
    }), [currentPage, searchTermDebounced, levelFilter, actionFilter, dateRange]);

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
            const result = await fetchAuditLogs(apiBase, getToken(), queryParams);
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

    const loadStats = useCallback(async () => {
        if (!apiBase) return;
        try {
            const s = await fetchAuditLogStats(apiBase, getToken());
            setStats(s);
        } catch {
            // stats are best-effort; ignore
        }
    }, [apiBase, getToken]);

    useEffect(() => {
        void loadLogs();
    }, [loadLogs]);

    useEffect(() => {
        void loadStats();
    }, [loadStats, total]);

    // Live polling
    useEffect(() => {
        if (liveTimerRef.current) {
            clearInterval(liveTimerRef.current);
            liveTimerRef.current = null;
        }
        if (isLive) {
            liveTimerRef.current = setInterval(() => {
                void loadLogs(true);
                void loadStats();
            }, 5000);
        }
        return () => {
            if (liveTimerRef.current) clearInterval(liveTimerRef.current);
        };
    }, [isLive, loadLogs, loadStats]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleRefresh = () => {
        void loadLogs();
        void loadStats();
    };

    const handleExport = () => {
        if (logs.length === 0) {
            alert('אין נתונים לייצוא');
            return;
        }
        const headers = ['ID', 'Timestamp', 'Level', 'Action', 'User', 'Email', 'Description', 'IP', 'Entity'];
        const rows = logs.map(log => [
            log.id,
            new Date(log.timestamp).toLocaleString(),
            log.level,
            log.action,
            log.user.name || '',
            log.user.email || '',
            `"${(log.description || '').replace(/"/g, '""')}"`,
            log.user.ip || '',
            log.entity ? `${log.entity.type}:${log.entity.id}` : '',
        ]);
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
            + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `system_logs_${new Date().toISOString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Header & Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h1 className="text-2xl font-black text-text-default flex items-center gap-2">
                        <ShieldCheckIcon className="w-8 h-8 text-primary-600"/>
                        יומן אירועים ומערכת
                    </h1>
                    <p className="text-sm text-text-muted">תיעוד מלא של כל הפעולות, השגיאות והשינויים במערכת (Audit Log).</p>
                </div>

                <div className="flex gap-3 items-center">
                     <button
                        onClick={handleRefresh}
                        className="p-2 bg-bg-subtle hover:bg-bg-hover text-text-default rounded-lg transition border border-border-default"
                        title="רענן נתונים"
                    >
                        <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}/>
                    </button>

                     <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold transition-all ${isLive ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-bg-subtle text-text-muted border-border-default'}`}>
                        <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-red-600' : 'bg-gray-400'}`}></div>
                        {isLive ? 'LIVE RECORDING' : 'PAUSED'}
                    </div>

                    <button
                        onClick={() => setIsLive(!isLive)}
                        className={`p-2 rounded-lg font-bold text-sm transition ${isLive ? 'bg-bg-subtle text-text-default hover:bg-bg-hover' : 'bg-primary-600 text-white shadow-md hover:bg-primary-700'}`}
                    >
                        {isLive ? 'עצור עדכון חי' : 'הפעל מצב חי'}
                    </button>
                </div>
            </div>

            {/* Quick Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                 <div className="bg-bg-card p-3 rounded-xl border border-border-default shadow-sm flex items-center justify-between">
                     <span className="text-xs font-bold text-text-muted uppercase">אירועים היום</span>
                     <span className="text-xl font-black text-text-default">{stats.eventsToday}</span>
                 </div>
                 <div className="bg-red-50 p-3 rounded-xl border border-red-100 shadow-sm flex items-center justify-between">
                     <span className="text-xs font-bold text-red-800 uppercase">שגיאות (24h)</span>
                     <span className="text-xl font-black text-red-700">{stats.errors24h}</span>
                 </div>
                 <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
                     <span className="text-xs font-bold text-blue-800 uppercase">משתמשים פעילים</span>
                     <span className="text-xl font-black text-blue-700">{stats.activeUsers}</span>
                 </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-bg-card p-3 rounded-xl border border-border-default shadow-sm flex flex-col md:flex-row gap-3 items-center z-10">
                <div className="relative flex-grow w-full md:w-auto">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="חפש לפי תיאור, ID, IP או משתמש..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 font-mono"
                    />
                </div>

                <div className="flex gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
                    <select
                        value={levelFilter}
                        onChange={(e) => setLevelFilter(e.target.value)}
                        className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 min-w-[120px]"
                    >
                        <option value="all">כל הרמות</option>
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="error">Error</option>
                        <option value="critical">Critical</option>
                    </select>

                    <select
                        value={actionFilter}
                        onChange={(e) => setActionFilter(e.target.value)}
                        className="bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-primary-500 min-w-[120px]"
                    >
                        <option value="all">כל הפעולות</option>
                        <option value="login">Login</option>
                        <option value="create">Create</option>
                        <option value="update">Update</option>
                        <option value="delete">Delete</option>
                        <option value="export">Export</option>
                        <option value="system">System</option>
                    </select>

                    <div className="w-[180px] flex-shrink-0">
                        <DateRangeSelector value={dateRange} onChange={setDateRange} placeholder="כל הזמנים" />
                    </div>

                    <button
                        onClick={handleExport}
                        className="p-2 bg-white border border-border-default text-text-muted hover:text-primary-600 hover:border-primary-300 rounded-lg transition flex items-center gap-2 text-sm font-semibold whitespace-nowrap"
                        title="ייצוא לאקסל (CSV)"
                    >
                        <ArrowDownTrayIcon className="w-5 h-5"/>
                        <span className="hidden xl:inline">ייצוא</span>
                    </button>
                </div>
            </div>

            {listError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {listError}
                </div>
            )}

            {/* Log Table */}
            <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1 custom-scrollbar relative">
                    <table className="w-full text-sm text-right min-w-[1000px]">
                        <thead className="bg-bg-subtle/50 text-text-muted font-bold text-xs uppercase sticky top-0 z-10 backdrop-blur-sm border-b border-border-default shadow-sm">
                            <tr>
                                <th className="p-4 w-32">חומרה</th>
                                <th className="p-4 w-48">זמן</th>
                                <th className="p-4 w-40">משתמש</th>
                                <th className="p-4 w-32">סוג פעולה</th>
                                <th className="p-4">תיאור האירוע</th>
                                <th className="p-4 w-40">ישות מקושרת</th>
                                <th className="p-4 w-32">IP Address</th>
                                <th className="p-4 w-20 text-center">פרטים</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle font-mono text-xs">
                            {loading && logs.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-10 text-center text-sm text-text-muted">
                                        טוען נתונים…
                                    </td>
                                </tr>
                            ) : logs.length > 0 ? logs.map(log => (
                                <tr key={log.id} className="hover:bg-bg-hover transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                                    <td className="p-4"><StatusBadge level={log.level} /></td>
                                    <td className="p-4 text-text-subtle">{new Date(log.timestamp).toLocaleString('he-IL')}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-bg-subtle flex items-center justify-center border border-border-default text-[10px]">
                                                {log.user.avatar || (log.user.name || '?').slice(0, 2).toUpperCase()}
                                            </div>
                                            <span className="truncate max-w-[100px] text-text-default font-sans font-semibold">{log.user.name || log.user.email || '—'}</span>
                                        </div>
                                    </td>
                                    <td className="p-4"><ActionBadge action={log.action} /></td>
                                    <td className="p-4 font-sans text-text-default font-medium truncate max-w-xs" title={log.description}>{log.description}</td>
                                    <td className="p-4">
                                        {log.entity ? (
                                            <span className="bg-bg-subtle px-2 py-0.5 rounded text-primary-600 border border-border-default">
                                                {log.entity.type}: {log.entity.id}
                                            </span>
                                        ) : <span className="text-text-subtle">-</span>}
                                    </td>
                                    <td className="p-4 text-text-subtle">{log.user.ip || '-'}</td>
                                    <td className="p-4 text-center">
                                        <button className="p-1.5 rounded-md hover:bg-white text-text-muted hover:text-primary-600 transition-colors">
                                            <EyeIcon className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={8} className="p-10 text-center">
                                        <div className="flex flex-col items-center justify-center text-text-muted opacity-60">
                                            <ShieldCheckIcon className="w-12 h-12 mb-3" />
                                            <p className="text-sm font-semibold">לא נמצאו אירועים התואמים את הסינון</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {totalPages > 1 && (
                    <div className="p-3 border-t border-border-default bg-bg-subtle/20 text-xs text-text-muted flex justify-between items-center">
                        <span>מציג {logs.length} מתוך {total} אירועים</span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1 || loading}
                                className="p-1.5 rounded hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ChevronRightIcon className="w-4 h-4" />
                            </button>
                            <span className="font-mono">עמוד {currentPage} מתוך {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages || loading}
                                className="p-1.5 rounded hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ChevronLeftIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
        </div>
    );
};

export default AdminEventsView;
