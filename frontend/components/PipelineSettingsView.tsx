import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
    PlusIcon, XMarkIcon, CheckCircleIcon,
    Bars3Icon, BriefcaseIcon, UserGroupIcon, TrashIcon,
    ChevronUpIcon, ChevronDownIcon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchPipelines,
    syncPipelines,
    createPipeline,
    type PipelineDto,
    type PipelineStageDto,
    type StageOutcomeDto,
} from '../services/pipelinesApi';
import {
    fetchCandidatePipelines,
    syncCandidatePipelines,
    createCandidatePipeline,
} from '../services/candidatePipelinesApi';
import { buildMoveTargetOptions } from '../utils/pipelineMoveTargets';
import SlaDurationInput from './SlaDurationInput';
import { slaFieldLabel, normalizeSlaUnit, type SlaUnit } from '../utils/slaDuration';
import {
    fetchClientMessageTemplates,
    type MessageTemplateDto,
} from '../services/messageTemplatesApi';
import { fetchSystemEvents } from '../services/systemEventsApi';
import {
    buildSystemEventGroupsFromApiRows,
    resolveSystemEventSelectValue,
    type SystemEventCatalogGroup,
} from '../utils/processManagementCatalog';
import { fetchRecruitmentStatuses, type RecruitmentStatusDto } from '../services/recruitmentStatusesApi';
import type {
    OutcomeAutomation,
    OutcomeTrigger,
    AutomationActionType,
    AutomationScheduleType,
} from '../services/pipelinesApi';

export type StageOutcome = StageOutcomeDto;

interface Stage {
    id: string;
    name: string;
    color: string;
    order: number;
    slaLimit: number;
    slaLimitUnit?: SlaUnit;
    outcomes?: StageOutcome[];
}

interface Pipeline {
    id: string;
    name: string;
    description: string;
    sortIndex?: number;
    stages: Stage[];
}

const SYSTEM_EVENT_GROUPS: SystemEventCatalogGroup[] = [
    {
        label: 'פורטל מועמד',
        events: [
            {
                value: 'candidate_confirmed_profile',
                label: 'אישור הפרופיל על ידי המועמד',
                triggerName: 'מועמד',
                eventName: 'אישור הפרופיל על ידי המועמד',
                rowIds: [],
            },
        ],
    },
    {
        label: 'אישורי הגעה',
        events: [
            {
                value: 'candidate_confirmed_interview',
                label: 'אישר_הגעה_לראיון',
                triggerName: 'מועמד',
                eventName: 'אישר_הגעה_לראיון',
                rowIds: [],
            },
            {
                value: 'candidate_canceled_interview',
                label: 'ביטל_הגעה_לראיון',
                triggerName: 'מועמד',
                eventName: 'ביטל_הגעה_לראיון',
                rowIds: [],
            },
            {
                value: 'candidate_requested_reschedule',
                label: 'ביקש_לשנות_מועד',
                triggerName: 'מועמד',
                eventName: 'ביקש_לשנות_מועד',
                rowIds: [],
            },
        ],
    },
    {
        label: 'טפסים ושאלונים',
        events: [
            {
                value: 'form_completed_onboarding',
                label: 'קליטה_הושלם',
                triggerName: 'טופס',
                eventName: 'קליטה_הושלם',
                rowIds: [],
            },
            {
                value: 'form_completed_tech_test',
                label: 'מבחן_מקצועי_הוגש',
                triggerName: 'טופס',
                eventName: 'מבחן_מקצועי_הוגש',
                rowIds: [],
            },
        ],
    },
    {
        label: 'מערכות צד שלישי',
        events: [
            {
                value: 'bg_check_passed',
                label: 'עבר_בהצלחה',
                triggerName: 'בדיקת_רקע',
                eventName: 'עבר_בהצלחה',
                rowIds: [],
            },
            {
                value: 'hris_sync_completed',
                label: 'סנכרון_הושלם',
                triggerName: 'מערכת_HR',
                eventName: 'סנכרון_הושלם',
                rowIds: [],
            },
        ],
    },
];

const FALLBACK_TEMPLATES: MessageTemplateDto[] = [
    { id: 't1', templateKey: null, name: 'תבנית קבלת פנים / ברוכים הבאים', subject: '', content: '', channels: ['email', 'sms'], isSystem: false, lastUpdated: null, updatedBy: '' },
    { id: 't2', templateKey: null, name: 'תבנית קביעת ראיון (זימון)', subject: '', content: '', channels: ['email', 'sms'], isSystem: false, lastUpdated: null, updatedBy: '' },
    { id: 't3', templateKey: null, name: 'תבנית עדכון סטטוס / דחייה', subject: '', content: '', channels: ['email', 'sms'], isSystem: false, lastUpdated: null, updatedBy: '' },
];

