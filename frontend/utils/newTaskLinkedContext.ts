/** Explicit linked-entity context for NewTaskModal (e.g. selected journal event). */
export type NewTaskLinkedOverride = {
  linkedCandidateBackendId?: string;
  linkedCandidateLabel?: string;
  linkedJobId?: string;
  linkedJobLabel?: string;
  linkedClientId?: string;
  linkedClientLabel?: string;
  linkedContactId?: string;
  linkedContactLabel?: string;
  linkedOrganizationId?: string;
  linkedOrganizationLabel?: string;
  /** Pipeline stage chip (e.g. אבוד). */
  stageLabel?: string;
  /** Selected journal event title — optional hint for assignees. */
  eventTitle?: string;
};

export function hasNewTaskLinkedOverrideContent(
  override: NewTaskLinkedOverride | null | undefined,
): boolean {
  if (!override) return false;
  return Boolean(
    override.linkedOrganizationLabel
    || override.linkedCandidateLabel
    || override.linkedContactLabel
    || override.linkedJobLabel
    || override.linkedClientLabel
    || override.stageLabel,
  );
}
