
import React, { useState, useRef, useEffect } from 'react';
import AccordionSection from './AccordionSection';
import { BuildingOffice2Icon, UserCircleIcon, PencilIcon, PhoneIcon, EnvelopeIcon, LinkIcon, MapPinIcon, PlusIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

const industryOptions = [
    { value: 'security_services', label: 'אבטחה' },
    { value: 'energy_environment', label: 'אנרגיה וסביבה' },
    { value: 'insurance', label: 'ביטוח' },
    { value: 'security_emergency_forces', label: 'ביטחון, חירום ואכיפת חוק' },
    { value: 'construction_infrastructure', label: 'בנייה ותשתיות' },
    { value: 'health_medicine', label: 'בריאות ורפואה' },
    { value: 'education_academia', label: 'חינוך ואקדמיה' },
    { value: 'agriculture', label: 'חקלאות' },
    { value: 'tech_innovation', label: 'טכנולוגיה וחדשנות' },
    { value: 'public_sector_government', label: 'מגזר ציבורי, ממשל וקהילה' },
    { value: 'media_advertising', label: 'מדיה ופרסום' },
    { value: 'retail_commerce', label: 'מסחר וקמעונאות' },
    { value: 'human_resources_manpower', label: 'משאבי אנוש וכוח אדם' },
    { value: 'legal_consulting', label: 'משפט וייעוץ' },
    { value: 'real_estate', label: 'נדל"ן וניהול נכסים' },
    { value: 'sports_leisure', label: 'ספורט ופנאי' },
    { value: 'finance', label: 'פיננסים' },
    { value: 'field_1770200910804-1770200910804', label: 'צה"ל ושירות צבאי' },
    { value: 'automotive', label: 'רכב' },
    { value: 'personal_services_maintenance', label: 'שירותים אישיים, תחזוקה ומתקנים' },
    { value: 'transportation_logistics', label: 'תחבורה ולוגיסטיקה' },
    { value: 'tourism_hospitality', label: 'תיירות ואירוח' },
    { value: 'industry_manufacturing', label: 'תעשייה וייצור' },
    { value: 'telecom', label: 'תקשורת' },
    { value: 'culture_entertainment', label: 'תרבות ובידור' },
    { value: 'other', label: 'אחר (הזן ידנית)' }
];

// --- Mock Global Companies Data ---
const globalCompanies = [
    { id: '1', name: 'נייס (NICE)', aliases: ['NICE Systems', 'נייס מערכות'], industry: 'tech_innovation', website: 'https://www.nice.com', phone: '09-1234567', address: 'רעננה' },
    { id: '2', name: 'ניסאן (Nissan)', aliases: ['קרסו מוטורס', 'Nissan Israel'], industry: 'automotive', website: 'https://www.nissan.co.il', phone: '03-9876543', address: 'תל אביב' },
    { id: '3', name: 'גוגל (Google)', aliases: ['Google Israel', 'גוגל ישראל'], industry: 'tech_innovation', website: 'https://www.google.com', phone: '074-1234567', address: 'תל אביב' },
    { id: '4', name: 'מיקרוסופט (Microsoft)', aliases: ['Microsoft Israel', 'מיקרוסופט ישראל'], industry: 'tech_innovation', website: 'https://www.microsoft.com', phone: '09-7654321', address: 'הרצליה' },
    { id: '5', name: 'אפל (Apple)', aliases: ['Apple Israel', 'אפל ישראל'], industry: 'tech_innovation', website: 'https://www.apple.com', phone: '09-1234567', address: 'הרצליה' },
    { id: '6', name: 'אמזון (Amazon)', aliases: ['Amazon Web Services', 'AWS Israel', 'אמזון ישראל'], industry: 'tech_innovation', website: 'https://www.amazon.com', phone: '03-1234567', address: 'תל אביב' },
    { id: '7', name: 'מטא (Meta)', aliases: ['פייסבוק', 'Facebook', 'Facebook Israel', 'פייסבוק ישראל'], industry: 'tech_innovation', website: 'https://www.meta.com', phone: '03-1234567', address: 'תל אביב' },
    { id: '8', name: 'יבמ (IBM)', aliases: ['International Business Machines', 'י.ב.מ', 'IBM Israel'], industry: 'tech_innovation', website: 'https://www.ibm.com', phone: '03-1234567', address: 'פתח תקווה' },
];

// --- Reusable Form Components ---
const FormInput: React.FC<{ 
    label: string; 
    name: string; 
    value: string; 
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; 
    type?: string; 
    placeholder?: string; 
    required?: boolean; 
    onFocus?: () => void;
    onBlur?: () => void;
    autoComplete?: string;
}> = ({ label, name, value, onChange, type = 'text', placeholder, required = false, onFocus, onBlur, autoComplete }) => (
    <div className="flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">{label} {required && <span className="text-red-500">*</span>}</label>
        <input 
            type={type} 
            name={name} 
            value={value} 
            onChange={onChange} 
            onFocus={onFocus}
            onBlur={onBlur}
            autoComplete={autoComplete}
            placeholder={placeholder} 
            required={required} 
            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm" 
        />
    </div>
);

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; }> = ({ label, name, value, onChange, children }) => (
    <div className="flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm">
            {children}
        </select>
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number; placeholder?: string; }> = ({ label, name, value, onChange, rows = 3, placeholder }) => (
    <div className="md:col-span-2 flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm resize-y"></textarea>
    </div>
);

