import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, TargetIcon, CheckCircleIcon } from './Icons';
import {
  shortJobStructuralWeightTooltipHe,
  weightToFilledBarCountJobBands,
  type WeightBarFilled,
} from '../utils/tagWeightDisplay';

export type TagMatchChipState = 'match' | 'gap' | 'neutral';

export interface TagMatchJobChip {
  label: string;
  state: TagMatchChipState;
  /** Candidate pool matches this job requirement (any mode — used for category header red/green). */
  satisfiesRequirement: boolean;
  /** Structural importance on the job requirement row (three-bar display). */
  jobStructuralWeight: number;
  /** Weight was inferred (no calculated_weight on skill row). */
  jobWeightEstimated?: boolean;
}

export interface TagMatchCandidateTag {
  label: string;
  matchesJob: boolean;
}

export interface TagMatchCategory {
  name: string;
  /** Internal category key — used for tone logic (e.g. 'language' uses all-must-match). */
  key?: string;
  chips: TagMatchJobChip[];
  candidateTags: TagMatchCandidateTag[];
}

interface TagMatchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Job title */
  title: string;
  /** Client / company name */
  subtitle?: string;
  categories: TagMatchCategory[];
}

function TagMatchCategoryFailIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function candidateChipClass(matchesJob: boolean): string {
  return matchesJob
    ? 'bg-green-50 border-green-200 text-green-700'
    : 'bg-white border-border-default text-text-default';
}

const WEIGHT_BAR_HEIGHTS = ['h-1.5', 'h-2.5', 'h-3.5'] as const;
const WEIGHT_BAR_COLORS = ['bg-primary-400', 'bg-primary-500', 'bg-primary-600'] as const;

function TagWeightBars({
  filled,
  className = '',
  title,
}: {
  filled: WeightBarFilled;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`flex items-end gap-[1.5px] h-3 shrink-0 mr-2 ${className}`} title={title} aria-hidden>
      {WEIGHT_BAR_HEIGHTS.map((h, i) => {
        const active = filled >= i + 1;
        return (
          <div
            key={i}
            className={`w-[3px] rounded-full ${h} ${active ? WEIGHT_BAR_COLORS[i] : 'bg-border-subtle'}`}
          />
        );
      })}
    </div>
  );
}

function categoryCardTone(chips: TagMatchJobChip[], categoryKey?: string): 'red' | 'green' | 'neutral' {
  if (!chips.length) return 'neutral';
  if (categoryKey === 'language') {
    // Language: ALL required tags must be matched
    return chips.every((c) => c.satisfiesRequirement) ? 'green' : 'red';
  }
  // All other categories: at least one match → green
  const anySatisfied = chips.some((c) => c.satisfiesRequirement);
  return anySatisfied ? 'green' : 'red';
}

