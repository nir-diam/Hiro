export const OUTCOME_TARGET_PREFIX = 'outcome:';

export type PipelineStageWithOutcomes = {
  id: string;
  name: string;
  slaLimit?: number;
  outcomes?: Array<{
    id: string;
    name: string;
    autoFollowupDays?: number;
    actionType?: string;
  }>;
};

export type MoveTargetOption = {
  value: string;
  label: string;
  kind: 'stage' | 'outcome';
};

export type ResolvedMoveTarget = {
  stageId: string;
  stageName: string;
  outcomeId?: string;
  outcomeName?: string;
};

export function encodeOutcomeTarget(outcomeId: string): string {
  return `${OUTCOME_TARGET_PREFIX}${outcomeId}`;
}

export function isOutcomeTarget(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(OUTCOME_TARGET_PREFIX);
}

export function decodeOutcomeTarget(value: string): string {
  return value.slice(OUTCOME_TARGET_PREFIX.length);
}

/** All pipeline stages and all stage outcomes for "עבור לשלב..." target pickers. */
export function buildMoveTargetOptions(stages: PipelineStageWithOutcomes[] = []): MoveTargetOption[] {
  const options: MoveTargetOption[] = [];

  for (const stage of stages) {
    const stageName = String(stage.name || '').trim();
    if (stageName) {
      options.push({ value: stage.id, label: stageName, kind: 'stage' });
    }
  }

  for (const stage of stages) {
    const stageName = String(stage.name || '').trim();
    for (const outcome of stage.outcomes || []) {
      const outcomeName = String(outcome.name || '').trim();
      if (!outcomeName) continue;
      options.push({
        value: encodeOutcomeTarget(outcome.id),
        label: stageName ? `${outcomeName} (${stageName})` : outcomeName,
        kind: 'outcome',
      });
    }
  }

  return options;
}

export function resolveMoveTarget(
  targetStageId: string | undefined,
  stages: PipelineStageWithOutcomes[] = [],
): ResolvedMoveTarget | null {
  if (!targetStageId) return null;

  if (isOutcomeTarget(targetStageId)) {
    const outcomeId = decodeOutcomeTarget(targetStageId);
    for (const stage of stages) {
      const outcome = (stage.outcomes || []).find((o) => o.id === outcomeId);
      if (outcome) {
        return {
          stageId: stage.id,
          stageName: String(stage.name || '').trim(),
          outcomeId: outcome.id,
          outcomeName: String(outcome.name || '').trim(),
        };
      }
    }
    return null;
  }

  const stage = stages.find((s) => s.id === targetStageId);
  if (!stage) return null;
  return {
    stageId: stage.id,
    stageName: String(stage.name || '').trim(),
  };
}

/** Resolve a display label (stage name or outcome label) back to pipeline stage id. */
export function resolveStageIdFromMoveTargetLabel(
  label: string,
  stages: PipelineStageWithOutcomes[] = [],
): string | null {
  const trimmed = String(label || '').trim();
  if (!trimmed) return null;

  const directStage = stages.find(
    (s) => String(s.name || '').trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (directStage) return directStage.id;

  const options = buildMoveTargetOptions(stages);
  const match = options.find((o) => o.label.toLowerCase() === trimmed.toLowerCase());
  if (!match) return null;

  const resolved = resolveMoveTarget(match.value, stages);
  return resolved?.stageId || null;
}
