import React from 'react';
import { ChatBubbleBottomCenterTextIcon } from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import ContactChannelHistoryTab from './ContactChannelHistoryTab';

interface ContactSMSTabProps {
  openMessageModal: (config: MessageModalConfig) => void;
  contactName: string;
  contactPhone?: string;
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
}

const ContactSMSTab: React.FC<ContactSMSTabProps> = ({
  openMessageModal,
  contactName,
  contactPhone,
  clientId,
  contactId,
  organizationId,
}) => (
  <ContactChannelHistoryTab
    channel="sms"
    title="היסטוריית הודעות SMS"
    icon={<ChatBubbleBottomCenterTextIcon className="w-5 h-5 text-primary-500" />}
    sendLabel="שליחת SMS"
    openMessageModal={openMessageModal}
    contactName={contactName}
    contactPhone={contactPhone}
    clientId={clientId}
    contactId={contactId}
    organizationId={organizationId}
  />
);

export default ContactSMSTab;
