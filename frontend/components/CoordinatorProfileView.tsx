
import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { InformationCircleIcon, CheckCircleIcon, ArrowTopRightOnSquareIcon, LinkIcon, BriefcaseIcon, UserGroupIcon, Cog6ToothIcon, UserIcon } from './Icons';
import { coordinatorsData } from './CoordinatorsSettingsView';


// --- TABS ---
const DetailsTab: React.FC<{ coordinator: any; formData: any; setFormData: any; }> = ({ coordinator, formData, setFormData }) => {
     const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData((prev: any) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                <div className="bg-bg-subtle/70 p-3 rounded-lg"><strong className="block text-text-muted">תאריך יצירה:</strong>{new Date(coordinator.creationDate).toLocaleString('he-IL')}</div>
                <div className="bg-bg-subtle/70 p-3 rounded-lg"><strong className="block text-text-muted">התחברות אחרונה:</strong>{new Date(coordinator.lastLogin).toLocaleString('he-IL')}</div>
            </div>
             <label className="flex items-center gap-2 text-sm font-semibold text-text-muted cursor-pointer bg-bg-subtle/70 p-3 rounded-lg w-fit">
                <input type="checkbox" name="isActive" checked={formData.isActive} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500" />
                פעיל
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="space-y-4">
                    <input name="username" value={formData.username} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                    <input name="senderName" value={formData.senderName} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                    <input name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                    <input name="extension" value={formData.extension} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                </div>
                <div className="space-y-4">
                     <div className="relative">
                        <input type="email" value={formData.email} disabled className="w-full bg-bg-subtle/50 border-border-default text-text-muted text-sm rounded-lg p-2.5" />
                        <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-semibold text-primary-600 hover:underline">איפוס סיסמה</button>
                    </div>
                    <input type="email" name="newEmail" value={formData.newEmail} onChange={handleChange} placeholder="דוא''ל חדש (אופציונלי)" className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> אימות מייל</span>
                        <span className="flex items-center gap-1.5 font-medium text-green-600"><CheckCircleIcon className="w-5 h-5"/> אימות דומיין</span>
                        <a href="#" className="flex items-center gap-1 text-primary-600 hover:underline"><ArrowTopRightOnSquareIcon className="w-4 h-4"/> מידע נוסף</a>
                    </div>
                </div>
            </div>
            <div className="pt-4">
                <label className="block text-sm font-semibold text-text-muted mb-1.5">הפניות שותפים:</label>
                <div className="p-2.5 bg-bg-subtle/70 border border-border-default rounded-lg text-sm text-primary-600 font-mono flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    <span>https://app.hiro.co.il/r/a1b2c3d4e5</span>
                </div>
            </div>
        </div>
    );
};

const UsageSettingsTab: React.FC<{ settings: any; setSettings: any; }> = ({ settings, setSettings }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setSettings((prev: any) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };
    return (
        <div>
            <div className="bg-bg-card p-4 rounded-lg border border-border-default">
                <SettingRow label="גישה לדף הבית"><select name="homepageAccess" value={settings.homepageAccess} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option>נתוני רכז בלבד</option></select></SettingRow>
                <SettingRow label="אימות כפול"><select name="twoFactor" value={settings.twoFactor} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option>לא פעיל</option></select></SettingRow>
                <SettingRow label="אירועים חסויים"><select name="confidentialEvents" value={settings.confidentialEvents} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option></option></select></SettingRow>
                <SettingRow label="מקורות חסומים"><select name="blockedSources" value={settings.blockedSources} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option></option></select></SettingRow>
                <SettingRow label="אישור ייצוא"><select name="exportApproval" value={settings.exportApproval} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option></option></select></SettingRow>
                <SettingRow label="שפה"><select name="language" value={settings.language} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"><option>עברית</option></select></SettingRow>
            </div>
             <div className="bg-bg-card p-4 rounded-lg border border-border-default mt-6">
                <CheckboxRow name="showOnlyOwnJobs" label='הצג רק משרות של בדף "סינון ראשוני"' checked={settings.showOnlyOwnJobs} onChange={handleChange}/>
                <CheckboxRow name="showOtherRecruiterMessages" label="הצג הודעה חדשה של רכזים אחרים" checked={settings.showOtherRecruiterMessages} onChange={handleChange}/>
                <CheckboxRow name="showOwnReferrals" label="הצג רק הפניות של" checked={settings.showOwnReferrals} onChange={handleChange}/>
                <CheckboxRow name="showOwnJobs" label="הצג רק את המשרות שלי" checked={settings.showOwnJobs} onChange={handleChange}/>
                <CheckboxRow name="showExternalDocuments" label={'להציג חיצוני "מסמכים" בדף לקוח'} checked={settings.showExternalDocuments} onChange={handleChange}/>
            </div>
        </div>
    );
};

