
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AccordionSection from './AccordionSection';
import { BuildingOffice2Icon, UserCircleIcon, PencilIcon, PlusIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import BusinessFieldHierarchyFields, { mainFieldsFromApi, mainFieldsToApi } from './BusinessFieldHierarchyFields';

const LOOKUP_DEBOUNCE_MS = 300;
const LOOKUP_MIN_CHARS = 2;
const LOOKUP_LIMIT = 6;

type GlobalCompanyLookupResult = {
    id: string;
    name: string;
    nameEn?: string | null;
    legalName?: string | null;
    aliases?: string[];
    mainField?: string | null;
    mainField2?: string[];
    subField?: string[];
    secondaryField?: string | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
    location?: string | null;
    description?: string | null;
    logo?: string | null;
    matchedAlias?: string | null;
};

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
    readOnly?: boolean;
}> = ({ label, name, value, onChange, type = 'text', placeholder, required = false, onFocus, onBlur, autoComplete, readOnly }) => (
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
            readOnly={readOnly}
            placeholder={placeholder} 
            required={required} 
            className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm ${readOnly ? 'opacity-80 cursor-default' : ''}`} 
        />
    </div>
);

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; disabled?: boolean; }> = ({ label, name, value, onChange, children, disabled = false }) => (
    <div className="flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">{label}</label>
        <select name={name} value={value} onChange={onChange} disabled={disabled} className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm ${disabled ? 'opacity-80 cursor-not-allowed' : ''}`}>
            {children}
        </select>
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number; placeholder?: string; readOnly?: boolean; }> = ({ label, name, value, onChange, rows = 3, placeholder, readOnly = false }) => (
    <div className="md:col-span-2 flex flex-col">
        <label className="text-sm font-bold text-text-default mb-2">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} readOnly={readOnly} className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3.5 transition-all outline-none hover:border-border-strong shadow-sm resize-y ${readOnly ? 'opacity-80 cursor-default' : ''}`}></textarea>
    </div>
);

interface NewClientViewProps {
  onCancel: () => void;
  onSave: (clientData: any) => void;
}

const resolveIndustryValue = (
    mainField: string | null | undefined,
): string => String(mainField || '').trim();

const formatWebsiteLabel = (website?: string | null) =>
    String(website || '')
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\/$/, '');

const NewClientView: React.FC<NewClientViewProps> = ({ onCancel, onSave }) => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const isTenantStaff = Boolean(user?.clientId) && !isPlatformAdmin;
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const [lookupResults, setLookupResults] = useState<GlobalCompanyLookupResult[]>([]);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [linkedOrganizationId, setLinkedOrganizationId] = useState<string | null>(null);
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const lookupAbortRef = useRef<AbortController | null>(null);
    
    const [formData, setFormData] = useState({
        clientName: '',
        mainField: '',
        mainField2: [] as string[],
        subField: [] as string[],
        secondaryField: '',
        website: '',
        logoUrl: '',
        companyPhone: '',
        address: '',
        companyDescription: '',
        aliasesText: '',
        status: 'פעיל',
        contactName: '',
        contactRole: '',
        contactEmail: '',
        contactPhone: '',
        notes: '',
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(formData.clientName.trim());
        }, LOOKUP_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [formData.clientName]);

    useEffect(() => {
        if (!apiBase || debouncedQuery.length < LOOKUP_MIN_CHARS) {
            lookupAbortRef.current?.abort();
            setLookupResults([]);
            setIsLookupLoading(false);
            return;
        }

        lookupAbortRef.current?.abort();
        const controller = new AbortController();
        lookupAbortRef.current = controller;
        setLookupResults([]);
        setIsLookupLoading(true);

        fetch(
            `${apiBase}/api/companies/global-lookup?q=${encodeURIComponent(debouncedQuery)}&limit=${LOOKUP_LIMIT}`,
            { signal: controller.signal, cache: 'no-store' },
        )
            .then((r) => {
                if (!r.ok) throw new Error('Lookup failed');
                return r.json();
            })
            .then((payload) => {
                if (controller.signal.aborted) return;
                const list = Array.isArray(payload?.data) ? payload.data : [];
                setLookupResults(list.slice(0, LOOKUP_LIMIT));
            })
            .catch((err) => {
                if (controller.signal.aborted || err?.name === 'AbortError') return;
                setLookupResults([]);
            })
            .finally(() => {
                if (!controller.signal.aborted) setIsLookupLoading(false);
            });

        return () => controller.abort();
    }, [apiBase, debouncedQuery]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        
        if (name === 'clientName') {
            setShowDropdown(true);
            setLinkedOrganizationId(null);
        }
    };

    const injectCompanyMetadata = useCallback((company: GlobalCompanyLookupResult) => {
        const aliases = Array.isArray(company.aliases) ? company.aliases.filter(Boolean) : [];
        const mainField = resolveIndustryValue(company.mainField);
        const mainField2 = Array.isArray(company.mainField2)
            ? company.mainField2.map((v) => String(v || '').trim()).filter(Boolean)
            : [];
        const subField = Array.isArray(company.subField)
            ? company.subField.map((v) => String(v || '').trim()).filter(Boolean)
            : [];
        setFormData(prev => ({
            ...prev,
            clientName: company.name || prev.clientName,
            mainField: mainField || prev.mainField,
            mainField2,
            subField,
            secondaryField: String(company.secondaryField || ''),
            website: company.website || prev.website,
            logoUrl: company.logo || prev.logoUrl,
            companyPhone: company.phone || prev.companyPhone,
            address: company.address || company.location || prev.address,
            companyDescription: company.description || prev.companyDescription,
            aliasesText: aliases.length ? aliases.join(', ') : prev.aliasesText,
        }));
        setLinkedOrganizationId(company.id || null);
        setShowDropdown(false);
    }, []);

    const clearExistingOrganizationSelection = () => {
        setLinkedOrganizationId(null);
        setShowDropdown(false);
    };

    const isExistingOrgSelected = Boolean(linkedOrganizationId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);
        try {
            if (!apiBase) throw new Error('Missing API base (VITE_API_BASE)');

            if (isExistingOrgSelected && linkedOrganizationId) {
                const linkPayload = { linkedOrganizationId };

                if (isTenantStaff && user?.clientId) {
                    const res = await fetch(
                        `${apiBase}/api/clients/${encodeURIComponent(user.clientId)}/organization-link`,
                        {
                            method: 'POST',
                            headers: authHeaders(true),
                            body: JSON.stringify(linkPayload),
                        },
                    );
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body?.message || 'Organization link failed');
                    }
                    const updated = await res.json();
                    onSave(updated);
                    navigate('/clients');
                    return;
                }

                if (isPlatformAdmin) {
                    const res = await fetch(`${apiBase}/api/clients`, {
                        method: 'POST',
                        headers: authHeaders(true),
                        body: JSON.stringify({
                            name: formData.clientName,
                            displayName: formData.clientName,
                            ...linkPayload,
                        }),
                    });
                    if (!res.ok) {
                        const body = await res.json().catch(() => ({}));
                        throw new Error(body?.message || 'Create failed');
                    }
                    const created = await res.json();
                    onSave(created);
                    navigate('/clients');
                    return;
                }
            }

            const finalData = { ...formData };
            const aliases = finalData.aliasesText
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean);
            const payload = {
                name: finalData.clientName,
                industry: finalData.mainField || undefined,
                mainField: finalData.mainField || undefined,
                mainField2: finalData.mainField2,
                subField: finalData.subField,
                secondaryField: finalData.secondaryField || undefined,
                phone: finalData.companyPhone,
                email: finalData.contactEmail || undefined,
                status: finalData.status,
                mainContactName: finalData.contactName,
                mainContactEmail: finalData.contactEmail,
                mainContactPhone: finalData.contactPhone,
                logoUrl: finalData.logoUrl || undefined,
                metadata: {
                    website: finalData.website,
                    address: finalData.address,
                    description: finalData.companyDescription,
                    aliases,
                    contactRole: finalData.contactRole,
                    notes: finalData.notes,
                    mainField: finalData.mainField || undefined,
                    mainField2: finalData.mainField2,
                    subField: finalData.subField,
                    secondaryField: finalData.secondaryField || undefined,
                },
            };

            if (isTenantStaff && user?.clientId) {
                const res = await fetch(
                    `${apiBase}/api/clients/${encodeURIComponent(user.clientId)}/organization-link`,
                    {
                        method: 'POST',
                        headers: authHeaders(true),
                        body: JSON.stringify(payload),
                    },
                );
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body?.message || 'Organization link failed');
                }
                const updated = await res.json();
                onSave(updated);
                navigate('/clients');
                return;
            }

            const res = await fetch(`${apiBase}/api/clients`, {
                method: 'POST',
                headers: authHeaders(true),
                body: JSON.stringify({
                    ...payload,
                    ...(isPlatformAdmin ? { skipOrganizationLink: true } : {}),
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'Create failed');
            }
            const created = await res.json();
            onSave(created);
            const managerInvite = created?.managerInvite;
            if (managerInvite?.reason === 'user_active' || managerInvite?.reason === 'email_exists') {
                window.alert(t('client_form.manager_invite_user_active'));
            } else if (managerInvite?.ok === false) {
                window.alert(managerInvite.error || t('client_form.manager_invite_failed'));
            }
            navigate('/clients');
        } catch (e: any) {
            setError(e?.message || 'Create failed');
        } finally {
            setIsSaving(false);
        }
    };

    const showLookupDropdown =
        showDropdown &&
        formData.clientName.trim().length >= LOOKUP_MIN_CHARS;

    return (
        <div className="max-w-4xl mx-auto pb-24 w-full px-4 sm:px-6 lg:px-8 animate-fade-in">
            <div className="mb-8 mt-6">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-text-default mb-3 tracking-tight">{t('client_form.title_new')}</h1>
                <p className="text-text-muted text-base sm:text-lg max-w-2xl leading-relaxed">
                    {isTenantStaff
                        ? 'קשר חברה למאגר הארגונים הגלובלי עבור הלקוח שלך. בחירת חברה קיימת = קישור בלבד; חברה חדשה = staging ב-OrganizationTmp לביקורת מנהל.'
                        : 'הזן את פרטי החברה כדי להוסיף אותה למאגר הלקוחות של המערכת. ניתן להשתמש בהשלמה האוטומטית לאיתור חברות קיימות ולהעשרת נתונים מהירה.'}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
                 <div id="client-details">
                    <AccordionSection title={t('client_form.section_company')} icon={<BuildingOffice2Icon className="w-5 h-5"/>} defaultOpen>
                        {isExistingOrgSelected ? (
                            <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
                                <div>
                                    <p className="text-sm font-bold text-primary-900">נבחרה חברה קיימת מהמאגר הגלובלי</p>
                                    <p className="text-xs text-primary-700 mt-0.5">השדות נטענו לצפייה בלבד. השמירה תקשר בלבד בין הלקוח לארגון — ללא יצירת Organization חדש.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={clearExistingOrganizationSelection}
                                    className="shrink-0 text-sm font-bold text-primary-700 hover:text-primary-900 underline"
                                >
                                    בחר חברה אחרת
                                </button>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            <div className="relative md:col-span-2 lg:col-span-1" ref={dropdownRef}>
                                <FormInput 
                                    label={t('client_form.field_client_name')} 
                                    name="clientName" 
                                    value={formData.clientName} 
                                    onChange={handleChange} 
                                    onFocus={() => { if (!isExistingOrgSelected) setShowDropdown(true); }}
                                    autoComplete="off"
                                    required 
                                    readOnly={isExistingOrgSelected}
                                    placeholder={t('client_form.placeholder_name')} 
                                />
                                
                                {showLookupDropdown && !isExistingOrgSelected && (
                                    <div className="absolute z-50 w-full mt-2 bg-bg-card border border-border-default rounded-2xl shadow-2xl max-h-[22rem] overflow-hidden animate-fade-in flex flex-col ring-1 ring-black/5">
                                        <div className="px-4 py-3 text-xs font-bold text-text-muted bg-bg-subtle/90 sticky top-0 backdrop-blur-md z-10 border-b border-border-subtle uppercase tracking-wider flex items-center justify-between gap-2">
                                            <span>{t('client_form.lookup_results')}</span>
                                            {isLookupLoading && (
                                                <span className="font-normal normal-case text-primary-600 animate-pulse">
                                                    {t('client_form.lookup_searching')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex-1 overflow-y-auto">
                                            {isLookupLoading && (
                                                <div className="px-4 py-6 text-sm text-text-muted text-center">
                                                    {t('client_form.lookup_searching')}
                                                </div>
                                            )}
                                            {!isLookupLoading && lookupResults.length === 0 && (
                                                <div className="px-4 py-3 text-sm text-text-muted">
                                                    {t('client_form.lookup_no_results')}
                                                </div>
                                            )}
                                            {!isLookupLoading && lookupResults.map((company) => (
                                                <div 
                                                    key={company.id} 
                                                    className="p-4 hover:bg-bg-hover cursor-pointer border-b border-border-subtle last:border-0 flex justify-between items-center transition-colors group"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => injectCompanyMetadata(company)}
                                                >
                                                    <div className="flex items-center gap-4 min-w-0">
                                                        {company.logo ? (
                                                            <img
                                                                src={company.logo}
                                                                alt=""
                                                                className="w-12 h-12 rounded-xl object-contain bg-bg-subtle border border-border-default group-hover:border-primary-500/30 transition-colors shadow-sm shrink-0 p-1"
                                                            />
                                                        ) : (
                                                            <div className="w-12 h-12 rounded-xl bg-bg-subtle flex items-center justify-center text-text-muted border border-border-default group-hover:border-primary-500/30 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors shadow-sm shrink-0">
                                                                <BuildingOffice2Icon className="w-6 h-6" />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-col min-w-0">
                                                            <div className="font-bold text-text-default text-base group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors truncate">
                                                                {company.name}
                                                            </div>
                                                            <div className="text-sm text-text-muted flex items-center gap-2 mt-0.5 min-w-0">
                                                                {company.website ? (
                                                                    <span className="truncate max-w-[120px] sm:max-w-xs">
                                                                        {formatWebsiteLabel(company.website)}
                                                                    </span>
                                                                ) : null}
                                                                {company.matchedAlias ? (
                                                                    <>
                                                                        {company.website ? (
                                                                            <span className="w-1 h-1 rounded-full bg-border-strong shrink-0" />
                                                                        ) : null}
                                                                        <span className="text-primary-600 font-medium truncate max-w-[100px] sm:max-w-xs">
                                                                            {t('client_form.lookup_known_as')} {company.matchedAlias}
                                                                        </span>
                                                                    </>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="hidden sm:inline-block text-xs font-bold bg-primary-500/10 text-primary-600 dark:text-primary-400 px-3 py-1.5 rounded-full border border-primary-500/20 whitespace-nowrap shrink-0 ms-2">
                                                        {company.mainField || '—'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                        <div 
                                            className="p-4 bg-bg-subtle hover:bg-primary-500/5 cursor-pointer text-primary-600 dark:text-primary-400 font-bold flex items-center gap-3 transition-colors border-t border-border-default sticky bottom-0 z-10"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setLinkedOrganizationId(null);
                                                setShowDropdown(false);
                                            }}
                                        >
                                            <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center text-primary-600 dark:text-primary-400 shadow-sm">
                                                <PlusIcon className="w-5 h-5" />
                                            </div>
                                            <span className="text-base">
                                                {t('client_form.lookup_create_new', { name: formData.clientName.trim() })}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="md:col-span-2">
                                <BusinessFieldHierarchyFields
                                    apiBase={apiBase}
                                    disabled={isExistingOrgSelected}
                                    values={{
                                        mainField: mainFieldsFromApi(formData.mainField, formData.mainField2),
                                        subField: formData.subField,
                                        secondaryField: formData.secondaryField,
                                    }}
                                    onChange={(next) => {
                                        if (isExistingOrgSelected) return;
                                        const { mainField, mainField2 } = mainFieldsToApi(next.mainField);
                                        setFormData((prev) => ({
                                            ...prev,
                                            mainField,
                                            mainField2,
                                            subField: next.subField,
                                            secondaryField: next.secondaryField ?? '',
                                        }));
                                    }}
                                />
                            </div>
                            <FormInput label={t('client_form.field_website')} name="website" value={formData.website} onChange={handleChange} type="url" placeholder="https://www.company.com" readOnly={isExistingOrgSelected} />
                            <div className="flex flex-col gap-3">
                                <FormInput label="לוגו (URL)" name="logoUrl" value={formData.logoUrl} onChange={handleChange} type="url" placeholder="https://..." readOnly={isExistingOrgSelected} />
                                {formData.logoUrl.trim() ? (
                                    <div className="flex items-center gap-3">
                                        <img
                                            src={formData.logoUrl.trim()}
                                            alt=""
                                            className="w-14 h-14 rounded-xl object-contain border border-border-default bg-bg-subtle p-1"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                        <span className="text-xs text-text-muted">תצוגה מקדימה</span>
                                    </div>
                                ) : null}
                            </div>
                            <FormInput label={t('client_form.field_company_phone')} name="companyPhone" value={formData.companyPhone} onChange={handleChange} type="tel" readOnly={isExistingOrgSelected} />
                            <FormInput label={t('client_form.field_address')} name="address" value={formData.address} onChange={handleChange} readOnly={isExistingOrgSelected} />
                            <FormInput label="שמות נוספים (Aliases)" name="aliasesText" value={formData.aliasesText} onChange={handleChange} placeholder="לדוגמה: Microsoft Israel, MSFT" readOnly={isExistingOrgSelected} />
                            <FormTextArea label="תיאור חברה" name="companyDescription" value={formData.companyDescription} onChange={handleChange} rows={3} placeholder="תיאור קצר על החברה..." readOnly={isExistingOrgSelected} />
                            <FormSelect label={t('client_form.field_status')} name="status" value={formData.status} onChange={handleChange} disabled={isExistingOrgSelected}>
                                <option value="פעיל">פעיל</option>
                                <option value="לא פעיל">לא פעיל</option>
                                <option value="בהקפאה">בהקפאה</option>
                            </FormSelect>
                        </div>
                    </AccordionSection>
                </div>

                <div id="contact-person">
                    <AccordionSection title={t('client_form.section_contact')} icon={<UserCircleIcon className="w-5 h-5"/>} defaultOpen={!isExistingOrgSelected}>
                        {isPlatformAdmin && !isExistingOrgSelected ? (
                            <p className="mb-4 text-sm text-primary-800 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3">
                                {t('client_form.contact_manager_hint')}
                            </p>
                        ) : null}
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                            <FormInput label={t('client_form.field_contact_name')} name="contactName" value={formData.contactName} onChange={handleChange} required={!isExistingOrgSelected} readOnly={isExistingOrgSelected} />
                            <FormInput label={t('client_form.field_contact_role')} name="contactRole" value={formData.contactRole} onChange={handleChange} readOnly={isExistingOrgSelected} />
                            <FormInput label={t('client_form.field_contact_email')} name="contactEmail" value={formData.contactEmail} onChange={handleChange} type="email" required={!isExistingOrgSelected} readOnly={isExistingOrgSelected} />
                            <FormInput label={t('client_form.field_contact_phone')} name="contactPhone" value={formData.contactPhone} onChange={handleChange} type="tel" readOnly={isExistingOrgSelected} />
                        </div>
                    </AccordionSection>
                </div>
                
                 <div id="internal-notes">
                    <AccordionSection title={t('client_form.section_notes')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen={false}>
                        <FormTextArea label={t('client_form.field_notes')} name="notes" value={formData.notes} onChange={handleChange} placeholder={t('client_form.placeholder_notes')} readOnly={isExistingOrgSelected} />
                    </AccordionSection>
                </div>
                
                <div className="fixed bottom-0 left-0 right-0 bg-bg-card/90 backdrop-blur-md border-t border-border-default p-4 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                    <div className="max-w-4xl mx-auto flex justify-end items-center gap-4 px-4 sm:px-6 lg:px-8">
                        <button type="button" onClick={onCancel} className="text-text-muted font-bold py-2.5 px-6 rounded-xl hover:bg-bg-hover transition-colors">{t('client_form.cancel')}</button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'שומר...' : isExistingOrgSelected || isTenantStaff ? 'קשר לארגון' : t('client_form.save')}
                        </button>
                    </div>
                </div>
            </form>
            {error && (
                <div className="mt-4 text-sm text-red-600 font-semibold">
                    {error}
                </div>
            )}
        </div>
    );
};

export default NewClientView;
