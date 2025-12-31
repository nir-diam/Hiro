
import React, { useState } from 'react';
import AccordionSection from './AccordionSection';
import { BuildingOffice2Icon, UserCircleIcon, PencilIcon, PhoneIcon, EnvelopeIcon, LinkIcon, MapPinIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

// --- Reusable Form Components ---
const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string; placeholder?: string; required?: boolean; }> = ({ label, name, value, onChange, type = 'text', placeholder, required = false }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label} {required && <span className="text-red-500">*</span>}</label>
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} required={required} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm" />
    </div>
);

const FormSelect: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; }> = ({ label, name, value, onChange, children }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <select name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
            {children}
        </select>
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number; placeholder?: string; }> = ({ label, name, value, onChange, rows = 3, placeholder }) => (
    <div className="md:col-span-2">
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={rows} placeholder={placeholder} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"></textarea>
    </div>
);

interface NewClientViewProps {
  onCancel: () => void;
  onSave: (clientData: any) => void;
}

const NewClientView: React.FC<NewClientViewProps> = ({ onCancel, onSave }) => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState({
        clientName: '',
        industry: '',
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
             <div id="client-details">
                <AccordionSection title={t('client_form.section_company')} icon={<BuildingOffice2Icon className="w-5 h-5"/>} defaultOpen>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <FormInput label={t('client_form.field_client_name')} name="clientName" value={formData.clientName} onChange={handleChange} required placeholder={t('client_form.placeholder_name')} />
                        <FormInput label={t('client_form.field_industry')} name="industry" value={formData.industry} onChange={handleChange} placeholder={t('client_form.placeholder_industry')} />
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
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
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
            
            <div className="flex justify-end items-center p-3 border-t border-border-default bg-bg-card gap-3 rounded-lg mt-4">
                <button type="button" onClick={onCancel} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">{t('client_form.cancel')}</button>
                <button type="submit" className="bg-primary-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-primary-700 transition">{t('client_form.save')}</button>
            </div>
        </form>
    );
};

export default NewClientView;
