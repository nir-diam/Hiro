const auditLogger = require('../utils/auditLogger');

const AGENT_ACTOR = {
  userId: null,
  userName: 'סוכן AI (Hiro)',
  userEmail: null,
};

const TAG_ENTITY = 'TagAiDecision';
const ORG_ENTITY = 'OrganizationAiDecision';

const TRACKED_FIELDS = [
  'reviewStatus',
  'reviewerAction',
  'manualApprovalStatus',
  'aiDecision',
  'aiSuggestedTarget',
  'aiSuggestedTargetId',
  'resolvedTargetTagId',
  'comments',
  'agentNotes',
  'agentVerdict',
  'userVerdict',
  'resolvedAt',
];

const NOTE_FIELD_LABELS = {
  comments: 'הערה',
  agentNotes: 'הערות סוכן',
  agentVerdict: 'פסק דין סוכן',
  userVerdict: 'פסק דין משתמש',
};

const REVIEW_STATUS_LABELS = {
  pending_review: 'ממתין לבדיקה',
  approved: 'אושר',
  overridden: 'שונה',
  manual_queue: 'תור ידני',
  manual: 'ידני',
  changed: 'שונה',
};

const REVIEWER_ACTION_LABELS = {
  merge: 'מיזוג',
  create: 'יצירה',
  delete: 'מחיקה',
  blacklist: 'רשימה שחורה',
  manual: 'ידני',
  undo_manual: 'ביטול ידני',
  undo_blacklist: 'ביטול רשימה שחורה',
  auto_merge: 'מיזוג אוטומטי',
  approved: 'אישור',
  changed: 'שינוי',
};

const TAG_AI_DECISION_LABELS = {
  merge: 'מיזוג',
  create: 'יצירה',
  delete: 'מחיקה',
  manual: 'ידני',
};

const ORG_AI_DECISION_LABELS = {
  create_company: 'יצירת חברה',
  merge_company: 'מיזוג חברה',
  map_generic: 'שיוך לסל כללי',
  manual_review: 'בדיקה ידנית',
};

const APPROVAL_LABELS = {
  pending: 'ממתין',
  approved: 'אושר',
  agent_approved: 'אושר על ידי סוכן',
};

function plainRow(row) {
  if (!row) return null;
  return row.get ? row.get({ plain: true }) : { ...row };
}

function label(map, value) {
  const key = String(value ?? '').trim();
  if (!key) return '—';
  return map[key] || key;
}

function pushChange(changes, field, oldValue, newValue) {
  const oldS = oldValue == null ? '' : String(oldValue);
  const newS = newValue == null ? '' : String(newValue);
  if (oldS === newS) return;
  changes.push({ field, oldValue: oldS, newValue: newS });
}

function buildChangeSet(before, after) {
  const changes = [];
  if (!after) return changes;
  const b = before || {};
  for (const field of TRACKED_FIELDS) {
    pushChange(changes, field, b[field], after[field]);
  }
  return changes;
}

function describeNoteChange(field, oldValue, newValue) {
  const labelText = NOTE_FIELD_LABELS[field] || field;
  const oldS = String(oldValue ?? '').trim();
  const newS = String(newValue ?? '').trim();
  if (!oldS && newS) return `נכתבה ${labelText}`;
  if (oldS && !newS) return `נמחקה ${labelText}`;
  if (oldS !== newS) return `עודכנה ${labelText}`;
  return null;
}

function buildDescription(changes, before, after, { kind = 'tag' } = {}) {
  const aiLabels = kind === 'org' ? ORG_AI_DECISION_LABELS : TAG_AI_DECISION_LABELS;
  const lines = [];

  for (const change of changes) {
    const { field, oldValue, newValue } = change;

    if (NOTE_FIELD_LABELS[field]) {
      const noteLine = describeNoteChange(field, oldValue, newValue);
      if (noteLine) lines.push(noteLine);
      continue;
    }

    if (field === 'reviewStatus') {
      lines.push(
        `סטטוס בדיקה שונה מ-"${label(REVIEW_STATUS_LABELS, oldValue)}" ל-"${label(REVIEW_STATUS_LABELS, newValue)}"`,
      );
      continue;
    }

    if (field === 'reviewerAction') {
      lines.push(
        `בוצעה החלטה: **${label(REVIEWER_ACTION_LABELS, newValue || oldValue)}**`,
      );
      continue;
    }

    if (field === 'manualApprovalStatus') {
      lines.push(
        `סטטוס אישור שונה מ-"${label(APPROVAL_LABELS, oldValue)}" ל-"${label(APPROVAL_LABELS, newValue)}"`,
      );
      continue;
    }

    if (field === 'aiDecision') {
      lines.push(
        `החלטת מודל שונתה מ-"${label(aiLabels, oldValue)}" ל-"${label(aiLabels, newValue)}"`,
      );
      continue;
    }

    if (field === 'aiSuggestedTarget') {
      lines.push(`יעד מוצע עודכן ל-"${newValue || '—'}"`);
      continue;
    }

    if (field === 'resolvedAt' && newValue && !oldValue) {
      lines.push('ההחלטה נסגרה');
      continue;
    }
  }

  if (lines.length) return lines.join(' · ');

  const term = after?.originalTerm || before?.originalTerm || '';
  const aiDecision = after?.aiDecision || before?.aiDecision;
  if (aiDecision) {
    return `עודכנה החלטת סוכן עבור "${term}"`;
  }
  return term ? `עודכנה החלטה עבור "${term}"` : 'עודכנה החלטת סוכן';
}

