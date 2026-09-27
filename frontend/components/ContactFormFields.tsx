import React from 'react';
import { PlusIcon, TrashIcon, StarIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
  ContactFormState,
  ContactAddressEntry,
  ContactEmailEntry,
  ContactLinkEntry,
  ContactPhoneEntry,
  newContactEntryId,
  setPrimaryAddress,
  setPrimaryEmail,
  setPrimaryLink,
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
  'w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block py-1.5 px-2.5 transition-all outline-none hover:border-border-strong';

const labelClass = 'block text-[11px] font-semibold text-text-muted mb-0.5';

const iconBtnClass = 'shrink-0 p-1 rounded-md border transition-colors';
const starActiveClass = 'border-amber-300 bg-amber-50 text-amber-600';
const starIdleClass =
  'border-border-default text-text-subtle hover:border-amber-200 hover:text-amber-500';
const trashBtnClass = 'shrink-0 p-1 rounded-md text-text-subtle hover:bg-red-50 hover:text-red-600';

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({
  title,
  children,
  className = '',
}) => (
  <section
    className={`rounded-xl border border-border-default/80 bg-bg-card/60 p-3 space-y-2.5 ${className}`}
  >
    <h3 className="text-xs font-bold text-text-default uppercase tracking-wide">{title}</h3>
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
  const updateLinks = (links: ContactLinkEntry[]) => patch({ links });
  const updateAddresses = (addresses: ContactAddressEntry[]) => patch({ addresses });

  const officePhones = formData.phones.filter((p) => p.kind === 'office');
  const mobilePhones = formData.phones.filter((p) => p.kind === 'mobile');

  const renderEmailRows = () => (
    <div className="space-y-1.5">
      {formData.emails.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            type="button"
            title={entry.isPrimary ? 'דוא״ל ראשי' : 'סמן כראשי'}
            onClick={() => updateEmails(setPrimaryEmail(formData.emails, entry.id))}
            className={`${iconBtnClass} ${entry.isPrimary ? starActiveClass : starIdleClass}`}
          >
            <StarIcon className={`w-3.5 h-3.5 ${entry.isPrimary ? 'fill-current' : ''}`} />
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
            className={`${inputClass} flex-1 min-w-0`}
          />
          <button
            type="button"
            onClick={() => updateEmails(formData.emails.filter((row) => row.id !== entry.id))}
            className={trashBtnClass}
            aria-label="הסר"
          >
            <TrashIcon className="w-3.5 h-3.5" />
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
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        הוסף דוא״ל
      </button>
    </div>
  );

  const renderPhoneRows = (kind: 'office' | 'mobile', rows: ContactPhoneEntry[], label: string) => (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-text-muted">{label}</label>
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
          className="inline-flex items-center gap-0.5 text-[11px] font-bold text-primary-600 hover:text-primary-700 shrink-0"
        >
          <PlusIcon className="w-3 h-3" />
          הוסף
        </button>
      </div>
      {rows.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            type="button"
            title={entry.isPrimary ? 'מספר ראשי' : 'סמן כראשי'}
            onClick={() => updatePhones(setPrimaryPhone(formData.phones, entry.id, kind))}
            className={`${iconBtnClass} ${entry.isPrimary ? starActiveClass : starIdleClass}`}
          >
            <StarIcon className={`w-3.5 h-3.5 ${entry.isPrimary ? 'fill-current' : ''}`} />
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
            className={`${inputClass} flex-1 min-w-0`}
          />
          <button
            type="button"
            onClick={() => updatePhones(formData.phones.filter((row) => row.id !== entry.id))}
            className={trashBtnClass}
            aria-label="הסר"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );

  const renderLinkRows = () => (
    <div className="space-y-1.5">
      {formData.links.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            type="button"
            title={entry.isPrimary ? 'קישור ראשי' : 'סמן כראשי'}
            onClick={() => updateLinks(setPrimaryLink(formData.links, entry.id))}
            className={`${iconBtnClass} ${entry.isPrimary ? starActiveClass : starIdleClass}`}
          >
            <StarIcon className={`w-3.5 h-3.5 ${entry.isPrimary ? 'fill-current' : ''}`} />
          </button>
          <input
            type="text"
            value={entry.label}
            onChange={(e) =>
              updateLinks(
                formData.links.map((row) =>
                  row.id === entry.id ? { ...row, label: e.target.value } : row,
                ),
              )
            }
            placeholder="שם"
            className={`${inputClass} w-[28%] min-w-[4.5rem] shrink-0`}
          />
          <input
            type="url"
            value={entry.url}
            onChange={(e) =>
              updateLinks(
                formData.links.map((row) =>
                  row.id === entry.id ? { ...row, url: e.target.value } : row,
                ),
              )
            }
            placeholder="https://..."
            dir="ltr"
            className={`${inputClass} flex-1 min-w-0`}
          />
          <button
            type="button"
            onClick={() => updateLinks(formData.links.filter((row) => row.id !== entry.id))}
            className={trashBtnClass}
            aria-label="הסר"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          updateLinks([
            ...formData.links,
            {
              id: newContactEntryId(),
              label: '',
              url: '',
              isPrimary: formData.links.length === 0,
            },
          ])
        }
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        הוסף קישור
      </button>
    </div>
  );

  const renderAddressRows = () => (
    <div className="space-y-1.5">
      {formData.addresses.map((entry) => (
        <div key={entry.id} className="flex items-center gap-1.5">
          <button
            type="button"
            title={entry.isPrimary ? 'כתובת ראשית' : 'סמן כראשית'}
            onClick={() => updateAddresses(setPrimaryAddress(formData.addresses, entry.id))}
            className={`${iconBtnClass} ${entry.isPrimary ? starActiveClass : starIdleClass}`}
          >
            <StarIcon className={`w-3.5 h-3.5 ${entry.isPrimary ? 'fill-current' : ''}`} />
          </button>
          <input
            type="text"
            value={entry.value}
            onChange={(e) =>
              updateAddresses(
                formData.addresses.map((row) =>
                  row.id === entry.id ? { ...row, value: e.target.value } : row,
                ),
              )
            }
            placeholder="רחוב, עיר, מיקוד..."
            className={`${inputClass} flex-1 min-w-0`}
          />
          <button
            type="button"
            onClick={() => updateAddresses(formData.addresses.filter((row) => row.id !== entry.id))}
            className={trashBtnClass}
            aria-label="הסר"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          updateAddresses([
            ...formData.addresses,
            {
              id: newContactEntryId(),
              value: '',
              isPrimary: formData.addresses.length === 0,
            },
          ])
        }
        className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700"
      >
        <PlusIcon className="w-3.5 h-3.5" />
        הוסף כתובת
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-3">
      {error ? (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      ) : null}

      <Section title="פרטים אישיים">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className={labelClass}>
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
            <label className={labelClass}>שם משפחה</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => patch({ lastName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>תפקיד</label>
            <input
              type="text"
              value={formData.role}
              onChange={(e) => patch({ role: e.target.value })}
              className={inputClass}
              placeholder="מנהל/ת גיוס"
            />
          </div>
        </div>
        {formData.name.trim() ? (
          <p className="text-[11px] text-text-muted pt-0.5">
            שם מלא: <span className="font-semibold text-text-default">{formData.name}</span>
          </p>
        ) : null}
      </Section>

      <Section title="פרטי קשר">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label className={labelClass}>דוא״ל</label>
            {renderEmailRows()}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-3 min-w-0">
            {renderPhoneRows('office', officePhones, 'טלפון משרד')}
            {renderPhoneRows('mobile', mobilePhones, 'טלפון נייד')}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5">
          <div>
            <label className={labelClass}>לינקדאין</label>
            <input
              type="url"
              value={formData.linkedin}
              onChange={(e) => patch({ linkedin: e.target.value })}
              dir="ltr"
              placeholder="linkedin.com/in/..."
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>שם משתמש</label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => patch({ username: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>קישורים</label>
          {renderLinkRows()}
        </div>

        <div>
          <label className={labelClass}>כתובות</label>
          {renderAddressRows()}
        </div>
      </Section>

      {showDistribution ? (
        <Section title={t('section.distribution_channels')}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionEmail !== false}
                onChange={(e) => patch({ distributionEmail: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span>{t('section.distribution_email')}</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionSms !== false}
                onChange={(e) => patch({ distributionSms: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border-default text-primary-600 focus:ring-primary-500"
              />
              <span>{t('section.distribution_sms')}</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-text-default cursor-pointer">
              <input
                type="checkbox"
                checked={formData.distributionWhatsapp !== false}
                onChange={(e) => patch({ distributionWhatsapp: e.target.checked })}
                className="h-3.5 w-3.5 rounded border-border-default text-primary-600 focus:ring-primary-500"
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
          rows={2}
          className={`${inputClass} resize-y min-h-[52px]`}
          placeholder="הערות לצוות..."
        />
      </Section>
    </div>
  );
};

export default ContactFormFields;
