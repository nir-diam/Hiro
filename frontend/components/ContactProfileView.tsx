import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  PhoneIcon,
  EnvelopeIcon,
  LinkedInIcon,
  WhatsappIcon,
  ChatBubbleBottomCenterTextIcon,
  PencilIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
} from './Icons';
import ContactDetailsTab from './ContactDetailsTab';
import ContactHistoryTab from './ContactHistoryTab';
import ContactEventsTab from './ContactEventsTab';
import ClientContactProcessesTab from './ClientContactProcessesTab';
import ClientJobsTab from './ClientJobsTab';
import ClientTasksTab from './ClientTasksTab';
import ContactFinanceTab from './ContactFinanceTab';
import ContactEmailsTab from './ContactEmailsTab';
import ContactSMSTab from './ContactSMSTab';
import ContactWhatsAppTab from './ContactWhatsAppTab';
import { MessageModalConfig } from '../hooks/useUIState';
import { authHeaders } from '../utils/authHeaders';
import {
  contactFromApi,
  contactOrganizationTmpId,
  contactToApiPayload,
  primaryEmail,
  primaryPhone,
  type ContactFormState,
} from '../utils/contactFormModel';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';

type Tab =
  | 'details'
  | 'tasks'
  | 'processes'
  | 'events'
  | 'jobs'
  | 'finance'
  | 'emails'
  | 'sms'
  | 'whatsapp'
  | 'personal_emails'
  | 'company_emails'
  | 'history';

const PROFILE_TABS = new Set<Tab>([
  'details',
  'tasks',
  'processes',
  'events',
  'jobs',
  'finance',
  'sms',
  'whatsapp',
  'personal_emails',
  'history',
]);

const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
  { id: 'details', label: 'פרטים אישיים', icon: <PencilIcon className="w-5 h-5" /> },
  { id: 'tasks', label: 'משימות', icon: <ClipboardDocumentCheckIcon className="w-5 h-5" /> },
  { id: 'events', label: 'אירועים', icon: <CalendarDaysIcon className="w-5 h-5" /> },
  { id: 'finance', label: 'כספים', icon: <BanknotesIcon className="w-5 h-5" /> },
  { id: 'personal_emails', label: 'מיילים אישיים', icon: <EnvelopeIcon className="w-5 h-5" /> },
  { id: 'sms', label: 'SMS', icon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <WhatsappIcon className="w-5 h-5" /> },
  { id: 'jobs', label: 'משרות משויכות', icon: <BriefcaseIcon className="w-5 h-5" /> },
  { id: 'history', label: 'היסטוריה', icon: <ClockIcon className="w-5 h-5" /> },
];

const SocialButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  href?: string;
}> = ({ children, onClick, title, href }) => {
  const commonProps = {
    title,
    className:
      'w-10 h-10 flex items-center justify-center bg-primary-100/70 text-primary-600 rounded-lg hover:bg-primary-200 transition-colors',
  };
  if (href) {
    return (
      <a href={href} {...commonProps}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} {...commonProps}>
      {children}
    </button>
  );
};

interface ContactProfileViewProps {
  openMessageModal: (config: MessageModalConfig) => void;
}

