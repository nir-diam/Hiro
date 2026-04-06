
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    UserIcon, BriefcaseIcon, LinkIcon, UserGroupIcon, ArrowLeftIcon,
    LockClosedIcon, ShieldCheckIcon, PencilIcon, CheckCircleIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { fetchStaffUser, updateStaffUser, type StaffUserDto } from '../services/usersApi';

// --- SHARED FORM COMPONENTS ---

const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; disabled?: boolean }> = ({ label, name, value, onChange, type = "text", disabled = false }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input 
            type={type} 
            name={name} 
            value={value} 
            onChange={onChange} 
            disabled={disabled}
            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed" 
        />
    </div>
);

const ToggleSwitch: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; description?: string }> = ({ label, checked, onChange, description }) => (
    <div className="flex items-center justify-between py-3 border-b border-border-subtle last:border-0">
        <div>
            <span className="text-sm font-bold text-text-default block">{label}</span>
            {description && <span className="text-xs text-text-muted">{description}</span>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
        </label>
    </div>
);

// --- TABS COMPONENTS ---

const DetailsTab: React.FC<{
    formData: Record<string, unknown>;
    setFormData: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
    onSave: () => Promise<void>;
    saving: boolean;
    saveMessage: string | null;
}> = ({ formData, setFormData, onSave, saving, saveMessage }) => {
    const { t } = useLanguage();

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <UserIcon className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-bold text-text-default">{t('coordinator_profile.tab_details')}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormInput
                        label={t('coordinators.col_username')}
                        name="name"
                        value={String(formData.name ?? '')}
                        onChange={handleChange}
                    />
                    <FormInput
                        label={t('coordinators.col_email')}
                        name="email"
                        type="email"
                        value={String(formData.email ?? '')}
                        onChange={handleChange}
                    />
                    <FormInput
                        label={t('coordinators.col_phone')}
                        name="phone"
                        value={String(formData.phone ?? '')}
                        onChange={handleChange}
                    />
                    <FormInput
                        label={t('coordinators.col_extension')}
                        name="extension"
                        value={String(formData.extension ?? '')}
                        onChange={handleChange}
                    />
                    <div className="md:col-span-2 pt-2 border-t border-border-default mt-2">
                        <ToggleSwitch
                            label={t('coordinators.col_active')}
                            checked={!!formData.isActive}
                            onChange={(checked) => setFormData((prev) => ({ ...prev, isActive: checked }))}
                        />
                    </div>
                </div>
            </div>
            {saveMessage && (
                <p className={`text-sm ${saveMessage.includes('נכשל') ? 'text-red-600' : 'text-green-600'}`}>{saveMessage}</p>
            )}
            <div className="flex justify-end">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onSave()}
                    className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all disabled:opacity-60"
                >
                    {saving ? 'שומר...' : t('client_form.save')}
                </button>
            </div>
        </div>
    );
};

const UsageTab: React.FC = () => {
    const { t } = useLanguage();
    // Mock state for usage settings
    const [settings, setSettings] = useState({
        twoFactor: true,
        homepageAccess: true,
        confidentialEvents: false,
        exportData: false,
        blockedSources: false
    });

    const toggle = (key: keyof typeof settings) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                     <LockClosedIcon className="w-5 h-5 text-primary-500"/>
                     <h3 className="text-lg font-bold text-text-default">אבטחה וגישה</h3>
                 </div>
                 <div className="space-y-2">
                     <ToggleSwitch label={t('coordinator_profile.homepage_access')} checked={settings.homepageAccess} onChange={() => toggle('homepageAccess')} description="האם למשתמש יש גישה לנתוני הדשבורד הראשי." />
                     <ToggleSwitch label={t('coordinator_profile.two_factor')} checked={settings.twoFactor} onChange={() => toggle('twoFactor')} description="חייב אימות דו-שלבי בכניסה למערכת." />
                     <ToggleSwitch label={t('coordinator_profile.confidential_events')} checked={settings.confidentialEvents} onChange={() => toggle('confidentialEvents')} description="אפשרות לצפות וליצור אירועים המסווגים כחסויים." />
                     <ToggleSwitch label={t('coordinator_profile.blocked_sources')} checked={settings.blockedSources} onChange={() => toggle('blockedSources')} description="מנע מהמשתמש לראות מקורות גיוס ספציפיים." />
                     <ToggleSwitch label={t('coordinator_profile.export_approval')} checked={settings.exportData} onChange={() => toggle('exportData')} description="אפשר למשתמש לייצא נתונים לקבצי Excel/CSV." />
                 </div>
            </div>

            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-4">פעולות חשבון</h3>
                <div className="flex flex-col sm:flex-row gap-4">
                    <button className="px-4 py-2 border border-border-default rounded-lg text-sm font-bold text-text-default hover:bg-bg-subtle transition-colors">
                        {t('coordinator_profile.reset_password')}
                    </button>
                    <button className="px-4 py-2 border border-border-default rounded-lg text-sm font-bold text-text-default hover:bg-bg-subtle transition-colors">
                        {t('coordinator_profile.new_email')}
                    </button>
                </div>
            </div>
            
             <div className="flex justify-end">
                  <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all">{t('client_form.save')}</button>
             </div>
        </div>
    );
};

