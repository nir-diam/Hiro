import React from 'react';
import { XMarkIcon } from './Icons';
import {
  cycleScanTagMode,
  isRoleScanTag,
  type ScanSkillTag,
  type ScanSkillTagMode,
} from '../utils/scanSkillTags';

function modeChipClass(mode: ScanSkillTagMode): string {
  if (mode === 'mandatory') {
    return 'border-[3px] border-green-500 ring-2 ring-green-400/70 shadow-[0_0_0_1px_rgba(34,197,94,0.45)] bg-primary-50/40 text-primary-700 font-bold';
  }
  if (mode === 'negative') {
    return 'border-[3px] border-red-500 ring-2 ring-red-400/60 bg-red-50/50 text-red-800 font-bold';
  }
  return 'border border-border-default bg-bg-subtle/80 text-text-default font-semibold';
}

const ScanSkillTagsEditor: React.FC<{
  tags: ScanSkillTag[];
  onChange: (tags: ScanSkillTag[]) => void;
  disabled?: boolean;
}> = ({ tags, onChange, disabled }) => {
  if (!tags.length) return null;

  const patchTag = (id: string, patch: Partial<ScanSkillTag>) => {
    onChange(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTag = (id: string) => {
    onChange(tags.filter((t) => t.id !== id));
  };

  const bump = (id: string, field: 'years_experience' | 'lookback_years', delta: number) => {
    const tag = tags.find((t) => t.id === id);
    if (!tag) return;
    const cur = tag[field];
    const base = typeof cur === 'number' && Number.isFinite(cur) ? cur : 0;
    const next = Math.max(0, base + delta);
    patchTag(id, { [field]: next > 0 ? next : null });
  };

  return (
    <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pe-0.5">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div key={tag.id} className="relative inline-flex group/tag max-w-full">
            <div
              role="button"
              tabIndex={disabled ? -1 : 0}
              title="לחץ לשינוי: רגיל / חובה / שלילי"
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  patchTag(tag.id, { mode: cycleScanTagMode(tag.mode) });
                }
              }}
              onClick={() => {
                if (disabled) return;
                patchTag(tag.id, { mode: cycleScanTagMode(tag.mode) });
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] transition-all select-none whitespace-nowrap max-w-full ${modeChipClass(
                tag.mode,
              )} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}`}
            >
              {isRoleScanTag(tag) ? (
                <>
                  <span className="flex items-center gap-0.5 shrink-0" title="שנות ניסיון">
                    <span className="text-[9px] text-text-muted">ניסיון</span>
                    <button
                      type="button"
                      disabled={disabled}
                      className="w-3 h-3.5 text-[7px] leading-none text-text-subtle hover:text-primary-700 disabled:opacity-30"
                      aria-label="שנות ניסיון: הוסף"
                      onClick={(e) => {
                        e.stopPropagation();
                        bump(tag.id, 'years_experience', 1);
                      }}
                    >
                      ▶
                    </button>
                    <span className="min-w-[0.75rem] text-center text-[10px] font-bold tabular-nums">
                      {tag.years_experience ?? '—'}
                    </span>
                    <button
                      type="button"
                      disabled={disabled || !(tag.years_experience && tag.years_experience > 0)}
                      className="w-3 h-3.5 text-[7px] leading-none text-text-subtle hover:text-primary-700 disabled:opacity-30"
                      aria-label="שנות ניסיון: הפחת"
                      onClick={(e) => {
                        e.stopPropagation();
                        bump(tag.id, 'years_experience', -1);
                      }}
                    >
                      ◀
                    </button>
                  </span>
                  <span className="h-3 border-r border-border-default/80" aria-hidden />
                </>
              ) : null}
              <span className="truncate max-w-[10rem]">{tag.name}</span>
              {isRoleScanTag(tag) ? (
                <>
                  <span className="h-3 border-r border-border-default/80" aria-hidden />
                  <span className="flex items-center gap-0.5 shrink-0" title="טווח זמן אחורה (שנים)">
                    <span className="text-[9px] text-text-muted">אחורה</span>
                    <button
                      type="button"
                      disabled={disabled}
                      className="w-3 h-3.5 text-[7px] leading-none text-text-subtle hover:text-primary-700 disabled:opacity-30"
                      aria-label="אחורה: הוסף"
                      onClick={(e) => {
                        e.stopPropagation();
                        bump(tag.id, 'lookback_years', 1);
                      }}
                    >
                      ▶
                    </button>
                    <span className="min-w-[0.75rem] text-center text-[10px] font-bold tabular-nums">
                      {tag.lookback_years ?? '—'}
                    </span>
                    <button
                      type="button"
                      disabled={disabled || !(tag.lookback_years && tag.lookback_years > 0)}
                      className="w-3 h-3.5 text-[7px] leading-none text-text-subtle hover:text-primary-700 disabled:opacity-30"
                      aria-label="אחורה: הפחת"
                      onClick={(e) => {
                        e.stopPropagation();
                        bump(tag.id, 'lookback_years', -1);
                      }}
                    >
                      ◀
                    </button>
                  </span>
                </>
              ) : null}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeTag(tag.id)}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full border border-white bg-white text-gray-500 flex items-center justify-center opacity-0 group-hover/tag:opacity-100 transition z-[1] disabled:opacity-0"
              aria-label="הסר תגית מהסריקה"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScanSkillTagsEditor;
