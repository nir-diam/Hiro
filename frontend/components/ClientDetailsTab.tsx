
import React, { useState, useEffect } from 'react';
import { LinkIcon, PencilIcon } from './Icons';
import AccordionSection from './AccordionSection'; 
import { useLanguage } from '../context/LanguageContext';
import { authHeaders } from '../utils/authHeaders';

// Reusable local components for this view
const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
    </div>
);

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode }> = ({ label, name, value, onChange, children }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5">
            {children}
        </select>
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number }> = ({ label, name, value, onChange, rows = 4 }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"></textarea>
    </div>
);

const InfoTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="bg-secondary-100 text-secondary-800 text-xs font-semibold px-2.5 py-1 rounded-full">
        {children}
    </span>
);

const getPrimaryOrg = (client: any): Record<string, any> => {
    const links: any[] = Array.isArray(client?.organizationLinks) ? client.organizationLinks : [];
    const primary = links.find((l) => l.isPrimary) || links[0];
    return (primary?.organization && typeof primary.organization === 'object') ? primary.organization : {};
};

const getClientBusinessProfile = (client: any) => {
    const meta = (client?.metadata && typeof client.metadata === 'object') ? client.metadata : {};
    const org = getPrimaryOrg(client);

    const mainField = String(org.mainField || client?.industry || meta.mainField || '').trim();
    const mainField2 = (() => {
        const src = org.mainField2 ?? meta.mainField2;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const subField = (() => {
        const src = org.subField ?? meta.subField;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const secondaryField = String(org.secondaryField || meta.secondaryField || '').trim();
    const industryDisplay = [mainField, ...mainField2].filter(Boolean).join(' · ') || '—';

    const description = String(org.description || org.snippet || meta.description || meta.notes || '').trim();
    const products: string[] = (() => {
        const src = org.productType ?? org.subField ?? meta.products;
        return Array.isArray(src) ? src.map((v: unknown) => String(v || '').trim()).filter(Boolean) : [];
    })();
    const website = String(org.website || meta.website || '').trim();
    const employeeCount = String(org.employeeCount || meta.employeeCount || '').trim();
    const ownership = String(org.structure || org.type || meta.ownership || '').trim();
    const location = String(org.location || client?.city || org.address || meta.address || '').trim();

    return { mainField, mainField2, subField, secondaryField, industryDisplay, description, products, website, employeeCount, ownership, location };
};

interface ClientDetailsTabProps {
    client: any;
    onClientUpdated?: (next: any) => void;
}

const ClientDetailsTab: React.FC<ClientDetailsTabProps> = ({ client, onClientUpdated }) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const businessProfile = getClientBusinessProfile(client);
    const [formData, setFormData] = useState({
        clientName: '',
        clientStatus: 'פעיל',
        accountManager: '',
        recruiters: '',
        internalNotes: '',
    });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!client) return;
        const meta = (client.metadata && typeof client.metadata === 'object') ? client.metadata : {};
        setFormData({
            clientName: client.displayName || client.name || '',
            clientStatus: client.status || 'פעיל',
            accountManager: client.accountManager || '',
            recruiters: Array.isArray(meta.recruiters) ? meta.recruiters.join(', ') : (meta.recruiters || ''),
            internalNotes: meta.internalNotes || '',
        });
    }, [client]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleSave = async () => {
        if (!client?.id || !apiBase) return;
        setIsSaving(true);
        setError(null);
        try {
            const prevMeta = (client.metadata && typeof client.metadata === 'object') ? client.metadata : {};
            const recruitersArr = String(formData.recruiters || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            const payload: any = {
                name: formData.clientName || client.name,
                displayName: formData.clientName || client.displayName,
                status: formData.clientStatus,
                accountManager: formData.accountManager,
                metadata: {
                    ...prevMeta,
                    recruiters: recruitersArr,
                    internalNotes: formData.internalNotes || '',
                },
            };

            const res = await fetch(`${apiBase}/api/clients/${client.id}`, {
                method: 'PUT',
                headers: authHeaders(true),
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.message || 'Update failed');
            }
            const updated = await res.json();
            onClientUpdated?.(updated);
        } catch (e: any) {
            setError(e?.message || 'Update failed');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <AccordionSection title={t('client_details.section_info')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                 <div className="space-y-4 text-sm">
                    <p className="text-text-muted leading-relaxed">
                        {businessProfile.description || '—'}
                    </p>
                    <div>
                        <h4 className="font-semibold text-text-default mb-2">{t('client_details.products_services')}</h4>
                        <div className="flex flex-wrap gap-2">
                            {businessProfile.products.slice(0, 8).map((p) => (
                                <InfoTag key={p}>{p}</InfoTag>
                            ))}
                            {businessProfile.products.length === 0 && <InfoTag>—</InfoTag>}
                        </div>
                    </div>
                    <dl className="space-y-2 pt-2 border-t border-border-default">
                        <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.industry')}</dt><dd className="font-semibold text-right">{businessProfile.industryDisplay}</dd></div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-text-muted shrink-0">תחום עיסוק:</dt>
                            <dd className="font-semibold text-right">
                                {businessProfile.subField.length > 0 ? (
                                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                                        {businessProfile.subField.map((item) => (
                                            <InfoTag key={item}>{item}</InfoTag>
                                        ))}
                                    </span>
                                ) : '—'}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                            <dt className="text-text-muted shrink-0">תחום עיסוק משני:</dt>
                            <dd className="font-semibold text-right">{businessProfile.secondaryField || '—'}</dd>
                        </div>
                        <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.employees')}</dt><dd className="font-semibold">{businessProfile.employeeCount || '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.ownership')}</dt><dd className="font-semibold">{businessProfile.ownership || '—'}</dd></div>
                        <div className="flex justify-between"><dt className="text-text-muted">{t('client_details.location')}</dt><dd className="font-semibold">{businessProfile.location || '—'}</dd></div>
                        <div className="flex justify-between items-center">
                            <dt className="text-text-muted">{t('client_details.website')}</dt>
                            <dd>
                                {businessProfile.website ? (
                                    <a href={businessProfile.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-semibold flex items-center gap-1">
                                        <span>{businessProfile.website.replace('https://www.', '').replace('http://www.', '').replace('https://', '').replace('http://', '')}</span>
                                        <LinkIcon className="w-4 h-4" />
                                    </a>
                                ) : (
                                    <span className="font-semibold">—</span>
                                )}
                            </dd>
                        </div>
                    </dl>
                 </div>
            </AccordionSection>
            
            <AccordionSection title={t('client_details.section_management')} icon={<PencilIcon className="w-5 h-5"/>} defaultOpen>
                <div className="space-y-4">
                     <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><strong className="text-text-muted">{t('client_details.client_id')}</strong> <span className="font-semibold">{String(client?.id || '—')}</span></div>
                        <div><strong className="text-text-muted">{t('client_details.created_at')}</strong> <span className="font-semibold">{client?.creationDate ? new Date(client.creationDate).toLocaleDateString('he-IL') : (client?.createdAt ? new Date(client.createdAt).toLocaleDateString('he-IL') : '—')}</span></div>
                    </div>
                    <FormInput label={t('client_details.field_client_name')} name="clientName" value={formData.clientName} onChange={handleChange} />
                    <FormSelect label={t('client_details.field_client_type')} name="clientStatus" value={formData.clientStatus} onChange={handleChange}>
                        <option value="פעיל">פעיל</option>
                        <option value="בהקפאה">בהקפאה</option>
                        <option value="לא פעיל">לא פעיל</option>
                    </FormSelect>
                     <FormInput label={t('client_details.field_account_manager')} name="accountManager" value={formData.accountManager} onChange={handleChange} />
                    <FormInput label={t('client_details.field_recruiter')} name="recruiters" value={formData.recruiters} onChange={handleChange} />
                     <FormTextArea label={t('client_details.field_internal_notes')} name="internalNotes" value={formData.internalNotes} onChange={handleChange} />
                     <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleSave}
                            className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'שומר...' : t('client_details.save_changes')}
                        </button>
                    </div>
                    {error && <div className="text-sm font-semibold text-red-600">{error}</div>}
                </div>
            </AccordionSection>
        </div>
    );
};

export default ClientDetailsTab;
