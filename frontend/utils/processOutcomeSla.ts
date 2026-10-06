import { resolveMoveTarget, type PipelineStageWithOutcomes } from './pipelineMoveTargets';
import {
  dueDateTimeAfterSla,
  formatSlaDuration,
  normalizeSlaUnit,
  type SlaUnit,
} from './slaDuration';

type OutcomeLike = {
  actionType: 'stay' | 'move' | 'freeze' | 'close';
  autoFollowupDays?: number;
  autoFollowupUnit?: SlaUnit | string | null;
  targetStageId?: string;
};

type StageLike = PipelineStageWithOutcomes;

export type SlaSpec = { value: number; unit: SlaUnit };

function readStageSla(stage?: StageLike | null): SlaSpec {
  return {
    value: Math.max(0, Number(stage?.slaLimit) || 0),
    unit: normalizeSlaUnit(stage?.slaLimitUnit),
  };
}

function readOutcomeSla(outcome?: OutcomeLike | null): SlaSpec {
  return {
    value: Math.max(0, Number(outcome?.autoFollowupDays) || 0),
    unit: normalizeSlaUnit(outcome?.autoFollowupUnit),
  };
}

function pickSla(...sources: SlaSpec[]): SlaSpec {
  for (const src of sources) {
    if (src.value > 0) return src;
  }
  return { value: 0, unit: 'days' };
}

/** @deprecated Use resolveOutcomeSla for hour/minute precision. */
export function dueDateAfterDaysFromToday(days: number): string {
  return dueDateTimeAfterSla(days, 'days').dueDate;
}

export function resolveOutcomeSla(outcome: OutcomeLike, stages: StageLike[] = []): SlaSpec {
  if (outcome.actionType === 'move' && outcome.targetStageId) {
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    const target = resolved
      ? stages.find((s) => s.id === resolved.stageId)
      : stages.find((s) => s.id === outcome.targetStageId);
    const fromStage = readStageSla(target);
    const fromOutcome = readOutcomeSla(outcome);
    if (resolved?.outcomeId && target) {
      const targetOutcome = (target.outcomes || []).find((o) => o.id === resolved.outcomeId);
      const fromTargetOutcome = readOutcomeSla(targetOutcome as OutcomeLike | undefined);
      return pickSla(fromTargetOutcome, fromStage, fromOutcome);
    }
    return pickSla(fromStage, fromOutcome);
  }
  if (outcome.actionType === 'stay') {
    return readOutcomeSla(outcome);
  }
  return { value: 0, unit: 'days' };
}

/** @deprecated Use resolveOutcomeSla for hour/minute precision. */
export function resolveOutcomeSlaDays(outcome: OutcomeLike, stages: StageLike[] = []): number {
  const sla = resolveOutcomeSla(outcome, stages);
  return sla.value > 0 && sla.unit === 'days' ? sla.value : 0;
}

export function applyOutcomeDueDate(
  outcome: OutcomeLike,
  stages: StageLike[],
  currentDueDate: string | null,
  currentDueTime: string | null = null,
): { dueDate: string | null; dueTime: string | null; resetStatusToFuture: boolean } {
  const sla = resolveOutcomeSla(outcome, stages);
  if (sla.value <= 0) {
    return { dueDate: currentDueDate, dueTime: currentDueTime, resetStatusToFuture: false };
  }
  const { dueDate, dueTime } = dueDateTimeAfterSla(sla.value, sla.unit);
  return {
    dueDate: dueDate || null,
    dueTime,
    resetStatusToFuture: true,
  };
}

export function outcomeActionSubtitle(
  outcome: OutcomeLike & { automations?: unknown[]; trigger?: { type?: string } },
  stages: StageLike[] = [],
): string {
  let base: string;
  if (outcome.actionType === 'move') {
    const sla = resolveOutcomeSla(outcome, stages);
    base =
      sla.value > 0 ? `מעבר לשלב · SLA ${formatSlaDuration(sla.value, sla.unit)}` : 'מעבר לשלב';
  } else if (outcome.actionType === 'freeze') {
    base = 'הקפאה';
  } else if (outcome.actionType === 'close') {
    base = 'סגירת תהליך';
  } else {
    const sla = readOutcomeSla(outcome);
    base =
      sla.value > 0
        ? `השאר בשלב · פולואפ ${formatSlaDuration(sla.value, sla.unit)}`
        : 'השאר בשלב';
  }
  const autoCount = Array.isArray(outcome.automations) ? outcome.automations.length : 0;
  const hasTrigger = outcome.trigger?.type === 'system_event';
  const extras: string[] = [];
  if (autoCount > 0) extras.push(`${autoCount} אוטומציות`);
  if (hasTrigger) extras.push('טריגר מערכת');
  return extras.length ? `${base} · ${extras.join(' · ')}` : base;
}

export type AutomationResultRow = {
  status: string;
  message?: string;
  channel?: string;
  reason?: string;
};

export function summarizeAutomationResults(results: AutomationResultRow[] | undefined): string | null {
  if (!results?.length) return null;
  const applied = results.filter((r) => r.status === 'sent' || r.status === 'applied').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const pending = results.filter((r) => r.status === 'pending_approval').length;
  const openedAdditional = results.filter(
    (r) =>
      r.status === 'applied' &&
      String((r as { action?: string }).action || '') === 'open_additional_process',
  ).length;
  const parts: string[] = [];
  if (applied) parts.push(`${applied} אוטומציות בוצעו`);
  if (openedAdditional) {
    parts.push(
      openedAdditional === 1
        ? 'נפתח תהליך נוסף (מופיע ביומן האירועים)'
        : `נפתחו ${openedAdditional} תהליכים נוספים`,
    );
  }
  if (pending) parts.push(`${pending} ממתינות לאישור`);
  if (skipped) parts.push(`${skipped} דולגו`);
  if (errors) parts.push(`${errors} שגיאות`);
  return parts.length ? parts.join(' · ') : null;
}
