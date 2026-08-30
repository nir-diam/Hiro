import type { AutomationResultRow } from './processOutcomeSla';

export type PendingAutomationRow = AutomationResultRow & {
  automationId: string;
  actionType?: string | null;
  templateId?: string | null;
  templateName?: string | null;
  statusName?: string | null;
  recipientLabels?: string[] | null;
};

export function automationActionLabel(actionType?: string | null): string {
  switch (actionType) {
    case 'send_email':
      return 'שליחת מייל מתוך תבנית';
    case 'send_sms':
      return 'שליחת SMS מתוך תבנית';
    case 'start_pipeline':
      return 'העבר לתהליך אחר';
    case 'open_additional_process':
      return 'פתח תהליך נוסף';
    case 'close_event':
      return 'סגירת אירוע';
    case 'change_status':
      return 'שנה סטטוס';
    default:
      return 'אוטומציה';
  }
}

export function pendingAutomationRows(results: AutomationResultRow[] | undefined): PendingAutomationRow[] {
  return (results || []).filter(
    (r): r is PendingAutomationRow =>
      r.status === 'pending_approval' && typeof (r as PendingAutomationRow).automationId === 'string',
  );
}

export function automationErrors(results: AutomationResultRow[] | undefined): AutomationResultRow[] {
  return (results || []).filter((r) => r.status === 'error');
}
