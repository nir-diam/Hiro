import React from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';

type Props = {
  clientId: string;
  clientName?: string;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string;
  contactName?: string;
};

const ContactEventsTab: React.FC<Props> = ({
  clientId,
  clientName,
  organizationId = null,
  organizationName = null,
  contactId,
  contactName,
}) => {
  const scopedOrganizationName =
    (organizationName && String(organizationName).trim())
    || (clientName && String(clientName).trim())
    || 'לקוח';

  return (
    <ClientsEventsJournalTab
      clientOptions={[
        {
          id: clientId,
          name: scopedOrganizationName,
          ...(organizationId ? { organizationId: String(organizationId) } : {}),
        },
      ]}
      defaultClientId={clientId}
      defaultOrganizationId={organizationId}
      defaultOrganizationName={organizationName || scopedOrganizationName}
      scopeOrganizationId={organizationId}
      scopeOrganizationName={organizationName || scopedOrganizationName}
      preferredOrganizationLabel={organizationName || scopedOrganizationName}
      scopeContactId={contactId}
      scopeContactName={contactName}
      hideFilters
      alwaysShowDetails
    />
  );
};

export default ContactEventsTab;
