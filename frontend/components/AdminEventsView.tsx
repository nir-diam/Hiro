
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    MagnifyingGlassIcon, FunnelIcon, XMarkIcon, CalendarDaysIcon, 
    ArrowPathIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon,
    TrashIcon, UserIcon, GlobeAmericasIcon, ComputerDesktopIcon, ClockIcon,
    ChevronDownIcon, ChevronUpIcon, DocumentTextIcon, CodeBracketIcon,
    BoltIcon, ShieldCheckIcon, EyeIcon, ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon
} from './Icons';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import Drawer from './Drawer';

// --- TYPES ---
type LogLevel = 'info' | 'warning' | 'error' | 'critical';
type ActionType = 'create' | 'update' | 'delete' | 'login' | 'export' | 'system';

interface LogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    action: ActionType;
    description: string;
    user: {
        name: string;
        email: string;
        role: string;
        ip: string;
        avatar?: string;
    };
    entity?: {
        type: string;
        id: string;
        name: string;
    };
    metadata: {
        browser?: string;
        os?: string;
        duration?: number; // ms
        statusCode?: number;
    };
    changes?: {
        field: string;
        oldValue: any;
        newValue: any;
    }[];
}

// --- MOCK DATA GENERATOR ---
const generateLogs = (count: number): LogEntry[] => {
    const actions: ActionType[] = ['create', 'update', 'delete', 'login', 'export', 'system'];
    const levels: LogLevel[] = ['info', 'info', 'info', 'warning', 'error'];
    const users = [
       
    ];
    
    return Array.from({ length: count }).map((_, i) => {
        const user = users[Math.floor(Math.random() * users.length)];
        const action = actions[Math.floor(Math.random() * actions.length)];
        const level = action === 'system' ? 'error' : levels[Math.floor(Math.random() * levels.length)];
        const time = new Date(Date.now() - Math.floor(Math.random() * 1000000000)).toISOString();
        
        return {
            id: `LOG-${Math.floor(Math.random() * 1000000)}`,
            timestamp: time,
            level,
            action,
            description: getMockDescription(action),
            user: { ...user, ip: `192.168.1.${Math.floor(Math.random() * 255)}` },
            entity: Math.random() > 0.3 ? { type: 'Candidate', id: String(Math.floor(Math.random()*500)), name: 'מועמד בדיקה' } : undefined,
            metadata: {
                browser: 'Chrome 120.0',
                os: 'Windows 11',
                duration: Math.floor(Math.random() * 500),
                statusCode: level === 'error' ? 500 : 200
            },
            changes: action === 'update' ? [
                { field: 'status', oldValue: 'New', newValue: 'Interview' },
                { field: 'rating', oldValue: 3, newValue: 4 }
            ] : undefined
        };
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

const getMockDescription = (action: ActionType) => {
    switch(action) {
        case 'login': return 'התחברות למערכת הצליחה';
        case 'create': return 'יצירת רשומת מועמד חדשה';
        case 'update': return 'עדכון פרטי משרה';
        case 'delete': return 'מחיקת מסמך קורות חיים';
        case 'export': return 'ייצוא דוח מועמדים לאקסל';
        case 'system': return 'כשל בסנכרון מול שרת המיילים';
        default: return 'פעולה כללית במערכת';
    }
};

// --- COMPONENTS ---

const StatusBadge: React.FC<{ level: LogLevel }> = ({ level }) => {
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

const ActionBadge: React.FC<{ action: ActionType }> = ({ action }) => {
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

const LogDetailDrawer: React.FC<{ log: LogEntry | null; onClose: () => void }> = ({ log, onClose }) => {
    if (!log) return null;

    return (
        <Drawer 
            isOpen={!!log} 
            onClose={onClose} 
            title="פרטי אירוע (Event Details)" 
            footer={<button onClick={onClose} className="w-full bg-bg-subtle hover:bg-bg-hover text-text-default py-2 rounded-lg font-bold">סגור</button>}
        >
            <div className="space-y-6">
                
                {/* Header Summary */}
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
                                <div className="w-5 h-5 rounded-full bg-primary-100 flex items-center justify-center text-[10px] font-bold text-primary-700">{log.user.avatar}</div>
                                <span>{log.user.name}</span>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Diff View / Changes */}
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
                                            <td className="p-2 text-red-600 bg-red-50/30 line-through decoration-red-300">{String(change.oldValue)}</td>
                                            <td className="p-2 text-green-600 bg-green-50/30 font-semibold">{String(change.newValue)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Technical Metadata */}
                <div>
                    <h4 className="font-bold text-sm text-text-default mb-3 flex items-center gap-2">
                        <CodeBracketIcon className="w-4 h-4"/> מטא-דאטה טכני
                    </h4>
                    <div className="bg-[#1e1e1e] p-4 rounded-xl border border-gray-700 overflow-x-auto">
                        <pre className="text-xs font-mono text-green-400 leading-relaxed">
{JSON.stringify({
    ip: log.user.ip,
    userAgent: log.metadata.browser,
    os: log.metadata.os,
    latency: `${log.metadata.duration}ms`,
    status: log.metadata.statusCode,
    entity: log.entity
}, null, 2)}
                        </pre>
                    </div>
                </div>

            </div>
        </Drawer>
    );
};

const AdminEventsView: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [levelFilter, setLevelFilter] = useState<string>('all');
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [dateRange, setDateRange] = useState<DateRange | null>(null);
    const [isLive, setIsLive] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    // Initial Load
    useEffect(() => {
        setLogs(generateLogs(350)); // Load more initial logs for testing pagination
    }, []);

    // Live Mode Simulation
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isLive) {
            interval = setInterval(() => {
                const newLog = generateLogs(1)[0];
                newLog.timestamp = new Date().toISOString(); // Real time
                setLogs(prev => [newLog, ...prev]);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [isLive]);

    // Derived Filtered Logs
    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = 
                log.description.includes(searchTerm) || 
                log.user.name.includes(searchTerm) || 
                log.id.includes(searchTerm) ||
                log.user.ip.includes(searchTerm);
            
            const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
            const matchesAction = actionFilter === 'all' || log.action === actionFilter;
            
            let matchesDate = true;
            if (dateRange) {
                const logDate = new Date(log.timestamp);
                const from = new Date(dateRange.from);
                const to = new Date(dateRange.to);
                to.setHours(23, 59, 59);
                matchesDate = logDate >= from && logDate <= to;
            }

            return matchesSearch && matchesLevel && matchesAction && matchesDate;
        });
    }, [logs, searchTerm, levelFilter, actionFilter, dateRange]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
    const displayedLogs = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(start, start + itemsPerPage);
    }, [filteredLogs, currentPage]);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, levelFilter, actionFilter, dateRange]);

    // Handlers
    const handleRefresh = () => {
        // Simulate fetch
        const newLogs = generateLogs(5);
        newLogs.forEach(l => l.timestamp = new Date().toISOString());
        setLogs(prev => [...newLogs, ...prev]);
    };

    const handleExport = () => {
        if (filteredLogs.length === 0) {
            alert('אין נתונים לייצוא');
            return;
        }

        const headers = ['ID', 'Timestamp', 'Level', 'Action', 'User', 'Description', 'IP'];
        const rows = filteredLogs.map(log => [
            log.id,
            new Date(log.timestamp).toLocaleString(),
            log.level,
            log.action,
            log.user.name,
            `"${log.description}"`, // Escape commas
            log.user.ip
        ]);

        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
            + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
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
                        <ArrowPathIcon className="w-5 h-5"/>
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
                     <span className="text-xl font-black text-text-default">{logs.filter(l => new Date(l.timestamp).getDate() === new Date().getDate()).length}</span>
                 </div>
                 <div className="bg-red-50 p-3 rounded-xl border border-red-100 shadow-sm flex items-center justify-between">
                     <span className="text-xs font-bold text-red-800 uppercase">שגיאות (24h)</span>
                     <span className="text-xl font-black text-red-700">{logs.filter(l => l.level === 'error').length}</span>
                 </div>
                 <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 shadow-sm flex items-center justify-between">
                     <span className="text-xs font-bold text-blue-800 uppercase">משתמשים פעילים</span>
                     <span className="text-xl font-black text-blue-700">{new Set(logs.map(l => l.user.email)).size}</span>
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
                            {displayedLogs.length > 0 ? displayedLogs.map(log => (
                                <tr key={log.id} className="hover:bg-bg-hover transition-colors group cursor-pointer" onClick={() => setSelectedLog(log)}>
                                    <td className="p-4"><StatusBadge level={log.level} /></td>
                                    <td className="p-4 text-text-subtle">{new Date(log.timestamp).toLocaleString('he-IL')}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-bg-subtle flex items-center justify-center border border-border-default text-[10px]">
                                                {log.user.avatar}
                                            </div>
                                            <span className="truncate max-w-[100px] text-text-default font-sans font-semibold">{log.user.name}</span>
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
                                    <td className="p-4 text-text-subtle">{log.user.ip}</td>
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
                        <span>מציג {displayedLogs.length} מתוך {filteredLogs.length} אירועים</span>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ChevronRightIcon className="w-4 h-4" />
                            </button>
                            <span className="font-mono">עמוד {currentPage} מתוך {totalPages}</span>
                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
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
