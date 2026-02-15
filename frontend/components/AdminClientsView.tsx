
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, PencilIcon, FunnelIcon, XMarkIcon, ChartBarIcon } from './Icons';

// --- TYPES ---
interface Client {
  id: string;
  name: string;
  creationDate: string;
  jobsUsed: number;
  jobsTotal: number;
  coordinatorsUsed: number;
  coordinatorsTotal: number;
  smsUsed: number;
  smsTotal: number;
  packageType: 'starter' | 'pro' | 'enterprise';
  isActive: boolean;
}

const UsageCell: React.FC<{ used: number; total: number; warningThreshold?: number }> = ({ used, total, warningThreshold = 0.9 }) => {
    const percentage = total > 0 ? (used / total) : 0;
    const isOver = percentage >= 1;
    const isHigh = percentage >= warningThreshold;

    let textColor = 'text-text-default';
    let bgColor = 'bg-bg-subtle';
    
    if (isOver) {
        textColor = 'text-red-700';
        bgColor = 'bg-red-50';
    } else if (isHigh) {
        textColor = 'text-amber-700';
        bgColor = 'bg-amber-50';
    }
    
    return (
        <div className={`flex items-center gap-2 px-2 py-1 rounded-md ${bgColor}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isOver ? 'bg-red-500' : isHigh ? 'bg-amber-500' : 'bg-green-500'}`}></div>
            <span className={`font-mono font-semibold text-xs ${textColor}`}>{used}/{total}</span>
        </div>
    )
}

