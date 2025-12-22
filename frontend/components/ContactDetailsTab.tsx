import React from 'react';

// Define the Contact interface here to ensure the component is self-contained
interface Contact {
  id: number;
  name: string;
  phone: string;
  mobilePhone: string;
  email: string;
  role: string;
  linkedin: string;
  username: string;
  isActive: boolean;
  notes: string;
}

const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5" />
    </div>
);

const FormTextArea: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; }> = ({ label, name, value, onChange }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <textarea name={name} value={value} onChange={onChange} rows={4} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"></textarea>
    </div>
);

const ContactDetailsTab: React.FC<{ formData: Contact; onFormChange: (updatedData: Contact) => void }> = ({ formData, onFormChange }) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        onFormChange({ ...formData, [name]: value });
    };

    return (
        <div className="bg-bg-card rounded-lg border border-border-default p-6 space-y-4">
            <FormInput label="שם מלא" name="name" value={formData.name} onChange={handleChange} />
            <FormInput label="תפקיד" name="role" value={formData.role} onChange={handleChange} />
            <FormInput label="טלפון" name="phone" value={formData.phone} onChange={handleChange} />
            <FormInput label="טלפון נייד" name="mobilePhone" value={formData.mobilePhone} onChange={handleChange} />
            <FormInput label="דוא״ל" name="email" value={formData.email} onChange={handleChange} />
            <FormInput label="לינקדאין" name="linkedin" value={formData.linkedin} onChange={handleChange} />
            <FormInput label="שם משתמש" name="username" value={formData.username} onChange={handleChange} />
            <FormTextArea label="הערה פנימית" name="notes" value={formData.notes} onChange={handleChange} />
             <div className="flex justify-end pt-4">
                <button className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700">שמור שינויים</button>
            </div>
        </div>
    );
};

export default ContactDetailsTab;
