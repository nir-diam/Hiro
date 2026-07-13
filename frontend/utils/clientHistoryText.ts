import type { AuditLogEntry } from '../services/auditLogsApi';
import { hebrewFieldChangeLine } from './eventHistoryText';

const PIPELINE_STAGE_LABELS: Record<string, string> = {
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

const CLIENT_STATUS_LABELS: Record<string, string> = {
    'פעיל': 'פעיל',
    'לא פעיל': 'לא פעיל',
    'בהקפאה': 'בהקפאה',
    'ליד חדש': 'ליד חדש',
    active: 'פעיל',
    inactive: 'לא פעיל',
};

function labelForStage(stageId: string): string {
    return PIPELINE_STAGE_LABELS[stageId] || stageId || '—';
}

function labelForStatus(status: string): string {
    return CLIENT_STATUS_LABELS[status] || status || '—';
}

function formatAliasList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((v) => String(v || '').trim()).filter(Boolean).sort();
}

export function formatClientHistoryActionType(entry: AuditLogEntry): string {
    if (entry.action === 'create') return 'יצירה';
    if (entry.action === 'delete') return 'מחיקה';
    return 'עדכון';
}

export function formatClientHistoryDescription(entry: AuditLogEntry): string {
    if (entry.description?.trim()) {
        return entry.description.trim();
    }

    const changes = entry.changes || [];
    const lines: string[] = [];

    for (const change of changes) {
        const field = String(change.field || '');
        const oldVal = change.oldValue;
        const newVal = change.newValue;

        if (field === 'status') {
            lines.push(
                hebrewFieldChangeLine(
                    'סטטוס הלקוח',
                    labelForStatus(String(oldVal ?? '')),
                    labelForStatus(String(newVal ?? '')),
                ),
            );
            continue;
        }

        if (field === 'metadata.pipelineStage' || field === 'pipelineStage') {
            lines.push(
                hebrewFieldChangeLine(
                    'שלב המכירה',
                    labelForStage(String(oldVal ?? '')),
                    labelForStage(String(newVal ?? '')),
                ),
            );
            continue;
        }

        if (field === 'metadata.aliases.added') {
            lines.push(`נוסף אליאס חדש: **${String(newVal ?? '').trim()}**`);
            continue;
        }

        if (field === 'metadata.aliases.removed') {
            lines.push(`הוסר האליאס: **${String(oldVal ?? '').trim()}**`);
            continue;
        }

        if (field === 'mainContactName') {
            lines.push(`עודכן איש קשר ראשי ל-**${String(newVal ?? '').trim()}**`);
            continue;
        }

        if (field === 'metadata.website' || field === 'website') {
            lines.push('עודכנה כתובת אתר האינטרנט');
            continue;
        }

        if (field === 'displayName' || field === 'name') {
            lines.push(
                hebrewFieldChangeLine('שם הלקוח', String(oldVal ?? ''), String(newVal ?? '')),
            );
        }
    }

    if (lines.length) return lines.join(' · ');
    return 'בוצע עדכון לפרטי הלקוח';
}

export function diffClientAliases(oldAliases: unknown, newAliases: unknown): { field: string; oldValue: string; newValue: string }[] {
    const oldList = formatAliasList(oldAliases);
    const newList = formatAliasList(newAliases);
    const oldSet = new Set(oldList);
    const newSet = new Set(newList);
    const out: { field: string; oldValue: string; newValue: string }[] = [];
    for (const alias of newList) {
        if (!oldSet.has(alias)) {
            out.push({ field: 'metadata.aliases.added', oldValue: '', newValue: alias });
        }
    }
    for (const alias of oldList) {
        if (!newSet.has(alias)) {
            out.push({ field: 'metadata.aliases.removed', oldValue: alias, newValue: '' });
        }
    }
    return out;
}
