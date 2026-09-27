import React from 'react';
import { EnvelopeIcon } from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import ContactChannelHistoryTab from './ContactChannelHistoryTab';

interface ContactEmailsTabProps {
  openMessageModal: (config: MessageModalConfig) => void;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
  /** When true, show all company contact emails (not only this contact). */
  companyWide?: boolean;
  title?: string;
}

const ContactEmailsTab: React.FC<ContactEmailsTabProps> = ({
  openMessageModal,
  contactName,
  contactPhone,
  contactEmail,
  clientId,
  contactId,
  organizationId,
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
    clientId={clientId}
    contactId={contactId}
    organizationId={organizationId}
    companyWide={companyWide}
  />
);

export default ContactEmailsTab;
