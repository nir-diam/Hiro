import { resolveMoveTarget, type PipelineStageWithOutcomes } from './pipelineMoveTargets';

type OutcomeLike = {
  actionType: 'stay' | 'move' | 'freeze' | 'close';
  autoFollowupDays?: number;
  targetStageId?: string;
};

type StageLike = PipelineStageWithOutcomes;

/** Due date = today + N days (SLA clock starts on stage entry / outcome). */
export function dueDateAfterDaysFromToday(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

export function resolveOutcomeSlaDays(outcome: OutcomeLike, stages: StageLike[] = []): number {
  if (outcome.actionType === 'move' && outcome.targetStageId) {
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    const target = resolved
      ? stages.find((s) => s.id === resolved.stageId)
      : stages.find((s) => s.id === outcome.targetStageId);
    const fromStage = Math.max(0, Number(target?.slaLimit) || 0);
    const fromOutcome = Math.max(0, Number(outcome.autoFollowupDays) || 0);
    if (resolved?.outcomeId && target) {
      const targetOutcome = (target.outcomes || []).find((o) => o.id === resolved.outcomeId);
      const fromTargetOutcome = Math.max(0, Number(targetOutcome?.autoFollowupDays) || 0);
      return fromTargetOutcome || fromStage || fromOutcome;
    }
    return fromStage || fromOutcome;
  }
  if (outcome.actionType === 'stay') {
    return Math.max(0, Number(outcome.autoFollowupDays) || 0);
  }
  return 0;
}

export function applyOutcomeDueDate(
  outcome: OutcomeLike,
  stages: StageLike[],
  currentDueDate: string | null,
): { dueDate: string | null; resetStatusToFuture: boolean } {
  const days = resolveOutcomeSlaDays(outcome, stages);
  if (days <= 0) {
    return { dueDate: currentDueDate, resetStatusToFuture: false };
  }
  return {
    dueDate: dueDateAfterDaysFromToday(days),
    resetStatusToFuture: true,
  };
}

export function outcomeActionSubtitle(
  outcome: OutcomeLike & { automations?: unknown[]; trigger?: { type?: string } },
  stages: StageLike[] = [],
): string {
  let base: string;
  if (outcome.actionType === 'move') {
    const days = resolveOutcomeSlaDays(outcome, stages);
    base = days > 0 ? `מעבר לשלב · SLA ${days} ימים` : 'מעבר לשלב';
  } else if (outcome.actionType === 'freeze') {
    base = 'הקפאה';
  } else if (outcome.actionType === 'close') {
    base = 'סגירת תהליך';
  } else {
    const days = Number(outcome.autoFollowupDays) || 0;
    base = days > 0 ? `השאר בשלב · פולואפ ${days} ימים` : 'השאר בשלב';
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
  const sent = results.filter((r) => r.status === 'sent' || r.status === 'applied').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const errors = results.filter((r) => r.status === 'error').length;
  const pending = results.filter((r) => r.status === 'pending_approval').length;
  const parts: string[] = [];
  if (sent) parts.push(`${sent} אוטומציות בוצעו`);
  if (pending) parts.push(`${pending} ממתינות לאישור`);
  if (skipped) parts.push(`${skipped} דולגו`);
  if (errors) parts.push(`${errors} שגיאות`);
  return parts.length ? parts.join(' · ') : null;
}
