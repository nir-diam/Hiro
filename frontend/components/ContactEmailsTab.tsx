import React from 'react';
import { EnvelopeIcon } from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import ContactChannelHistoryTab from './ContactChannelHistoryTab';

interface ContactEmailsTabProps {
  openMessageModal: (config: MessageModalConfig) => void;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  contactEmails?: string[];
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
  organizationTmpId?: string | null;
  organizationName?: string | null;
  /** When true, show all company contact emails (not only this contact). */
  companyWide?: boolean;
  title?: string;
}

const ContactEmailsTab: React.FC<ContactEmailsTabProps> = ({
  openMessageModal,
  contactName,
  contactPhone,
  contactEmail,
  contactEmails,
  clientId,
  contactId,
  organizationId,
  organizationTmpId,
  organizationName,
  companyWide = false,
  title,
}) => (
  <ContactChannelHistoryTab
    channel="email"
    title={title ?? (companyWide ? 'מיילים — כל אנשי הקשר בחברה' : 'היסטוריית מיילים')}
    icon={<EnvelopeIcon className="w-5 h-5 text-primary-500" />}
    sendLabel="שליחת מייל"
    openMessageModal={openMessageModal}
    contactName={contactName}
    contactPhone={contactPhone}
    contactEmail={contactEmail}
    contactEmails={contactEmails}
    clientId={clientId}
    contactId={contactId}
    organizationId={organizationId}
    organizationTmpId={organizationTmpId}
    organizationName={organizationName}
    companyWide={companyWide}
  />
);

export default ContactEmailsTab;
