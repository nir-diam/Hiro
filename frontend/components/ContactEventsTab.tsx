import React from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';

type Props = {
  clientId: string;
  clientName?: string;
  contactId?: string;
  contactName?: string;
};

const ContactEventsTab: React.FC<Props> = ({ clientId, clientName, contactId, contactName }) => {
  return (
    <ClientsEventsJournalTab
      clientOptions={[{ id: clientId, name: clientName || 'לקוח' }]}
      defaultClientId={clientId}
      scopeContactId={contactId}
      scopeContactName={contactName}
      hideFilters
      alwaysShowDetails
    />
  );
};

export default ContactEventsTab;
