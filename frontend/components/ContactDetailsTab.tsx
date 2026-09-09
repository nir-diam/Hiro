import React from 'react';
import ContactFormFields from './ContactFormFields';
import { ContactFormState } from '../utils/contactFormModel';

interface ContactDetailsTabProps {
  formData: ContactFormState;
  onFormChange: (updatedData: ContactFormState) => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  error?: string | null;
}

const ContactDetailsTab: React.FC<ContactDetailsTabProps> = ({
  formData,
  onFormChange,
  onSave,
  isSaving = false,
  error,
}) => (
  <div className="space-y-4">
    <ContactFormFields formData={formData} onChange={onFormChange} error={error} />
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={isSaving}
        className="bg-primary-600 text-white font-semibold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSaving ? 'שומר...' : 'שמור שינויים'}
      </button>
    </div>
  </div>
);

export default ContactDetailsTab;
