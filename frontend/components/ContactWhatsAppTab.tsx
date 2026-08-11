import React from 'react';
import { WhatsappIcon } from './Icons';
import { MessageModalConfig } from '../hooks/useUIState';
import ContactChannelHistoryTab from './ContactChannelHistoryTab';

interface ContactWhatsAppTabProps {
  openMessageModal: (config: MessageModalConfig) => void;
  contactName: string;
  contactPhone?: string;
  clientId?: string | null;
  contactId?: string | null;
  organizationId?: string | null;
}

const ContactWhatsAppTab: React.FC<ContactWhatsAppTabProps> = ({
  openMessageModal,
  contactName,
  contactPhone,
  clientId,
  contactId,
  organizationId,
}) => (
  <ContactChannelHistoryTab
    channel="whatsapp"
    title="היסטוריית הודעות WhatsApp"
    icon={<WhatsappIcon className="w-5 h-5 text-primary-500" />}
    sendLabel="שליחת WhatsApp"
    openMessageModal={openMessageModal}
    contactName={contactName}
    contactPhone={contactPhone}
    clientId={clientId}
    contactId={contactId}
    organizationId={organizationId}
  />
);

export default ContactWhatsAppTab;
