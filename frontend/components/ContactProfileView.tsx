import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
} from './Icons';
import ContactDetailsTab from './ContactDetailsTab';
import ContactEventsTab from './ContactEventsTab';
import ContactFinanceTab from './ContactFinanceTab';
import ContactEmailsTab from './ContactEmailsTab';
import ContactSMSTab from './ContactSMSTab';
import ContactWhatsAppTab from './ContactWhatsAppTab';
import { MessageModalConfig } from '../hooks/useUIState';
import { authHeaders } from '../utils/authHeaders';

type Tab = 'details' | 'events' | 'jobs' | 'finance' | 'emails' | 'sms' | 'whatsapp' | 'company_emails';

const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
  { id: 'details', label: 'פרטים אישיים', icon: <PencilIcon className="w-5 h-5" /> },
  { id: 'events', label: 'אירועים', icon: <CalendarDaysIcon className="w-5 h-5" /> },
  { id: 'finance', label: 'כספים', icon: <BanknotesIcon className="w-5 h-5" /> },
  { id: 'emails', label: 'מיילים', icon: <EnvelopeIcon className="w-5 h-5" /> },
  { id: 'company_emails', label: 'מיילי חברה', icon: <EnvelopeIcon className="w-5 h-5" /> },
  { id: 'sms', label: 'SMS', icon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <WhatsappIcon className="w-5 h-5" /> },
  { id: 'jobs', label: 'משרות משויכות', icon: <BriefcaseIcon className="w-5 h-5" /> },
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
  const [activeTab, setActiveTab] = useState<Tab>('details');

  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [contact, setContact] = useState<any | null>(null);
  const [clientName, setClientName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const [formData, setFormData] = useState<any>(null);

  useEffect(() => {
    setFormData(contact);
  }, [contact]);

  if (isLoading) return <div className="text-center p-8">טוען...</div>;
  if (error || !contact) return <div className="text-center p-8">{error || 'איש קשר לא נמצא.'}</div>;

  const handleFormChange = (updatedData: any) => {
    setFormData(updatedData);
  };

  const handleActionClick = (mode: 'email' | 'sms' | 'whatsapp') => {
    openMessageModal({
      mode,
      candidateName: contact.name,
      candidatePhone: contact.mobilePhone || contact.phone,
      candidateEmail: contact.email || contact.mainContactEmail || undefined,
      linkedClientId: clientId || null,
      linkedContactId: contactId || null,
      linkedOrganizationId: contact.organizationId ? String(contact.organizationId) : null,
      recipientOptions: [
        {
          id: String(contactId || contact.id),
          name: contact.name,
          email: contact.email || contact.mainContactEmail || '',
          phone: contact.mobilePhone || contact.phone || '',
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
          <ContactDetailsTab formData={formData} onFormChange={handleFormChange} />
        ) : null;
      case 'events':
        return (
          <ContactEventsTab
            clientId={clientId!}
            clientName={clientName}
            contactId={contactId}
            contactName={contact.name}
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
        return (
          <ContactEmailsTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            contactEmail={contact.email}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
          />
        );
      case 'company_emails':
        return (
          <ContactEmailsTab
            openMessageModal={openMessageModal}
            contactName={contact.name}
            contactPhone={contact.mobilePhone || contact.phone}
            contactEmail={contact.email}
            clientId={clientId}
            contactId={contactId}
            organizationId={contact.organizationId ? String(contact.organizationId) : null}
            companyWide
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
        return <div className="text-center p-8 text-text-muted">אין משרות משויכות.</div>;
      default:
        return null;
    }
  };

  const domainHint =
    typeof contact.email === 'string' && contact.email.includes('@')
      ? contact.email.split('@')[1]
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
            <SocialButton href={`tel:${contact.mobilePhone || contact.phone}`} title="Phone">
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
