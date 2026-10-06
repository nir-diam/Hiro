import React, { useMemo } from 'react';
import ClientsEventsJournalTab from './ClientsEventsJournalTab';
import type { MessageModalConfig } from '../hooks/useUIState';

type Props = {
  clientId: string;
  organizationId?: string;
  organizationTmpId?: string;
  organizationName: string;
  defaultActionPipelineId?: string | null;
  defaultProcessStageId?: string | null;
  openMessageModal?: (config: MessageModalConfig) => void;
};

const OrganizationEventsTab: React.FC<Props> = ({
  clientId,
  organizationId,
  organizationTmpId,
  organizationName,
  defaultActionPipelineId = null,
  defaultProcessStageId = null,
  openMessageModal,
}) => {
  const scopedName = String(organizationName || '').trim() || 'ארגון';

  const clientOptions = useMemo(
    () => [
      {
        id: clientId,
        name: scopedName,
        ...(organizationId ? { organizationId: String(organizationId) } : {}),
        ...(!organizationId && organizationTmpId
          ? { organizationTmpId: String(organizationTmpId) }
          : {}),
      },
    ],
    [clientId, scopedName, organizationId, organizationTmpId],
  );

  return (
    <ClientsEventsJournalTab
      clientOptions={clientOptions}
      defaultClientId={clientId}
      defaultOrganizationId={organizationId || null}
      defaultOrganizationTmpId={organizationTmpId || null}
      defaultOrganizationName={scopedName}
      scopeOrganizationId={organizationId || null}
      scopeOrganizationTmpId={organizationTmpId || null}
      scopeOrganizationName={scopedName}
      preferredOrganizationLabel={scopedName}
      alwaysShowDetails
      defaultActionPipelineId={defaultActionPipelineId}
      defaultProcessStageId={defaultProcessStageId}
      autoSelectFirstEvent={Boolean(defaultActionPipelineId)}
      openMessageModal={openMessageModal}
    />
  );
};

export default OrganizationEventsTab;