const SignatureTab: React.FC<{ signature: string; setSignature: (html: string) => void; }> = ({ signature, setSignature }) => (
    <div className="space-y-4">
        <p className="text-sm text-text-muted">צור חתימה אישית שתצורף אוטומטית להודעות אימייל שתשלח מהמערכת.</p>
        <div className="border border-border-default rounded-lg overflow-hidden">
            <div className="flex items-center gap-1 p-2 bg-bg-subtle border-b border-border-default text-text-muted">
                <button className="p-2 hover:bg-bg-hover rounded-md font-bold">B</button>
                <button className="p-2 hover:bg-bg-hover rounded-md font-bold italic">I</button>
                <button className="p-2 hover:bg-bg-hover rounded-md font-bold underline">U</button>
                <div className="w-px h-5 bg-border-default mx-1"></div>
                <button className="p-2 hover:bg-bg-hover rounded-md"><LinkIcon className="w-5 h-5" /></button>
            </div>
            <textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={8} className="w-full p-4 bg-bg-input border-0 focus:ring-0 text-sm" placeholder="בברכה, מיכל..."></textarea>
        </div>
    </div>
);

const allPermissions = {
    "מועמדים": ["צפייה ברשימת מועמדים", "יצירת מועמד חדש", "עריכת פרטי מועמד", "מחיקת מועמד"],
    "משרות": ["צפייה ברשימת משרות", "יצירת משרה חדשה", "עריכת משרה", "מחיקת משרה"],
    "לקוחות": ["צפייה ברשימת לקוחות", "יצירת לקוח חדש", "עריכת לקוח"],
    "דוחות": ["גישה לדוחות", "יצירת דוחות חדשים"],
    "הגדרות": ["גישה להגדרות חברה", "ניהול רכזים", "ניהול תבניות"],
};

type UserRole = 'admin' | 'manager' | 'recruiter';
type DataScope = 'all' | 'own' | 'department';

