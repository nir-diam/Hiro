import React from 'react';
import { PlusIcon, TrashIcon, StarIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
  ContactFormState,
  ContactEmailEntry,
  ContactPhoneEntry,
  newContactEntryId,
  setPrimaryEmail,
  setPrimaryPhone,
  syncContactName,
} from '../utils/contactFormModel';

interface ContactFormFieldsProps {
  formData: ContactFormState;
  onChange: (next: ContactFormState) => void;
  error?: string | null;
  showDistribution?: boolean;
}

const inputClass =
  'w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3 transition-all outline-none hover:border-border-strong shadow-sm';

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <section className="rounded-2xl border border-border-default bg-bg-card/80 p-5 space-y-4 shadow-sm">
    <div>
      <h3 className="text-sm font-bold text-text-default">{title}</h3>
      {subtitle ? <p className="text-xs text-text-muted mt-0.5">{subtitle}</p> : null}
    </div>
    {children}
  </section>
);

const ContactFormFields: React.FC<ContactFormFieldsProps> = ({
  formData,
  onChange,
  error,
  showDistribution = true,
}) => {
  const { t } = useLanguage();

  const patch = (partial: Partial<ContactFormState>) => {
    onChange(syncContactName({ ...formData, ...partial }));
  };

  const updateEmails = (emails: ContactEmailEntry[]) => patch({ emails });
  const updatePhones = (phones: ContactPhoneEntry[]) => patch({ phones });

  const officePhones = formData.phones.filter((p) => p.kind === 'office');
  const mobilePhones = formData.phones.filter((p) => p.kind === 'mobile');

  const renderEmailRows = () => (
    <div className="space-y-2">
      {formData.emails.length === 0 ? (
        <p className="text-xs text-text-muted">אין כתובות — לחץ + להוספה</p>
      ) : null}
      {formData.emails.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <button
            type="button"
            title={entry.isPrimary ? 'דוא״ל ראשי' : 'סמן כראשי'}
            onClick={() => updateEmails(setPrimaryEmail(formData.emails, entry.id))}
            className={`shrink-0 p-2 rounded-lg border transition-colors ${
              entry.isPrimary
                ? 'border-amber-300 bg-amber-50 text-amber-600'
                : 'border-border-default text-text-subtle hover:border-amber-200 hover:text-amber-500'
            }`}
          >
            <StarIcon className={`w-4 h-4 ${entry.isPrimary ? 'fill-current' : ''}`} />
          </button>
          <input
            type="email"
            value={entry.value}
            onChange={(e) =>
              updateEmails(
                formData.emails.map((row) =>
                  row.id === entry.id ? { ...row, value: e.target.value } : row,
                ),
              )
            }
            placeholder="name@company.com"
            dir="ltr"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => updateEmails(formData.emails.filter((row) => row.id !== entry.id))}
            className="shrink-0 p-2 rounded-lg text-text-subtle hover:bg-red-50 hover:text-red-600"
            aria-label="הסר"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          updateEmails([
            ...formData.emails,
            {
              id: newContactEntryId(),
              value: '',
              isPrimary: formData.emails.length === 0,
            },
          ])
        }
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700"
      >
        <PlusIcon className="w-4 h-4" />
        הוסף דוא״ל
      </button>
    </div>
  );

  const renderPhoneRows = (kind: 'office' | 'mobile', rows: ContactPhoneEntry[], label: string) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-text-muted">{label}</label>
        <button
          type="button"
          onClick={() =>
            updatePhones([
              ...formData.phones,
              {
                id: newContactEntryId(),
                value: '',
                kind,
                isPrimary: rows.length === 0,
              },
            ])
          }
          className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          הוסף
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-text-muted">לא הוזן {label.toLowerCase()}</p>
      ) : null}
      {rows.map((entry) => (
        <div key={entry.id} className="flex items-center gap-2">
          <button
            type="button"
            title={entry.isPrimary ? 'מספר ראשי' : 'סמן כראשי'}
            onClick={() => updatePhones(setPrimaryPhone(formData.phones, entry.id, kind))}
            className={`shrink-0 p-2 rounded-lg border transition-colors ${
              entry.isPrimary
                ? 'border-amber-300 bg-amber-50 text-amber-600'
                : 'border-border-default text-text-subtle hover:border-amber-200 hover:text-amber-500'
            }`}
          >
            <StarIcon className={`w-4 h-4 ${entry.isPrimary ? 'fill-current' : ''}`} />
          </button>
          <input
            type="tel"
            value={entry.value}
            onChange={(e) =>
              updatePhones(
                formData.phones.map((row) =>
                  row.id === entry.id ? { ...row, value: e.target.value } : row,
                ),
              )
            }
            dir="ltr"
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => updatePhones(formData.phones.filter((row) => row.id !== entry.id))}
            className="shrink-0 p-2 rounded-lg text-text-subtle hover:bg-red-50 hover:text-red-600"
            aria-label="הסר"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </div>
      ) : null}

      <Section title="פרטים אישיים" subtitle="שם פרטי ושם משפחה — יוצגו יחד כשם מלא">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">
              שם פרטי <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => patch({ firstName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-1.5">שם משפחה</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-semibold text-text-muted mb-1.5">תפקיד</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => patch({ role: e.target.value })}
              className={inputClass}
              placeholder="לדוגמה: מנהל/ת גיוס"
            />
          </div>
        </div>
        {formData.name.trim() ? (
          <p className="text-xs text-text-muted">
            שם מלא לתצוגה: <span className="font-semibold text-text-default">{formData.name}</span>
          </p>
        ) : null}
      </Section>

      <Section title="פרטי קשר" subtitle="ניתן להוסיף מספר כתובות — כוכב = ראשי">
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-text-muted mb-2">דוא״ל</label>
            {renderEmailRows()}
          </div>
          {renderPhoneRows('office', officePhones, 'טלפון משרד')}
          {renderPhoneRows('mobile', mobilePhones, 'טלפון נייד')}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5">לינקדאין</label>
              <input
                type="url"
                value={formData.linkedin}
                onChange={(e) => patch({ linkedin: e.target.value })}
                dir="ltr"
                placeholder="https://linkedin.com/in/..."
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-muted mb-1.5">שם משתמש</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => patch({ username: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </Section>

      {showDistribution ? (
        <Section title={t('section.distribution_channels')} subtitle="בחירת ערוצים לתקשורת המונית">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionEmail !== false}
                onChange={(e) => patch({ distributionEmail: e.target.checked })}
                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span>{t('section.distribution_email')}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionSms !== false}
                onChange={(e) => patch({ distributionSms: e.target.checked })}
                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span>{t('section.distribution_sms')}</span>
            </label>
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionWhatsapp !== false}
                onChange={(e) => patch({ distributionWhatsapp: e.target.checked })}
                className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span>{t('section.distribution_whatsapp')}</span>
            </label>
          </div>
        </Section>
      ) : null}

      <Section title="הערות פנימיות">
        <textarea
          value={formData.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={4}
          className={`${inputClass} resize-y min-h-[96px]`}
          placeholder="הערות לצוות..."
        />
      </Section>
    </div>
  );
};

export default ContactFormFields;
