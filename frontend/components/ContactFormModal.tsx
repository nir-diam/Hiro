import React, { useEffect, useId } from 'react';
import { UserCircleIcon, XMarkIcon } from './Icons';
import ContactFormFields from './ContactFormFields';
import { ContactFormState } from '../utils/contactFormModel';

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  formData: ContactFormState;
  onChange: (next: ContactFormState) => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  error?: string | null;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  formData,
  onChange,
  onSave,
  isSaving = false,
  error,
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[94vh] sm:max-h-[90vh] bg-bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border-default flex flex-col overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="relative px-6 pt-6 pb-4 border-b border-border-subtle bg-gradient-to-l from-primary-50/80 to-bg-card">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-full text-text-muted hover:bg-bg-hover"
            aria-label="סגור"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          <div className="flex items-start gap-4 pe-8">
            <div className="w-12 h-12 rounded-2xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0 shadow-sm">
              <UserCircleIcon className="w-7 h-7" />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-bold text-text-default truncate">
                {title}
              </h2>
              {subtitle ? (
                <p className="text-sm text-text-muted mt-1">{subtitle}</p>
              ) : (
                <p className="text-sm text-text-muted mt-1">מלא את פרטי איש הקשר — רק שם פרטי הוא שדה חובה</p>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5 bg-bg-subtle/30">
          <ContactFormFields formData={formData} onChange={onChange} error={error} />
        </main>

        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border-default bg-bg-card">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-text-muted font-bold py-2.5 px-5 rounded-xl hover:bg-bg-hover transition-colors disabled:opacity-60"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={isSaving}
            className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isSaving ? 'שומר...' : 'שמור'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ContactFormModal;
