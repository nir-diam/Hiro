import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  PhoneIcon,
  EnvelopeIcon,
  LinkedInIcon,
  WhatsappIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  PencilIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ArrowPathIcon,
  ClipboardDocumentCheckIcon,
  ClockIcon,
  DocumentTextIcon,
} from './Icons';
import ContactProposalsTab from './ContactProposalsTab';
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
import { MessageModalConfig, type MessageRecipientOption } from '../hooks/useUIState';
import {
  fetchClientContactRecipientOptions,
  mergeMessageRecipientOptions,
} from '../utils/processEntityDrawers';
import { authHeaders } from '../utils/authHeaders';
import {
  contactFromApi,
  contactOrganizationTmpId,
  contactToApiPayload,
  primaryEmail,
  primaryPhone,
  type ContactFormState,
} from '../utils/contactFormModel';
import { collectContactEmailAddresses } from '../utils/contactEmailMatch';
import { useBreadcrumbContext } from '../context/BreadcrumbContext';

type MainTab =
  | 'details'
  | 'tasks'
  | 'processes'
  | 'events'
  | 'jobs'
  | 'finance'
  | 'communication'
  | 'proposals'
  | 'history';

type CommunicationTab = 'personal_emails' | 'sms' | 'whatsapp';

const MAIN_PROFILE_TABS = new Set<MainTab>([
  'details',
  'tasks',
  'processes',
  'events',
  'jobs',
  'finance',
  'communication',
  'proposals',
  'history',
]);

const COMMUNICATION_TABS = new Set<CommunicationTab>(['personal_emails', 'sms', 'whatsapp']);

const mainTabs: { id: MainTab; label: string; icon: React.ReactElement }[] = [
  { id: 'details', label: 'פרטים אישיים', icon: <PencilIcon className="w-5 h-5" /> },
  { id: 'tasks', label: 'משימות', icon: <ClipboardDocumentCheckIcon className="w-5 h-5" /> },
  { id: 'events', label: 'אירועים', icon: <CalendarDaysIcon className="w-5 h-5" /> },
  { id: 'finance', label: 'כספים', icon: <BanknotesIcon className="w-5 h-5" /> },
  { id: 'communication', label: 'תקשורת', icon: <ChatBubbleOvalLeftEllipsisIcon className="w-5 h-5" /> },
  { id: 'proposals', label: 'הצעות מחיר', icon: <DocumentTextIcon className="w-5 h-5" /> },
  { id: 'jobs', label: 'משרות משויכות', icon: <BriefcaseIcon className="w-5 h-5" /> },
  { id: 'history', label: 'היסטוריה', icon: <ClockIcon className="w-5 h-5" /> },
];

