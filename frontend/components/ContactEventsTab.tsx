import React, { useMemo } from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import type { MessageModalConfig } from '../hooks/useUIState';

type Props = {
  clientId: string;
  clientName?: string;
  organizationId?: string | null;
  organizationTmpId?: string | null;
  organizationName?: string | null;
  contactId?: string;
  contactName?: string;
  contactProcessPipelineId?: string | null;
  contactProcessStageId?: string | null;
  defaultActionPipelineId?: string | null;
  defaultProcessStageId?: string | null;
  openMessageModal?: (config: MessageModalConfig) => void;
};

const ContactEventsTab: React.FC<Props> = ({
  clientId,
  clientName,
  organizationId = null,
  organizationTmpId = null,
  organizationName = null,
  contactId,
  contactName,
  contactProcessPipelineId = null,
  contactProcessStageId = null,
  defaultActionPipelineId = null,
  defaultProcessStageId = null,
  openMessageModal,
}) => {
  const scopedOrganizationName =
    (organizationName && String(organizationName).trim())
    || (clientName && String(clientName).trim())
    || 'לקוח';

  const clientOptions = useMemo(
    () => [
      {
        id: clientId,
        name: scopedOrganizationName,
        ...(organizationId ? { organizationId: String(organizationId) } : {}),
        ...(!organizationId && organizationTmpId
          ? { organizationTmpId: String(organizationTmpId) }
          : {}),
      },
    ],
    [clientId, scopedOrganizationName, organizationId, organizationTmpId],
  );

  return (
    <ClientsEventsJournalTab
      clientOptions={clientOptions}
      defaultClientId={clientId}
      defaultOrganizationId={organizationId}
      defaultOrganizationTmpId={organizationTmpId}
      defaultOrganizationName={organizationName || scopedOrganizationName}
      scopeOrganizationId={organizationId}
      scopeOrganizationTmpId={organizationTmpId}
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
      openMessageModal={openMessageModal}
    />
  );
};

export default ContactEventsTab;
