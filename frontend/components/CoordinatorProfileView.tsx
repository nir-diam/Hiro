

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    UserIcon, BriefcaseIcon, LinkIcon, UserGroupIcon, ArrowLeftIcon, 
    LockClosedIcon, ShieldCheckIcon, PencilIcon, EnvelopeIcon, CheckCircleIcon
} from './Icons';
import { coordinatorsData } from './CoordinatorsSettingsView';
import { useLanguage } from '../context/LanguageContext';

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

const DetailsTab: React.FC<{ coordinator: any; formData: any; setFormData: any; }> = ({ coordinator, formData, setFormData }) => {
     const { t } = useLanguage();
     
     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? e.target.checked : undefined;
        setFormData((prev: any) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
     };

     return (
         <div className="space-y-6 animate-fade-in">
             <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                     <UserIcon className="w-5 h-5 text-primary-500"/>
                     <h3 className="text-lg font-bold text-text-default">{t('coordinator_profile.tab_details')}</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <FormInput label={t('coordinators.col_username')} name="username" value={formData.username || ''} onChange={handleChange} />
                     <FormInput label={t('coordinators.col_email')} name="email" value={formData.email || ''} onChange={handleChange} />
                     <FormInput label={t('coordinators.col_phone')} name="phone" value={formData.phone || ''} onChange={handleChange} />
                     <FormInput label={t('coordinators.col_extension')} name="extension" value={formData.extension || ''} onChange={handleChange} />
                     <FormInput label={t('coordinators.col_sender')} name="senderName" value={formData.senderName || ''} onChange={handleChange} />
                     
                     <div className="md:col-span-2 pt-2">
                        <ToggleSwitch 
                            label={t('coordinators.col_active')} 
                            checked={formData.isActive || false} 
                            onChange={(checked) => setFormData((prev: any) => ({ ...prev, isActive: checked }))} 
                        />
                     </div>
                 </div>
             </div>
             
             <div className="flex justify-end">
                  <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all">{t('client_form.save')}</button>
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

const PermissionsTab: React.FC = () => {
    const { t } = useLanguage();
    const [role, setRole] = useState('recruiter');
    const [candidateScope, setCandidateScope] = useState('all');
    const [jobScope, setJobScope] = useState('department');

    // Granular Permissions
    const [permissions, setPermissions] = useState({
        canDeleteCandidates: false,
        canEditJobs: true,
        canManageClients: false,
        canViewReports: false,
        canManageTags: true
    });

    const togglePermission = (key: keyof typeof permissions) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="bg-bg-card p-6 rounded-xl border border-border-default shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                     <ShieldCheckIcon className="w-5 h-5 text-primary-500"/>
                     <h3 className="text-lg font-bold text-text-default">פרופיל הרשאה (Role)</h3>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                     <label className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${role === 'admin' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:bg-bg-subtle'}`}>
                         <input type="radio" name="role" value="admin" checked={role === 'admin'} onChange={(e) => setRole(e.target.value)} className="sr-only" />
                         <span className="block font-bold text-text-default mb-1">{t('coordinator_profile.role_admin')}</span>
                         <span className="text-xs text-text-muted">גישה מלאה לכלל ההגדרות, המשתמשים והנתונים במערכת.</span>
                     </label>
                     <label className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${role === 'manager' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:bg-bg-subtle'}`}>
                         <input type="radio" name="role" value="manager" checked={role === 'manager'} onChange={(e) => setRole(e.target.value)} className="sr-only" />
                         <span className="block font-bold text-text-default mb-1">{t('coordinator_profile.role_manager')}</span>
                         <span className="text-xs text-text-muted">ניהול צוות, צפייה בדוחות מתקדמים וניהול משרות.</span>
                     </label>
                     <label className={`cursor-pointer p-4 rounded-xl border-2 transition-all ${role === 'recruiter' ? 'border-primary-500 bg-primary-50' : 'border-border-default hover:bg-bg-subtle'}`}>
                         <input type="radio" name="role" value="recruiter" checked={role === 'recruiter'} onChange={(e) => setRole(e.target.value)} className="sr-only" />
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
                        <select value={candidateScope} onChange={(e) => setCandidateScope(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                            <option value="all">{t('coordinator_profile.scope_all')}</option>
                            <option value="department">{t('coordinator_profile.scope_department')}</option>
                            <option value="own">{t('coordinator_profile.scope_own')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-default mb-2">{t('coordinator_profile.scope_jobs')}</label>
                        <select value={jobScope} onChange={(e) => setJobScope(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                            <option value="all">{t('coordinator_profile.scope_jobs_all')}</option>
                            <option value="department">{t('coordinator_profile.scope_jobs_department')}</option>
                            <option value="own">{t('coordinator_profile.scope_jobs_own')}</option>
                        </select>
                    </div>
                </div>
                
                 {/* Specific Toggles */}
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
                    <ToggleSwitch label="מחיקת מועמדים (לצמיתות)" checked={permissions.canDeleteCandidates} onChange={() => togglePermission('canDeleteCandidates')} />
                    <ToggleSwitch label="עריכת פרטי משרה (כולל סגירה)" checked={permissions.canEditJobs} onChange={() => togglePermission('canEditJobs')} />
                    <ToggleSwitch label="ניהול ועיבוד נתוני לקוחות" checked={permissions.canManageClients} onChange={() => togglePermission('canManageClients')} />
                    <ToggleSwitch label="צפייה בדוחות ניהוליים" checked={permissions.canViewReports} onChange={() => togglePermission('canViewReports')} />
                    <ToggleSwitch label="ניהול תגיות מערכת" checked={permissions.canManageTags} onChange={() => togglePermission('canManageTags')} />
                </div>
            </div>

            <div className="flex justify-end">
                  <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 shadow-sm transition-all">{t('client_form.save')}</button>
             </div>
        </div>
    );
};

const CoordinatorProfileView: React.FC = () => {
    const { t } = useLanguage();
    const { coordinatorId } = useParams<{ coordinatorId: string }>();
    const navigate = useNavigate();
    
    // Find coordinator (Mock)
    const coordinator = coordinatorsData.find(c => c.id === Number(coordinatorId));
    
    const [activeTab, setActiveTab] = useState('details');
    const [formData, setFormData] = useState(coordinator || {});

    useEffect(() => {
        if (coordinator) {
            setFormData(coordinator);
        }
    }, [coordinator]);

    if (!coordinator) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-text-muted">
                <p className="text-lg font-semibold">רכז לא נמצא</p>
                <button onClick={() => navigate('/settings/coordinators')} className="mt-4 text-primary-600 hover:underline">חזרה לרשימה</button>
            </div>
        );
    }

    const tabs = [
        { id: 'details', label: t('coordinator_profile.tab_details'), icon: <UserIcon className="w-5 h-5"/> },
        { id: 'usage', label: t('coordinator_profile.tab_usage'), icon: <BriefcaseIcon className="w-5 h-5"/> },
        { id: 'signature', label: t('coordinator_profile.tab_signature'), icon: <LinkIcon className="w-5 h-5"/> },
        { id: 'permissions', label: t('coordinator_profile.tab_permissions'), icon: <UserGroupIcon className="w-5 h-5"/> },
    ];

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                     <div className="w-14 h-14 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center text-primary-700 font-bold text-2xl border-4 border-white shadow-sm">
                         {coordinator.username.charAt(0)}
                     </div>
                     <div>
                        <h1 className="text-2xl font-bold text-text-default flex items-center gap-2">
                            {coordinator.username}
                            {coordinator.isActive && (
                                <span title="פעיל">
                                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                                </span>
                            )}
                        </h1>
                        <p className="text-sm text-text-muted">{coordinator.email}</p>
                     </div>
                </div>
                 <button onClick={() => navigate('/settings/coordinators')} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition flex items-center gap-2 self-start sm:self-center">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>חזרה לרשימה</span>
                </button>
            </header>

            <div className="border-b border-border-default overflow-x-auto">
                <nav className="flex items-center -mb-px gap-6 min-w-max">
                    {tabs.map(tab => (
                         <button 
                            key={tab.id}
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
                {activeTab === 'details' && <DetailsTab coordinator={coordinator} formData={formData} setFormData={setFormData} />}
                {activeTab === 'usage' && <UsageTab />}
                {activeTab === 'signature' && <SignatureTab />}
                {activeTab === 'permissions' && <PermissionsTab />}
            </main>
        </div>
    );
};

export default CoordinatorProfileView;