const PermissionsTab: React.FC<{ 
    permissions: { [key: string]: boolean }; 
    setPermissions: (p: any) => void; 
    role: UserRole;
    setRole: (r: UserRole) => void;
    dataScope: { candidates: DataScope, jobs: DataScope };
    setDataScope: (s: { candidates: DataScope, jobs: DataScope }) => void;
}> = ({ permissions, setPermissions, role, setRole, dataScope, setDataScope }) => {
    
    const handlePermissionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setPermissions((prev: any) => ({ ...prev, [name]: checked }));
    };

    const handleRoleChange = (newRole: UserRole) => {
        setRole(newRole);
        // In a real app, you would auto-select permissions based on role here
    };

    return (
        <div className="space-y-6">
            {/* Role & Scope Selection */}
            <div className="bg-primary-50/50 p-5 rounded-xl border border-primary-100 space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-bold text-primary-800 mb-2">תפקיד במערכת</label>
                        <select 
                            value={role} 
                            onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                            className="w-full bg-white border border-primary-200 rounded-lg p-2 text-sm focus:ring-primary-500 focus:border-primary-500 font-medium"
                        >
                            <option value="admin">מנהל מערכת (Super Admin)</option>
                            <option value="manager">מנהל גיוס (Manager)</option>
                            <option value="recruiter">רכז גיוס (Recruiter)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-primary-800 mb-2">חשיפת מועמדים</label>
                        <select 
                            value={dataScope.candidates} 
                            onChange={(e) => setDataScope({...dataScope, candidates: e.target.value as DataScope})}
                            className="w-full bg-white border border-primary-200 rounded-lg p-2 text-sm"
                        >
                            <option value="all">כל המועמדים במערכת</option>
                            <option value="department">מועמדים במחלקה שלי</option>
                            <option value="own">רק מועמדים שלי</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-primary-800 mb-2">חשיפת משרות</label>
                        <select 
                            value={dataScope.jobs} 
                            onChange={(e) => setDataScope({...dataScope, jobs: e.target.value as DataScope})}
                            className="w-full bg-white border border-primary-200 rounded-lg p-2 text-sm"
                        >
                            <option value="all">כל המשרות במערכת</option>
                            <option value="department">משרות במחלקה שלי</option>
                            <option value="own">רק משרות שלי</option>
                        </select>
                    </div>
                 </div>
                 <p className="text-xs text-primary-600">הגדרות אלו קובעות את ברירת המחדל ואת היקף המידע שהמשתמש יראה. ניתן לדייק הרשאות ספציפיות למטה.</p>
            </div>

            {/* Granular Permissions */}
            <h3 className="text-lg font-bold text-text-default mt-6 mb-2">הרשאות ביצוע (Actions)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(allPermissions).map(([group, perms]) => (
                    <div key={group} className="bg-bg-subtle/70 p-4 rounded-lg border border-border-default">
                        <h3 className="font-bold text-base text-text-default mb-3">{group}</h3>
                        <div className="space-y-3">
                            {perms.map(perm => (
                                <label key={perm} className="flex items-center gap-3 text-sm font-medium text-text-default cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        name={perm} 
                                        checked={permissions[perm] || false} 
                                        onChange={handlePermissionChange} 
                                        className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500"
                                    />
                                    {perm}
                                </label>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- REUSABLE COMPONENTS ---
const TabButton: React.FC<{ title: string; isActive: boolean; onClick: () => void; }> = ({ title, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${
            isActive ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'
        }`}
    >
        {title}
    </button>
);

const SettingRow: React.FC<{ label: string; children: React.ReactNode; tooltip?: string }> = ({ label, children, tooltip }) => (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] lg:grid-cols-2 items-center gap-4 py-3 border-b border-border-default last:border-b-0">
        <label className="text-sm font-semibold text-text-default flex items-center gap-2">
            <span title={tooltip}>
                <InformationCircleIcon className="w-5 h-5 text-text-subtle flex-shrink-0" />
            </span>
            <span>{label}</span>
        </label>
        <div className="w-full max-w-[250px] justify-self-start md:justify-self-end">{children}</div>
    </div>
);

const CheckboxRow: React.FC<{ label: string; name: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; isSub?: boolean }> = ({ label, name, checked, onChange, isSub = false }) => (
    <div className={`flex items-center justify-between py-3 border-b border-border-default last:border-b-0 ${isSub ? 'pr-8' : ''}`}>
        <label htmlFor={name} className="text-sm font-semibold text-text-default flex items-center gap-2 cursor-pointer">
            {!isSub && <InformationCircleIcon className="w-5 h-5 text-text-subtle flex-shrink-0" />}
            <span>{label}</span>
        </label>
        <input 
            type="checkbox" 
            id={name}
            name={name} 
            checked={checked} 
            onChange={onChange} 
            className="w-5 h-5 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500 cursor-pointer"
        />
    </div>
);


const CoordinatorProfileView: React.FC = () => {
    const { coordinatorId } = useParams<{ coordinatorId: string }>();
    const [activeTab, setActiveTab] = useState<'details' | 'usage' | 'signature' | 'permissions'>('details');
    
    const numericCoordinatorId = coordinatorId ? parseInt(coordinatorId, 10) : null;
    const coordinator = useMemo(() => 
        coordinatorsData.find(c => c.id === numericCoordinatorId) || coordinatorsData[0], 
        [numericCoordinatorId]
    );
    
    const [formData, setFormData] = useState({
        username: coordinator.username,
        senderName: coordinator.senderName,
        phone: coordinator.phone,
        extension: coordinator.extension,
        email: coordinator.email,
        newEmail: '',
        isActive: coordinator.isActive,
    });
    
    const [usageSettings, setUsageSettings] = useState({
        homepageAccess: 'נתוני רכז בלבד', twoFactor: 'לא פעיל', confidentialEvents: '', blockedSources: '', exportApproval: '', language: 'עברית',
        showOnlyOwnJobs: true, showOtherRecruiterMessages: false, showOwnReferrals: true, showOwnJobs: true, showExternalDocuments: true,
    });
    
    const [signature, setSignature] = useState('');
    
    // New State for Permissions Tab
    const [role, setRole] = useState<UserRole>('recruiter');
    const [dataScope, setDataScope] = useState<{ candidates: DataScope, jobs: DataScope }>({ candidates: 'own', jobs: 'own' });
    const [permissions, setPermissions] = useState(
        Object.values(allPermissions).flat().reduce((acc, perm) => ({...acc, [perm]: true}), {}) // default all to true for mock
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'details': return <DetailsTab coordinator={coordinator} formData={formData} setFormData={setFormData} />;
            case 'usage': return <UsageSettingsTab settings={usageSettings} setSettings={setUsageSettings} />;
            case 'signature': return <SignatureTab signature={signature} setSignature={setSignature} />;
            case 'permissions': return <PermissionsTab permissions={permissions} setPermissions={setPermissions} role={role} setRole={setRole} dataScope={dataScope} setDataScope={setDataScope} />;
            default: return null;
        }
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
             <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.3s ease-out; }`}</style>
            <header className="flex-shrink-0 mb-6">
                <div className="border-b border-border-default">
                    <nav className="flex items-center -mb-px">
                        <TabButton title="פרטי רכז" isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                        <TabButton title="הגדרות שימוש" isActive={activeTab === 'usage'} onClick={() => setActiveTab('usage')} />
                        <TabButton title="חתימה" isActive={activeTab === 'signature'} onClick={() => setActiveTab('signature')} />
                        <TabButton title="הרשאות גישה" isActive={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')} />
                    </nav>
                </div>
            </header>
            <main className="flex-1 overflow-y-auto p-2">
                <div className="animate-fade-in">
                    {renderContent()}
                </div>
            </main>
             <footer className="flex justify-end items-center mt-6 pt-4 border-t border-border-default">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">שמור שינויים</button>
            </footer>
        </div>
    );
};

export default CoordinatorProfileView;
