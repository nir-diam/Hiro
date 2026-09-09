import React from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';

type Props = {
  clientId: string;
  organizationId?: string;
  organizationTmpId?: string;
  organizationName: string;
  defaultActionPipelineId?: string | null;
  defaultProcessStageId?: string | null;
};

const OrganizationEventsTab: React.FC<Props> = ({
  clientId,
  organizationId,
  organizationTmpId,
  organizationName,
  defaultActionPipelineId = null,
  defaultProcessStageId = null,
}) => {
  const scopedName = String(organizationName || '').trim() || 'ארגון';

  return (
    <ClientsEventsJournalTab
      clientOptions={[
        {
          id: clientId,
          name: scopedName,
          ...(organizationId ? { organizationId: String(organizationId) } : {}),
        },
      ]}
      defaultClientId={clientId}
      defaultOrganizationId={organizationId || null}
      defaultOrganizationName={scopedName}
      scopeOrganizationId={organizationId || null}
      scopeOrganizationName={scopedName}
      preferredOrganizationLabel={scopedName}
      hideFilters
      alwaysShowDetails
      defaultActionPipelineId={defaultActionPipelineId}
      defaultProcessStageId={defaultProcessStageId}
      autoSelectFirstEvent={Boolean(defaultActionPipelineId)}
    />
  );
};

export default OrganizationEventsTab;