const PackageBadge: React.FC<{ type: string }> = ({ type }) => {
    const styles = {
        starter: 'bg-blue-50 text-blue-700 border-blue-200',
        pro: 'bg-purple-50 text-purple-700 border-purple-200',
        enterprise: 'bg-slate-800 text-white border-slate-700'
    };
    // @ts-ignore
    const style = styles[type] || 'bg-gray-100 text-gray-700';
    
    return (
        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${style}`}>
            {type}
        </span>
    );
};

const AdminClientsView: React.FC = () => {
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mapClient = useCallback((c: any): Client => ({
        id: (c.id || '').toString(),
        name: c.name || c.displayName || 'ללא שם',
        creationDate: c.creationDate || c.createdAt || new Date().toISOString(),
        jobsUsed: c.jobsUsed || 0,
        jobsTotal: c.jobsTotal || 0,
        coordinatorsUsed: c.coordinatorsUsed || c.usersUsed || 0,
        coordinatorsTotal: c.coordinatorsTotal || c.usersTotal || 0,
        smsUsed: c.smsUsed || c.smsMonthly || 0,
        smsTotal: c.smsTotal || c.smsBackup || 0,
        packageType: c.packageType || 'starter',
        isActive: typeof c.isActive === 'boolean' ? c.isActive : c.status !== 'לא פעיל',
    }), []);

    const loadClients = useCallback(async () => {
        if (!apiBase) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/clients`);
            if (!res.ok) throw new Error('Failed to load clients');
            const data = await res.json();
            setClients(Array.isArray(data) ? data.map(mapClient) : []);
        } catch (err: any) {
            setError(err.message || 'Load failed');
        } finally {
            setLoading(false);
        }
    }, [apiBase, mapClient]);

    useEffect(() => {
        loadClients();
    }, [loadClients]);
    
    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPackage, setFilterPackage] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [showFilters, setShowFilters] = useState(false);

    const filteredClients = useMemo(() => {
        return clients.filter(client => {
            const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesPackage = filterPackage === 'all' || client.packageType === filterPackage;
            const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? client.isActive : !client.isActive);
            
            return matchesSearch && matchesPackage && matchesStatus;
        });
    }, [clients, searchTerm, filterPackage, filterStatus]);

    const handleStatusToggle = async (clientId: string) => {
        const target = clients.find(c => c.id === clientId);
        if (!target) return;
        const nextActive = !target.isActive;
        setClients(prev => prev.map(client => 
            client.id === clientId ? { ...client, isActive: nextActive } : client
        ));
        try {
            if (!apiBase) return;
            await fetch(`${apiBase}/api/clients/${clientId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: nextActive, status: nextActive ? 'פעיל' : 'לא פעיל' }),
            });
        } catch {
            // ignore revert for now
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">ניהול לקוחות</h1>
                    <p className="text-sm text-text-muted">סה"כ {filteredClients.length} לקוחות במערכת</p>
                    {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                </div>
                <button onClick={() => navigate('/admin/client/new')} className="bg-primary-600 text-white font-bold py-2 px-4 rounded-xl hover:bg-primary-700 transition shadow-md flex items-center gap-2">
                    <PlusIcon className="w-5 h-5"/>
                    <span>לקוח חדש</span>
                </button>
            </div>

            {/* Rich Search & Filter Bar */}
            <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="חיפוש לפי שם לקוח..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-bg-input border border-border-default rounded-xl py-2.5 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 transition-all" 
                        />
                    </div>
                    <button 
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-700' : 'bg-white border-border-default text-text-muted hover:bg-bg-subtle'}`}
                    >
                        <FunnelIcon className="w-4 h-4" />
                        <span>סינון מתקדם</span>
                    </button>
                </div>

                {showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border-subtle animate-fade-in">
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">חבילה</label>
                            <select value={filterPackage} onChange={e => setFilterPackage(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                <option value="all">כל החבילות</option>
                                <option value="starter">Starter</option>
                                <option value="pro">Pro</option>
                                <option value="enterprise">Enterprise</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-text-muted mb-1.5 uppercase">סטטוס</label>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2 text-sm">
                                <option value="all">הכל</option>
                                <option value="active">פעיל</option>
                                <option value="inactive">לא פעיל</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button 
                                onClick={() => { setSearchTerm(''); setFilterPackage('all'); setFilterStatus('all'); }}
                                className="text-sm text-text-muted hover:text-red-500 font-medium px-2 py-2"
                            >
                                נקה סינון
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-bg-card border border-border-default rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[1000px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle border-b border-border-default">
                            <tr>
                                <th className="p-4">שם לקוח</th>
                                <th className="p-4">חבילה</th>
                                <th className="p-4">משרות</th>
                                <th className="p-4">רכזים</th>
                                <th className="p-4">SMS</th>
                                <th className="p-4">הצטרף ב</th>
                                <th className="p-4">סטטוס</th>
                                <th className="p-4 text-center">פעולות</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {filteredClients.map(client => (
                            <tr key={client.id} className="hover:bg-bg-hover group transition-colors">
                                <td className="p-4 font-bold text-text-default">
                                    {client.name}
                                </td>
                                <td className="p-4">
                                    <PackageBadge type={client.packageType} />
                                </td>
                                <td className="p-4">
                                    <UsageCell used={client.jobsUsed} total={client.jobsTotal} />
                                </td>
                                <td className="p-4">
                                    <UsageCell used={client.coordinatorsUsed} total={client.coordinatorsTotal} />
                                </td>
                                <td className="p-4">
                                    <UsageCell used={client.smsUsed} total={client.smsTotal} />
                                </td>
                                <td className="p-4 text-text-muted">{new Date(client.creationDate).toLocaleDateString('he-IL')}</td>
                                <td className="p-4">
                                     <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={client.isActive} onChange={() => handleStatusToggle(client.id)} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                                    </label>
                                </td>
                                <td className="p-4 text-center">
                                    <button 
                                        onClick={() => navigate(`/admin/client/edit/${client.id}`)} 
                                        className="p-2 hover:bg-primary-50 rounded-lg text-text-muted hover:text-primary-600 transition-colors"
                                        title="ערוך לקוח"
                                    >
                                        <PencilIcon className="w-4 h-4"/>
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
                {filteredClients.length === 0 && (
                    <div className="p-8 text-center text-text-muted">
                        לא נמצאו לקוחות התואמים את הסינון.
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminClientsView;
