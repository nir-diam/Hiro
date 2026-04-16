
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    BuildingOffice2Icon, ChartBarIcon, SparklesIcon, UserGroupIcon, 
    PaintBrushIcon, CheckCircleIcon, ArrowLeftIcon, 
    LockClosedIcon, BanknotesIcon, BriefcaseIcon, CloudArrowUpIcon,
    PlusIcon, XMarkIcon, ClipboardDocumentListIcon, ChatBubbleBottomCenterTextIcon,
    Cog6ToothIcon, CircleStackIcon, ViewColumnsIcon, Squares2X2Icon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

// --- TYPES ---
interface ClientUser {
    id: number;
    name: string;
    email: string;
    role: 'Admin' | 'Recruiter' | 'Viewer';
    lastLogin: string;
}

interface ClientData {
    id: string;
    clientName: string;
    displayName: string;
    status: 'active' | 'inactive' | 'trial' | 'suspended';
    packageType: 'starter' | 'pro' | 'enterprise';
    creationDate: string;
    renewalDate: string;
    mainContactName: string;
    mainContactEmail: string;
    mainContactPhone: string;
    smsSource: string;
    authorizedIps: string;
    primaryColor: string;
    logoUrl: string;
    matchingEnginePreset: 'balanced' | 'skills' | 'experience';
    
    // Quotas
    cvQuota: { used: number; total: number };
    smsQuota: { used: number; total: number };
    usersQuota: { used: number; total: number };
    jobsQuota: { used: number; total: number };
    emailsQuota: { used: number; total: number }; // New
    tagsQuota: { used: number; total: number };   // New
    storageQuota: { used: number; total: number }; // New (GB)
    aiCreditsQuota: { used: number; total: number }; // New (Tokens/Actions)

    modules: Record<string, boolean>;
    users: ClientUser[];
}

const packageDefaults = {
    starter: { cv: 500, sms: 100, users: 3, jobs: 5, emails: 500, tags: 20, storage: 5, ai: 100 },
    pro: { cv: 2000, sms: 1000, users: 10, jobs: 20, emails: 5000, tags: 100, storage: 50, ai: 1000 },
    enterprise: { cv: 10000, sms: 5000, users: 50, jobs: 100, emails: 50000, tags: 9999, storage: 500, ai: 10000 }
};

const DEFAULT_MODULES: Record<string, boolean> = {
    candidates: true,
    candidate_pool: true,
    jobs: true,
    job_board: true,
    misc: true,
    clients: true,
    finance: false,
    reports: true,
    communication: true,
    settings: true,
    ai_parsing: false,
    hiro_ai: false,
    portal: false,
};

const mergeModules = (raw: unknown): Record<string, boolean> => {
    const base = { ...DEFAULT_MODULES };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (v === true || v === false) base[k] = v;
    }
    return base;
};

const dbStatusToForm = (s: string | undefined): ClientData['status'] => {
    if (s === 'לא פעיל') return 'inactive';
    if (s === 'בהקפאה') return 'suspended';
    return 'active';
};

const formStatusToDb = (s: ClientData['status']): string => {
    if (s === 'inactive') return 'לא פעיל';
    if (s === 'suspended') return 'בהקפאה';
    return 'פעיל';
};

const formatDateInput = (v: string | Date | null | undefined): string => {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v) : v;
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
};

const clientApiToFormData = (raw: Record<string, unknown>): ClientData => {
    const usersRaw = raw.users;
    const users: ClientUser[] = Array.isArray(usersRaw)
        ? (usersRaw as Record<string, unknown>[]).map((u, i) => ({
              id: Number(u.id) || i + 1,
              name: String(u.name || ''),
              email: String(u.email || ''),
              role: (u.role as ClientUser['role']) || 'Recruiter',
              lastLogin: String(u.lastLogin || '-'),
          }))
        : [];

    return {
        id: String(raw.id || ''),
        clientName: String(raw.name || ''),
        displayName: String(raw.displayName || raw.name || ''),
        status: dbStatusToForm(raw.status as string),
        packageType: (raw.packageType as ClientData['packageType']) || 'starter',
        creationDate:
            formatDateInput(raw.creationDate as string) || new Date().toISOString().split('T')[0],
        renewalDate: formatDateInput(raw.renewalDate as string) || '',
        mainContactName: String(raw.mainContactName || ''),
        mainContactEmail: String(raw.mainContactEmail || ''),
        mainContactPhone: String(raw.mainContactPhone || ''),
        smsSource: String(raw.smsSource || ''),
        authorizedIps: String(raw.authorizedIps || ''),
        primaryColor: String(raw.primaryColor || '#8B5CF6'),
        logoUrl: String(raw.logoUrl || ''),
        matchingEnginePreset: 'balanced',
        cvQuota: { used: Number(raw.cvQuotaUsed ?? 0), total: Number(raw.cvQuotaTotal ?? 0) },
        smsQuota: { used: Number(raw.smsUsed ?? 0), total: Number(raw.smsTotal ?? 0) },
        usersQuota: { used: Number(raw.usersUsed ?? 0), total: Number(raw.usersTotal ?? 0) },
        jobsQuota: { used: Number(raw.jobsUsed ?? 0), total: Number(raw.jobsTotal ?? 0) },
        emailsQuota: { used: Number(raw.emailsQuotaUsed ?? 0), total: Number(raw.emailsQuotaTotal ?? 0) },
        tagsQuota: { used: Number(raw.tagsQuotaUsed ?? 0), total: Number(raw.tagsQuotaTotal ?? 0) },
        storageQuota: { used: Number(raw.storageQuotaUsed ?? 0), total: Number(raw.storageQuotaTotal ?? 0) },
        aiCreditsQuota: {
            used: Number(raw.aiCreditsQuotaUsed ?? 0),
            total: Number(raw.aiCreditsQuotaTotal ?? 0),
        },
        modules: mergeModules(raw.modules),
        users,
    };
};

/** New client: totals only — never send usage counters (server-owned). */
const buildClientCreatePayload = (form: ClientData): Record<string, unknown> => ({
    name: form.clientName,
    displayName: form.displayName,
    packageType: form.packageType,
    status: formStatusToDb(form.status),
    isActive: form.status === 'active' || form.status === 'trial',
    mainContactName: form.mainContactName || null,
    mainContactEmail: form.mainContactEmail || null,
    mainContactPhone: form.mainContactPhone || null,
    smsSource: form.smsSource || null,
    authorizedIps: form.authorizedIps || null,
    primaryColor: form.primaryColor || null,
    logoUrl: form.logoUrl || null,
    renewalDate: form.renewalDate || null,
    modules: form.modules,
    cvQuotaTotal: form.cvQuota.total,
    tagsQuotaTotal: form.tagsQuota.total,
    jobsTotal: form.jobsQuota.total,
    usersTotal: form.usersQuota.total,
    smsTotal: form.smsQuota.total,
    emailsQuotaTotal: form.emailsQuota.total,
    storageQuotaTotal: form.storageQuota.total,
    aiCreditsQuotaTotal: form.aiCreditsQuota.total,
});

const modulesEqual = (a: Record<string, boolean>, b: Record<string, boolean>) =>
    JSON.stringify(a) === JSON.stringify(b);

/** Edit: only fields that changed vs snapshot — avoids overwriting usage & spamming unused keys. */
const buildClientUpdatePatch = (form: ClientData, initial: ClientData): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (form.clientName !== initial.clientName) p.name = form.clientName;
    if (form.displayName !== initial.displayName) p.displayName = form.displayName;
    if (form.packageType !== initial.packageType) p.packageType = form.packageType;
    const st = formStatusToDb(form.status);
    const st0 = formStatusToDb(initial.status);
    if (st !== st0) {
        p.status = st;
        p.isActive = form.status === 'active' || form.status === 'trial';
    }
    if (form.mainContactName !== initial.mainContactName) p.mainContactName = form.mainContactName || null;
    if (form.mainContactEmail !== initial.mainContactEmail) p.mainContactEmail = form.mainContactEmail || null;
    if (form.mainContactPhone !== initial.mainContactPhone) p.mainContactPhone = form.mainContactPhone || null;
    if (form.smsSource !== initial.smsSource) p.smsSource = form.smsSource || null;
    if (form.authorizedIps !== initial.authorizedIps) p.authorizedIps = form.authorizedIps || null;
    if (form.primaryColor !== initial.primaryColor) p.primaryColor = form.primaryColor || null;
    if (form.logoUrl !== initial.logoUrl) p.logoUrl = form.logoUrl || null;
    if (form.renewalDate !== initial.renewalDate) p.renewalDate = form.renewalDate || null;
    if (!modulesEqual(form.modules, initial.modules)) p.modules = form.modules;

    if (form.cvQuota.total !== initial.cvQuota.total) p.cvQuotaTotal = form.cvQuota.total;
    if (form.tagsQuota.total !== initial.tagsQuota.total) p.tagsQuotaTotal = form.tagsQuota.total;
    if (form.jobsQuota.total !== initial.jobsQuota.total) p.jobsTotal = form.jobsQuota.total;
    if (form.usersQuota.total !== initial.usersQuota.total) p.usersTotal = form.usersQuota.total;
    if (form.smsQuota.total !== initial.smsQuota.total) p.smsTotal = form.smsQuota.total;
    if (form.emailsQuota.total !== initial.emailsQuota.total) p.emailsQuotaTotal = form.emailsQuota.total;
    if (form.storageQuota.total !== initial.storageQuota.total) p.storageQuotaTotal = form.storageQuota.total;
    if (form.aiCreditsQuota.total !== initial.aiCreditsQuota.total) {
        p.aiCreditsQuotaTotal = form.aiCreditsQuota.total;
    }
    return p;
};

