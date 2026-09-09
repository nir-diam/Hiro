import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { XMarkIcon, InformationCircleIcon } from './Icons';
import type { OutcomeAutomation, PipelineDto } from '../services/pipelinesApi';
import type { MessageTemplateDto } from '../services/messageTemplatesApi';
import { outcomeActionSubtitle } from '../utils/processOutcomeSla';
import {
  describeOutcomeAutomations,
  type DescribeAutomationContext,
} from '../utils/outcomeAutomationDescriptions';

type OutcomeLike = {
  title: string;
  actionType: 'stay' | 'move' | 'freeze' | 'close';
  autoFollowupDays?: number;
  autoFollowupUnit?: string;
  targetStageId?: string;
  automations?: unknown[];
  trigger?: { type?: string };
};

export type OutcomeAutomationsInfoModalProps = {
  isOpen: boolean;
  outcome: OutcomeLike | null;
  /** When set without `outcome`, shows all stage outcomes and their automations. */
  stageOutcomes?: OutcomeLike[] | null;
  stageLabel?: string | null;
  pipelineLabel?: string | null;
  pipelineKind?: 'client' | 'candidate' | null;
  stages?: PipelineDto['stages'];
  templates?: MessageTemplateDto[];
  pipelines?: PipelineDto[];
  onClose: () => void;
  overlayZIndexClass?: string;
};

function settingsGuideForPipeline(
  pipelineKind: 'client' | 'candidate' | null | undefined,
): { menuLabel: string; path: string; wrongPlaceHint: string | null } {
  if (pipelineKind === 'candidate') {
    return {
      menuLabel: 'תהליכי מועמדים',
      path: '/settings/candidate-pipelines',
      wrongPlaceHint: 'זהו תהליך גיוס מועמד — הפעולות מוגדרות ב«תהליכי מועמדים», לא ב«תהליכי עבודה» (שזה ללקוחות).',
    };
  }
  return {
    menuLabel: 'תהליכי עבודה',
    path: '/settings/pipelines',
    wrongPlaceHint: null,
  };
}

function isGenericStageLabel(name: string | null | undefined): boolean {
  const n = String(name || '').trim().toLowerCase();
  return n === 'שלב חדש' || n === 'new stage' || n === 'new step';
}

