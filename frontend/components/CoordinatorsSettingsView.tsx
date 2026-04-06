
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, MagnifyingGlassIcon, ChevronDownIcon, Cog6ToothIcon, DocumentTextIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { fetchStaffUsers, createStaffUser, type StaffUserDto } from '../services/usersApi';

export interface CoordinatorRow {
    id: string;
    name: string;
    phone: string;
    extension: string;
    email: string;
    role: 'manager' | 'recruiter';
    creationDate: string;
    lastLogin: string;
    isActive: boolean;
}

function mapDto(u: StaffUserDto): CoordinatorRow {
    const created = u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : '';
    return {
        id: u.id,
        name: (u.name || u.email || '').trim() || '—',
        phone: u.phone || '',
        extension: u.extension || '',
        email: u.email,
        role: u.role === 'manager' ? 'manager' : 'recruiter',
        creationDate: created,
        lastLogin: '—',
        isActive: !!u.isActive,
    };
}

type AddModalProps = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
};

const AddStaffUserModal: React.FC<AddModalProps> = ({ open, onClose, onCreated }) => {
    const { t } = useLanguage();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'manager' | 'recruiter'>('recruiter');
    const [phone, setPhone] = useState('');
    const [extension, setExtension] = useState('');
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) {
            setName('');
            setEmail('');
            setPassword('');
            setRole('recruiter');
            setPhone('');
            setExtension('');
            setErr(null);
            setSaving(false);
        }
    }, [open]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr(null);
        setSaving(true);
        try {
            await createStaffUser({
                email: email.trim(),
                password,
                name: name.trim() || email.trim(),
                role,
                phone: phone.trim() || undefined,
                extension: extension.trim() || undefined,
            });
            onCreated();
            onClose();
        } catch (e: any) {
            setErr(e?.message || 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
            <div
                role="dialog"
                aria-modal="true"
                className="bg-bg-card rounded-2xl shadow-xl border border-border-default w-full max-w-md max-h-[90vh] overflow-y-auto"
            >
                <div className="p-5 border-b border-border-default flex items-center justify-between">
                    <h2 className="text-lg font-bold text-text-default">{t('coordinators.add_new')}</h2>
                    <button type="button" onClick={onClose} className="text-text-muted hover:text-text-default text-sm font-semibold">
                        סגור
                    </button>
                </div>
                <form onSubmit={submit} className="p-5 space-y-4">
                    {err && <p className="text-sm text-red-600">{err}</p>}
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">שם מלא</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                            placeholder="ישראל ישראלי"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">דוא״ל *</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">סיסמה *</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1">תפקיד במערכת *</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value as 'manager' | 'recruiter')}
                            className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                        >
                            <option value="recruiter">מגייס/ת</option>
                            <option value="manager">מנהל/ת</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">טלפון</label>
                            <input
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1">שלוחה</label>
                            <input
                                value={extension}
                                onChange={(e) => setExtension(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg border border-border-default font-semibold text-text-default hover:bg-bg-subtle"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-lg bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-60"
                        >
                            {saving ? 'שומר...' : 'צור משתמש'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const CoordinatorsSettingsView: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [coordinators, setCoordinators] = useState<CoordinatorRow[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: keyof CoordinatorRow; direction: 'asc' | 'desc' } | null>({
        key: 'creationDate',
        direction: 'desc',
    });

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const rows = await fetchStaffUsers();
            setCoordinators(rows.map(mapDto));
        } catch (e: any) {
            setLoadError(e?.message || 'טעינה נכשלה');
            setCoordinators([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const sortedAndFilteredCoordinators = useMemo(() => {
        let sortableItems = [...coordinators];

        if (sortConfig !== null) {
            sortableItems.sort((a, b) => {
                const av = a[sortConfig.key];
                const bv = b[sortConfig.key];
                if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
                if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return sortableItems.filter((row) => {
            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'active' && row.isActive) ||
                (statusFilter === 'inactive' && !row.isActive);

            const search = searchTerm.toLowerCase();
            const matchesSearch =
                row.name.toLowerCase().includes(search) ||
                row.phone.includes(search) ||
                row.email.toLowerCase().includes(search);

            return matchesStatus && matchesSearch;
        });
    }, [coordinators, searchTerm, statusFilter, sortConfig]);

    const requestSort = (key: keyof CoordinatorRow) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: keyof CoordinatorRow) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
    };

    const activeCoordinatorsCount = useMemo(() => coordinators.filter((c) => c.isActive).length, [coordinators]);

    const roleLabel = (r: CoordinatorRow['role']) => (r === 'manager' ? 'מנהל/ת' : 'מגייס/ת');

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            <AddStaffUserModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />

            <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">{t('coordinators.title')}</h1>
                    <p className="text-sm text-text-muted">{t('coordinators.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setAddOpen(true)}
                    className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm"
                >
                    <PlusIcon className="w-5 h-5" />
                    <span>{t('coordinators.add_new')}</span>
                </button>
            </header>

            {loadError && <p className="text-sm text-red-600 mb-3">{loadError}</p>}
            {loading && <p className="text-sm text-text-muted mb-3">טוען...</p>}

            <div className="p-3 bg-bg-subtle rounded-xl border border-border-default mb-4 flex flex-col md:flex-row items-center gap-3">
                <div className="relative w-full md:w-auto md:flex-grow">
                    <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder={t('coordinators.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-300 transition"
                    />
                </div>
                <div className="relative w-full md:w-48">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                        className="appearance-none w-full bg-bg-input border border-border-default rounded-lg py-2 pl-8 pr-3 text-sm font-medium text-text-default focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                    >
                        <option value="all">{t('coordinators.filter_status_all')}</option>
                        <option value="active">{t('coordinators.filter_active')}</option>
                        <option value="inactive">{t('coordinators.filter_inactive')}</option>
                    </select>
                    <ChevronDownIcon className="w-4 h-4 text-text-subtle absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <div className="hidden md:flex items-center gap-3 pl-2">
                    <button type="button" title="הגדרות" className="p-2 text-text-muted rounded-full hover:bg-bg-hover">
                        <Cog6ToothIcon className="w-5 h-5" />
                    </button>
                    <button type="button" title="ייצוא ל-CSV" className="p-2 text-text-muted rounded-full hover:bg-bg-hover">
                        <DocumentTextIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto border border-border-default rounded-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right min-w-[900px]">
                        <thead className="text-xs text-text-muted uppercase bg-bg-subtle/80 sticky top-0">
                            <tr>
                                <th className="p-4">{t('coordinators.col_username')}</th>
                                <th className="p-4">תפקיד</th>
                                <th className="p-4">{t('coordinators.col_phone')}</th>
                                <th className="p-4">{t('coordinators.col_extension')}</th>
                                <th className="p-4">{t('coordinators.col_email')}</th>
                                <th className="p-4 cursor-pointer" onClick={() => requestSort('creationDate')}>
                                    {t('coordinators.col_creation_date')}
                                    {getSortIndicator('creationDate')}
                                </th>
                                <th className="p-4">{t('coordinators.col_last_login')}</th>
                                <th className="p-4">{t('coordinators.col_active')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {sortedAndFilteredCoordinators.map((user) => (
                                <tr
                                    key={user.id}
                                    onClick={() => navigate(`/settings/coordinators/${user.id}`)}
                                    className="hover:bg-bg-hover cursor-pointer group"
                                >
                                    <td className="p-4 font-semibold text-primary-700">{user.name}</td>
                                    <td className="p-4">
                                        <span
                                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                                user.role === 'manager'
                                                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                            }`}
                                        >
                                            {roleLabel(user.role)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-text-default">{user.phone || '—'}</td>
                                    <td className="p-4 text-text-default">{user.extension || '—'}</td>
                                    <td className="p-4 text-text-default">{user.email}</td>
                                    <td className="p-4 text-text-muted">
                                        {user.creationDate ? new Date(user.creationDate).toLocaleDateString('he-IL') : '—'}
                                    </td>
                                    <td className="p-4 text-text-muted">{user.lastLogin}</td>
                                    <td className="p-4 font-semibold">
                                        {user.isActive ? <span className="text-green-600">כן</span> : <span className="text-red-600">לא</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>
            <footer className="flex-shrink-0 pt-3 text-sm text-text-muted font-semibold flex justify-between items-center">
                <p>{t('coordinators.summary_rows', { count: sortedAndFilteredCoordinators.length })}</p>
                <p>{t('coordinators.summary_total', { total: coordinators.length, active: activeCoordinatorsCount })}</p>
            </footer>
        </div>
    );
};

export default CoordinatorsSettingsView;