function buildCreateDescription(row, kind = 'tag') {
  const plain = plainRow(row) || {};
  const term = String(plain.originalTerm || '').trim() || '—';
  const aiLabels = kind === 'org' ? ORG_AI_DECISION_LABELS : TAG_AI_DECISION_LABELS;
  const decisionLabel = label(aiLabels, plain.aiDecision);
  const statusLabel = label(REVIEW_STATUS_LABELS, plain.reviewStatus);
  return `הסוכן יצר החלטה חדשה: **${term}** — ${decisionLabel} (${statusLabel})`;
}

function resolveAuditActor(req, opts = {}) {
  if (opts.actor === 'agent' || req?.agent) return 'agent';
  if (opts.actor === 'user') return 'user';
  if (req?.user || req?.dbUser) return 'user';
  if (!req) return 'agent';
  return 'user';
}

function actorPayload(req, opts = {}) {
  const actor = resolveAuditActor(req, opts);
  if (actor === 'agent') return { ...AGENT_ACTOR };
  return {};
}

function buildResolveActionDescription(metadata = {}) {
  const resolveAction = metadata?.resolveAction;
  if (!resolveAction) return null;
  const label = REVIEWER_ACTION_LABELS[String(resolveAction)] || String(resolveAction);
  return `בוצעה פעולה: **${label}**`;
}

async function recordTagDecisionAudit(req, before, after, opts = {}) {
  const afterPlain = plainRow(after);
  if (!afterPlain?.id) return;
  const beforePlain = plainRow(before);
  const changes = buildChangeSet(beforePlain, afterPlain);
  const actor = resolveAuditActor(req, opts);
  const metadata = {
    source: actor === 'user' ? 'admin_ui' : 'agent_api',
    actor,
    decisionKind: 'tag',
    pendingTagId: afterPlain.pendingTagId || beforePlain?.pendingTagId || null,
    ...(opts.metadata || {}),
  };
  const resolveDescription = buildResolveActionDescription(metadata);
  if (!changes.length && !opts.force && !resolveDescription) return;

  await auditLogger.log(req, {
    level: 'info',
    action: opts.action || 'update',
    description:
      opts.description
      || resolveDescription
      || buildDescription(changes, beforePlain, afterPlain, { kind: 'tag' }),
    entityType: TAG_ENTITY,
    entityId: String(afterPlain.id),
    entityName: String(afterPlain.originalTerm || beforePlain?.originalTerm || '').slice(0, 255),
    metadata,
    changes,
    ...actorPayload(req, { ...opts, actor }),
  });
}

async function recordOrgDecisionAudit(req, before, after, opts = {}) {
  const afterPlain = plainRow(after);
  if (!afterPlain?.id) return;
  const beforePlain = plainRow(before);
  const changes = buildChangeSet(beforePlain, afterPlain);
  if (!changes.length && !opts.force) return;

  await auditLogger.log(req, {
    level: 'info',
    action: opts.action || 'update',
    description: opts.description || buildDescription(changes, beforePlain, afterPlain, { kind: 'org' }),
    entityType: ORG_ENTITY,
    entityId: String(afterPlain.id),
    entityName: String(afterPlain.originalTerm || beforePlain?.originalTerm || '').slice(0, 255),
    metadata: {
      source: 'agent_api',
      actor: opts.actor || 'agent',
      decisionKind: 'organization',
      candidateId: afterPlain.candidateId || beforePlain?.candidateId || null,
      ...(opts.metadata || {}),
    },
    changes,
    ...actorPayload(req, opts),
  });
}

async function recordTagDecisionCreated(req, row, opts = {}) {
  const plain = plainRow(row);
  if (!plain?.id) return;
  await auditLogger.log(req, {
    level: 'info',
    action: 'create',
    description: opts.description || buildCreateDescription(plain, 'tag'),
    entityType: TAG_ENTITY,
    entityId: String(plain.id),
    entityName: String(plain.originalTerm || '').slice(0, 255),
    metadata: {
      decisionKind: 'tag',
      pendingTagId: plain.pendingTagId || null,
      aiDecision: plain.aiDecision || null,
      reviewStatus: plain.reviewStatus || null,
      ...(opts.metadata || {}),
    },
    changes: [],
    ...actorPayload(req, { ...opts, actor: opts.actor || 'agent' }),
  });
}

async function recordOrgDecisionCreated(req, row, opts = {}) {
  const plain = plainRow(row);
  if (!plain?.id) return;
  await auditLogger.log(req, {
    level: 'info',
    action: 'create',
    description: opts.description || buildCreateDescription(plain, 'org'),
    entityType: ORG_ENTITY,
    entityId: String(plain.id),
    entityName: String(plain.originalTerm || '').slice(0, 255),
    metadata: {
      decisionKind: 'organization',
      candidateId: plain.candidateId || null,
      aiDecision: plain.aiDecision || null,
      reviewStatus: plain.reviewStatus || null,
      ...(opts.metadata || {}),
    },
    changes: [],
    ...actorPayload(req, { ...opts, actor: opts.actor || 'agent' }),
  });
}

module.exports = {
  recordTagDecisionAudit,
  recordOrgDecisionAudit,
  recordTagDecisionCreated,
  recordOrgDecisionCreated,
  buildChangeSet,
  buildDescription,
  buildCreateDescription,
};