function defaultAutomation(): OutcomeAutomation {
    return {
        id: `auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actionType: 'send_email',
        scheduleType: 'immediate',
        requireManualApproval: false,
        recipients: { candidate: false, hiringManager: false, coordinator: false, extra: '' },
    };
}

const OutcomeTriggerSection: React.FC<{
    trigger: OutcomeTrigger;
    onChange: (trigger: OutcomeTrigger) => void;
    systemEventGroups: SystemEventCatalogGroup[];
}> = ({ trigger, onChange, systemEventGroups }) => {
    const triggerType = trigger?.type || 'none';
    return (
        <div className="mt-2 pt-2 border-t border-border-subtle bg-blue-50/50 p-2 rounded-md">
            <div className="flex items-center gap-2 mb-2">
                <label className="text-xs font-bold text-blue-800">הפעלה אוטומטית של התוצאה (טריגר):</label>
                <span className="text-[10px] text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">מומלץ</span>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
                <select
                    value={triggerType}
                    onChange={(e) => {
                        const type = e.target.value as OutcomeTrigger['type'];
                        onChange(type === 'system_event' ? { type, systemEventId: '' } : { type: 'none' });
                    }}
                    className="text-sm border border-blue-200 rounded-md bg-white px-2 py-1 outline-none focus:border-blue-500 min-w-[180px]"
                >
                    <option value="none">ללא (בחירה ידנית בלבד)</option>
                    <option value="system_event">אירוע מערכת (System Event)</option>
                </select>
                {triggerType === 'system_event' ? (
                    <div className="flex items-center gap-2 flex-1 min-w-[250px]">
                        <span className="text-xs text-blue-800">בחר אירוע:</span>
                        <select
                            value={resolveSystemEventSelectValue(trigger.systemEventId, systemEventGroups)}
                            onChange={(e) => onChange({ type: 'system_event', systemEventId: e.target.value })}
                            className="text-sm border border-blue-200 rounded-md bg-white px-2 py-1 outline-none focus:border-blue-500 w-full"
                        >
                            <option value="" disabled>
                                -- בחר אירוע מהרשימה --
                            </option>
                            {systemEventGroups.map((group) => (
                                <optgroup key={group.label} label={group.label}>
                                    {group.events.map((ev) => (
                                        <option key={ev.value} value={ev.value}>
                                            {ev.label}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>
                ) : null}
            </div>
            <div className="text-[10px] text-blue-700 mt-1">
                * מומלץ: שימוש באירועי מערכת מאפשר אמינות גבוהה יותר. המערכת תנתח סמסים, מיילים, ו-API ותמיר אותם לאירוע מסודר.
            </div>
        </div>
    );
};

const OutcomeAutomationRow: React.FC<{
    automation: OutcomeAutomation;
    pipelines: Pipeline[];
    emailTemplates: MessageTemplateDto[];
    smsTemplates: MessageTemplateDto[];
    recruitmentStatuses: RecruitmentStatusDto[];
    onChange: (automation: OutcomeAutomation) => void;
    onDelete: () => void;
}> = ({ automation, pipelines, emailTemplates, smsTemplates, recruitmentStatuses, onChange, onDelete }) => {
    const showManualApproval = automation.actionType === 'send_email' || automation.actionType === 'send_sms';
    const recipients = automation.recipients || { candidate: false, hiringManager: false, coordinator: false, extra: '' };
    const selectedPipeline = pipelines.find((p) => p.id === automation.pipelineId) || null;
    const stageOptions = [...(selectedPipeline?.stages || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const selectedStage = stageOptions.find((s) => s.id === automation.stageId) || null;
    const outcomeOptions = selectedStage?.outcomes || [];

    const patch = (partial: Partial<OutcomeAutomation>) => onChange({ ...automation, ...partial });

    const patchRecipients = (field: keyof NonNullable<OutcomeAutomation['recipients']>, value: boolean | string) => {
        patch({ recipients: { ...recipients, [field]: value } });
    };

    return (
        <div className="flex flex-wrap gap-3 items-center bg-bg-subtle p-2 rounded-md border border-border-default relative group pr-8">
            <button
                type="button"
                onClick={onDelete}
                className="absolute top-1/2 -translate-y-1/2 right-2 text-text-muted hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                title="מחק אוטומציה"
            >
                <TrashIcon className="w-4 h-4" />
            </button>

            <select
                value={automation.actionType}
                onChange={(e) => {
                    const actionType = e.target.value as AutomationActionType;
                    patch({
                        actionType,
                        templateId: undefined,
                        pipelineId: undefined,
                        stageId: undefined,
                        targetOutcomeId: undefined,
                        statusName: undefined,
                    });
                }}
                className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500"
            >
                <option value="send_email">שליחת מייל מתוך תבנית</option>
                <option value="send_sms">שליחת SMS מתוך תבנית</option>
                <option value="start_pipeline">העבר לתהליך אחר</option>
                <option value="open_additional_process">פתח תהליך נוסף</option>
                <option value="close_event">סגירת אירוע</option>
                <option value="change_status">שנה סטטוס</option>
            </select>

            {automation.actionType === 'send_email' ? (
                <div className="flex flex-col gap-2 flex-1 min-w-[250px]">
                    <select
                        value={automation.templateId || ''}
                        onChange={(e) => patch({ templateId: e.target.value })}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full"
                    >
                        <option value="" disabled>
                            -- בחר תבנית מייל --
                        </option>
                        {emailTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                    <div className="flex flex-col gap-2 mt-1 bg-white p-2.5 rounded-md border border-border-subtle shadow-sm w-full">
                        <span className="text-xs font-semibold text-text-default">נמענים:</span>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <label className="flex items-center gap-1.5 text-xs text-text-default cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(recipients.candidate)}
                                    onChange={(e) => patchRecipients('candidate', e.target.checked)}
                                    className="rounded border-border-default text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                                />
                                מועמד/ת
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-text-default cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(recipients.hiringManager)}
                                    onChange={(e) => patchRecipients('hiringManager', e.target.checked)}
                                    className="rounded border-border-default text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                                />
                                מנהל/ת גיוס
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-text-default cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(recipients.coordinator)}
                                    onChange={(e) => patchRecipients('coordinator', e.target.checked)}
                                    className="rounded border-border-default text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                                />
                                רכז/ת משרה
                            </label>
                        </div>
                        <input
                            type="text"
                            value={recipients.extra || ''}
                            onChange={(e) => patchRecipients('extra', e.target.value)}
                            placeholder="נמענים נוספים (למשל: hr@company.com)"
                            className="text-xs border border-border-default rounded-md bg-bg-input px-2 py-1.5 outline-none focus:border-primary-500 w-full mt-1"
                        />
                    </div>
                </div>
            ) : null}

            {automation.actionType === 'send_sms' ? (
                <div className="flex flex-col gap-2 flex-1 min-w-[250px]">
                    <select
                        value={automation.templateId || ''}
                        onChange={(e) => patch({ templateId: e.target.value })}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full"
                    >
                        <option value="" disabled>
                            -- בחר תבנית SMS --
                        </option>
                        {smsTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {automation.actionType === 'start_pipeline' ? (
                <div className="flex flex-col gap-2 flex-1 min-w-[220px]">
                    <select
                        value={automation.pipelineId || ''}
                        onChange={(e) => {
                            const pipelineId = e.target.value;
                            const pipeline = pipelines.find((p) => p.id === pipelineId);
                            const firstStage = [...(pipeline?.stages || [])].sort(
                                (a, b) => (a.order ?? 0) - (b.order ?? 0),
                            )[0];
                            const firstOutcome = firstStage?.outcomes?.[0];
                            patch({
                                pipelineId,
                                stageId: firstStage?.id || undefined,
                                targetOutcomeId: firstOutcome?.id || undefined,
                            });
                        }}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full"
                    >
                        <option value="" disabled>
                            -- בחר תהליך --
                        </option>
                        {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={automation.stageId || ''}
                        onChange={(e) => {
                            const stageId = e.target.value;
                            const stage = stageOptions.find((s) => s.id === stageId);
                            patch({
                                stageId,
                                targetOutcomeId: stage?.outcomes?.[0]?.id || undefined,
                            });
                        }}
                        disabled={!automation.pipelineId || stageOptions.length === 0}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full disabled:opacity-50"
                    >
                        <option value="" disabled>
                            {automation.pipelineId ? '-- בחר שלב --' : 'בחר תהליך תחילה'}
                        </option>
                        {stageOptions.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={automation.targetOutcomeId || ''}
                        onChange={(e) => patch({ targetOutcomeId: e.target.value || undefined })}
                        disabled={!automation.stageId || outcomeOptions.length === 0}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full disabled:opacity-50"
                    >
                        <option value="" disabled>
                            {!automation.stageId
                                ? 'בחר שלב תחילה'
                                : outcomeOptions.length === 0
                                  ? 'אין תוצאות לשלב זה'
                                  : '-- בחר תוצאה --'}
                        </option>
                        {outcomeOptions.map((outcome) => (
                            <option key={outcome.id} value={outcome.id}>
                                {outcome.name}
                            </option>
                        ))}
                    </select>
                    <p className="text-[10px] text-text-muted leading-snug">
                        האירוע/מועמד יועבר לתהליך, לשלב ולתוצאה שנבחרו
                    </p>
                </div>
            ) : null}

            {automation.actionType === 'open_additional_process' ? (
                <div className="flex flex-col gap-2 flex-1 min-w-[220px]">
                    <select
                        value={automation.pipelineId || ''}
                        onChange={(e) => {
                            const pipelineId = e.target.value;
                            const pipeline = pipelines.find((p) => p.id === pipelineId);
                            const firstStage = [...(pipeline?.stages || [])].sort(
                                (a, b) => (a.order ?? 0) - (b.order ?? 0),
                            )[0];
                            patch({
                                pipelineId,
                                stageId: firstStage?.id || undefined,
                                targetOutcomeId: firstStage?.outcomes?.[0]?.id || undefined,
                            });
                        }}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full"
                    >
                        <option value="" disabled>
                            -- בחר תהליך --
                        </option>
                        {pipelines.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={automation.stageId || ''}
                        onChange={(e) => {
                            const stageId = e.target.value;
                            const stage = stageOptions.find((s) => s.id === stageId);
                            patch({
                                stageId,
                                targetOutcomeId: stage?.outcomes?.[0]?.id || undefined,
                            });
                        }}
                        disabled={!automation.pipelineId || stageOptions.length === 0}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full disabled:opacity-50"
                    >
                        <option value="" disabled>
                            {automation.pipelineId ? '-- בחר שלב --' : 'בחר תהליך תחילה'}
                        </option>
                        {stageOptions.map((stage) => (
                            <option key={stage.id} value={stage.id}>
                                {stage.name}
                            </option>
                        ))}
                    </select>
                    <select
                        value={automation.targetOutcomeId || ''}
                        onChange={(e) => patch({ targetOutcomeId: e.target.value || undefined })}
                        disabled={!automation.stageId || outcomeOptions.length === 0}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full disabled:opacity-50"
                    >
                        <option value="" disabled>
                            {!automation.stageId
                                ? 'בחר שלב תחילה'
                                : outcomeOptions.length === 0
                                  ? 'אין תוצאות לשלב זה'
                                  : '-- בחר תוצאה --'}
                        </option>
                        {outcomeOptions.map((outcome) => (
                            <option key={outcome.id} value={outcome.id}>
                                {outcome.name}
                            </option>
                        ))}
                    </select>
                    <p className="text-[10px] text-text-muted leading-snug">
                        התהליך הנוכחי יישאר פתוח · ייפתח תהליך נוסף במקביל לתהליך, לשלב ולתוצאה שנבחרו
                    </p>
                </div>
            ) : null}

            {automation.actionType === 'change_status' ? (
                <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
                    <select
                        value={automation.statusName || ''}
                        onChange={(e) => patch({ statusName: e.target.value })}
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500 w-full"
                    >
                        <option value="" disabled>
                            -- בחר סטטוס גיוס --
                        </option>
                        {recruitmentStatuses.map((status) => (
                            <option key={status.id} value={status.name}>
                                {status.name}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            <div className="flex flex-col gap-2 border-r border-border-subtle pr-4 mr-auto w-full sm:w-auto mt-2 sm:mt-0">
                <div className="flex items-center gap-2">
                    <label className="text-xs text-text-muted whitespace-nowrap">תזמון:</label>
                    <select
                        value={automation.scheduleType}
                        onChange={(e) =>
                            patch({
                                scheduleType: e.target.value as AutomationScheduleType,
                                scheduleValue: e.target.value === 'immediate' ? undefined : automation.scheduleValue,
                            })
                        }
                        className="text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500"
                    >
                        <option value="immediate">מיידי</option>
                        <option value="minutes">דקות</option>
                        <option value="hours">שעות</option>
                        <option value="days">ימים</option>
                    </select>
                    {automation.scheduleType !== 'immediate' ? (
                        <input
                            type="number"
                            min={1}
                            value={automation.scheduleValue || 1}
                            onChange={(e) => patch({ scheduleValue: parseInt(e.target.value, 10) || 1 })}
                            className="w-16 text-sm border border-border-default rounded-md bg-white px-2 py-1 outline-none focus:border-primary-500"
                        />
                    ) : null}
                </div>
                {showManualApproval ? (
                    <label className="flex items-center gap-1.5 text-xs text-text-default cursor-pointer mt-1 bg-white p-1.5 rounded border border-border-subtle hover:bg-bg-subtle transition-colors w-max">
                        <input
                            type="checkbox"
                            checked={Boolean(automation.requireManualApproval)}
                            onChange={(e) => patch({ requireManualApproval: e.target.checked })}
                            className="rounded border-border-default text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
                        />
                        אני רוצה לאשר ידנית את האוטומציה
                    </label>
                ) : null}
            </div>
        </div>
    );
};

const availableColors = [
    { label: 'כחול', value: 'bg-blue-100 text-blue-700' },
    { label: 'ירוק', value: 'bg-green-100 text-green-700' },
    { label: 'אדום', value: 'bg-red-100 text-red-700' },
    { label: 'צהוב', value: 'bg-yellow-100 text-yellow-700' },
    { label: 'סגול', value: 'bg-purple-100 text-purple-700' },
    { label: 'כתום', value: 'bg-orange-100 text-orange-700' },
    { label: 'אפור', value: 'bg-gray-100 text-gray-700' },
    { label: 'טורקיז', value: 'bg-teal-100 text-teal-700' },
    { label: 'ורוד', value: 'bg-pink-100 text-pink-700' },
    { label: 'אינדיגו', value: 'bg-indigo-100 text-indigo-700' },
    { label: 'ציאן', value: 'bg-cyan-100 text-cyan-700' },
];

function dtoToPipeline(d: PipelineDto): Pipeline {
    return {
        id: d.id,
        name: d.name,
        description: d.description || '',
        sortIndex: d.sortIndex,
        stages: (d.stages || []).map((s: PipelineStageDto) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            order: s.order,
            slaLimit: s.slaLimit,
            slaLimitUnit: normalizeSlaUnit(s.slaLimitUnit),
            outcomes: Array.isArray(s.outcomes) ? s.outcomes : [],
        })),
    };
}

function sortPipelinesByIndex(list: Pipeline[]): Pipeline[] {
    return [...list]
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map((p, i) => ({ ...p, sortIndex: i }));
}

function pipelineToDto(p: Pipeline, sortIndex: number): PipelineDto {
    return {
        id: p.id,
        name: p.name,
        description: p.description || '',
        sortIndex,
        stages: (p.stages || []).map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            order: s.order,
            slaLimit: s.slaLimit,
            slaLimitUnit: s.slaLimitUnit || 'days',
            outcomes: Array.isArray(s.outcomes) ? s.outcomes : [],
        })),
    };
}

const PIPELINE_ORDER_HELP_TEXT =
    'התהליך הראשון ברשימה הוא ברירת המחדל שייפתח כשלב ראשון (למשל בעת הצבת ארגון או איש קשר בתהליך). ניתן להגדיר תהליך אחר כברירת מחדל על ידי גרירה למעלה. הסדר משפיע גם על לוח הקנבן ועל תצוגות נוספות במערכת.';

const AddPipelineModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, description: string) => void;
    saving?: boolean;
}> = ({ isOpen, onClose, onSave, saving }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(name, description);
        setName('');
        setDescription('');
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card w-full max-w-md rounded-2xl shadow-xl border border-border-default overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-border-default flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">יצירת תהליך חדש</h3>
                    <button type="button" onClick={onClose}><XMarkIcon className="w-5 h-5 text-text-muted hover:text-text-default"/></button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">שם התהליך</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            placeholder="למשל: גיוס בכירים"
                            required
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">תיאור</label>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            placeholder="תיאור קצר של התהליך..."
                            rows={3}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-text-muted hover:bg-bg-subtle">ביטול</button>
                        <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 shadow-sm disabled:opacity-60">
                            {saving ? 'שומר…' : 'צור תהליך'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const AdminClientPicker: React.FC<{
    value: string | null;
    options: Array<{ id: string; label: string }>;
    loading: boolean;
    onChange: (id: string | null) => void;
    centered?: boolean;
}> = ({ value, options, loading, onChange, centered }) => (
    <div className={`flex items-center gap-3 flex-wrap ${centered ? 'justify-center' : ''}`}>
        <label className="text-sm font-semibold text-text-muted whitespace-nowrap">לקוח:</label>
        <select
            value={value ?? ''}
            disabled={loading}
            onChange={(e) => onChange(e.target.value || null)}
            className="bg-bg-input border border-border-default text-sm rounded-md p-2 min-w-[220px] disabled:opacity-50"
        >
            <option value="">— בחר לקוח —</option>
            {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                    {opt.label}
                </option>
            ))}
        </select>
        {loading ? <span className="text-xs text-text-muted">טוען לקוחות...</span> : null}
    </div>
);

const PipelineSettingsView: React.FC<{ kind?: 'client' | 'candidate' }> = ({ kind = 'client' }) => {
    const isCandidateKind = kind === 'candidate';
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const ownClientId = user?.clientId ? String(user.clientId) : null;
    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

    const [adminClientId, setAdminClientId] = useState<string | null>(null);
    const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [clientsLoading, setClientsLoading] = useState(false);

    const clientId = isPlatformAdmin ? adminClientId : ownClientId;

    const [pipelines, setPipelines] = useState<Pipeline[]>([]);
    const [activePipelineId, setActivePipelineId] = useState<string>('');
    const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [messageTemplates, setMessageTemplates] = useState<MessageTemplateDto[]>(FALLBACK_TEMPLATES);
    const [systemEventGroups, setSystemEventGroups] = useState(SYSTEM_EVENT_GROUPS);
    const [recruitmentStatuses, setRecruitmentStatuses] = useState<RecruitmentStatusDto[]>([]);
    const [isPipelineOrderHelpExpanded, setIsPipelineOrderHelpExpanded] = useState(false);

    const emailTemplates = useMemo(
        () => messageTemplates.filter((t) => t.channels.includes('email')),
        [messageTemplates],
    );
    const smsTemplates = useMemo(
        () => messageTemplates.filter((t) => t.channels.includes('sms')),
        [messageTemplates],
    );

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);
    const pipelineDragItem = useRef<number | null>(null);
    const pipelineDragOverItem = useRef<number | null>(null);
    const stagesContainerRef = useRef<HTMLDivElement>(null);
    const persistEnabled = useRef(false);
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const persistRevision = useRef(0);
    const activePipelineIdRef = useRef('');
    const expandedStageIdRef = useRef<string | null>(null);

    const activePipeline = pipelines.find(p => p.id === activePipelineId);

    useEffect(() => {
        activePipelineIdRef.current = activePipelineId;
    }, [activePipelineId]);
    useEffect(() => {
        expandedStageIdRef.current = expandedStageId;
    }, [expandedStageId]);

    useEffect(() => {
        if (!clientId) {
            setMessageTemplates(FALLBACK_TEMPLATES);
            return;
        }
        let cancelled = false;
        fetchClientMessageTemplates(clientId)
            .then((rows) => {
                if (cancelled) return;
                setMessageTemplates(rows.length > 0 ? rows : FALLBACK_TEMPLATES);
            })
            .catch(() => {
                if (!cancelled) setMessageTemplates(FALLBACK_TEMPLATES);
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    useEffect(() => {
        if (!clientId) {
            setRecruitmentStatuses([]);
            return;
        }
        let cancelled = false;
        void fetchRecruitmentStatuses(clientId)
            .then((rows) => {
                if (!cancelled) setRecruitmentStatuses(Array.isArray(rows) ? rows.filter((r) => r.isActive !== false) : []);
            })
            .catch(() => {
                if (!cancelled) setRecruitmentStatuses([]);
            });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    useEffect(() => {
        if (!apiBase) {
            setSystemEventGroups(SYSTEM_EVENT_GROUPS);
            return;
        }
        let cancelled = false;
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
        fetchSystemEvents(apiBase, token)
            .then((rows) => {
                if (cancelled) return;
                const fromApi = buildSystemEventGroupsFromApiRows(rows);
                setSystemEventGroups(fromApi.length > 0 ? fromApi : SYSTEM_EVENT_GROUPS);
            })
            .catch(() => {
                if (!cancelled) setSystemEventGroups(SYSTEM_EVENT_GROUPS);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    const isTempId = (id: string) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));

    const remapExpandedAfterSync = (
        expandedId: string | null,
        before: Pipeline[],
        after: Pipeline[],
        activeId: string,
    ): string | null => {
        if (!expandedId) return null;
        if (after.some((p) => p.stages.some((s) => s.id === expandedId))) return expandedId;
        const beforePipe =
            before.find((p) => p.id === activeId) ||
            before.find((p) => p.stages.some((s) => s.id === expandedId));
        if (!beforePipe) return null;
        const stageIndex = beforePipe.stages.findIndex((s) => s.id === expandedId);
        if (stageIndex < 0) return null;
        const afterPipe =
            after.find((p) => p.id === beforePipe.id) ||
            after[before.findIndex((p) => p.id === beforePipe.id)] ||
            after.find((p) => p.name === beforePipe.name);
        return afterPipe?.stages[stageIndex]?.id ?? null;
    };

    useEffect(() => {
        if (!isPlatformAdmin || !apiBase) {
            setClientOptions([]);
            return;
        }
        let cancelled = false;
        setClientsLoading(true);
        fetch(`${apiBase}/api/clients?activeOnly=true`, {
            headers: authHeaders(true),
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : ((rows as { data?: unknown })?.data ?? []);
                const opts = (Array.isArray(list) ? list : [])
                    .map((c: Record<string, unknown>) => ({
                        id: String(c.id ?? ''),
                        label: String(c.displayName || c.name || '').trim(),
                    }))
                    .filter((o) => o.id && o.label)
                    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
                setClientOptions(opts);
            })
            .catch(() => {
                if (!cancelled) setClientOptions([]);
            })
            .finally(() => {
                if (!cancelled) setClientsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, isPlatformAdmin]);

    useEffect(() => {
        if (!isPlatformAdmin || adminClientId || !clientOptions.length) return;
        setAdminClientId(clientOptions[0].id);
    }, [isPlatformAdmin, adminClientId, clientOptions]);

    const schedulePersist = useCallback((snapshot: Pipeline[]) => {
        if (!clientId || !persistEnabled.current) return;
        setSaveError(null);
        const rev = ++persistRevision.current;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(async () => {
            persistTimer.current = null;
            // Only persist the latest scheduled revision.
            if (rev !== persistRevision.current) return;
            try {
                setSaving(true);
                const saved = isCandidateKind
                    ? await syncCandidatePipelines(
                        clientId,
                        snapshot.map((p, i) => pipelineToDto(p, i)),
                    )
                    : await syncPipelines(clientId, snapshot.map((p, i) => pipelineToDto(p, i)));
                // Ignore stale responses — user kept editing while save was in flight.
                if (rev !== persistRevision.current) return;

                const mapped = sortPipelinesByIndex(saved.map(dtoToPipeline));
                const hadTempIds = snapshot.some(
                    (p) => isTempId(p.id) || p.stages.some((s) => isTempId(s.id)),
                );

                if (hadTempIds) {
                    const nextExpanded = remapExpandedAfterSync(
                        expandedStageIdRef.current,
                        snapshot,
                        mapped,
                        activePipelineIdRef.current,
                    );
                    setPipelines(mapped);
                    setExpandedStageId(nextExpanded);
                    setActivePipelineId((prev) => {
                        if (mapped.some((p) => p.id === prev)) return prev;
                        const idx = snapshot.findIndex((p) => p.id === prev);
                        if (idx >= 0 && mapped[idx]) return mapped[idx].id;
                        return mapped[0]?.id || '';
                    });
                }
                // If all IDs were already real UUIDs, keep local state so inputs keep focus.
            } catch (e: unknown) {
                if (rev !== persistRevision.current) return;
                setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
            } finally {
                if (rev === persistRevision.current) setSaving(false);
            }
        }, 1200);
    }, [clientId, isCandidateKind]);

    useEffect(() => {
        persistEnabled.current = false;
        persistRevision.current += 1;
        if (!clientId) {
            setPipelines([]);
            setActivePipelineId('');
            setExpandedStageId(null);
            setLoadError(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        void (isCandidateKind ? fetchCandidatePipelines(clientId) : fetchPipelines(clientId))
            .then((rows) => {
                if (cancelled) return;
                const mapped = sortPipelinesByIndex(rows.map(dtoToPipeline));
                setPipelines(mapped);
                setActivePipelineId(mapped[0]?.id || '');
                setExpandedStageId(null);
                queueMicrotask(() => {
                    persistEnabled.current = true;
                });
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setLoadError(e instanceof Error ? e.message : 'טעינה נכשלה');
                setPipelines([]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, [clientId, isCandidateKind]);

    const updatePipelines = (next: Pipeline[]) => {
        setPipelines(next);
        schedulePersist(next);
    };

    const handleAddPipeline = async (name: string, description: string) => {
        if (!clientId) return;
        try {
            setSaving(true);
            setSaveError(null);
            const created = isCandidateKind
                ? await createCandidatePipeline(clientId, { name, description })
                : await createPipeline(clientId, { name, description });
            const mapped = dtoToPipeline(created);
            setPipelines((prev) => [...prev, mapped]);
            setActivePipelineId(mapped.id);
            setIsAddModalOpen(false);
        } catch (e: unknown) {
            setSaveError(e instanceof Error ? e.message : 'יצירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleAddStage = () => {
        if (!activePipeline) return;
        const newStage: Stage = {
            id: `tmp-${Date.now()}`,
            name: 'שלב חדש',
            color: 'bg-gray-100 text-gray-700',
            order: activePipeline.stages.length + 1,
            slaLimit: 3,
            slaLimitUnit: 'days',
            outcomes: [],
        };
        const updatedPipeline = {
            ...activePipeline,
            stages: [...activePipeline.stages, newStage],
        };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
        setTimeout(() => {
            if (stagesContainerRef.current) {
                stagesContainerRef.current.scrollTop = stagesContainerRef.current.scrollHeight;
            }
        }, 100);
    };

    const handleUpdateStage = (stageId: string, field: keyof Stage, value: unknown) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map(s => s.id === stageId ? { ...s, [field]: value } : s),
        };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
    };

    const handleDeleteStage = (stageId: string) => {
        if (!activePipeline) return;
        if (!window.confirm('האם למחוק שלב זה?')) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages
                .filter(s => s.id !== stageId)
                .map((s, i) => ({ ...s, order: i + 1 })),
        };
        if (expandedStageId === stageId) setExpandedStageId(null);
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
    };

    const handleAddOutcome = (stageId: string) => {
        if (!activePipeline) return;
        const newOutcome: StageOutcome = {
            id: `out-${Date.now()}`,
            name: 'תוצאה חדשה',
            actionType: 'stay',
            autoFollowupDays: 7,
            autoFollowupUnit: 'days',
            trigger: { type: 'none' },
            automations: [],
        };
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) =>
                s.id === stageId
                    ? { ...s, outcomes: [...(s.outcomes || []), newOutcome] }
                    : s,
            ),
        };
        setExpandedStageId(stageId);
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleUpdateOutcome = (
        stageId: string,
        outcomeId: string,
        field: keyof StageOutcome,
        value: unknown,
    ) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) => {
                if (s.id !== stageId) return s;
                return {
                    ...s,
                    outcomes: (s.outcomes || []).map((o) =>
                        o.id === outcomeId ? { ...o, [field]: value } : o,
                    ),
                };
            }),
        };
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleDeleteOutcome = (stageId: string, outcomeId: string) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) => {
                if (s.id !== stageId) return s;
                return {
                    ...s,
                    outcomes: (s.outcomes || []).filter((o) => o.id !== outcomeId),
                };
            }),
        };
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleAddAutomation = (stageId: string, outcomeId: string) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) => {
                if (s.id !== stageId) return s;
                return {
                    ...s,
                    outcomes: (s.outcomes || []).map((o) =>
                        o.id === outcomeId
                            ? { ...o, automations: [...(o.automations || []), defaultAutomation()] }
                            : o,
                    ),
                };
            }),
        };
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleUpdateAutomation = (
        stageId: string,
        outcomeId: string,
        automationId: string,
        automation: OutcomeAutomation,
    ) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) => {
                if (s.id !== stageId) return s;
                return {
                    ...s,
                    outcomes: (s.outcomes || []).map((o) =>
                        o.id === outcomeId
                            ? {
                                  ...o,
                                  automations: (o.automations || []).map((a) =>
                                      a.id === automationId ? automation : a,
                                  ),
                              }
                            : o,
                    ),
                };
            }),
        };
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleDeleteAutomation = (stageId: string, outcomeId: string, automationId: string) => {
        if (!activePipeline) return;
        const updatedPipeline = {
            ...activePipeline,
            stages: activePipeline.stages.map((s) => {
                if (s.id !== stageId) return s;
                return {
                    ...s,
                    outcomes: (s.outcomes || []).map((o) =>
                        o.id === outcomeId
                            ? {
                                  ...o,
                                  automations: (o.automations || []).filter((a) => a.id !== automationId),
                              }
                            : o,
                    ),
                };
            }),
        };
        updatePipelines(pipelines.map((p) => (p.id === activePipelineId ? updatedPipeline : p)));
    };

    const handleDeletePipeline = () => {
        if (!activePipeline) return;
        if (!window.confirm(`למחוק את התהליך "${activePipeline.name}" ואת כל שלביו?`)) return;
        const next = pipelines.filter(p => p.id !== activePipelineId).map((p, i) => ({ ...p, sortIndex: i }));
        setActivePipelineId(next[0]?.id || '');
        updatePipelines(next);
    };

    const handlePipelineDragStart = (e: React.DragEvent, position: number) => {
        pipelineDragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handlePipelineDragEnter = (e: React.DragEvent, position: number) => {
        pipelineDragOverItem.current = position;
        e.preventDefault();
    };

    const handlePipelineDragEnd = () => {
        if (pipelineDragItem.current === null || pipelineDragOverItem.current === null) {
            pipelineDragItem.current = null;
            pipelineDragOverItem.current = null;
            return;
        }
        if (pipelineDragItem.current === pipelineDragOverItem.current) {
            pipelineDragItem.current = null;
            pipelineDragOverItem.current = null;
            return;
        }
        const reordered = [...pipelines];
        const dragged = reordered[pipelineDragItem.current];
        reordered.splice(pipelineDragItem.current, 1);
        reordered.splice(pipelineDragOverItem.current, 0, dragged);
        updatePipelines(reordered.map((p, i) => ({ ...p, sortIndex: i })));
        pipelineDragItem.current = null;
        pipelineDragOverItem.current = null;
    };

    const handleDragStart = (e: React.DragEvent, position: number) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnter = (e: React.DragEvent, position: number) => {
        dragOverItem.current = position;
        e.preventDefault();
    };

    const handleDragEnd = () => {
        if (!activePipeline || dragItem.current === null || dragOverItem.current === null) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }
        const newStages = [...activePipeline.stages];
        const draggedItemContent = newStages[dragItem.current];
        newStages.splice(dragItem.current, 1);
        newStages.splice(dragOverItem.current, 0, draggedItemContent);
        const reorderedStages = newStages.map((s, i) => ({ ...s, order: i + 1 }));
        const updatedPipeline = { ...activePipeline, stages: reorderedStages };
        updatePipelines(pipelines.map(p => p.id === activePipelineId ? updatedPipeline : p));
        dragItem.current = null;
        dragOverItem.current = null;
    };

    if (!clientId) {
        return (
            <div className="p-8 space-y-4">
                {isPlatformAdmin ? (
                    <>
                        <AdminClientPicker
                            value={adminClientId}
                            options={clientOptions}
                            loading={clientsLoading}
                            onChange={setAdminClientId}
                            centered
                        />
                        <p className="text-center text-text-muted text-sm">
                            בחר לקוח מהרשימה כדי לנהל תהליכים.
                        </p>
                    </>
                ) : (
                    <div className="text-center text-text-muted">
                        יש להתחבר כמשתמש לקוח כדי לנהל תהליכים.
                    </div>
                )}
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-8 space-y-4">
                {isPlatformAdmin ? (
                    <AdminClientPicker
                        value={adminClientId}
                        options={clientOptions}
                        loading={clientsLoading}
                        onChange={setAdminClientId}
                    />
                ) : null}
                <div className="text-center text-text-muted">טוען תהליכים…</div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="p-8 space-y-4">
                {isPlatformAdmin ? (
                    <AdminClientPicker
                        value={adminClientId}
                        options={clientOptions}
                        loading={clientsLoading}
                        onChange={setAdminClientId}
                    />
                ) : null}
                <div className="text-center text-red-600">{loadError}</div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-4 animate-fade-in pb-10">
            {isPlatformAdmin ? (
                <AdminClientPicker
                    value={adminClientId}
                    options={clientOptions}
                    loading={clientsLoading}
                    onChange={setAdminClientId}
                />
            ) : null}

            <div className="h-full flex flex-col md:flex-row gap-6 flex-1 min-h-0">
            <style>{`.ghost { opacity: 0.5; background: #f3f4f6; }`}</style>

            <div className="w-full md:w-1/4 flex flex-col gap-4">
                <div className="bg-bg-card rounded-2xl border border-border-default p-4 shadow-sm h-full">
                    <div className="flex justify-between items-center mb-4 px-1">
                        <h2 className="text-lg font-bold text-text-default">תהליכים</h2>
                        <button
                            type="button"
                            onClick={() => setIsAddModalOpen(true)}
                            className="text-primary-600 hover:bg-primary-50 p-1.5 rounded-lg transition-colors"
                            title="הוסף תהליך חדש"
                        >
                            <PlusIcon className="w-5 h-5"/>
                        </button>
                    </div>

                    <div className="space-y-2">
                        {pipelines.map((pipeline, idx) => (
                            <div
                                key={pipeline.id}
                                draggable={pipelines.length > 1}
                                onDragStart={(e) => handlePipelineDragStart(e, idx)}
                                onDragEnter={(e) => handlePipelineDragEnter(e, idx)}
                                onDragEnd={handlePipelineDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className={`rounded-xl transition-all ${
                                    pipelines.length > 1 ? 'cursor-grab active:cursor-grabbing' : ''
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivePipelineId(pipeline.id);
                                        setExpandedStageId(null);
                                    }}
                                    className={`w-full text-right p-4 rounded-xl border transition-all flex items-center justify-between group ${
                                        activePipelineId === pipeline.id
                                        ? 'bg-primary-50 border-primary-200 shadow-sm ring-1 ring-primary-200'
                                        : 'bg-white border-border-default hover:border-primary-200 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {pipelines.length > 1 ? (
                                            <span
                                                className="p-1.5 rounded-lg text-text-muted group-hover:text-primary-600 group-hover:bg-primary-50 shrink-0"
                                                title="גרור לשינוי סדר"
                                                aria-hidden
                                            >
                                                <Bars3Icon className="w-4 h-4" />
                                            </span>
                                        ) : null}
                                        <div className={`p-2 rounded-lg shrink-0 ${activePipelineId === pipeline.id ? 'bg-white text-primary-600' : 'bg-bg-subtle text-text-muted'}`}>
                                            {idx === 0 ? <BriefcaseIcon className="w-5 h-5"/> : <UserGroupIcon className="w-5 h-5"/>}
                                        </div>
                                        <div className="min-w-0 text-right">
                                            <span className={`font-bold block truncate ${activePipelineId === pipeline.id ? 'text-primary-900' : 'text-text-default'}`}>
                                                {pipeline.name}
                                            </span>
                                            <span className="text-xs text-text-muted">{pipeline.stages.length} שלבים</span>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        ))}
                        {!pipelines.length && (
                            <p className="text-sm text-text-muted px-1">אין תהליכים עדיין.</p>
                        )}
                    </div>
                    {pipelines.length > 0 ? (
                        <button
                            type="button"
                            onClick={() => setIsPipelineOrderHelpExpanded((v) => !v)}
                            className={`w-full text-right text-xs mt-3 leading-relaxed bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-blue-900 cursor-pointer hover:bg-blue-100/80 transition-colors ${
                                isPipelineOrderHelpExpanded ? '' : 'truncate'
                            }`}
                            title={isPipelineOrderHelpExpanded ? undefined : PIPELINE_ORDER_HELP_TEXT}
                            aria-expanded={isPipelineOrderHelpExpanded}
                        >
                            {isPipelineOrderHelpExpanded
                                ? PIPELINE_ORDER_HELP_TEXT
                                : 'התהליך הראשון ברשימה הוא ברירת המחדל שייפתח…'}
                        </button>
                    ) : null}
                    {(saving || saveError) && (
                        <p className={`text-xs mt-3 px-1 ${saveError ? 'text-red-600' : 'text-text-muted'}`}>
                            {saveError || 'שומר…'}
                        </p>
                    )}
                </div>
            </div>

            <div className="w-full md:w-3/4 flex flex-col gap-4">
                <div className="bg-bg-card rounded-2xl border border-border-default p-6 shadow-sm flex flex-col h-full">
                {activePipeline ? (
                    <>
                        <header className="mb-6 flex justify-between items-end border-b border-border-default pb-4 gap-3">
                            <div>
                                <h2 className="text-2xl font-black text-text-default">{activePipeline.name}</h2>
                                <p className="text-sm text-text-muted mt-1">{activePipeline.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDeletePipeline}
                                    className="p-2 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                    title="מחק תהליך"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddStage}
                                    className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2 px-5 rounded-xl hover:bg-primary-700 transition shadow-md"
                                >
                                    <PlusIcon className="w-5 h-5" />
                                    <span>הוסף שלב</span>
                                </button>
                            </div>
                        </header>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" ref={stagesContainerRef}>
                             <div className="grid grid-cols-[40px_2fr_2fr_1fr_40px_40px] gap-4 px-4 py-2 text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                                 <div></div>
                                 <div>שם השלב (תצוגה)</div>
                                 <div>צבע תווית</div>
                                 <div>התראת SLA</div>
                                 <div></div>
                                 <div></div>
                             </div>

                            <div className="space-y-3">
                                {activePipeline.stages.map((stage, index) => {
                                    const isExpanded = expandedStageId === stage.id;
                                    return (
                                    <div
                                        key={stage.id}
                                        className="bg-white border border-border-default rounded-xl group hover:shadow-md transition-all flex flex-col overflow-hidden"
                                        draggable={!isExpanded}
                                        onDragStart={(e) => {
                                            if (isExpanded) {
                                                e.preventDefault();
                                                return;
                                            }
                                            handleDragStart(e, index);
                                        }}
                                        onDragEnter={(e) => handleDragEnter(e, index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                    >
                                        <div className="grid grid-cols-[40px_2fr_2fr_1fr_40px_40px] gap-4 items-center p-3 cursor-default">
                                        <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-text-subtle hover:text-primary-600">
                                            <Bars3Icon className="w-5 h-5"/>
                                        </div>

                                        <div>
                                            <input
                                                type="text"
                                                value={stage.name}
                                                onChange={(e) => handleUpdateStage(stage.id, 'name', e.target.value)}
                                                className={`w-full text-sm font-bold bg-transparent border-b-2 border-transparent focus:border-primary-500 outline-none px-1 py-0.5 rounded transition-colors ${stage.color.split(' ')[1] || ''}`}
                                                placeholder="שם השלב"
                                            />
                                        </div>

                                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                                            {availableColors.map(c => {
                                                const bgClass = c.value.split(' ')[0];
                                                const isSelected = stage.color === c.value;
                                                return (
                                                    <button
                                                        key={c.label}
                                                        type="button"
                                                        onClick={() => handleUpdateStage(stage.id, 'color', c.value)}
                                                        className={`w-6 h-6 rounded-full flex-shrink-0 transition-all border-2 ${bgClass} ${isSelected ? 'border-primary-600 scale-110 ring-1 ring-offset-1 ring-primary-300' : 'border-transparent hover:scale-105'}`}
                                                        title={c.label}
                                                    >
                                                        {isSelected && <CheckCircleIcon className="w-full h-full text-primary-700 p-0.5"/>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <SlaDurationInput
                                            value={stage.slaLimit}
                                            unit={stage.slaLimitUnit}
                                            onValueChange={(value) => handleUpdateStage(stage.id, 'slaLimit', value)}
                                            onUnitChange={(unit) => handleUpdateStage(stage.id, 'slaLimitUnit', unit)}
                                            className="max-w-[140px]"
                                            title="התראה לאחר X זמן ללא שינוי"
                                        />

                                        <div className="flex items-center justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedStageId(isExpanded ? null : stage.id)}
                                                className={`p-2 rounded-lg transition-colors ${isExpanded ? 'bg-primary-50 text-primary-600' : 'text-text-subtle hover:text-primary-600 hover:bg-bg-subtle'}`}
                                                title="הגדר תוצאות אינטראקציה"
                                            >
                                                {isExpanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-center">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteStage(stage.id)}
                                                className="p-2 text-text-subtle hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                title="מחק שלב"
                                            >
                                                <TrashIcon className="w-4 h-4"/>
                                            </button>
                                        </div>
                                        </div>

                                        {isExpanded ? (
                                            <div className="p-4 bg-bg-subtle border-t border-border-default space-y-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h4 className="text-sm font-bold text-text-default flex items-center gap-2">
                                                        <CheckCircleIcon className="w-4 h-4 text-primary-500" />
                                                        תוצאות אינטראקציה אפשריות לשלב זה
                                                    </h4>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddOutcome(stage.id)}
                                                        className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                                    >
                                                        <PlusIcon className="w-3 h-3" />
                                                        הוסף תוצאה
                                                    </button>
                                                </div>

                                                {(stage.outcomes || []).map((outcome) => (
                                                    <div
                                                        key={outcome.id}
                                                        className="flex flex-col gap-2 bg-white p-3 rounded-lg border border-border-default shadow-sm"
                                                    >
                                                        <div className="grid grid-cols-[2fr_1fr_1fr_40px] gap-3 items-center">
                                                        <input
                                                            type="text"
                                                            value={outcome.name}
                                                            onChange={(e) =>
                                                                handleUpdateOutcome(stage.id, outcome.id, 'name', e.target.value)
                                                            }
                                                            className="text-sm border-none bg-transparent focus:ring-1 focus:ring-primary-500 rounded px-2 py-1 outline-none font-semibold text-text-default"
                                                            placeholder="שם התוצאה (למשל: אין מענה)"
                                                        />

                                                        <select
                                                            value={outcome.actionType}
                                                            onChange={(e) =>
                                                                handleUpdateOutcome(
                                                                    stage.id,
                                                                    outcome.id,
                                                                    'actionType',
                                                                    e.target.value as StageOutcome['actionType'],
                                                                )
                                                            }
                                                            className="text-sm border border-border-default rounded-md bg-bg-input px-2 py-1 outline-none focus:border-primary-500"
                                                        >
                                                            <option value="stay">השאר בשלב</option>
                                                            <option value="move">עבור לשלב...</option>
                                                            <option value="freeze">הקפאה</option>
                                                            <option value="close">סגירת תהליך</option>
                                                        </select>

                                                        {outcome.actionType === 'move' ? (
                                                            <select
                                                                value={outcome.targetStageId || ''}
                                                                onChange={(e) =>
                                                                    handleUpdateOutcome(
                                                                        stage.id,
                                                                        outcome.id,
                                                                        'targetStageId',
                                                                        e.target.value,
                                                                    )
                                                                }
                                                                className="text-sm border border-border-default rounded-md bg-bg-input px-2 py-1 outline-none focus:border-primary-500"
                                                            >
                                                                <option value="" disabled>
                                                                    בחר שלב יעד
                                                                </option>
                                                                {buildMoveTargetOptions(activePipeline.stages).map((option) => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        ) : outcome.actionType === 'close' ? (
                                                            <div className="text-xs text-text-muted px-2 py-1 border border-border-default rounded-md bg-bg-subtle/50">
                                                                יסגור / יפתח מחדש את האירוע (פעיל ↔ לא פעיל)
                                                            </div>
                                                        ) : (
                                                            <SlaDurationInput
                                                                value={outcome.autoFollowupDays || 0}
                                                                unit={outcome.autoFollowupUnit}
                                                                onValueChange={(value) =>
                                                                    handleUpdateOutcome(
                                                                        stage.id,
                                                                        outcome.id,
                                                                        'autoFollowupDays',
                                                                        value,
                                                                    )
                                                                }
                                                                onUnitChange={(unit) =>
                                                                    handleUpdateOutcome(
                                                                        stage.id,
                                                                        outcome.id,
                                                                        'autoFollowupUnit',
                                                                        unit,
                                                                    )
                                                                }
                                                                className="border-none bg-transparent px-0 py-0"
                                                                title="זמן לפולואפ"
                                                            />
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteOutcome(stage.id, outcome.id)}
                                                            className="p-1.5 text-text-subtle hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                                                            title="מחק תוצאה"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                        </div>

                                                        <OutcomeTriggerSection
                                                            trigger={outcome.trigger || { type: 'none' }}
                                                            onChange={(trigger) =>
                                                                handleUpdateOutcome(stage.id, outcome.id, 'trigger', trigger)
                                                            }
                                                            systemEventGroups={systemEventGroups}
                                                        />

                                                        <div className="mt-2 pt-3 border-t border-border-subtle">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <label className="text-xs font-bold text-text-muted">
                                                                    אוטומציות (פעולות נוספות):
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddAutomation(stage.id, outcome.id)}
                                                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                                                >
                                                                    <PlusIcon className="w-3 h-3" />
                                                                    הוסף אוטומציה
                                                                </button>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {(outcome.automations || []).length === 0 ? (
                                                                    <div className="text-xs text-text-muted italic py-1">
                                                                        לא הוגדרו אוטומציות
                                                                    </div>
                                                                ) : (
                                                                    (outcome.automations || []).map((automation) => (
                                                                        <OutcomeAutomationRow
                                                                            key={automation.id}
                                                                            automation={automation}
                                                                            pipelines={pipelines}
                                                                            recruitmentStatuses={recruitmentStatuses}
                                                                            emailTemplates={
                                                                                emailTemplates.length > 0
                                                                                    ? emailTemplates
                                                                                    : FALLBACK_TEMPLATES
                                                                            }
                                                                            smsTemplates={
                                                                                smsTemplates.length > 0
                                                                                    ? smsTemplates
                                                                                    : FALLBACK_TEMPLATES
                                                                            }
                                                                            onChange={(next) =>
                                                                                handleUpdateAutomation(
                                                                                    stage.id,
                                                                                    outcome.id,
                                                                                    automation.id,
                                                                                    next,
                                                                                )
                                                                            }
                                                                            onDelete={() =>
                                                                                handleDeleteAutomation(
                                                                                    stage.id,
                                                                                    outcome.id,
                                                                                    automation.id,
                                                                                )
                                                                            }
                                                                        />
                                                                    ))
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!stage.outcomes || stage.outcomes.length === 0) && (
                                                    <div className="text-center py-4 text-sm text-text-muted italic bg-white rounded-lg border border-border-default border-dashed">
                                                        לא הוגדרו תוצאות אינטראקציה לשלב זה
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex gap-3 text-sm text-blue-800">
                             <div className="bg-blue-100 p-1.5 rounded-full h-fit"><CheckCircleIcon className="w-5 h-5 text-blue-600"/></div>
                             <div>
                                 <strong>טיפ:</strong> סדר השלבים משפיע על תצוגת הלוח (Kanban). שלבים עם אותו צבע יופיעו באותה עמודה בלוח. גרור את השלבים כדי לשנות את הסדר.
                                 הגדרת "SLA" תצבע {isCandidateKind ? 'מועמדים' : 'פריטים'} בלוח באדום כאשר הם חורגים מהזמן המוגדר.
                             </div>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-text-muted">
                        בחר תהליך מהרשימה לעריכה
                    </div>
                )}
                </div>
            </div>
            </div>

            <AddPipelineModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSave={handleAddPipeline}
                saving={saving}
            />
        </div>
    );
};

export default PipelineSettingsView;