const OutcomeAutomationsInfoModal: React.FC<OutcomeAutomationsInfoModalProps> = ({
  isOpen,
  outcome,
  stageOutcomes = null,
  stageLabel,
  pipelineLabel,
  pipelineKind = null,
  stages = [],
  templates = [],
  pipelines = [],
  onClose,
  overlayZIndexClass = 'z-[10100]',
}) => {
  const ctx: DescribeAutomationContext = useMemo(
    () => ({ templates, pipelines }),
    [templates, pipelines],
  );

  const isStageOverview = !outcome && stageOutcomes !== null;

  const automationLines = useMemo(() => {
    if (!outcome) return [];
    return describeOutcomeAutomations(outcome.automations as OutcomeAutomation[] | undefined, ctx);
  }, [outcome, ctx]);

  const stageOverviewItems = useMemo(() => {
    if (!isStageOverview || !stageOutcomes) return [];
    return stageOutcomes.map((item) => ({
      outcome: item,
      actionSummary: outcomeActionSubtitle(item, stages || []),
      automationLines: describeOutcomeAutomations(
        item.automations as OutcomeAutomation[] | undefined,
        ctx,
      ),
    }));
  }, [isStageOverview, stageOutcomes, stages, ctx]);

  if (!isOpen || (!outcome && !isStageOverview)) return null;

  const settingsGuide = settingsGuideForPipeline(pipelineKind);
  const actionSummary = outcome ? outcomeActionSubtitle(outcome, stages || []) : '';

  return (
    <div
      className={`fixed inset-0 bg-black/60 ${overlayZIndexClass} flex items-center justify-center p-4 backdrop-blur-sm`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border-default overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-automations-info-title"
      >
        <header className="p-5 border-b border-border-default flex items-start justify-between gap-3 bg-blue-50/50">
          <div className="min-w-0">
            <h2
              id="outcome-automations-info-title"
              className="text-lg font-bold text-text-default flex items-center gap-2"
            >
              <InformationCircleIcon className="w-5 h-5 text-blue-600 shrink-0" />
              {isStageOverview ? 'פעולות ואוטומציות לשלב' : 'מה יקרה בפעולה זו?'}
            </h2>
            {outcome ? (
              <p className="text-sm font-semibold text-text-default mt-2">{outcome.title}</p>
            ) : null}
            {(stageLabel || pipelineLabel) ? (
              <p className={`text-xs text-text-muted ${outcome ? 'mt-0.5' : 'mt-2'}`}>
                {[stageLabel, pipelineLabel].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors shrink-0"
            aria-label="סגור"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-4 max-h-[min(60vh,24rem)] overflow-y-auto custom-scrollbar">
          {isStageOverview ? (
            stageOverviewItems.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-text-muted leading-relaxed">
                  ליד כל פעולה בלוח הימני יש כפתור ℹ️ — כאן מוצגות כל התוצאות המוגדרות לשלב ומה יקרה
                  בכל אחת (מייל, SMS, שינוי סטטוס ועוד).
                </p>
                {stageOverviewItems.map((item) => (
                  <div
                    key={item.outcome.title}
                    className="rounded-xl border border-border-default bg-white overflow-hidden"
                  >
                    <div className="px-3 py-2.5 bg-bg-subtle/50 border-b border-border-subtle">
                      <p className="text-sm font-bold text-text-default">{item.outcome.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{item.actionSummary}</p>
                    </div>
                    <div className="px-3 py-2.5">
                      {item.automationLines.length > 0 ? (
                        <ul className="space-y-1.5">
                          {item.automationLines.map((line, index) => (
                            <li key={`${item.outcome.title}-${index}`} className="text-sm text-text-default leading-relaxed">
                              {index + 1}. {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-text-muted">
                          לא הוגדרו אוטומציות — בלחיצה יתבצע רק שינוי השלב/סטטוס לפי הגדרת התוצאה.
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-text-default leading-relaxed">
                  הלוח הימני מציג <strong>פעולות שאת/ה מגדיר/ה מראש</strong> (למשל «הועבר לראיון», «אין
                  מענה»). המערכת לא מציעה פעולות מעצמה — רק מציגה מה שהוגדר בהגדרות.
                </p>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950 leading-relaxed">
                  <p className="font-bold mb-1">למה אין כאן כפתורי פעולה?</p>
                  <p>
                    לשלב{' '}
                    <strong>{stageLabel || 'זה'}</strong>
                    {pipelineLabel ? (
                      <>
                        {' '}
                        בתהליך <strong>{pipelineLabel}</strong>
                      </>
                    ) : null}{' '}
                    לא הוגדרה אף «תוצאה» — לכן אין מה להציג, וגם אין ℹ️ ליד כל פעולה.
                  </p>
                </div>
                {settingsGuide.wrongPlaceHint ? (
                  <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
                    {settingsGuide.wrongPlaceHint}
                  </p>
                ) : null}
                <div className="text-sm text-text-default bg-white border border-border-default rounded-xl px-3 py-4 leading-relaxed space-y-2">
                  <p className="font-bold">איך מוסיפים פעולות שיופיעו כאן?</p>
                  <p className="text-text-muted text-sm">
                    לא צריך ליצור שלב חדש — השתמש/י בשלבים שכבר קיימים (למשל 01, 02…). לחץ/י על החץ
                    ליד השלב → <strong>«הוסף תוצאה»</strong>.
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-text-muted">
                    <li>
                      עבור/י ל<strong>הגדרות → {settingsGuide.menuLabel}</strong>
                    </li>
                    {pipelineLabel ? (
                      <li>
                        בחר/י את התהליך <strong>{pipelineLabel}</strong>
                      </li>
                    ) : (
                      <li>בחר/י את התהליך הרלוונטי</li>
                    )}
                    {stageLabel ? (
                      <li>
                        פתח/י את השלב <strong>{stageLabel}</strong> (לחיצה על החץ בצד)
                      </li>
                    ) : (
                      <li>פתח/י את השלב הרלוונטי</li>
                    )}
                    <li>
                      לחץ/י <strong>«הוסף תוצאה»</strong>, תן/י שם (למשל «נקבע ראיון») והגדר/י אוטומציות
                      (מייל, SMS וכו')
                    </li>
                    <li>שמור/י — הפעולות יופיעו בלוח הימני, וליד כל אחת יהיה ℹ️ עם פירוט האוטומציות</li>
                  </ol>
                  {stageLabel && isGenericStageLabel(stageLabel) ? (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                      נראה שהמערכת זיהתה שלב ברירת מחדל «{stageLabel}» — מומלץ למחוק אותו ולהוסיף תוצאות
                      לשלבים האמיתיים (01, 02…).
                    </p>
                  ) : null}
                </div>
                <Link
                  to={settingsGuide.path}
                  onClick={onClose}
                  className="inline-flex w-full items-center justify-center px-4 py-2.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                >
                  פתח/י {settingsGuide.menuLabel}
                </Link>
              </div>
            )
          ) : (
            <>
              <div className="rounded-xl border border-border-default bg-bg-subtle/40 p-3">
                <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-1">פעולת התוצאה</p>
                <p className="text-sm text-text-default">{actionSummary}</p>
              </div>

              {automationLines.length > 0 ? (
                <div>
                  <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">
                    אוטומציות שיופעלו
                  </p>
                  <ul className="space-y-2">
                    {automationLines.map((line, index) => (
                      <li
                        key={`${index}-${line.slice(0, 24)}`}
                        className="text-sm text-text-default bg-white border border-border-default rounded-xl px-3 py-2.5 leading-relaxed"
                      >
                        {index + 1}. {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-text-muted bg-white border border-dashed border-border-default rounded-xl px-3 py-4 text-center">
                  לתוצאה זו לא הוגדרו אוטומציות — בלחיצה יתבצע רק שינוי השלב/סטטוס לפי הגדרת התוצאה.
                </p>
              )}

              {outcome?.trigger?.type === 'system_event' ? (
                <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 leading-relaxed">
                  חלק מההגדרות בתהליך זה מקושרות לאירועי מערכת. האוטומציות המוצגות למעלה יופעלו בעת ביצוע
                  הפעולה הידנית.
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-border-default bg-white hover:bg-bg-hover transition-colors"
          >
            סגור
          </button>
          {!outcome && isStageOverview && stageOverviewItems.length === 0 ? null : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-bold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            >
              הבנתי
            </button>
          )}
        </footer>
      </div>
    </div>
  );
};

export default OutcomeAutomationsInfoModal;