const TagMatchPanel: React.FC<TagMatchPanelProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  categories,
}) => {
  if (!isOpen) return null;

  const root = typeof document !== 'undefined' ? document.body : null;

  const overlay = (
    <div
      className="fixed inset-0 bg-black/30 z-[10085] transition-opacity"
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="fixed top-0 left-0 h-full w-[400px] max-w-full bg-slate-50 shadow-2xl flex flex-col transform transition-transform"
        style={{ animation: '0.3s ease 0s 1 normal forwards running slideInLeft' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-match-panel-heading"
      >
        <header className="p-5 border-b border-border-subtle flex justify-between items-start bg-white shrink-0">
          <div>
            <h2
              id="tag-match-panel-heading"
              className="text-xl font-extrabold text-text-default flex items-center gap-2"
            >
              <TargetIcon className="w-5 h-5 text-primary-600 shrink-0" />
              פירוט התאמת תגיות
            </h2>
            {title ? (
              <h3 className="text-sm font-semibold text-text-muted mt-1">{title}</h3>
            ) : null}
            {subtitle ? <p className="text-xs text-text-subtle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-bg-subtle rounded-full text-text-muted transition-colors shrink-0"
            aria-label="סגור"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {(categories || []).length === 0 ? (
            <p className="text-sm text-text-muted text-center py-12">אין נתונים להצגה</p>
          ) : (
            <>
              <div className="mb-4 bg-primary-50/50 rounded-xl p-3.5 border border-primary-100/50">
                <p className="text-xs font-bold text-primary-800 mb-2">
                  מקרא חיוניות תגית (תגיות משרה):
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <TagWeightBars
                      filled={1}
                      className="mr-0 w-4 justify-center border border-primary-100/0"
                    />
                    <span>חיוניות נמוכה (משקל &lt; 0.85)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <TagWeightBars
                      filled={2}
                      className="mr-0 w-4 justify-center border border-primary-100/0"
                    />
                    <span>חיוניות בינונית (משקל 0.85 - 1.04)</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    <TagWeightBars
                      filled={3}
                      className="mr-0 w-4 justify-center border border-primary-100/0"
                    />
                    <span>חיוניות גבוהה (משקל 1.05 ומעלה)</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {categories.map((cat, idx) => {
                  const jobList = Array.isArray(cat.chips) ? cat.chips : [];
                  const candList = Array.isArray(cat.candidateTags) ? cat.candidateTags : [];
                  const tone = categoryCardTone(jobList, cat.key);
                  const shell =
                    tone === 'red'
                      ? 'p-4 rounded-xl border border-red-100 bg-red-50/50'
                      : tone === 'green'
                        ? 'p-4 rounded-xl border border-green-100 bg-green-50/50'
                        : 'p-4 rounded-xl border border-border-default bg-white';
                  const heading =
                    tone === 'red'
                      ? 'font-bold text-sm text-red-700'
                      : tone === 'green'
                        ? 'font-bold text-sm text-green-700'
                        : 'font-bold text-sm text-text-default';

                  return (
                    <div key={`${cat.name}-${idx}`} className={`${shell} min-w-0`}>
                      <div className="flex items-center justify-between mb-3 border-b border-black/5 pb-2">
                        <h4 className={heading}>{cat.name}</h4>
                        {tone === 'green' ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-500 shrink-0" />
                        ) : tone === 'red' ? (
                          <TagMatchCategoryFailIcon className="w-5 h-5 text-red-500 shrink-0" />
                        ) : null}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-text-muted uppercase mb-1.5 tracking-wide">
                            תגיות משרה
                          </p>
                          <ul className="space-y-1.5">
                            {jobList.length > 0 ? (
                              jobList.map((chip, ci) => {
                                const w = chip.jobStructuralWeight;
                                const filled = weightToFilledBarCountJobBands(w);
                                const barTitle = shortJobStructuralWeightTooltipHe(w);
                                return (
                                  <li
                                    key={`${idx}-j-${ci}-${chip.label}`}
                                    className="flex items-center justify-between text-xs bg-white border border-border-default px-2 py-1.5 rounded-lg shadow-sm text-text-default font-medium break-words leading-tight gap-1"
                                  >
                                    <span className="min-w-0">{chip.label}</span>
                                    <TagWeightBars filled={filled} title={barTitle} />
                                  </li>
                                );
                              })
                            ) : (
                              <li className="text-xs text-text-muted italic px-2 py-1">אין תגיות</li>
                            )}
                          </ul>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-text-muted uppercase mb-1.5 tracking-wide">
                            תגיות המועמד
                          </p>
                          <ul className="space-y-1.5">
                            {candList.length > 0 ? (
                              candList.map((tag, ti) => (
                                <li
                                  key={`${idx}-c-${ti}-${tag.label}`}
                                  className={`text-xs px-2 py-1.5 border rounded-lg shadow-sm font-medium break-words leading-tight ${candidateChipClass(tag.matchesJob)}`}
                                >
                                  {tag.label}
                                </li>
                              ))
                            ) : (
                              <li className="text-xs text-text-muted italic px-2 py-1">אין תגיות</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes slideInLeft {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    </div>
  );

  return root ? createPortal(overlay, root) : overlay;
};

export default TagMatchPanel;