const SignatureTab: React.FC = () => {
    const { t } = useLanguage();
    const [signature, setSignature] = useState(`בברכה,
ישראל ישראלי | רכז גיוס
מימד אנושי - פתרונות כוח אדם
טלפון: 054-1234567 | אתר: www.humand.co.il`);

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                     <PencilIcon className="w-5 h-5 text-primary-500"/>
                     <h3 className="text-lg font-bold text-text-default">{t('coordinator_profile.tab_signature')}</h3>
                 </div>
                 <p className="text-sm text-text-muted mb-4">{t('coordinator_profile.signature_desc')}</p>
                 
                 {/* Rich Text Toolbar Simulation */}
                 <div className="border border-border-default rounded-lg overflow-hidden">
                     <div className="bg-bg-subtle p-2 border-b border-border-default flex gap-2">
                         <button className="p-1.5 hover:bg-bg-hover rounded font-bold text-text-default">B</button>
                         <button className="p-1.5 hover:bg-bg-hover rounded italic text-text-default">I</button>
                         <button className="p-1.5 hover:bg-bg-hover rounded underline text-text-default">U</button>
                         <div className="w-px h-6 bg-border-default mx-1"></div>
                         <button className="p-1.5 hover:bg-bg-hover rounded text-text-default flex items-center gap-1 text-xs">
                             <LinkIcon className="w-3.5 h-3.5"/> הוסף קישור
                         </button>
                     </div>
                     <textarea 
                        className="w-full h-48 p-4 bg-white text-text-default text-sm outline-none resize-none"
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                     ></textarea>
                 </div>
            </div>
            
            <div className="bg-bg-subtle/50 p-4 rounded-xl border border-border-default">
                <h4 className="font-bold text-sm text-text-default mb-2">תצוגה מקדימה:</h4>
                <div className="bg-white p-4 rounded-lg border border-border-default text-sm whitespace-pre-line">
                    {signature}
                </div>
            </div>

            <div className="flex justify-end">
                  <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all">{t('client_form.save')}</button>
            </div>
        </div>
    );
};

type PermFlags = {
    canDeleteCandidates: boolean;
    canEditJobs: boolean;
    canManageClients: boolean;
    canViewReports: boolean;
    canManageTags: boolean;
};

