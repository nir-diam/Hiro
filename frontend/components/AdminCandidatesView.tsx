import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, AvatarIcon } from './Icons';

const AdminCandidatesView: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [semanticResults, setSemanticResults] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const authHeaders = () => {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    const loadAll = async () => {
        if (!apiBase) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates`, { headers: { ...authHeaders() } });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setCandidates(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e.message || 'שגיאה בטעינת מועמדים');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiBase]);

    useEffect(() => {
        const timer = setTimeout(() => {
            runSemanticSearch(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const runSemanticSearch = async (term: string) => {
        const q = term.trim();
        if (!apiBase || q.length < 3) {
            setSemanticResults(null);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates/search/semantic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ query: q, limit: 50 }),
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            setSemanticResults(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setSemanticResults(null);
            setError(e.message || 'שגיאה בחיפוש הסמנטי');
        } finally {
            setLoading(false);
        }
    };

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };
    
    const getSortIndicator = (key: string) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return <span className="text-text-subtle">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>;
    };

    const sortedAndFilteredCandidates = useMemo(() => {
        const base = semanticResults || candidates;
        if (!sortConfig) return base;
        const sorted = [...base].sort((a, b) => {
            const aVal = (a as any)[sortConfig.key];
            const bVal = (b as any)[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [candidates, semanticResults, sortConfig]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="relative w-full max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="חיפוש לפי שם, תפקיד, מקור... "
                        value={searchTerm}
                        onChange={e => {
                            const val = e.target.value;
                            setSearchTerm(val);
                            if (val.trim().length < 3) {
                                setSemanticResults(null);
                            }
                        }}
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                    />
                </div>
            </div>

            {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
            {loading ? (
                <div className="text-sm text-text-muted">טוען מועמדים...</div>
            ) : (
                <div className="overflow-x-auto border border-border-default rounded-lg">
                    <table className="w-full text-sm text-right min-w-[900px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                            <tr>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('fullName')}>שם המועמד {getSortIndicator('fullName')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('title')}>תפקיד {getSortIndicator('title')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('status')}>סטטוס {getSortIndicator('status')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('source')}>מקור {getSortIndicator('source')}</th>
                                <th className="p-3 cursor-pointer" onClick={() => requestSort('lastActive')}>פעילות אחרונה {getSortIndicator('lastActive')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-default">
                        {sortedAndFilteredCandidates.map(candidate => (
                            <tr key={candidate.id} onClick={() => navigate(`/admin/candidates/${candidate.id}`)} className="hover:bg-bg-hover cursor-pointer">
                                 <td className="p-3">
                                    <div className="flex items-center gap-3">
                                        <AvatarIcon initials={candidate.fullName?.[0] || '?'} size={32} fontSize={14} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                                        <span className="font-semibold text-primary-700">{candidate.fullName || 'ללא שם'}</span>
                                    </div>
                                </td>
                                <td className="p-3 text-text-muted">{candidate.title || '—'}</td>
                                <td className="p-3 text-text-muted">{candidate.status || '—'}</td>
                                <td className="p-3 text-text-muted">{candidate.source || '—'}</td>
                                <td className="p-3 text-text-muted">{candidate.lastActive || candidate.lastActivity || '—'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminCandidatesView;