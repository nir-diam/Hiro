import React, { useMemo, useState } from 'react';
import { XMarkIcon, CheckCircleIcon } from './Icons';
import { automationActionLabel, type PendingAutomationRow } from '../utils/automationApproval';

export type AutomationApprovalModalProps = {
  isOpen: boolean;
  outcomeName?: string;
  pending: PendingAutomationRow[];
  onClose: () => void;
  onApprove: (automationIds: string[]) => Promise<void>;
};

const AutomationApprovalModal: React.FC<AutomationApprovalModalProps> = ({
  isOpen,
  outcomeName,
  pending,
  onClose,
  onApprove,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => pending.filter((p) => p.automationId), [pending]);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set(rows.map((r) => r.automationId)));
    setError(null);
    setSaving(false);
  }, [isOpen, rows]);

  if (!isOpen || rows.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApprove = async () => {
    const ids = rows.map((r) => r.automationId).filter((id) => selected.has(id));
    if (!ids.length) {
      setError('יש לבחור לפחות אוטומציה אחת לאישור');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onApprove(ids);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'אישור האוטומציה נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[10100] flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border-default overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-approval-title"
      >
        <header className="p-5 border-b border-border-default flex items-start justify-between gap-3 bg-primary-50/40">
          <div>
            <h2 id="automation-approval-title" className="text-lg font-bold text-text-default">
              אישור אוטומציה ידני
            </h2>
            <p className="text-sm text-text-muted mt-1">
              {outcomeName ? `לאחר התוצאה "${outcomeName}" — ` : ''}
              האם לאשר את ביצוע האוטומציות הבאות?
            </p>
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

        <div className="p-5 space-y-3 max-h-[min(60vh,24rem)] overflow-y-auto custom-scrollbar">
          {rows.map((row) => {
            const checked = selected.has(row.automationId);
            return (
              <label
                key={row.automationId}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  checked ? 'border-primary-300 bg-primary-50/50' : 'border-border-default bg-white hover:bg-bg-subtle/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(row.automationId)}
                  className="mt-1 rounded border-border-default text-primary-600 focus:ring-primary-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-text-default">
                    {automationActionLabel(row.actionType)}
                  </span>
                  {row.recipientLabels?.length ? (
                    <span className="block text-sm text-text-default mt-1">
                      <span className="font-semibold text-text-muted">נמענים: </span>
                      {row.recipientLabels.join(' · ')}
                    </span>
                  ) : null}
                  {row.templateName || row.templateId ? (
                    <span className="block text-sm text-text-default mt-0.5">
                      <span className="font-semibold text-text-muted">תבנית: </span>
                      {row.templateName || row.templateId}
                    </span>
                  ) : null}
                  {row.statusName ? (
                    <span className="block text-sm text-text-default mt-0.5">
                      <span className="font-semibold text-text-muted">סטטוס: </span>
                      {row.statusName}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>

        {error ? (
          <div className="px-5 pb-2">
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          </div>
        ) : null}

        <footer className="p-5 border-t border-border-default flex flex-wrap items-center justify-end gap-2 bg-bg-subtle/30">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-muted hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            ביטול — לא לאשר
          </button>
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={saving || selected.size === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <CheckCircleIcon className="w-5 h-5" />
            {saving ? 'מאשר...' : 'אשר ובצע'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AutomationApprovalModal;
