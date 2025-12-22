import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { candidatesData } from './CandidatesListView';
import { MagnifyingGlassIcon, AvatarIcon } from './Icons';
import { clientsData } from './ClientsListView';

// Augment mock data with client info for this view
const allCandidates = candidatesData.map((candidate, index) => ({
    ...candidate,
    clientName: clientsData[index % clientsData.length].name,
}));

const AdminCandidatesView: React.FC = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

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
        let filtered = allCandidates.filter(candidate => 
            candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            candidate.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            candidate.clientName.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        if (sortConfig) {
            filtered.sort((a, b) => {
                const aVal = (a as any)[sortConfig.key];
                const bVal = (b as any)[sortConfig.key];
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [searchTerm, sortConfig]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="relative w-full max-w-sm">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input type="text" placeholder="חיפוש לפי שם, תפקיד, לקוח..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm" />
                </div>
            </div>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right min-w-[1000px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                        <tr>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('name')}>שם המועמד {getSortIndicator('name')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('clientName')}>משויך ללקוח {getSortIndicator('clientName')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('title')}>תפקיד {getSortIndicator('title')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('status')}>סטטוס {getSortIndicator('status')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('lastActivity')}>פעילות אחרונה {getSortIndicator('lastActivity')}</th>
                            <th className="p-3 cursor-pointer" onClick={() => requestSort('source')}>מקור {getSortIndicator('source')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                    {sortedAndFilteredCandidates.map(candidate => (
                        <tr key={candidate.id} onClick={() => navigate(`/admin/candidates/${candidate.id}`)} className="hover:bg-bg-hover cursor-pointer">
                             <td className="p-3">
                                <div className="flex items-center gap-3">
                                    <AvatarIcon initials={candidate.avatar} size={32} fontSize={14} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                                    <span className="font-semibold text-primary-700">{candidate.name}</span>
                                </div>
                            </td>
                            <td className="p-3 text-text-default font-semibold">{candidate.clientName}</td>
                            <td className="p-3 text-text-muted">{candidate.title}</td>
                            <td className="p-3 text-text-muted">{candidate.status}</td>
                            <td className="p-3 text-text-muted">{candidate.lastActivity}</td>
                            <td className="p-3 text-text-muted">{candidate.source}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminCandidatesView;