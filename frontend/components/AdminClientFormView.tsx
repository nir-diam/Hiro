
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AccordionSection from './AccordionSection';
import { BuildingOffice2Icon, ChartBarIcon, SparklesIcon } from './Icons';

// --- TYPES ---
interface ClientData {
    id: number;
    clientName: string;
    name: string;
    creationDate: string;
    smsSource: string;
    authorizedIps: string;
    verifiedPhones: string;
    
    // Quotas
    cvQuotaTotal: number;
    tagsQuotaTotal: number;
    jobsQuotaTotal: number;
    coordinatorsQuotaTotal: number;
    contactsQuotaTotal: number;
    
    // Specific Usage Limits
    smsBackup: number; smsMonthly: number; 
    questionnaireBackup: number; questionnaireMonthly: number; 
    emailBackup: number; emailMonthly: number; 
    hiroAiMonthly: number; 
    
    // Modules
    modules: {
        ai_parsing: boolean;
        manager_portal: boolean;
        hiro_ai: boolean;
    };
}

// --- MOCK DATA FOR EDITING ---
const FormInput: React.FC<{ label: string; name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; required?: boolean; }> = ({ label, name, value, onChange, type = 'text', placeholder, required = false }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm" />
    </div>
);

const QuotaInput: React.FC<{ label: string; name: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, onChange }) => (
     <div className="bg-bg-subtle/70 p-3 rounded-lg border border-border-default">
        <label className="block text-xs font-semibold text-text-muted mb-1">{label}</label>
        <input type="number" name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2 transition shadow-sm" />
    </div>
);

const ToggleSwitch: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void; }> = ({ label, checked, onChange }) => (
    <label className="flex items-center justify-between cursor-pointer bg-bg-card p-3 rounded-lg border border-border-default hover:border-primary-300 transition-colors">
        <span className="text-sm font-medium text-text-default">{label}</span>
        <div className="relative">
            <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <div className={`block w-10 h-6 rounded-full transition ${checked ? 'bg-primary-600' : 'bg-gray-300'}`}></div>
            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-4' : ''}`}></div>
        </div>
    </label>
);

