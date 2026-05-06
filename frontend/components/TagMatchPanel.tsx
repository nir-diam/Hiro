import React from 'react';
import { XMarkIcon, CheckCircleIcon, NoSymbolIcon } from './Icons';

export interface TagMatchCategory {
  name: string;
  status?: 'match' | 'gap' | 'grayed';
  jobTags?: string[];
  candidateTags?: string[];
}

interface TagMatchPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  categories: TagMatchCategory[];
}

const TagMatchPanel: React.FC<TagMatchPanelProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  categories,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-bg-card w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30 shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-lg text-text-default truncate">{title}</h3>
            {subtitle ? <p className="text-sm text-text-muted truncate">{subtitle}</p> : null}
            <p className="text-xs text-text-muted mt-1">פירוט ניתוח סינון</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-bg-hover rounded-full text-text-muted shrink-0"
            aria-label="סגור"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </header>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {(categories || []).length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">אין נתונים להצגה</p>
          ) : (
            categories.map((cat, idx) => {
              const isGap = cat.status === 'gap';
              const isMatch = cat.status === 'match';
              return (
                <section
                  key={`${cat.name}-${idx}`}
                  className="rounded-xl border border-border-default bg-bg-subtle/25 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm text-text-default">{cat.name}</h4>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isMatch
                          ? 'bg-green-100 text-green-800'
                          : isGap
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-bg-hover text-text-muted'
                      }`}
                    >
                      {isMatch ? (
                        <>
                          <CheckCircleIcon className="w-3.5 h-3.5" /> עומד
                        </>
                      ) : isGap ? (
                        <>
                          <NoSymbolIcon className="w-3.5 h-3.5" /> לא עומד
                        </>
                      ) : (
                        'לא ידוע'
                      )}
                    </span>
                  </div>
                  {Array.isArray(cat.jobTags) && cat.jobTags.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-text-muted mb-1">משרה</p>
                      <div className="flex flex-wrap gap-1">
                        {cat.jobTags.map((x) => (
                          <span
                            key={x}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-white border border-border-default"
                          >
                            {x}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {Array.isArray(cat.candidateTags) && cat.candidateTags.length > 0 ? (
                    <div>
                      <p className="text-[10px] font-bold uppercase text-text-muted mb-1">מועמד</p>
                      <div className="flex flex-wrap gap-1">
                        {cat.candidateTags.map((x) => (
                          <span
                            key={x}
                            className="text-[11px] px-2 py-0.5 rounded-md bg-primary-50 border border-primary-100 text-primary-900"
                          >
                            {x}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>

        <footer className="p-4 border-t border-border-default flex justify-end bg-bg-subtle/20 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl transition-colors"
          >
            סגירה
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TagMatchPanel;