const ContactProfileView: React.FC<ContactProfileViewProps> = ({ openMessageModal }) => {
  const { clientId, contactId } = useParams<{ clientId: string; contactId: string }>();
  const [searchParams] = useSearchParams();
  const tabFromUrlRaw = searchParams.get('tab');
  const tabFromUrl =
    tabFromUrlRaw === 'company_emails' || tabFromUrlRaw === 'emails'
      ? 'personal_emails'
      : tabFromUrlRaw;
  const pipelineFromUrl = searchParams.get('pipelineId');
  const processStageFromUrl = searchParams.get('processStage');
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (tabFromUrl && PROFILE_TABS.has(tabFromUrl as Tab)) return tabFromUrl as Tab;
    return 'details';
  });
  const [eventsPipelineId, setEventsPipelineId] = useState<string | null>(pipelineFromUrl);
  const [eventsProcessStageId, setEventsProcessStageId] = useState<string | null>(processStageFromUrl);

  useEffect(() => {
    if (tabFromUrl && PROFILE_TABS.has(tabFromUrl as Tab)) {
      setActiveTab(tabFromUrl as Tab);
    }
    setEventsPipelineId(pipelineFromUrl);
    setEventsProcessStageId(processStageFromUrl);
  }, [tabFromUrl, pipelineFromUrl, processStageFromUrl]);

  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [contact, setContact] = useState<any | null>(null);
  const [clientName, setClientName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setContactProfileParent } = useBreadcrumbContext();

  const organizationDisplayName = useMemo(() => {
    if (!contact) return '';
    return String(
      contact.organizationName
        || contact.organization?.name
        || contact.organization?.displayName
        || '',
    ).trim();
  }, [contact]);

  useEffect(() => {
    if (!contact) {
      setContactProfileParent(null);
      return;
    }
    const organizationId = contact.organizationId ? String(contact.organizationId).trim() : '';
    const organizationName = organizationDisplayName;
    if (organizationId && organizationName) {
      setContactProfileParent({
        label: organizationName,
        path: `/organizations/${organizationId}`,
      });
    } else {
      setContactProfileParent(null);
    }
    return () => setContactProfileParent(null);
  }, [contact, organizationDisplayName, setContactProfileParent]);

  useEffect(() => {
    if (!apiBase || !clientId || !contactId) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    Promise.all([
      fetch(`${apiBase}/api/clients/${clientId}/contacts`, {
        credentials: 'include',
        headers: authHeaders(),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to load contacts');
        return r.json();
      }),
      fetch(`${apiBase}/api/clients/${clientId}`, {
        credentials: 'include',
        headers: authHeaders(),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([data, client]) => {
        if (!active) return;
        const list = Array.isArray(data) ? data : data?.data ?? [];
        const found = list.find((c: any) => String(c.id) === String(contactId));
        if (!found) throw new Error('איש קשר לא נמצא.');
        setContact(found);
        setClientName(client?.displayName || client?.name || '');
      })
      .catch((e: any) => {
        if (!active) return;
        setError(e?.message || 'איש קשר לא נמצא.');
        setContact(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [apiBase, clientId, contactId]);

  const [formData, setFormData] = useState<ContactFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (contact) setFormData(contactFromApi(contact));
  }, [contact]);

  if (isLoading) return <div className="text-center p-8">טוען...</div>;
  if (error || !contact) return <div className="text-center p-8">{error || 'איש קשר לא נמצא.'}</div>;

  const handleFormChange = (updatedData: ContactFormState) => {
    setFormData(updatedData);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!formData || !apiBase || !clientId || !contactId) return;
    if (!formData.firstName.trim() && !formData.lastName.trim()) {
      setSaveError('נא למלא לפחות שם פרטי');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: authHeaders(true),
          body: JSON.stringify(contactToApiPayload(formData)),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || 'שמירה נכשלה');
      }
      const updated = await res.json();
      setContact(updated);
      setFormData(contactFromApi(updated));
    } catch (e: any) {
      setSaveError(e?.message || 'שמירה נכשלה');
    } finally {
      setIsSaving(false);
    }
  };

  const displayEmail = formData ? primaryEmail(formData) : contact.email;
  const displayPhone = formData
    ? primaryPhone(formData, 'mobile') || primaryPhone(formData, 'office')
    : contact.mobilePhone || contact.phone;

  const handleActionClick = (mode: 'email' | 'sms' | 'whatsapp') => {
    openMessageModal({
      mode,
      recipientType: 'client_contact',
      candidateName: contact.name,
      candidatePhone: displayPhone,
      candidateEmail: displayEmail || undefined,
      linkedClientId: clientId || null,
      linkedContactId: contactId || null,
      linkedOrganizationId: contact.organizationId ? String(contact.organizationId) : null,
      linkedOrganizationName: organizationDisplayName || null,
      recipientOptions: [
        {
          id: String(contactId || contact.id),
          name: contact.name,
          email: displayEmail || contact.mainContactEmail || '',
          phone: displayPhone || '',
          subtitle: organizationDisplayName || null,
          clientId: clientId || null,
          organizationId: contact.organizationId ? String(contact.organizationId) : null,
        },
      ],
      initialRecipientIds: contactId ? [contactId] : undefined,
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'details':
        return formData ? (
          <ContactDetailsTab
            formData={formData}
            onFormChange={handleFormChange}
            onSave={handleSave}
            isSaving={isSaving}
            error={saveError}
          />
        ) : null;
      case 'tasks':
        return (
          <ClientTasksTab
            clientId={clientId!}
            organizationId={contact.organizationId ? String(contact.organizationId) : undefined}
            contactName={contact.name}
          />
        );
      case 'processes':
        return (
          <ClientContactProcessesTab
            clientId={clientId!}
            organizationId={contact.organizationId ? String(contact.organizationId) : undefined}
            contactId={contactId}
            contactName={contact.name}
          />
        );
      case 'events':
        return (
          <ContactEventsTab
            key={`${contactId}:${eventsPipelineId || 'all'}:${eventsProcessStageId || ''}`}
            clientId={clientId!}
            clientName={clientName}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
            organizationTmpId={contactOrganizationTmpId(contact)}
            organizationName={
              String(
                contact.organizationName
                  || contact.organization?.name
                  || contact.organization?.displayName
                  || '',
              ).trim() || null
            }
            contactId={contactId}
            contactName={contact.name}
            contactProcessPipelineId={
              contact.pipelineId != null ? String(contact.pipelineId) : null
            }
            contactProcessStageId={
              contact.processStage != null ? String(contact.processStage) : null
            }
            defaultActionPipelineId={eventsPipelineId}
            defaultProcessStageId={eventsProcessStageId}
            openMessageModal={openMessageModal}
          />
        );
      case 'finance':
        return (
          <ContactFinanceTab
            clientId={clientId!}
            contactId={contactId}
            clientName={clientName}
          />
        );
      case 'emails':
      case 'personal_emails':
      case 'company_emails':
        return (
          <ContactEmailsTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            contactEmail={displayEmail || contact.email}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
            title="מיילים אישיים"
          />
        );
      case 'sms':
        return (
          <ContactSMSTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
          />
        );
      case 'whatsapp':
        return (
          <ContactWhatsAppTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
          />
        );
      case 'jobs':
        return (
          <ClientJobsTab
            clientId={clientId!}
            contactId={contactId!}
          />
        );
      case 'history':
        return (
          <ContactHistoryTab
            clientId={clientId!}
            contactId={contactId!}
            contactName={contact.name}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
          />
        );
      default:
        return null;
    }
  };

  const domainHint =
    typeof displayEmail === 'string' && displayEmail.includes('@')
      ? displayEmail.split('@')[1]
      : clientName;

  return (
    <div className="space-y-6">
      <div className="bg-bg-card rounded-2xl shadow-sm p-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div>
            <h1 className="text-2xl font-bold text-text-default">{contact.name}</h1>
            <p className="text-text-muted">
              {contact.role}
              {domainHint ? ` · ${domainHint}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SocialButton href={`tel:${displayPhone}`} title="Phone">
              <PhoneIcon className="w-5 h-5" />
            </SocialButton>
            <SocialButton onClick={() => handleActionClick('email')} title="Send Email">
              <EnvelopeIcon className="w-5 h-5" />
            </SocialButton>
            <SocialButton onClick={() => handleActionClick('sms')} title="Send SMS">
              <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
            </SocialButton>
            {contact.linkedin ? (
              <SocialButton href={contact.linkedin} title="LinkedIn Profile">
                <LinkedInIcon className="w-5 h-5" />
              </SocialButton>
            ) : null}
            <SocialButton onClick={() => handleActionClick('whatsapp')} title="Send WhatsApp">
              <WhatsappIcon className="w-5 h-5" />
            </SocialButton>
          </div>
        </div>
      </div>

      <div className="border-b border-border-default">
        <nav className="flex items-center -mb-px gap-4 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${
                activeTab === tab.id
                  ? 'border-b-2 border-primary-500 text-primary-600'
                  : 'text-text-muted hover:text-text-default'
              }`}
            >
              {React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, {
                className: 'w-5 h-5',
              })}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <main>{renderContent()}</main>
    </div>
  );
};

export default ContactProfileView;