const AdminClientFormView: React.FC = () => {
    const { clientId } = useParams<{ clientId: string }>();
    const navigate = useNavigate();
    const isEditing = !!clientId;
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // Initialize with default values
    const [formData, setFormData] = useState<ClientData>({
        id: 0,
        clientName: '',
        name: '',
        creationDate: new Date().toISOString().split('T')[0],
        smsSource: '',
        authorizedIps: '',
        verifiedPhones: '',
        cvQuotaTotal: 1000,
        tagsQuotaTotal: 50,
        jobsQuotaTotal: 10,
        coordinatorsQuotaTotal: 1,
        contactsQuotaTotal: 5,
        smsBackup: 0, smsMonthly: 100,
        questionnaireBackup: 0, questionnaireMonthly: 50,
        emailBackup: 0, emailMonthly: 1000,
        hiroAiMonthly: 100,
        modules: { ai_parsing: false, manager_portal: false, hiro_ai: false }
    });

    useEffect(() => {
        if (isEditing) {
            const load = async () => {
                setLoading(true);
                setError(null);
                try {
                    const res = await fetch(`${apiBase}/api/clients/${clientId}`);
                    if (!res.ok) throw new Error('Failed to load client');
                    const data = await res.json();
                    setFormData(prev => ({
                        ...prev,
                        id: data.id,
                        clientName: data.name || '',
                        name: data.name || '',
                        creationDate: data.creationDate ? data.creationDate.split('T')[0] : prev.creationDate,
                        authorizedIps: '',
                        verifiedPhones: data.phone || '',
                        cvQuotaTotal: data.cvQuotaTotal ?? prev.cvQuotaTotal,
                        tagsQuotaTotal: data.tagsQuotaTotal ?? prev.tagsQuotaTotal,
                        jobsQuotaTotal: data.jobsTotal ?? prev.jobsQuotaTotal,
                        coordinatorsQuotaTotal: data.coordinatorsTotal ?? prev.coordinatorsQuotaTotal,
                        contactsQuotaTotal: data.contactsQuotaTotal ?? prev.contactsQuotaTotal,
                        smsBackup: data.smsBackup ?? prev.smsBackup,
                        smsMonthly: data.smsMonthly ?? prev.smsMonthly,
                        questionnaireBackup: data.questionnaireBackup ?? prev.questionnaireBackup,
                        questionnaireMonthly: data.questionnaireMonthly ?? prev.questionnaireMonthly,
                        emailBackup: data.emailBackup ?? prev.emailBackup,
                        emailMonthly: data.emailMonthly ?? prev.emailMonthly,
                        hiroAiMonthly: data.hiroAiMonthly ?? prev.hiroAiMonthly,
                        modules: { ...prev.modules, manager_portal: data.contactIsActive ?? prev.modules.manager_portal },
                    }));
                } catch (err: any) {
                    setError(err.message || 'Load failed');
                } finally {
                    setLoading(false);
                }
            };
            load();
        }
    }, [clientId, isEditing, apiBase]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: type === 'number' ? parseInt(value) || 0 : value 
        }));
    };

    const handleModuleToggle = (key: keyof ClientData['modules'], value: boolean) => {
        setFormData(prev => ({
            ...prev,
            modules: { ...prev.modules, [key]: value }
        }));
    };

    const handleSave = async () => {
        setLoading(true);
        setError(null);
        const payload = {
            name: formData.clientName || formData.name,
            creationDate: formData.creationDate,
            contactPerson: formData.name,
            phone: formData.verifiedPhones,
            status: formData.modules.manager_portal ? 'פעיל' : 'לא פעיל',
            contactIsActive: formData.modules.manager_portal,
            jobsTotal: formData.jobsQuotaTotal,
            coordinatorsTotal: formData.coordinatorsQuotaTotal,
            jobsUsed: formData.jobsQuotaTotal - 0,
            coordinatorsUsed: formData.coordinatorsQuotaTotal - 0,
            cvQuotaTotal: formData.cvQuotaTotal,
            tagsQuotaTotal: formData.tagsQuotaTotal,
            contactsQuotaTotal: formData.contactsQuotaTotal,
            smsBackup: formData.smsBackup,
            smsMonthly: formData.smsMonthly,
            questionnaireBackup: formData.questionnaireBackup,
            questionnaireMonthly: formData.questionnaireMonthly,
            emailBackup: formData.emailBackup,
            emailMonthly: formData.emailMonthly,
            hiroAiMonthly: formData.hiroAiMonthly,
        };
        try {
            const res = await fetch(`${apiBase}/api/clients${isEditing ? `/${clientId}` : ''}`, {
                method: isEditing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || 'Save failed');
            }
            navigate('/admin/clients');
        } catch (err: any) {
            setError(err.message || 'Save failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-10">
            <h1 className="text-2xl font-bold text-text-default">{isEditing ? `עריכת לקוח: ${formData.clientName}` : 'יצירת לקוח חדש'}</h1>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            {loading && <p className="text-text-muted text-sm">טוען...</p>}
            
            {/* 1. General Details */}
            <AccordionSection title="פרטי חברה" icon={<BuildingOffice2Icon className="w-5 h-5"/>} defaultOpen>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <FormInput label="שם חברה" name="clientName" value={formData.clientName} onChange={handleChange} required />
                    <FormInput label="שם תצוגה" name="name" value={formData.name} onChange={handleChange} />
                    <FormInput label="תאריך יצירה" name="creationDate" value={formData.creationDate} onChange={handleChange} type="date" />
                    <FormInput label="מקור סמסים" name="smsSource" value={formData.smsSource} onChange={handleChange} />
                    <FormInput label="IP מורשים" name="authorizedIps" value={formData.authorizedIps} onChange={handleChange} />
                    <FormInput label="טלפונים מאומתים" name="verifiedPhones" value={formData.verifiedPhones} onChange={handleChange} />
                </div>
            </AccordionSection>
            
            {/* 2. Modules */}
            <AccordionSection title="מודולים פעילים" icon={<SparklesIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-4">
                    <p className="text-sm text-text-muted">בחר את המודולים הזמינים ללקוח זה.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ToggleSwitch 
                            label="פענוח קורות חיים (AI Parsing)" 
                            checked={formData.modules.ai_parsing} 
                            onChange={(v) => handleModuleToggle('ai_parsing', v)} 
                        />
                        <ToggleSwitch 
                            label="Hiro AI (עוזר אישי חכם)" 
                            checked={formData.modules.hiro_ai} 
                            onChange={(v) => handleModuleToggle('hiro_ai', v)} 
                        />
                        <ToggleSwitch 
                            label="פורטל מנהלים מגייסים" 
                            checked={formData.modules.manager_portal} 
                            onChange={(v) => handleModuleToggle('manager_portal', v)} 
                        />
                    </div>
                    <p className="text-xs text-text-subtle mt-2">* אזור אישי למועמד מופעל באופן אוטומטי עבור כל הלקוחות.</p>
                </div>
            </AccordionSection>

            {/* 3. Quotas */}
            <AccordionSection title="הגדרות מכסה ושימוש" icon={<ChartBarIcon className="w-5 h-5"/>}>
                <div className="space-y-4">
                    {/* Main Entities Quotas */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <QuotaInput label="חבילת קו''ח" name="cvQuotaTotal" value={formData.cvQuotaTotal} onChange={handleChange} />
                        <QuotaInput label="תגיות" name="tagsQuotaTotal" value={formData.tagsQuotaTotal} onChange={handleChange} />
                        <QuotaInput label="משרות" name="jobsQuotaTotal" value={formData.jobsQuotaTotal} onChange={handleChange} />
                        <QuotaInput label="רכזים" name="coordinatorsQuotaTotal" value={formData.coordinatorsQuotaTotal} onChange={handleChange} />
                        <QuotaInput label="אנשי קשר" name="contactsQuotaTotal" value={formData.contactsQuotaTotal} onChange={handleChange} />
                    </div>
                    
                    {/* Communication & AI Quotas */}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border-default">
                        <div className="bg-bg-card p-3 rounded-lg border border-border-default space-y-2">
                            <h4 className="text-sm font-bold text-text-default flex items-center gap-2">
                                SMS
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                <QuotaInput label="חודשי" name="smsMonthly" value={formData.smsMonthly} onChange={handleChange} />
                                <QuotaInput label="גיבוי" name="smsBackup" value={formData.smsBackup} onChange={handleChange} />
                            </div>
                        </div>
                        
                        <div className="bg-bg-card p-3 rounded-lg border border-border-default space-y-2">
                             <h4 className="text-sm font-bold text-text-default">שאלונים</h4>
                             <div className="grid grid-cols-2 gap-2">
                                <QuotaInput label="חודשי" name="questionnaireMonthly" value={formData.questionnaireMonthly} onChange={handleChange} />
                                <QuotaInput label="גיבוי" name="questionnaireBackup" value={formData.questionnaireBackup} onChange={handleChange} />
                             </div>
                        </div>
                        
                        <div className="bg-bg-card p-3 rounded-lg border border-border-default space-y-2">
                            <h4 className="text-sm font-bold text-text-default">מיילים</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <QuotaInput label="חודשי" name="emailMonthly" value={formData.emailMonthly} onChange={handleChange} />
                                <QuotaInput label="גיבוי" name="emailBackup" value={formData.emailBackup} onChange={handleChange} />
                            </div>
                        </div>
                        
                         <div className="bg-bg-card p-3 rounded-lg border border-border-default space-y-2">
                            <h4 className="text-sm font-bold text-text-default flex items-center gap-1">
                                <SparklesIcon className="w-4 h-4 text-primary-500"/> Hiro AI
                            </h4>
                            <QuotaInput label="מכסה חודשית" name="hiroAiMonthly" value={formData.hiroAiMonthly} onChange={handleChange} />
                        </div>
                    </div>
                </div>
            </AccordionSection>
            
            {/* Actions */}
            <div className="flex justify-end items-center p-4 border-t border-border-default bg-bg-card gap-3 rounded-lg mt-4 sticky bottom-0 z-10 shadow-lg">
                <button 
                    type="button" 
                    onClick={() => navigate('/admin')} 
                    className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition"
                >
                    ביטול
                </button>
                <button 
                    type="button"
                    onClick={handleSave} 
                    className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-lg hover:bg-primary-700 transition shadow-md"
                >
                    {isEditing ? 'שמור שינויים' : 'צור לקוח'}
                </button>
            </div>
        </div>
    );
};

export default AdminClientFormView;
