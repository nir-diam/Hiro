
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, Cog6ToothIcon, DocumentTextIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
interface Coordinator {
  id: number;
  username: string;
  phone: string;
  extension: string;
  email: string;
  senderName: string;
  creationDate: string;
  lastLogin: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isDomainVerified: boolean;
}

// --- MOCK DATA ---
export const coordinatorsData: Coordinator[] = [
  { id: 1, username: 'מיכל', phone: '08-9564396', extension: '368', email: 'michal@humand.co.il', senderName: 'מיכל אלקבץ - מימד אנושי', creationDate: '2025-09-14', lastLogin: '2025-10-21', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 2, username: 'תום גורביץ', phone: '08-8599972', extension: '366', email: 'tom@humand.co.il', senderName: 'תום גורביץ מימד אנושי', creationDate: '2025-07-27', lastLogin: '2025-10-26', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 3, username: 'דיאנה', phone: '073-2674729', extension: '370', email: 'diana@humand.co.il', senderName: 'דיאנה ברודסקי', creationDate: '2025-03-31', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 4, username: 'עדי', phone: '08-6315585', extension: 'x36', email: 'adi@humand.co.il', senderName: 'עדי גורן', creationDate: '2024-05-30', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 5, username: 'מיטל', phone: '', extension: '', email: 'meytal@humand.co.il', senderName: 'מיטל בכלר', creationDate: '2024-05-19', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 6, username: 'עדן', phone: '073-3990281', extension: '', email: 'edens@humand.co.il', senderName: 'עדן סיברובר', creationDate: '2023-05-14', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 7, username: 'גלעד', phone: '054-9444674', extension: '', email: 'gilad@humand.co.il', senderName: 'גלעד בן חיים', creationDate: '2022-05-15', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
  { id: 8, username: 'שרית', phone: '08-6694136', extension: '361', email: 'hr@humand.co.il', senderName: 'שרית בן חיים', creationDate: '2022-05-13', lastLogin: '2025-11-02', isActive: true, isEmailVerified: true, isDomainVerified: true },
];

const CoordinatorsSettingsView: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [coordinators] = useState<Coordinator[]>(coordinatorsData);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Coordinator; direction: 'asc' | 'desc' } | null>({ key: 'creationDate', direction: 'desc' });

    const sortedAndFilteredCoordinators = useMemo(() => {
        let sortableItems = [...coordinators];

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                if (a[sortConfig.key] < b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? -1 : 1;
                }
                if (a[sortConfig.key] > b[sortConfig.key]) {
                    return sortConfig.direction === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }
        
        return sortableItems.filter(coordinator => {
            const matchesStatus = 
                statusFilter === 'all' || 
                (statusFilter === 'active' && coordinator.isActive) || 
                (statusFilter === 'inactive' && !coordinator.isActive);
            
            const search = searchTerm.toLowerCase();
            const matchesSearch = 
                coordinator.username.toLowerCase().includes(search) ||
                coordinator.phone.includes(search) ||
                coordinator.email.toLowerCase().includes(search);
            
            return matchesStatus && matchesSearch;
        });
    }, [coordinators, searchTerm, statusFilter, sortConfig]);

    const requestSort = (key: keyof Coordinator) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof Coordinator) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const activeCoordinatorsCount = useMemo(() => coordinators.filter(c => c.isActive).length, [coordinators]);

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            {/* Header */}
            <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">{t('coordinators.title')}</h1>
                    <p className="text-sm text-text-muted">{t('coordinators.subtitle')}</p>
                </div>
                <button className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                    <PlusIcon className="w-5 h-5"/>
                    <span>{t('coordinators.add_new')}</span>
                </button>
            </header>

            {/* Toolbar */}
            <div className="p-3 bg-bg-subtle rounded-xl border border-border-default mb-4 flex flex-col md:flex-row items-center gap-3">
                <div className="relative w-full md:w-auto md:flex-grow">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        placeholder={t('coordinators.search_placeholder')}
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition" 
                    />
                </div>
                 <div className="relative w-full md:w-48">
                    <select 
                        value={statusFilter} 
                        onChange={e => setStatusFilter(e.target.value as any)} 
                        className="appearance-none w-full bg-bg-input border border-border-default rounded-lg py-2 pl-8 pr-3 text-sm font-medium text-text-default focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                    >
                        <option value="all">{t('coordinators.filter_status_all')}</option>
                        <option value="active">{t('coordinators.filter_active')}</option>
                        <option value="inactive">{t('coordinators.filter_inactive')}</option>
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"/>
                </div>
                 <div className="hidden md:flex items-center gap-3 pl-2">
                    <button title="הגדרות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><Cog6ToothIcon className="w-5 h-5"/></button>
                    <button title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover"><DocumentTextIcon className="w-5 h-5"/></button>
                </div>
            </div>

            {/* Table */}
            <main className="flex-1 overflow-y-auto border border-border-default rounded-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[1200px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80 sticky top-0">
                            <tr>
                                <th className="p-4">{t('coordinators.col_username')}</th>
                                <th className="p-4">{t('coordinators.col_phone')}</th>
                                <th className="p-4">{t('coordinators.col_extension')}</th>
                                <th className="p-4">{t('coordinators.col_email')}</th>
                                <th className="p-4">{t('coordinators.col_sender')}</th>
                                <th className="p-4 cursor-pointer" onClick={() => requestSort('creationDate')}>
                                    {t('coordinators.col_creation_date')}{getSortIndicator('creationDate')}
                                </th>
                                <th className="p-4 cursor-pointer" onClick={() => requestSort('lastLogin')}>
                                    {t('coordinators.col_last_login')}{getSortIndicator('lastLogin')}
                                </th>
                                <th className="p-4">{t('coordinators.col_active')}</th>
                                <th className="p-4">{t('coordinators.col_email_verified')}</th>
                                <th className="p-4">{t('coordinators.col_domain_verified')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                        {sortedAndFilteredCoordinators.map(user => (
                            <tr key={user.id} onClick={() => navigate(`/settings/coordinators/${user.id}`)} className="hover:bg-bg-hover cursor-pointer group">
                                <td className="p-4 font-semibold text-primary-700">{user.username}</td>
                                <td className="p-4 text-text-default">{user.phone}</td>
                                <td className="p-4 text-text-default">{user.extension}</td>
                                <td className="p-4 text-text-default">{user.email}</td>
                                <td className="p-4 text-text-muted">{user.senderName}</td>
                                <td className="p-4 text-text-muted">{new Date(user.creationDate).toLocaleDateString('he-IL')}</td>
                                <td className="p-4 text-text-muted">{new Date(user.lastLogin).toLocaleDateString('he-IL')}</td>
                                <td className="p-4 font-semibold">{user.isActive ? <span className="text-green-600">כן</span> : <span className="text-red-600">לא</span>}</td>
                                <td className="p-4 text-text-muted">{user.isEmailVerified ? 'כן' : 'לא'}</td>
                                <td className="p-4 text-text-muted">{user.isDomainVerified ? 'כן' : 'לא'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </main>
            {/* Footer */}
            <footer className="flex-shrink-0 pt-3 text-sm text-text-muted font-semibold flex justify-between items-center">
                <p>{t('coordinators.summary_rows', {count: sortedAndFilteredCoordinators.length})}</p>
                <p>{t('coordinators.summary_total', {total: coordinators.length, active: activeCoordinatorsCount})}</p>
            </footer>
        </div>
    );
};

export default CoordinatorsSettingsView;