const PermissionsTab: React.FC<{
    userId: string;
    user: StaffUserDto | null;
    onUserUpdated: (u: StaffUserDto) => void;
}> = ({ userId, user, onUserUpdated }) => {
    const { t } = useLanguage();
    const [role, setRole] = useState<'manager' | 'recruiter'>('recruiter');
    const [candidateScope, setCandidateScope] = useState('own');
    const [jobScope, setJobScope] = useState('own');
    const [permissions, setPermissions] = useState<PermFlags>({
        canDeleteCandidates: false,
        canEditJobs: true,
        canManageClients: false,
        canViewReports: false,
        canManageTags: true,
    });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        setRole(user.role === 'manager' ? 'manager' : 'recruiter');
        const ds = user.dataScope || {};
        setCandidateScope(typeof ds.candidates === 'string' ? ds.candidates : 'own');
        setJobScope(typeof ds.jobs === 'string' ? ds.jobs : 'own');
        const p = user.permissions || {};
        setPermissions({
            canDeleteCandidates: !!p.canDeleteCandidates,
            canEditJobs: p.canEditJobs !== false,
            canManageClients: !!p.canManageClients,
            canViewReports: !!p.canViewReports,
            canManageTags: p.canManageTags !== false,
        });
    }, [user]);

    const togglePermission = (key: keyof PermFlags) => {
        setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const save = async () => {
        setMsg(null);
        setSaving(true);
        try {
            const updated = await updateStaffUser(userId, {
                role,
                dataScope: { candidates: candidateScope, jobs: jobScope },
                permissions: { ...permissions },
            });
            onUserUpdated(updated);
            setMsg('נשמר בהצלחה');
        } catch (e: any) {
            setMsg(e?.message || 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <ShieldCheckIcon className="w-5 h-5 text-primary-500" />
                    <h3 className="text-lg font-bold text-text-default">פרופיל הרשאה (Role)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <label
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${role === 'manager' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:bg-bg-subtle'}`}
                    >
                        <input
                            type="radio"
                            name="permRole"
                            value="manager"
                            checked={role === 'manager'}
                            onChange={() => setRole('manager')}
                            className="sr-only"
                        />
                        <span className="block font-bold text-text-default mb-1">{t('coordinator_profile.role_manager')}</span>
                        <span className="text-xs text-text-muted">ניהול צוות, צפייה בדוחות מתקדמים וניהול משרות.</span>
                    </label>
                    <label
                        className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${role === 'recruiter' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:bg-bg-subtle'}`}
                    >
                        <input
                            type="radio"
                            name="permRole"
                            value="recruiter"
                            checked={role === 'recruiter'}
                            onChange={() => setRole('recruiter')}
                            className="sr-only"
                        />
                        <span className="block font-bold text-text-default mb-1">{t('coordinator_profile.role_recruiter')}</span>
                        <span className="text-xs text-text-muted">טיפול במועמדים, משרות ולקוחות שוטף.</span>
                    </label>
                </div>
            </div>

            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-2">היקף נתונים (Data Scope)</h3>
                <p className="text-sm text-text-muted mb-6">{t('coordinator_profile.scope_desc')}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <label className="block text-sm font-semibold text-text-default mb-2">{t('coordinator_profile.scope_candidates')}</label>
                        <select
                            value={candidateScope}
                            onChange={(e) => setCandidateScope(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option value="all">{t('coordinator_profile.scope_all')}</option>
                            <option value="department">{t('coordinator_profile.scope_department')}</option>
                            <option value="own">{t('coordinator_profile.scope_own')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-default mb-2">{t('coordinator_profile.scope_jobs')}</label>
                        <select
                            value={jobScope}
                            onChange={(e) => setJobScope(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option value="all">{t('coordinator_profile.scope_jobs_all')}</option>
                            <option value="department">{t('coordinator_profile.scope_jobs_department')}</option>
                            <option value="own">{t('coordinator_profile.scope_jobs_own')}</option>
                        </select>
                    </div>
                </div>

                <div className="mt-6 space-y-3 pt-6 border-t border-border-default">
                    <h4 className="text-sm font-bold text-text-default mb-2">הגדרות תצוגה מתקדמות</h4>
                    <ToggleSwitch label={t('coordinator_profile.show_own_jobs_only')} checked={true} onChange={() => {}} />
                    <ToggleSwitch label={t('coordinator_profile.show_other_messages')} checked={false} onChange={() => {}} />
                    <ToggleSwitch label={t('coordinator_profile.show_external_docs')} checked={true} onChange={() => {}} />
                </div>
            </div>

            <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <h3 className="text-lg font-bold text-text-default mb-4">{t('coordinator_profile.permissions_actions')}</h3>
                <div className="space-y-3">
                    <ToggleSwitch
                        label="מחיקת מועמדים (לצמיתות)"
                        checked={permissions.canDeleteCandidates}
                        onChange={() => togglePermission('canDeleteCandidates')}
                    />
                    <ToggleSwitch
                        label="עריכת פרטי משרה (כולל סגירה)"
                        checked={permissions.canEditJobs}
                        onChange={() => togglePermission('canEditJobs')}
                    />
                    <ToggleSwitch
                        label="ניהול ועיבוד נתוני לקוחות"
                        checked={permissions.canManageClients}
                        onChange={() => togglePermission('canManageClients')}
                    />
                    <ToggleSwitch
                        label="צפייה בדוחות ניהוליים"
                        checked={permissions.canViewReports}
                        onChange={() => togglePermission('canViewReports')}
                    />
                    <ToggleSwitch
                        label="ניהול תגיות מערכת"
                        checked={permissions.canManageTags}
                        onChange={() => togglePermission('canManageTags')}
                    />
                </div>
            </div>

            {msg && <p className={`text-sm ${msg.includes('נכשל') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>}
            <div className="flex justify-end">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all disabled:opacity-60"
                >
                    {saving ? 'שומר...' : t('client_form.save')}
                </button>
            </div>
        </div>
    );
};

const CoordinatorProfileView: React.FC = () => {
    const { t } = useLanguage();
    const { coordinatorId } = useParams<{ coordinatorId: string }>();
    const navigate = useNavigate();

    const [staffUser, setStaffUser] = useState<StaffUserDto | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState<Record<string, unknown>>({});
    const [detailsSaving, setDetailsSaving] = useState(false);
    const [detailsMsg, setDetailsMsg] = useState<string | null>(null);

    const loadUser = useCallback(async () => {
        if (!coordinatorId) return;
        setLoading(true);
        setLoadError(null);
        try {
            const u = await fetchStaffUser(coordinatorId);
            setStaffUser(u);
            setFormData({
                name: u.name || '',
                email: u.email,
                phone: u.phone || '',
                extension: u.extension || '',
                isActive: u.isActive,
            });
        } catch (e: any) {
            setLoadError(e?.message || 'טעינה נכשלה');
            setStaffUser(null);
        } finally {
            setLoading(false);
        }
    }, [coordinatorId]);

    useEffect(() => {
        void loadUser();
    }, [loadUser]);

    const saveDetails = async () => {
        if (!coordinatorId) return;
        setDetailsMsg(null);
        setDetailsSaving(true);
        try {
            const updated = await updateStaffUser(coordinatorId, {
                name: String(formData.name ?? ''),
                email: String(formData.email ?? ''),
                phone: String(formData.phone ?? ''),
                extension: String(formData.extension ?? ''),
                isActive: !!formData.isActive,
            });
            setStaffUser(updated);
            setDetailsMsg('נשמר בהצלחה');
        } catch (e: any) {
            setDetailsMsg(e?.message || 'שמירה נכשלה');
        } finally {
            setDetailsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-text-muted">
                <p>טוען...</p>
            </div>
        );
    }

    if (loadError || !staffUser) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-text-muted">
                <p className="text-lg font-semibold">{loadError || 'משתמש לא נמצא'}</p>
                <button type="button" onClick={() => navigate('/settings/coordinators')} className="mt-4 text-primary-600 hover:underline">
                    חזרה לרשימה
                </button>
            </div>
        );
    }

    const displayName = (staffUser.name || staffUser.email || '—').trim();
    const initial = displayName.charAt(0) || '?';

    const tabs = [
        { id: 'details', label: t('coordinator_profile.tab_details'), icon: <UserIcon className="w-5 h-5" /> },
        { id: 'usage', label: t('coordinator_profile.tab_usage'), icon: <BriefcaseIcon className="w-5 h-5" /> },
        { id: 'signature', label: t('coordinator_profile.tab_signature'), icon: <LinkIcon className="w-5 h-5" /> },
        { id: 'permissions', label: t('coordinator_profile.tab_permissions'), icon: <UserGroupIcon className="w-5 h-5" /> },
    ];

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-700 font-bold text-2xl border-4 border-white shadow-sm">
                        {initial}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-default flex items-center gap-2">
                            {displayName}
                            {staffUser.isActive && (
                                <span title="פעיל">
                                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-text-muted">{staffUser.email}</p>
                        <p className="text-xs text-text-subtle mt-1">
                            {staffUser.role === 'manager' ? 'מנהל/ת' : 'מגייס/ת'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/settings/coordinators')}
                    className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-2 self-start sm:self-center"
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>חזרה לרשימה</span>
                </button>
            </header>

            <div className="border-b border-border-default overflow-x-auto">
                <nav className="flex items-center -mb-px gap-6 min-w-max">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 pb-3 text-sm font-bold transition-all border-b-2 ${
                                activeTab === tab.id
                                    ? 'border-primary-500 text-primary-600'
                                    : 'border-transparent text-text-muted hover:text-text-default hover:border-border-default'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            <main className="flex-1 overflow-y-auto">
                {activeTab === 'details' && (
                    <DetailsTab
                        formData={formData}
                        setFormData={setFormData}
                        onSave={saveDetails}
                        saving={detailsSaving}
                        saveMessage={detailsMsg}
                    />
                )}
                {activeTab === 'usage' && <UsageTab />}
                {activeTab === 'signature' && <SignatureTab />}
                {activeTab === 'permissions' && (
                    <PermissionsTab userId={staffUser.id} user={staffUser} onUserUpdated={setStaffUser} />
                )}
            </main>
        </div>
    );
};

export default CoordinatorProfileView;