// --- SUB-COMPONENTS ---

const TabButton: React.FC<{ 
    id: string; 
    label: string; 
    icon: React.ReactNode; 
    isActive: boolean; 
    onClick: () => void 
}> = ({ id, label, icon, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-bold transition-all border-b-2 ${
            isActive 
                ? 'border-primary-500 text-primary-600 bg-primary-50/50' 
                : 'border-transparent text-text-muted hover:text-text-default hover:bg-bg-subtle'
        }`}
    >
        {icon}
        {label}
    </button>
);

const FormInput: React.FC<{ 
    label: string; 
    value: string; 
    onChange: (val: string) => void; 
    type?: string; 
    required?: boolean;
    className?: string;
    placeholder?: string;
}> = ({ label, value, onChange, type = "text", required, className, placeholder }) => (
    <div className={className}>
        <label className="block text-xs font-bold text-text-muted uppercase mb-1.5 tracking-wide">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input 
            type={type} 
            value={value} 
            onChange={(e) => onChange(e.target.value)} 
            placeholder={placeholder}
            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all shadow-sm"
        />
    </div>
);

const ModuleCard: React.FC<{
    title: string;
    description: string;
    isEnabled: boolean;
    icon: React.ReactNode;
    onToggle: () => void;
    isPremium?: boolean;
}> = ({ title, description, isEnabled, icon, onToggle, isPremium }) => (
    <div 
        className={`relative p-5 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between h-full group ${
            isEnabled 
                ? 'bg-bg-card border-primary-500 ring-1 ring-primary-500 shadow-md' 
                : 'bg-bg-subtle/30 border-border-default hover:border-primary-200'
        }`}
        onClick={onToggle}
    >
        <div className="flex justify-between items-start mb-3">
            <div className={`p-2 rounded-lg ${isEnabled ? 'bg-primary-100 text-primary-600' : 'bg-bg-subtle text-text-muted'}`}>
                {icon}
            </div>
            <div className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${isEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${isEnabled ? 'translate-x-0' : '-translate-x-6'}`}></div>
            </div>
        </div>
        <div>
            <div className="flex items-center gap-2 mb-1">
                <h4 className={`font-bold text-base ${isEnabled ? 'text-primary-900' : 'text-text-default'}`}>{title}</h4>
                {isPremium && <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">PREMIUM</span>}
            </div>
            <p className="text-xs text-text-muted leading-relaxed">{description}</p>
        </div>
    </div>
);

const UsageInput: React.FC<{ 
    label: string; 
    used: number; 
    total: number; 
    unit?: string;
    onTotalChange: (val: number) => void;
}> = ({ label, used, total, unit, onTotalChange }) => {
    const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
    
    return (
        <div className="bg-bg-card p-4 rounded-xl border border-border-default shadow-sm">
            <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-text-default">{label}</span>
                <span className="text-xs text-text-muted bg-bg-subtle px-2 py-0.5 rounded">
                    בשימוש: <strong>{used.toLocaleString()}{unit ? ` ${unit}` : ''}</strong>
                </span>
            </div>
            <div className="relative">
                <input 
                    type="number" 
                    value={total} 
                    onChange={(e) => onTotalChange(parseInt(e.target.value) || 0)}
                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm font-bold focus:ring-2 focus:ring-primary-500 pl-16"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">מוגדר</span>
            </div>
            <div className="w-full h-1.5 bg-bg-subtle rounded-full overflow-hidden mt-3">
                <div 
                    className={`h-full rounded-full ${percent > 90 ? 'bg-red-500' : 'bg-primary-500'}`} 
                    style={{ width: `${percent}%` }}
                ></div>
            </div>
        </div>
    );
};

// --- USER MODAL (Create / Edit) ---
const UserModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    onSave: (user: any) => void;
    userToEdit?: ClientUser | null;
}> = ({ isOpen, onClose, onSave, userToEdit }) => {
    const [userData, setUserData] = useState({ name: '', email: '', password: '', role: 'Admin' });

    useEffect(() => {
        if (isOpen) {
            if (userToEdit) {
                setUserData({ 
                    name: userToEdit.name, 
                    email: userToEdit.email, 
                    password: '', // Reset password field for security
                    role: userToEdit.role 
                });
            } else {
                setUserData({ name: '', email: '', password: '', role: 'Admin' });
            }
        }
    }, [isOpen, userToEdit]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ 
            ...userData, 
            id: userToEdit ? userToEdit.id : undefined // Pass ID if editing
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-bg-card rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                <header className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg">{userToEdit ? 'עריכת משתמש' : 'הוסף משתמש (Admin)'}</h3>
                    <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted" /></button>
                </header>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <FormInput label="שם מלא" value={userData.name} onChange={(v) => setUserData({...userData, name: v})} required />
                    <FormInput label="אימייל (שם משתמש)" value={userData.email} onChange={(v) => setUserData({...userData, email: v})} type="email" required />
                    <FormInput 
                        label={userToEdit ? "איפוס סיסמה" : "סיסמה ראשונית"} 
                        value={userData.password} 
                        onChange={(v) => setUserData({...userData, password: v})} 
                        type="password" 
                        required={!userToEdit} // Required only for new users
                        placeholder={userToEdit ? "השאר ריק אם אין שינוי" : ""}
                    />
                    <div>
                        <label className="block text-xs font-bold text-text-muted uppercase mb-1.5">תפקיד</label>
                        <select 
                            value={userData.role} 
                            onChange={(e) => setUserData({...userData, role: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                        >
                            <option value="Admin">Admin (מנהל מערכת)</option>
                            <option value="Recruiter">Recruiter (רכז)</option>
                        </select>
                    </div>
                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-text-muted hover:bg-bg-subtle rounded-lg">ביטול</button>
                        <button type="submit" className="px-6 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm">
                            {userToEdit ? 'שמור שינויים' : 'צור משתמש'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- MAIN COMPONENT ---

const AdminClientFormView: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { refreshUser, user: authUser } = useAuth();
    const isEditing = !!clientId;
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const [activeTab, setActiveTab] = useState<'details' | 'modules' | 'quotas' | 'branding' | 'users'>('details');
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isLoadingClient, setIsLoadingClient] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    /** Snapshot after GET — used to send a minimal PUT (diff only, no usage counters). */
    const loadedSnapshotRef = useRef<ClientData | null>(null);

    const [formData, setFormData] = useState<ClientData>({
        id: '',
        clientName: '',
        displayName: '',
        status: 'active',
        packageType: 'starter',
        creationDate: new Date().toISOString().split('T')[0],
        renewalDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        mainContactName: '',
        mainContactEmail: '',
        mainContactPhone: '',
        smsSource: '',
        authorizedIps: '',
        primaryColor: '#8B5CF6',
        logoUrl: '',
        matchingEnginePreset: 'balanced',
        cvQuota: { used: 0, total: 500 },
        smsQuota: { used: 0, total: 100 },
        usersQuota: { used: 1, total: 3 },
        jobsQuota: { used: 0, total: 5 },
        emailsQuota: { used: 0, total: 500 },
        tagsQuota: { used: 0, total: 20 },
        storageQuota: { used: 0, total: 5 },
        aiCreditsQuota: { used: 0, total: 100 },
        modules: {
            candidates: true,
            candidate_pool: true,
            jobs: true,
            job_board: true,
            misc: true,
            clients: true,
            finance: false,
            reports: true,
            communication: true,
            settings: true,
            ai_parsing: false,
            hiro_ai: false,
            portal: false,
        },
        users: []
    });

    useEffect(() => {
        loadedSnapshotRef.current = null;
    }, [clientId]);

    useEffect(() => {
        if (!isEditing || !clientId) return;
        if (!apiBase) {
            setLoadError('חסר VITE_API_BASE');
            return;
        }
        let cancelled = false;
        setIsLoadingClient(true);
        setLoadError(null);
        fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`)
            .then((r) => {
                if (!r.ok) throw new Error('טעינת לקוח נכשלה');
                return r.json();
            })
            .then((raw) => {
                if (cancelled) return;
                const fd = clientApiToFormData(raw as Record<string, unknown>);
                setFormData(fd);
                loadedSnapshotRef.current = fd;
            })
            .catch((e: Error) => {
                if (!cancelled) setLoadError(e?.message || 'שגיאה');
            })
            .finally(() => {
                if (!cancelled) setIsLoadingClient(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isEditing, clientId, apiBase]);

    const handlePackageChange = (newPackage: 'starter' | 'pro' | 'enterprise') => {
        const defaults = packageDefaults[newPackage];
        setFormData(prev => ({
            ...prev,
            packageType: newPackage,
            // We update quotas based on package, but keep 'used' amount
            cvQuota: { ...prev.cvQuota, total: defaults.cv },
            smsQuota: { ...prev.smsQuota, total: defaults.sms },
            usersQuota: { ...prev.usersQuota, total: defaults.users },
            jobsQuota: { ...prev.jobsQuota, total: defaults.jobs },
            emailsQuota: { ...prev.emailsQuota, total: defaults.emails },
            tagsQuota: { ...prev.tagsQuota, total: defaults.tags },
            storageQuota: { ...prev.storageQuota, total: defaults.storage },
            aiCreditsQuota: { ...prev.aiCreditsQuota, total: defaults.ai },
        }));
    };

    const handleSave = async () => {
        if (!apiBase) {
            setLoadError('חסר VITE_API_BASE');
            return;
        }
        if (!formData.clientName.trim()) {
            setLoadError('שם חברה נדרש');
            return;
        }
        setIsSaving(true);
        setLoadError(null);
        try {
            let body: Record<string, unknown>;
            if (isEditing && clientId) {
                const snap = loadedSnapshotRef.current;
                if (snap) {
                    body = buildClientUpdatePatch(formData, snap);
                } else {
                    body = { modules: formData.modules };
                }
                if (Object.keys(body).length === 0) {
                    navigate('/admin/clients');
                    return;
                }
            } else {
                body = buildClientCreatePayload(formData);
            }

            if (isEditing && clientId) {
                const res = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error('שמירת לקוח נכשלה');
                if (authUser?.clientId && clientId === authUser.clientId) {
                    await refreshUser();
                }
            } else {
                const res = await fetch(`${apiBase}/api/clients`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error('יצירת לקוח נכשלה');
            }
            navigate('/admin/clients');
        } catch (e: unknown) {
            setLoadError(e instanceof Error ? e.message : 'שגיאה');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleModule = (key: string) => {
        setFormData((prev) => {
            const wasOn = prev.modules[key] !== false;
            return {
                ...prev,
                modules: { ...DEFAULT_MODULES, ...prev.modules, [key]: !wasOn },
            };
        });
    };

    const handleSaveUser = (user: any) => {
        if (user.id) {
            // Edit existing user
            setFormData(prev => ({
                ...prev,
                users: prev.users.map(u => u.id === user.id ? { ...u, ...user } : u)
            }));
        } else {
            // Create new user
            const newUser = { ...user, id: Date.now(), lastLogin: '-' };
            setFormData(prev => ({ ...prev, users: [...prev.users, newUser] }));
        }
    };

    const openAddUser = () => {
        setEditingUser(null);
        setIsUserModalOpen(true);
    }

    const openEditUser = (user: ClientUser) => {
        setEditingUser(user);
        setIsUserModalOpen(true);
    }

    if (isEditing && isLoadingClient) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 min-h-[40vh] text-text-muted text-sm">
                טוען לקוח…
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-bg-default relative overflow-hidden">
            {loadError && (
                <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-6 py-3 shrink-0">
                    {loadError}
                </div>
            )}
            {/* Top Bar */}
            <div className="bg-bg-card border-b border-border-default px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/admin/clients')} className="p-2 rounded-full hover:bg-bg-subtle text-text-muted transition-colors">
                        <ArrowLeftIcon className="w-5 h-5 transform rotate-180" />
                    </button>
                    <div>
                        <h1 className="text-xl font-black text-text-default">
                            {isEditing ? `עריכת לקוח: ${formData.clientName}` : 'לקוח חדש'}
                        </h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className={`w-2 h-2 rounded-full ${formData.status === 'active' ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                            <span className="text-xs text-text-muted uppercase font-bold tracking-wide">
                                {formData.packageType.toUpperCase()} PLAN
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3">
                     <button 
                        onClick={() => navigate('/admin/clients')} 
                        className="px-4 py-2 rounded-lg text-sm font-bold text-text-muted hover:bg-bg-subtle transition"
                    >
                        ביטול
                    </button>
                    <button 
                        onClick={() => void handleSave()} 
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-primary-700 transition shadow-md disabled:opacity-60"
                    >
                        <span>{isSaving ? 'שומר…' : 'שמור שינויים'}</span>
                    </button>
                </div>
            </div>

            {/* Layout: Sidebar Tabs + Content Area */}
            <div className="flex flex-1 overflow-hidden">
                
                {/* Tabs Sidebar (Desktop) */}
                <div className="w-64 bg-bg-card border-l border-border-default flex flex-col hidden md:flex shrink-0">
                    <div className="p-4 space-y-1">
                        <p className="px-4 py-2 text-xs font-black text-text-muted uppercase tracking-wider mb-2">הגדרות</p>
                        <button 
                            onClick={() => setActiveTab('details')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'details' ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}`}
                        >
                            <BuildingOffice2Icon className="w-5 h-5"/> פרטים כלליים
                        </button>
                         <button 
                            onClick={() => setActiveTab('modules')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'modules' ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}`}
                        >
                            <SparklesIcon className="w-5 h-5"/> מודולים ורישוי
                        </button>
                         <button 
                            onClick={() => setActiveTab('quotas')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'quotas' ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}`}
                        >
                            <ChartBarIcon className="w-5 h-5"/> מכסות ושימוש
                        </button>
                         <button 
                            onClick={() => setActiveTab('branding')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'branding' ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}`}
                        >
                            <PaintBrushIcon className="w-5 h-5"/> מיתוג מערכת
                        </button>
                         <button 
                            onClick={() => setActiveTab('users')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-primary-50 text-primary-700 shadow-sm' : 'text-text-muted hover:bg-bg-subtle hover:text-text-default'}`}
                        >
                            <UserGroupIcon className="w-5 h-5"/> משתמשים
                        </button>
                    </div>
                </div>

                {/* Mobile Tabs */}
                <div className="md:hidden w-full border-b border-border-default overflow-x-auto flex bg-bg-card shrink-0">
                    <TabButton id="details" label="כללי" icon={<BuildingOffice2Icon className="w-4 h-4"/>} isActive={activeTab === 'details'} onClick={() => setActiveTab('details')} />
                    <TabButton id="modules" label="מודולים" icon={<SparklesIcon className="w-4 h-4"/>} isActive={activeTab === 'modules'} onClick={() => setActiveTab('modules')} />
                    <TabButton id="quotas" label="מכסות" icon={<ChartBarIcon className="w-4 h-4"/>} isActive={activeTab === 'quotas'} onClick={() => setActiveTab('quotas')} />
                    <TabButton id="branding" label="מיתוג" icon={<PaintBrushIcon className="w-4 h-4"/>} isActive={activeTab === 'branding'} onClick={() => setActiveTab('branding')} />
                    <TabButton id="users" label="משתמשים" icon={<UserGroupIcon className="w-4 h-4"/>} isActive={activeTab === 'users'} onClick={() => setActiveTab('users')} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-bg-subtle/30">
                    <div className="max-w-4xl mx-auto space-y-6">
                        
                        {/* TAB: GENERAL DETAILS */}
                        {activeTab === 'details' && (
                            <div className="animate-fade-in space-y-6">
                                <div className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-text-default mb-4">פרטי החברה</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormInput label="שם חברה (לחיוב)" value={formData.clientName} onChange={v => setFormData({...formData, clientName: v})} required />
                                        <FormInput label="שם תצוגה (במערכת)" value={formData.displayName} onChange={v => setFormData({...formData, displayName: v})} />
                                        
                                        <div>
                                            <label className="block text-xs font-bold text-text-muted uppercase mb-1.5 tracking-wide">סטטוס</label>
                                            <select 
                                                value={formData.status} 
                                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                                                className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                            >
                                                <option value="active">פעיל</option>
                                                <option value="trial">תקופת ניסיון</option>
                                                <option value="suspended">מושהה</option>
                                                <option value="inactive">לא פעיל</option>
                                            </select>
                                        </div>
                                        
                                        <div>
                                            <label className="block text-xs font-bold text-text-muted uppercase mb-1.5 tracking-wide">חבילה (Template)</label>
                                            <select 
                                                value={formData.packageType} 
                                                onChange={e => handlePackageChange(e.target.value as any)}
                                                className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500"
                                            >
                                                <option value="starter">Starter</option>
                                                <option value="pro">Professional</option>
                                                <option value="enterprise">Enterprise</option>
                                            </select>
                                            <p className="text-[10px] text-text-muted mt-1">* בחירת חבילה תאפס את המכסות לברירת המחדל.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-text-default mb-4">איש קשר ראשי</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <FormInput label="שם מלא" value={formData.mainContactName} onChange={v => setFormData({...formData, mainContactName: v})} />
                                        <FormInput label="אימייל" value={formData.mainContactEmail} onChange={v => setFormData({...formData, mainContactEmail: v})} type="email" />
                                        <FormInput label="טלפון" value={formData.mainContactPhone} onChange={v => setFormData({...formData, mainContactPhone: v})} type="tel" />
                                    </div>
                                </div>

                                <div className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-text-default mb-4">הגדרות טכניות</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <FormInput label="מקור סמס (Sender ID)" value={formData.smsSource} onChange={v => setFormData({...formData, smsSource: v})} />
                                        <FormInput label="כתובות IP מורשות" value={formData.authorizedIps} onChange={v => setFormData({...formData, authorizedIps: v})} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: MODULES */}
                        {activeTab === 'modules' && (
                            <div className="animate-fade-in space-y-8">
                                <div>
                                    <h3 className="text-lg font-bold text-text-default mb-4 px-1">מודולי ליבה (Core)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <ModuleCard 
                                            title="רשימת מועמדים" 
                                            description="ניהול וצפייה במועמדים, סטטוסים ומסלולי גיוס."
                                            icon={<ClipboardDocumentListIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.candidates}
                                            onToggle={() => toggleModule('candidates')}
                                        />
                                        <ModuleCard 
                                            title="משרות" 
                                            description="פרסום משרות, ניהול תיאורים ומעקב אחר מועמדים למשרה."
                                            icon={<BriefcaseIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.jobs}
                                            onToggle={() => toggleModule('jobs')}
                                        />
                                        <ModuleCard 
                                            title="לוח משרות" 
                                            description="לוח משרות פתוחות ופרסומים."
                                            icon={<ViewColumnsIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.job_board}
                                            onToggle={() => toggleModule('job_board')}
                                        />
                                        <ModuleCard 
                                            title="מאגר מועמדים" 
                                            description="מאגר מועמדים ומועמדות לפני שיוך למשרה."
                                            icon={<CircleStackIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.candidate_pool}
                                            onToggle={() => toggleModule('candidate_pool')}
                                        />
                                        <ModuleCard 
                                            title="שונות" 
                                            description="דף הבית, התראות וקישורים מהירים."
                                            icon={<Squares2X2Icon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.misc}
                                            onToggle={() => toggleModule('misc')}
                                        />
                                        <ModuleCard 
                                            title="לקוחות" 
                                            description="כרטיסי לקוח, אנשי קשר והיסטוריית התקשרות."
                                            icon={<BuildingOffice2Icon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.clients}
                                            onToggle={() => toggleModule('clients')}
                                        />
                                        <ModuleCard 
                                            title="כספים" 
                                            description="חשבוניות, מעקב גבייה וחישוב עמלות."
                                            icon={<BanknotesIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.finance}
                                            onToggle={() => toggleModule('finance')}
                                        />
                                        <ModuleCard 
                                            title="דוחות" 
                                            description="דוחות, לוחות בקרה ומדדי ביצועים."
                                            icon={<ChartBarIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.reports}
                                            onToggle={() => toggleModule('reports')}
                                        />
                                        <ModuleCard 
                                            title="מרכז תקשורת" 
                                            description="הודעות, מיילים ותקשורת מרוכזת עם הצוות והמועמדים."
                                            icon={<ChatBubbleBottomCenterTextIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.communication}
                                            onToggle={() => toggleModule('communication')}
                                        />
                                        <ModuleCard 
                                            title="הגדרות" 
                                            description="הגדרות מערכת, ארגון, הרשאות ופרטי לקוח."
                                            icon={<Cog6ToothIcon className="w-6 h-6"/>}
                                            isEnabled={!!formData.modules.settings}
                                            onToggle={() => toggleModule('settings')}
                                        />
                                    </div>
                                </div>

                                
                            </div>
                        )}

                        {/* TAB: QUOTAS */}
                        {activeTab === 'quotas' && (
                            <div className="animate-fade-in space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <UsageInput 
                                        label="חבילת קו''ח (Parsing)" 
                                        used={formData.cvQuota.used} 
                                        total={formData.cvQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, cvQuota: { ...prev.cvQuota, total: val }}))}
                                    />
                                    <UsageInput 
                                        label="חבילת סמסים (SMS)" 
                                        used={formData.smsQuota.used} 
                                        total={formData.smsQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, smsQuota: { ...prev.smsQuota, total: val }}))}
                                    />
                                    <UsageInput 
                                        label="כמות משתמשים" 
                                        used={formData.usersQuota.used} 
                                        total={formData.usersQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, usersQuota: { ...prev.usersQuota, total: val }}))}
                                    />
                                     <UsageInput 
                                        label="משרות פעילות" 
                                        used={formData.jobsQuota.used} 
                                        total={formData.jobsQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, jobsQuota: { ...prev.jobsQuota, total: val }}))}
                                    />
                                     <UsageInput 
                                        label="כמות מיילים" 
                                        used={formData.emailsQuota.used} 
                                        total={formData.emailsQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, emailsQuota: { ...prev.emailsQuota, total: val }}))}
                                    />
                                     <UsageInput 
                                        label="תגיות פנימיות" 
                                        used={formData.tagsQuota.used} 
                                        total={formData.tagsQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, tagsQuota: { ...prev.tagsQuota, total: val }}))}
                                    />
                                     <UsageInput 
                                        label="נפח אחסון (GB)" 
                                        used={formData.storageQuota.used} 
                                        total={formData.storageQuota.total} 
                                        unit="GB"
                                        onTotalChange={(val) => setFormData(prev => ({...prev, storageQuota: { ...prev.storageQuota, total: val }}))}
                                    />
                                     <UsageInput 
                                        label="קרדיטים ל-AI" 
                                        used={formData.aiCreditsQuota.used} 
                                        total={formData.aiCreditsQuota.total} 
                                        onTotalChange={(val) => setFormData(prev => ({...prev, aiCreditsQuota: { ...prev.aiCreditsQuota, total: val }}))}
                                    />
                                </div>
                                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-sm text-blue-800">
                                    <strong>הערה:</strong> שינוי המספרים כאן דורס את הגדרות ברירת המחדל של החבילה עבור לקוח זה בלבד.
                                </div>
                            </div>
                        )}

                        {/* TAB: BRANDING */}
                        {activeTab === 'branding' && (
                            <div className="animate-fade-in space-y-6">
                                <div className="bg-bg-card border border-border-default rounded-2xl p-6 shadow-sm">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                        <div>
                                            <h3 className="font-bold text-text-default mb-2">צבעי מערכת</h3>
                                            <p className="text-sm text-text-muted mb-4">בחר את הצבע הראשי שילווה את הממשק עבור משתמשי הלקוח.</p>
                                            
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="color" 
                                                    value={formData.primaryColor}
                                                    onChange={(e) => setFormData({...formData, primaryColor: e.target.value})}
                                                    className="w-16 h-16 rounded-xl cursor-pointer border-none p-0 bg-transparent"
                                                />
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-mono text-text-default">{formData.primaryColor}</span>
                                                    <span className="text-xs text-text-muted">Primary Color</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-text-default mb-2">לוגו חברה</h3>
                                            <p className="text-sm text-text-muted mb-4">יופיע בפינה העליונה ובמיילים יוצאים.</p>
                                            
                                            <div className="flex items-center gap-4">
                                                <div className="w-32 h-32 bg-bg-subtle border-2 border-dashed border-border-default rounded-xl flex items-center justify-center text-text-muted">
                                                    {formData.logoUrl ? <img src={formData.logoUrl} alt="Logo" className="max-w-full max-h-full p-2" /> : <span className="text-xs">אין לוגו</span>}
                                                </div>
                                                <button className="text-sm font-bold text-primary-600 hover:bg-primary-50 px-4 py-2 rounded-lg transition">
                                                    העלה תמונה...
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: USERS */}
                        {activeTab === 'users' && (
                            <div className="animate-fade-in">
                                <div className="bg-bg-card border border-border-default rounded-2xl overflow-hidden shadow-sm">
                                    <div className="p-4 border-b border-border-default flex justify-between items-center bg-bg-subtle/30">
                                        <h3 className="font-bold text-text-default">משתמשים פעילים ({formData.users.length})</h3>
                                        <button 
                                            onClick={openAddUser}
                                            className="text-sm font-bold text-primary-600 bg-primary-50 hover:bg-primary-100 px-4 py-2 rounded-lg transition flex items-center gap-2"
                                        >
                                            <PlusIcon className="w-4 h-4"/>
                                            הוסף משתמש
                                        </button>
                                    </div>
                                    <table className="w-full text-right text-sm">
                                        <thead className="bg-bg-subtle text-text-muted font-semibold border-b border-border-default">
                                            <tr>
                                                <th className="p-4">שם מלא</th>
                                                <th className="p-4">אימייל</th>
                                                <th className="p-4">תפקיד</th>
                                                <th className="p-4">התחברות אחרונה</th>
                                                <th className="p-4 w-10"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle">
                                            {formData.users.map(user => (
                                                <tr key={user.id} className="hover:bg-bg-hover">
                                                    <td className="p-4 font-bold text-text-default">{user.name}</td>
                                                    <td className="p-4 text-text-default">{user.email}</td>
                                                    <td className="p-4">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                                                            user.role === 'Admin' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-blue-50 text-blue-700 border-blue-100'
                                                        }`}>
                                                            {user.role}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-text-muted">{user.lastLogin}</td>
                                                    <td className="p-4 text-center">
                                                        <button 
                                                            onClick={() => openEditUser(user)}
                                                            className="text-primary-600 font-bold hover:underline text-xs"
                                                        >
                                                            ערוך
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {formData.users.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-text-muted">
                                                        אין משתמשים. לחץ על "הוסף משתמש" כדי ליצור את המנהל הראשון.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                    </div>
                </div>
            </div>

            <UserModal 
                isOpen={isUserModalOpen} 
                onClose={() => setIsUserModalOpen(false)} 
                onSave={handleSaveUser}
                userToEdit={editingUser}
            />
        </div>
    );
};

export default AdminClientFormView;
