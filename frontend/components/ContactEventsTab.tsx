import React from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';

type Props = {
  clientId: string;
  clientName?: string;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string;
  contactName?: string;
  contactProcessPipelineId?: string | null;
  contactProcessStageId?: string | null;
  defaultActionPipelineId?: string | null;
  defaultProcessStageId?: string | null;
};

const ContactEventsTab: React.FC<Props> = ({
  clientId,
  clientName,
  organizationId = null,
  organizationName = null,
  contactId,
  contactName,
  contactProcessPipelineId = null,
  contactProcessStageId = null,
  defaultActionPipelineId = null,
  defaultProcessStageId = null,
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
      contactProcessPipelineId={contactProcessPipelineId}
      contactProcessStageId={contactProcessStageId}
      defaultActionPipelineId={defaultActionPipelineId}
      defaultProcessStageId={defaultProcessStageId}
      autoSelectFirstEvent={Boolean(defaultActionPipelineId)}
    />
  );
};

export default ContactEventsTab;
