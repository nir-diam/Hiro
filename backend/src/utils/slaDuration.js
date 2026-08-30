const SLA_UNITS = new Set(['days', 'hours', 'minutes']);

function normalizeSlaUnit(unit) {
  if (SLA_UNITS.has(unit)) return unit;
  return 'days';
}

function cycleSlaUnit(unit) {
  const u = normalizeSlaUnit(unit);
  if (u === 'days') return 'hours';
  if (u === 'hours') return 'minutes';
  return 'days';
}

function slaUnitLabel(unit) {
  const u = normalizeSlaUnit(unit);
  if (u === 'hours') return 'שעות';
  if (u === 'minutes') return 'דקות';
  return 'ימים';
}

function dueDateTimeAfterSla(value, unit, base = new Date()) {
  const v = Math.max(0, Number(value) || 0);
  if (v <= 0) return { dueDate: null, dueTime: null };

  const d = new Date(base);
  const u = normalizeSlaUnit(unit);

  if (u === 'days') {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + v);
    return { dueDate: d.toISOString().slice(0, 10), dueTime: null };
  }

  if (u === 'hours') {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + v);
  } else {
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + v);
  }

  const dueDate = d.toISOString().slice(0, 10);
  const dueTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { dueDate, dueTime };
}

function readStageSla(stage) {
  return {
    value: Math.max(0, Number(stage?.slaLimit) || 0),
    unit: normalizeSlaUnit(stage?.slaLimitUnit),
  };
}

function readOutcomeSla(outcome) {
  return {
    value: Math.max(0, Number(outcome?.autoFollowupDays) || 0),
    unit: normalizeSlaUnit(outcome?.autoFollowupUnit),
  };
}

function pickSla(...sources) {
  for (const src of sources) {
    if (src && src.value > 0) return src;
  }
  return { value: 0, unit: 'days' };
}

module.exports = {
  normalizeSlaUnit,
  cycleSlaUnit,
  slaUnitLabel,
  dueDateTimeAfterSla,
  readStageSla,
  readOutcomeSla,
  pickSla,
};
