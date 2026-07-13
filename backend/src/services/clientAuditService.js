const auditLogger = require('../utils/auditLogger');

const META_PREFIX = 'metadata.';

function plainClient(row) {
  if (!row) return null;
  return row.get ? row.get({ plain: true }) : { ...row };
}

function normalizeAliases(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v || '').trim()).filter(Boolean).sort();
}

function diffAliases(oldAliases, newAliases) {
  const oldList = normalizeAliases(oldAliases);
  const newList = normalizeAliases(newAliases);
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  const changes = [];
  for (const alias of newList) {
    if (!oldSet.has(alias)) {
      changes.push({ field: 'metadata.aliases.added', oldValue: '', newValue: alias });
    }
  }
  for (const alias of oldList) {
    if (!newSet.has(alias)) {
      changes.push({ field: 'metadata.aliases.removed', oldValue: alias, newValue: '' });
    }
  }
  return changes;
}

function pushChange(changes, field, oldValue, newValue) {
  const oldS = oldValue == null ? '' : String(oldValue);
  const newS = newValue == null ? '' : String(newValue);
  if (oldS === newS) return;
  changes.push({ field, oldValue: oldS, newValue: newS });
}

function buildClientChangeSet(before, after) {
  const changes = [];
  const beforeMeta = before.metadata && typeof before.metadata === 'object' ? before.metadata : {};
  const afterMeta = after.metadata && typeof after.metadata === 'object' ? after.metadata : {};

  pushChange(changes, 'status', before.status, after.status);
  pushChange(changes, 'displayName', before.displayName || before.name, after.displayName || after.name);
  pushChange(changes, 'name', before.name, after.name);
  pushChange(changes, 'mainContactName', before.mainContactName, after.mainContactName);
  pushChange(changes, 'accountManager', before.accountManager, after.accountManager);
  pushChange(changes, 'phone', before.phone, after.phone);
  pushChange(changes, 'email', before.email, after.email);
  pushChange(changes, 'industry', before.industry, after.industry);
  pushChange(
    changes,
    `${META_PREFIX}pipelineStage`,
    beforeMeta.pipelineStage,
    afterMeta.pipelineStage,
  );
  pushChange(changes, `${META_PREFIX}website`, beforeMeta.website, afterMeta.website);
  pushChange(changes, `${META_PREFIX}address`, beforeMeta.address, afterMeta.address);
  pushChange(changes, `${META_PREFIX}description`, beforeMeta.description, afterMeta.description);
  pushChange(changes, `${META_PREFIX}notes`, beforeMeta.notes, afterMeta.notes);

  changes.push(...diffAliases(beforeMeta.aliases, afterMeta.aliases));
  return changes;
}

function buildDescriptionFromChanges(changes) {
  const stageLabels = {
    lead: 'ליד חדש',
    meeting: 'פגישה',
    proposal: 'הצעת מחיר',
    negotiation: 'משא ומתן',
    won: 'סגירה (זכייה)',
    onboarding: 'קליטה (Onboarding)',
    active: 'לקוח פעיל',
    risk: 'בסיכון (At Risk)',
    renewal: 'חידוש חוזה',
  };

  const lines = [];
  for (const change of changes) {
    const { field, oldValue, newValue } = change;
    if (field === 'status') {
      lines.push(`סטטוס הלקוח שונה מ-"${oldValue || '—'}" ל-"${newValue || '—'}"`);
      continue;
    }
    if (field === `${META_PREFIX}pipelineStage`) {
      const oldLabel = stageLabels[oldValue] || oldValue || '—';
      const newLabel = stageLabels[newValue] || newValue || '—';
      lines.push(`שלב המכירה עודכן מ-"${oldLabel}" ל-"${newLabel}"`);
      continue;
    }
    if (field === 'metadata.aliases.added') {
      lines.push(`נוסף אליאס חדש: "${newValue}"`);
      continue;
    }
    if (field === 'metadata.aliases.removed') {
      lines.push(`הוסר האליאס: "${oldValue}"`);
      continue;
    }
    if (field === 'mainContactName') {
      lines.push(`עודכן איש קשר ראשי ל-"${newValue}"`);
      continue;
    }
    if (field === 'accountManager') {
      lines.push(`עודכן מנהל לקוח ל-"${newValue}"`);
      continue;
    }
    if (field === `${META_PREFIX}website`) {
      lines.push(`כתובת אתר האינטרנט עודכנה מ-"${oldValue || '—'}" ל-"${newValue || '—'}"`);
      continue;
    }
    if (field === `${META_PREFIX}address`) {
      lines.push(`כתובת החברה עודכנה מ-"${oldValue || '—'}" ל-"${newValue || '—'}"`);
      continue;
    }
    if (field === `${META_PREFIX}description`) {
      lines.push('תיאור החברה עודכן');
      continue;
    }
    if (field === 'phone' || field === 'email' || field === 'industry') {
      const labels = { phone: 'טלפון', email: 'אימייל', industry: 'תחום' };
      lines.push(`${labels[field] || field} עודכן מ-"${oldValue || '—'}" ל-"${newValue || '—'}"`);
      continue;
    }
    if (field === 'displayName' || field === 'name') {
      lines.push(`שם הלקוח שונה מ-"${oldValue || '—'}" ל-"${newValue || '—'}"`);
    }
  }
  return lines.join(' · ') || 'בוצע עדכון לפרטי הלקוח';
}

const recordClientChanges = async (req, beforeRow, afterRow) => {
  const before = plainClient(beforeRow);
  const after = plainClient(afterRow);
  if (!before || !after) return;

  const changes = buildClientChangeSet(before, after);
  if (!changes.length) return;

  const clientName = after.displayName || after.name || before.displayName || before.name || 'לקוח';
  await auditLogger.logAwait(req, {
    level: 'info',
    action: 'update',
    description: buildDescriptionFromChanges(changes),
    entityType: 'Client',
    entityId: String(after.id),
    entityName: String(clientName).slice(0, 255),
    changes,
  });
};

const recordClientCreated = async (req, clientRow) => {
  const after = plainClient(clientRow);
  if (!after) return;
  const clientName = after.displayName || after.name || 'לקוח';
  await auditLogger.logAwait(req, {
    level: 'info',
    action: 'create',
    description: `לקוח חדש נוצר במערכת: "${clientName}"`,
    entityType: 'Client',
    entityId: String(after.id),
    entityName: String(clientName).slice(0, 255),
    changes: [],
  });
};

module.exports = {
  recordClientChanges,
  recordClientCreated,
  buildClientChangeSet,
  buildDescriptionFromChanges,
};