interface NewClientViewProps {
  onCancel: () => void;
  onSave: (clientData: any) => void;
}

const NewClientView: React.FC<NewClientViewProps> = ({ onCancel, onSave }) => {
    const { t } = useLanguage();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const [formData, setFormData] = useState({
        clientName: '',
        industry: '',
        customIndustry: '',
        website: '',
        companyPhone: '',
        address: '',
        status: 'פעיל',
        contactName: '',
        contactRole: '',
        contactEmail: '',
        contactPhone: '',
        notes: '',
    });

    // Handle clicking outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        if (name === 'clientName') {
            setShowDropdown(true);
        }
    };

    const handleSelectCompany = (company: any) => {
        setFormData(prev => ({
            ...prev,
            clientName: company.name,
            industry: prev.industry || company.industry,
            website: prev.website || company.website,
            companyPhone: prev.companyPhone || company.phone,
            address: prev.address || company.address
        }));
        setShowDropdown(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalData = { ...formData };
        if (finalData.industry === 'other') {
            finalData.industry = finalData.customIndustry;
        }
        // Remove customIndustry from the final payload if desired
        // delete finalData.customIndustry;
        onSave(finalData);
    };

    const searchQuery = formData.clientName.toLowerCase();
    const filteredCompanies = globalCompanies.map(company => {
        const matchName = company.name.toLowerCase().includes(searchQuery);
        const matchedAlias = company.aliases?.find(alias => alias.toLowerCase().includes(searchQuery));
        
        if (matchName || matchedAlias) {
            return { ...company, matchedAlias: matchName ? null : matchedAlias };
        }
        return null;
    }).filter(Boolean);

    return (
        <div className="max-w-4xl mx-auto pb-24 w-full px-4 sm:px-6 lg:px-8 animate-fade-in">
            {/* Header Section */}
            <div className="mb-8 mt-6">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-text-default mb-3 tracking-tight">{t('client_form.title_new')}</h1>
                <p className="text-text-muted text-base sm:text-lg max-w-2xl leading-relaxed">
                    הזן את פרטי החברה כדי להוסיף אותה למאגר הלקוחות של המערכת. ניתן להשתמש בהשלמה האוטומטית לאיתור חברות קיימות ולהעשרת נתונים מהירה.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
                 <div id="client-details">
                    <AccordionSection title={t('client_form.section_company')} icon={<BuildingOffice2Icon className="w-5 h-5"/>} defaultOpen>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            <div className="relative md:col-span-2 lg:col-span-1" ref={dropdownRef}>
                                <FormInput 
                                    label={t('client_form.field_client_name')} 
                                    name="clientName" 
                                    value={formData.clientName} 
                                    onChange={handleChange} 
                                    onFocus={() => setShowDropdown(true)}
                                    autoComplete="off"
                                    required 
                                    placeholder={t('client_form.placeholder_name')} 
                                />
                                
                                {/* Autocomplete Dropdown */}
                                {showDropdown && formData.clientName && (
                                    <div className="absolute z-50 w-full mt-2 bg-bg-card border border-border-default rounded-2xl shadow-2xl max-h-[22rem] overflow-hidden animate-fade-in flex flex-col ring-1 ring-black/5">
                                        {filteredCompanies.length > 0 && (
                                            <div className="px-4 py-3 text-xs font-bold text-text-muted bg-bg-subtle/90 sticky top-0 backdrop-blur-md z-10 border-b border-border-subtle uppercase tracking-wider">
                                                תוצאות ממאגר החברות הגלובאלי
                                            </div>
                                        )}
                                        <div className="flex-1 overflow-y-auto">
                                            {filteredCompanies.map(company => (
                                                <div 
                                                    key={company.id} 
                                                    className="p-4 hover:bg-bg-hover cursor-pointer border-b border-border-subtle last:border-0 flex justify-between items-center transition-colors group"
                                                    onClick={() => handleSelectCompany(company)}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-xl bg-bg-subtle flex items-center justify-center text-text-muted border border-border-default group-hover:border-primary-500/30 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors shadow-sm">
                                                            <BuildingOffice2Icon className="w-6 h-6" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="font-bold text-text-default text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{company.name}</div>
                                                            <div className="text-sm text-text-muted flex items-center gap-2 mt-0.5">
                                                                <span className="truncate max-w-[120px] sm:max-w-xs">{company.website.replace('https://www.', '')}</span>
                                                                {company.matchedAlias && (
                                                                    <>
                                                                        <span className="w-1 h-1 rounded-full bg-border-strong"></span>
                                                                        <span className="text-primary-600 font-medium truncate max-w-[100px] sm:max-w-xs">מוכר גם כ: {company.matchedAlias}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="hidden sm:inline-block text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 px-3 py-1.5 rounded-full border border-primary-500/20 whitespace-nowrap">
                                                        {industryOptions.find(opt => opt.value === company.industry)?.label || company.industry}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div 
                                            className="p-4 bg-bg-subtle hover:bg-primary-500/5 cursor-pointer text-primary-600 dark:text-primary-400 font-bold flex items-center gap-3 transition-colors border-t border-border-default sticky bottom-0 z-10"
                                            onClick={() => setShowDropdown(false)}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-sm">
                                                <PlusIcon className="w-5 h-5" />
                                            </div>
                                            <span className="text-base">צור לקוח חדש: "{formData.clientName}"</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-4 md:col-span-2 lg:col-span-1">
                                <FormSelect label={t('client_form.field_industry')} name="industry" value={formData.industry} onChange={handleChange}>
                                    <option value="">בחר תעשייה...</option>
                                    {industryOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </FormSelect>
                                {formData.industry === 'other' && (
                                    <FormInput label="שם תעשייה (מותאם אישית)" name="customIndustry" value={formData.customIndustry} onChange={handleChange} required />
                                )}
                            </div>
                            <FormInput label={t('client_form.field_website')} name="website" value={formData.website} onChange={handleChange} type="url" placeholder="https://www.company.com" />
                            <FormInput label={t('client_form.field_company_phone')} name="companyPhone" value={formData.companyPhone} onChange={handleChange} type="tel" />
                            <FormInput label={t('client_form.field_address')} name="address" value={formData.address} onChange={handleChange} />
                            <FormSelect label={t('client_form.field_status')} name="status" value={formData.status} onChange={handleChange}>
                                <option value="פעיל">פעיל</option>
                                <option value="לא פעיל">לא פעיל</option>
                                <option value="בהקפאה">בהקפאה</option>
                            </FormSelect>
                        </div>
                    </AccordionSection>
                </div>

                <div id="contact-person">
                    <AccordionSection title={t('client_form.section_contact')} icon={<UserCircleIcon className="w-5 h-5"/>} defaultOpen>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            <FormInput label={t('client_form.field_contact_name')} name="contactName" value={formData.contactName} onChange={handleChange} required />
                            <FormInput label={t('client_form.field_contact_role')} name="contactRole" value={formData.contactRole} onChange={handleChange} />
                            <FormInput label={t('client_form.field_contact_email')} name="contactEmail" value={formData.contactEmail} onChange={handleChange} type="email" required />
                            <FormInput label={t('client_form.field_contact_phone')} name="contactPhone" value={formData.contactPhone} onChange={handleChange} type="tel" />
                        </div>
                    </AccordionSection>
                </div>
                
                 <div id="internal-notes">
                    <AccordionSection title={t('client_form.section_notes')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                        <FormTextArea label={t('client_form.field_notes')} name="notes" value={formData.notes} onChange={handleChange} placeholder={t('client_form.placeholder_notes')} />
                    </AccordionSection>
                </div>
                
                {/* Sticky Footer Actions */}
                <div className="fixed bottom-0 left-0 right-0 bg-bg-card/90 backdrop-blur-md border-t border-border-default p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <div className="max-w-4xl mx-auto flex justify-end items-center gap-4 px-4 sm:px-6 lg:px-8">
                        <button type="button" onClick={onCancel} className="text-text-muted font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover transition-colors">{t('client_form.cancel')}</button>
                        <button type="submit" className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5">{t('client_form.save')}</button>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default NewClientView;

