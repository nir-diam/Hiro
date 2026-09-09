import type { OutcomeAutomation, PipelineDto } from '../services/pipelinesApi';
import type { MessageTemplateDto } from '../services/messageTemplatesApi';
import { automationActionLabel } from './automationApproval';

export type DescribeAutomationContext = {
  templates?: MessageTemplateDto[];
  pipelines?: PipelineDto[];
};

function recipientLabels(automation: OutcomeAutomation): string[] {
  const r = automation.recipients || {};
  const labels: string[] = [];
  if (r.candidate) labels.push('מועמד/ת');
  if (r.hiringManager) labels.push('מנהל/ת גיוס');
  if (r.coordinator) labels.push('רכז/ת משרה');
  const extra = String(r.extra || '').trim();
  if (extra) labels.push(extra);
  return labels;
}

function schedulePhrase(automation: OutcomeAutomation): string {
  const type = automation.scheduleType || 'immediate';
  if (type === 'immediate') return 'מייד';
  const value = Math.max(1, Number(automation.scheduleValue) || 1);
  if (type === 'minutes') return `לאחר ${value} דקות`;
  if (type === 'hours') return `לאחר ${value} שעות`;
  if (type === 'days') return `לאחר ${value} ימים`;
  return 'מייד';
}

function approvalPhrase(automation: OutcomeAutomation): string {
  if (
    automation.requireManualApproval
    && (automation.actionType === 'send_email' || automation.actionType === 'send_sms')
  ) {
    return ' · עם אישור ידני של המשתמש לפני ביצוע';
  }
  return '';
}

function templatePhrase(
  templateId: string | undefined,
  templates: MessageTemplateDto[],
  channel: 'email' | 'sms',
): string {
  if (!templateId) return channel === 'email' ? 'תבנית מייל (לא נבחרה)' : 'תבנית SMS (לא נבחרה)';
  const match = templates.find((t) => t.id === templateId);
  if (match?.name) return `תבנית "${match.name}"`;
  return `תבנית מס' ${templateId.slice(0, 8)}`;
}

function pipelineStagePhrase(
  pipelineId: string | undefined,
  stageId: string | undefined,
  pipelines: PipelineDto[],
): string {
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stage = pipeline?.stages?.find((s) => s.id === stageId);
  if (pipeline?.name && stage?.name) return `תהליך "${pipeline.name}" → שלב "${stage.name}"`;
  if (pipeline?.name) return `תהליך "${pipeline.name}"`;
  return 'תהליך יעד';
}

export function describeOutcomeAutomation(
  automation: OutcomeAutomation,
  ctx: DescribeAutomationContext = {},
): string {
  const templates = ctx.templates || [];
  const pipelines = ctx.pipelines || [];
  const schedule = schedulePhrase(automation);
  const approval = approvalPhrase(automation);
  const recipients = recipientLabels(automation);
  const toPhrase = recipients.length ? ` ל${recipients.join(', ')}` : '';

  switch (automation.actionType) {
    case 'send_email':
      return `יישלח מייל${toPhrase} עם ${templatePhrase(automation.templateId, templates, 'email')} · ${schedule}${approval}`;
    case 'send_sms':
      return `יישלח SMS${toPhrase} עם ${templatePhrase(automation.templateId, templates, 'sms')} · ${schedule}${approval}`;
    case 'start_pipeline':
      return `יועבר ${pipelineStagePhrase(automation.pipelineId, automation.stageId, pipelines)} · ${schedule}${approval}`;
    case 'open_additional_process':
      return `ייפתח תהליך נוסף: ${pipelineStagePhrase(automation.pipelineId, automation.stageId, pipelines)} · ${schedule}${approval}`;
    case 'close_event':
      return `האירוע ייסגר · ${schedule}${approval}`;
    case 'change_status':
      return automation.statusName
        ? `סטטוס הגיוס ישתנה ל-"${automation.statusName}" · ${schedule}${approval}`
        : `${automationActionLabel(automation.actionType)} · ${schedule}${approval}`;
    default:
      return `${automationActionLabel(automation.actionType)} · ${schedule}${approval}`;
  }
}

export function describeOutcomeAutomations(
  automations: OutcomeAutomation[] | undefined,
  ctx: DescribeAutomationContext = {},
): string[] {
  if (!Array.isArray(automations) || automations.length === 0) return [];
  return automations
    .filter((a) => a && typeof a === 'object')
    .map((a) => describeOutcomeAutomation(a as OutcomeAutomation, ctx));
}