const communicationTabs: { id: CommunicationTab; label: string; icon: React.ReactElement }[] = [
  { id: 'personal_emails', label: 'מיילים אישיים', icon: <EnvelopeIcon className="w-5 h-5" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <WhatsappIcon className="w-5 h-5" /> },
  { id: 'sms', label: 'SMS', icon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" /> },
];

function resolveTabsFromUrl(tabRaw: string | null, commRaw: string | null): {
  main: MainTab;
  communication: CommunicationTab;
} {
  const legacyComm =
    tabRaw === 'personal_emails'
    || tabRaw === 'sms'
    || tabRaw === 'whatsapp'
    || tabRaw === 'emails'
    || tabRaw === 'company_emails';
  if (legacyComm) {
    const comm: CommunicationTab =
      tabRaw === 'sms' ? 'sms'
      : tabRaw === 'whatsapp' ? 'whatsapp'
      : 'personal_emails';
    return { main: 'communication', communication: comm };
  }
  if (tabRaw === 'communication') {
    const comm =
      commRaw && COMMUNICATION_TABS.has(commRaw as CommunicationTab)
        ? (commRaw as CommunicationTab)
        : 'personal_emails';
    return { main: 'communication', communication: comm };
  }
  if (tabRaw && MAIN_PROFILE_TABS.has(tabRaw as MainTab)) {
    return { main: tabRaw as MainTab, communication: 'personal_emails' };
  }
  return { main: 'details', communication: 'personal_emails' };
}

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
  const commFromUrlRaw = searchParams.get('comm') || searchParams.get('channel');
  const initialTabs = resolveTabsFromUrl(tabFromUrlRaw, commFromUrlRaw);
  const pipelineFromUrl = searchParams.get('pipelineId');
  const processStageFromUrl = searchParams.get('processStage');
  const [activeTab, setActiveTab] = useState<MainTab>(() => initialTabs.main);
  const [communicationTab, setCommunicationTab] = useState<CommunicationTab>(
    () => initialTabs.communication,
  );
  const [eventsPipelineId, setEventsPipelineId] = useState<string | null>(pipelineFromUrl);
  const [eventsProcessStageId, setEventsProcessStageId] = useState<string | null>(processStageFromUrl);

  useEffect(() => {
    const resolved = resolveTabsFromUrl(tabFromUrlRaw, commFromUrlRaw);
    setActiveTab(resolved.main);
    setCommunicationTab(resolved.communication);
    setEventsPipelineId(pipelineFromUrl);
    setEventsProcessStageId(processStageFromUrl);
  }, [tabFromUrlRaw, commFromUrlRaw, pipelineFromUrl, processStageFromUrl]);

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
  const [orgRecipientOptions, setOrgRecipientOptions] = useState<MessageRecipientOption[]>([]);

  useEffect(() => {
    if (contact) setFormData(contactFromApi(contact));
  }, [contact]);

  const organizationTmpId = contact ? contactOrganizationTmpId(contact) : null;

  useEffect(() => {
    if (!apiBase || !clientId || !contact) {
      setOrgRecipientOptions([]);
      return;
    }
    const organizationId = contact.organizationId ? String(contact.organizationId).trim() : '';
    const tmpId = organizationTmpId ? String(organizationTmpId).trim() : '';
    if (!organizationId && !tmpId) {
      setOrgRecipientOptions([]);
      return;
    }
    let active = true;
    void fetchClientContactRecipientOptions(
      apiBase,
      clientId,
      organizationDisplayName || clientName,
      { organizationId: organizationId || null, organizationTmpId: tmpId || null },
    ).then((rows) => {
      if (active) setOrgRecipientOptions(rows);
    });
    return () => {
      active = false;
    };
  }, [apiBase, clientId, contact, organizationDisplayName, clientName, organizationTmpId]);

  const contactEmailList = useMemo(() => {
    if (formData) return collectContactEmailAddresses(formData);
    if (!contact) return [];
    return collectContactEmailAddresses({
      emails: (contact as { emails?: { value?: string }[] }).emails,
      email: contact.email,
      mainContactEmail: contact.mainContactEmail,
    });
  }, [formData, contact]);

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

  const buildCurrentRecipientOption = (): MessageRecipientOption => ({
    id: String(contactId || contact.id),
    name: contact.name,
    email: displayEmail || contact.mainContactEmail || '',
    phone: displayPhone || '',
    subtitle: organizationDisplayName || null,
    clientId: clientId || null,
    organizationId: contact.organizationId ? String(contact.organizationId) : null,
  });

  const handleActionClick = async (mode: 'email' | 'sms' | 'whatsapp') => {
    const current = buildCurrentRecipientOption();
    let recipientOptions = mergeMessageRecipientOptions(orgRecipientOptions, current);
    const hasOrgScope = Boolean(
      (contact.organizationId && String(contact.organizationId).trim())
      || (organizationTmpId && String(organizationTmpId).trim()),
    );
    if (clientId && hasOrgScope && recipientOptions.length <= 1 && apiBase) {
      const fetched = await fetchClientContactRecipientOptions(
        apiBase,
        clientId,
        organizationDisplayName || clientName,
        {
          organizationId: contact.organizationId ? String(contact.organizationId) : null,
          organizationTmpId: organizationTmpId || null,
        },
      );
      recipientOptions = mergeMessageRecipientOptions(fetched, current);
      if (fetched.length) setOrgRecipientOptions(fetched);
    }
    if (!recipientOptions.length) {
      recipientOptions = [current];
    }
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
      recipientOptions,
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
            scopeContactEmails={contactEmailList}
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
      case 'communication':
        if (communicationTab === 'sms') {
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
        }
        if (communicationTab === 'whatsapp') {
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
        }
        return (
          <ContactEmailsTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            contactEmail={displayEmail || contact.email}
            contactEmails={contactEmailList}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
            organizationTmpId={organizationTmpId}
            organizationName={organizationDisplayName || null}
            title="מיילים אישיים"
          />
        );
      case 'proposals':
        return clientId && contactId ? (
          <ContactProposalsTab
            clientId={clientId}
            contactId={contactId}
            contactName={contact.name}
            clientName={clientName}
          />
        ) : null;
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
          {mainTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'communication') {
                  setCommunicationTab('personal_emails');
                }
              }}
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
        {activeTab === 'communication' && (
          <nav className="flex items-center gap-2 px-2 py-2 border-t border-border-subtle bg-bg-subtle/40 overflow-x-auto">
            {communicationTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCommunicationTab(tab.id)}
                className={`flex items-center gap-2 py-2 px-4 text-sm font-semibold rounded-lg transition-colors shrink-0 ${
                  communicationTab === tab.id
                    ? 'bg-white text-primary-600 shadow-sm border border-border-default'
                    : 'text-text-muted hover:text-text-default hover:bg-white/60'
                }`}
              >
                {React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, {
                  className: 'w-4 h-4',
                })}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      <main>{renderContent()}</main>
    </div>
  );
};

export default ContactProfileView;
