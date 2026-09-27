import React from 'react';
import { ClockIcon, XMarkIcon } from './Icons';

export type DuplicateProcessSummary = {
  id: string;
  title: string;
  stage: string;
  status: string;
  owner: string;
  dateLabel: string;
};

type Props = {
  isOpen: boolean;
  processName: string;
  organizationName?: string;
  existingEvents: DuplicateProcessSummary[];
  onGoToExisting: () => void;
  onCreateAnyway: () => void;
  onClose: () => void;
};

const DuplicateProcessPromptModal: React.FC<Props> = ({
  isOpen,
  processName,
  organizationName,
  existingEvents,
  onGoToExisting,
  onCreateAnyway,
  onClose,
}) => {
  if (!isOpen || !existingEvents.length) return null;

  const primaryStatus = existingEvents[0]?.status || 'פעיל';

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[10090] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
      dir="rtl"
    >
      <div
        className="bg-bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border-default overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-process-title"
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-border-default">
          <div className="flex items-start gap-3">
            <ClockIcon className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h3 id="duplicate-process-title" className="text-lg font-bold text-text-default">
                כבר קיים תהליך מסוג «{processName || 'תהליך'}»
              </h3>
              <p className="text-sm text-text-muted mt-1 leading-relaxed">
                נמצא{existingEvents.length > 1 ? 'ו' : ''} {existingEvents.length} תהליך
                {existingEvents.length > 1 ? 'ים' : ''} פעיל{existingEvents.length > 1 ? 'ים' : ''} מאותו סוג
                {organizationName ? ` בארגון «${organizationName}»` : ''}
                {primaryStatus ? ` (סטטוס: ${primaryStatus})` : ''}.
                מומלץ לעבור לתהליך הקיים ולעדכן שם.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-text-muted hover:bg-bg-hover"
            aria-label="סגור"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>

        <div className="p-5 space-y-3 max-h-[40vh] overflow-y-auto">
          {existingEvents.map((event) => (
            <div
              key={event.id}
              className="rounded-xl border border-border-default bg-bg-subtle/40 p-3 text-sm"
            >
              <p className="font-semibold text-text-default">{event.title}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-text-muted">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-subtle">שלב</dt>
                  <dd className="font-medium text-text-default">{event.stage || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-subtle">סטטוס</dt>
                  <dd className="font-medium text-text-default">{event.status || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-subtle">בעלים</dt>
                  <dd className="font-medium text-text-default">{event.owner || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-subtle">תאריך</dt>
                  <dd className="font-medium text-text-default">{event.dateLabel || '—'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        <footer className="flex flex-col-reverse sm:flex-row gap-2 p-5 border-t border-border-default bg-bg-subtle/30">
          <button
            type="button"
            onClick={onCreateAnyway}
            className="flex-1 px-4 py-2.5 text-sm font-semibold text-text-muted bg-white border border-border-default rounded-xl hover:bg-bg-hover transition-colors"
          >
            פתח תהליך חדש בכל זאת
          </button>
          <button
            type="button"
            onClick={onGoToExisting}
            className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 shadow-sm transition-colors"
          >
            עבור לתהליך הקיים
          </button>
        </footer>
      </div>
    </div>
  );
};

export default DuplicateProcessPromptModal;
