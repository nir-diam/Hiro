import type { AuditLogEntry } from '../services/auditLogsApi';
import { hebrewFieldChangeLine } from './eventHistoryText';

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending_review: 'ממתין לבדיקה',
  approved: 'אושר',
  overridden: 'שונה',
  manual_queue: 'תור ידני',
  manual: 'ידני',
  changed: 'שונה',
};

const REVIEWER_ACTION_LABELS: Record<string, string> = {
  merge: 'מיזוג',
  create: 'יצירה',
  delete: 'מחיקה',
  blacklist: 'רשימה שחורה',
  manual: 'ידני',
  undo_manual: 'ביטול ידני',
  undo_blacklist: 'ביטול רשימה שחורה',
  auto_merge: 'מיזוג אוטומטי',
  auto_map_generic: 'שיוך אוטומטי לסל',
  approved: 'אישור',
  changed: 'שינוי',
};

const NOTE_FIELD_LABELS: Record<string, string> = {
  comments: 'הערה',
  agentNotes: 'הערות סוכן',
  agentVerdict: 'פסק דין סוכן',
  userVerdict: 'פסק דין משתמש',
};

const APPROVAL_LABELS: Record<string, string> = {
  pending: 'ממתין',
  approved: 'אושר',
  agent_approved: 'אושר על ידי סוכן',
};

function label(map: Record<string, string>, value: unknown): string {
  const key = String(value ?? '').trim();
  if (!key) return '—';
  return map[key] || key;
}

function describeNoteChange(field: string, oldVal: unknown, newVal: unknown): string | null {
  const fieldLabel = NOTE_FIELD_LABELS[field] || field;
  const oldS = String(oldVal ?? '').trim();
  const newS = String(newVal ?? '').trim();
  if (!oldS && newS) return `נכתבה ${fieldLabel}`;
  if (oldS && !newS) return `נמחקה ${fieldLabel}`;
  if (oldS !== newS) return `עודכנה ${fieldLabel}`;
  return null;
}

export function formatAgentDecisionHistoryActionType(entry: AuditLogEntry): string {
  if (entry.action === 'create') return 'יצירה';
  if (entry.action === 'delete') return 'מחיקה';
  return 'עדכון';
}

export function formatAgentDecisionHistoryDescription(entry: AuditLogEntry): string {
  if (entry.description?.trim()) {
    return entry.description.trim();
  }

  const changes = entry.changes || [];
  const lines: string[] = [];

  for (const change of changes) {
    const field = String(change.field || '');
    const oldVal = change.oldValue;
    const newVal = change.newValue;

    const noteLine = describeNoteChange(field, oldVal, newVal);
    if (noteLine) {
      lines.push(noteLine);
      continue;
    }

    if (field === 'reviewStatus') {
      lines.push(
        hebrewFieldChangeLine(
          'סטטוס בדיקה',
          label(REVIEW_STATUS_LABELS, oldVal),
          label(REVIEW_STATUS_LABELS, newVal),
        ),
      );
      continue;
    }

    if (field === 'reviewerAction') {
      lines.push(`בוצעה החלטה: **${label(REVIEWER_ACTION_LABELS, newVal || oldVal)}**`);
      continue;
    }

    if (field === 'manualApprovalStatus') {
      lines.push(
        hebrewFieldChangeLine(
          'סטטוס אישור',
          label(APPROVAL_LABELS, oldVal),
          label(APPROVAL_LABELS, newVal),
        ),
      );
      continue;
    }

    if (field === 'aiDecision') {
      lines.push(
        hebrewFieldChangeLine('החלטת מודל', String(oldVal ?? ''), String(newVal ?? '')),
      );
    }
  }

  if (lines.length) return lines.join(' · ');
  return 'עודכנה החלטת סוכן';
}
