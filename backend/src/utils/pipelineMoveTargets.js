const {
  normalizeSlaUnit,
  dueDateTimeAfterSla,
  readStageSla,
  readOutcomeSla,
  pickSla,
} = require('./slaDuration');

const OUTCOME_TARGET_PREFIX = 'outcome:';

function encodeOutcomeTarget(outcomeId) {
  return `${OUTCOME_TARGET_PREFIX}${outcomeId}`;
}

function isOutcomeTarget(value) {
  return typeof value === 'string' && value.startsWith(OUTCOME_TARGET_PREFIX);
}

function decodeOutcomeTarget(value) {
  return value.slice(OUTCOME_TARGET_PREFIX.length);
}

function resolveMoveTarget(targetStageId, stages = []) {
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

function resolveOutcomeSla(outcome, stages = []) {
  if (outcome.actionType === 'move' && outcome.targetStageId) {
    const resolved = resolveMoveTarget(outcome.targetStageId, stages);
    const target = resolved
      ? stages.find((s) => s.id === resolved.stageId)
      : stages.find((s) => s.id === outcome.targetStageId);
    const fromStage = readStageSla(target);
    const fromOutcome = readOutcomeSla(outcome);
    if (resolved?.outcomeId && target) {
      const targetOutcome = (target.outcomes || []).find((o) => o.id === resolved.outcomeId);
      const fromTargetOutcome = readOutcomeSla(targetOutcome);
      return pickSla(fromTargetOutcome, fromStage, fromOutcome);
    }
    return pickSla(fromStage, fromOutcome);
  }
  if (outcome.actionType === 'stay') {
    return readOutcomeSla(outcome);
  }
  return { value: 0, unit: 'days' };
}

/** @deprecated Use resolveOutcomeSla + dueDateTimeAfterSla for hour/minute precision. */
function resolveOutcomeSlaDays(outcome, stages = []) {
  const sla = resolveOutcomeSla(outcome, stages);
  if (sla.value <= 0) return 0;
  if (sla.unit === 'days') return sla.value;
  if (sla.unit === 'hours') return Math.max(1, Math.ceil(sla.value / 24));
  return Math.max(1, Math.ceil(sla.value / (24 * 60)));
}

function applyOutcomeSlaDueDateTime(outcome, stages = []) {
  const sla = resolveOutcomeSla(outcome, stages);
  if (sla.value <= 0) return { dueDate: null, dueTime: null };
  return dueDateTimeAfterSla(sla.value, sla.unit);
}

function dueDateAfterDaysFromToday(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Math.max(0, days));
  return d.toISOString().slice(0, 10);
}

module.exports = {
  OUTCOME_TARGET_PREFIX,
  encodeOutcomeTarget,
  isOutcomeTarget,
  decodeOutcomeTarget,
  resolveMoveTarget,
  resolveOutcomeSla,
  resolveOutcomeSlaDays,
  applyOutcomeSlaDueDateTime,
  dueDateAfterDaysFromToday,
};
