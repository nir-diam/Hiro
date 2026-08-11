import React, { useEffect, useRef, useState } from 'react';
import {
  XMarkIcon,
  DocumentTextIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ListBulletIcon,
  ListNumberIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  UndoIcon,
  RedoIcon,
  PhotoIcon,
} from './Icons';
import {
  fetchProposalTemplates,
  type ProposalDto,
  type ProposalStatus,
  type ProposalTemplateDto,
  PROPOSAL_STATUS_LABELS,
} from '../services/proposalsApi';

export type ProposalModalSavePayload = {
  id?: string;
  number?: string;
  date: string;
  validUntil: string;
  currency: string;
  amount: number;
  vatRate: number;
  includeVat: boolean;
  closeProbability: number | null;
  status: ProposalStatus;
  templateId: string | null;
  contentHtml: string;
  notes: string;
  clientId?: string;
  contactId?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ProposalModalSavePayload) => void | Promise<void>;
  initialData?: Partial<ProposalDto> | null;
  clientId: string;
  contactId?: string | null;
  clientName?: string;
};

const emptyForm = (clientId: string, contactId?: string | null): ProposalModalSavePayload => ({
  date: new Date().toISOString().slice(0, 10),
  validUntil: '',
  currency: 'ILS',
  amount: 0,
  vatRate: 17,
  includeVat: true,
  closeProbability: null,
  status: 'draft',
  templateId: null,
  contentHtml: '',
  notes: '',
  clientId,
  contactId: contactId || null,
});

const ProposalModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  clientId,
  contactId,
  clientName,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState<ProposalModalSavePayload>(emptyForm(clientId, contactId));
  const [templates, setTemplates] = useState<ProposalTemplateDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    const base = emptyForm(clientId, contactId);
    if (initialData) {
      setForm({
        ...base,
        id: initialData.id,
        number: initialData.number,
        date: initialData.date || base.date,
        validUntil: initialData.validUntil || '',
        currency: initialData.currency || 'ILS',
        amount: Number(initialData.amount) || 0,
        vatRate: Number(initialData.vatRate ?? 17),
        includeVat: initialData.includeVat !== false,
        closeProbability:
          initialData.closeProbability == null ? null : Number(initialData.closeProbability),
        status: (initialData.status as ProposalStatus) || 'draft',
        templateId: initialData.templateId || null,
        contentHtml: initialData.contentHtml || '',
        notes: initialData.notes || '',
        clientId: initialData.clientId || clientId,
        contactId: initialData.contactId ?? contactId ?? null,
      });
    } else {
      setForm(base);
    }
    void fetchProposalTemplates(clientId)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [isOpen, initialData, clientId, contactId]);

  useEffect(() => {
    if (!isOpen || !editorRef.current) return;
    editorRef.current.innerHTML = form.contentHtml || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, form.id, form.templateId]);

  if (!isOpen) return null;

  const execCmd = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleInsertImage = () => {
    const url = window.prompt('הכנס כתובת תמונה (לוגו / חתימה):');
    if (url) execCmd('insertImage', url);
  };

  const applyTemplate = (templateId: string) => {
    const t = templates.find((x) => x.id === templateId);
    setForm((prev) => ({
      ...prev,
      templateId: templateId || null,
      contentHtml: t?.content || prev.contentHtml,
    }));
    if (editorRef.current && t) {
      editorRef.current.innerHTML = t.content || '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const contentHtml = editorRef.current?.innerHTML || form.contentHtml || '';
      await onSave({ ...form, contentHtml, clientId, contactId: form.contactId ?? contactId ?? null });
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/40" dir="rtl">
      <div className="bg-bg-card rounded-2xl shadow-2xl border border-border-default w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary-50 text-primary-600">
              <DocumentTextIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-text-default">
                {form.id ? 'עריכת הצעת מחיר' : 'הצעת מחיר חדשה'}
              </h2>
              {clientName ? (
                <p className="text-xs text-text-muted">{clientName}</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error ? (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          ) : null}

          <section className="space-y-4">
            <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider">פרטים כלליים</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">מספר הצעה</label>
                <input
                  type="text"
                  value={form.number || ''}
                  onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))}
                  placeholder="יוקצה אוטומטית"
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">תאריך</label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">תוקף עד</label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">סכום</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) || 0 }))}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">מטבע</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                >
                  <option value="ILS">₪ ILS</option>
                  <option value="USD">$ USD</option>
                  <option value="EUR">€ EUR</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">מע״מ %</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.vatRate}
                    onChange={(e) => setForm((p) => ({ ...p, vatRate: Number(e.target.value) || 0 }))}
                    className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                    dir="ltr"
                  />
                  <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={form.includeVat}
                      onChange={(e) => setForm((p) => ({ ...p, includeVat: e.target.checked }))}
                    />
                    כולל
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">סיכוי סגירה %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.closeProbability ?? ''}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      closeProbability: e.target.value === '' ? null : Number(e.target.value),
                    }))
                  }
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">סטטוס</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ProposalStatus }))}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                >
                  {(Object.keys(PROPOSAL_STATUS_LABELS) as ProposalStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {PROPOSAL_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">תבנית</label>
                <select
                  value={form.templateId || ''}
                  onChange={(e) => applyTemplate(e.target.value)}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm"
                >
                  <option value="">ללא תבנית</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-bold text-primary-700 uppercase tracking-wider">תוכן ההצעה</h3>
            <div className="border border-border-default rounded-xl overflow-hidden bg-white">
              <div className="flex items-center gap-1 border-b border-border-default p-2 bg-bg-subtle flex-wrap">
                <button type="button" onClick={() => execCmd('formatBlock', 'H1')} className="px-2 py-1 hover:bg-bg-hover rounded text-sm font-bold">H1</button>
                <button type="button" onClick={() => execCmd('formatBlock', 'H2')} className="px-2 py-1 hover:bg-bg-hover rounded text-sm font-bold">H2</button>
                <div className="w-px h-5 bg-border-default mx-1" />
                <button type="button" onClick={() => execCmd('bold')} className="p-1.5 hover:bg-bg-hover rounded"><BoldIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('italic')} className="p-1.5 hover:bg-bg-hover rounded"><ItalicIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('underline')} className="p-1.5 hover:bg-bg-hover rounded"><UnderlineIcon className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-border-default mx-1" />
                <button type="button" onClick={() => execCmd('insertUnorderedList')} className="p-1.5 hover:bg-bg-hover rounded"><ListBulletIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('insertOrderedList')} className="p-1.5 hover:bg-bg-hover rounded"><ListNumberIcon className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-border-default mx-1" />
                <button type="button" onClick={() => execCmd('justifyRight')} className="p-1.5 hover:bg-bg-hover rounded"><AlignRightIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('justifyCenter')} className="p-1.5 hover:bg-bg-hover rounded"><AlignCenterIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('justifyLeft')} className="p-1.5 hover:bg-bg-hover rounded"><AlignLeftIcon className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-border-default mx-1" />
                <button type="button" onClick={handleInsertImage} className="p-1.5 hover:bg-bg-hover rounded" title="הוסף תמונה"><PhotoIcon className="w-4 h-4" /></button>
                <div className="w-px h-5 bg-border-default mx-1" />
                <button type="button" onClick={() => execCmd('undo')} className="p-1.5 hover:bg-bg-hover rounded"><UndoIcon className="w-4 h-4" /></button>
                <button type="button" onClick={() => execCmd('redo')} className="p-1.5 hover:bg-bg-hover rounded"><RedoIcon className="w-4 h-4" /></button>
              </div>
              <div
                ref={editorRef}
                contentEditable
                dir="rtl"
                className="w-full p-4 outline-none text-sm leading-relaxed min-h-[220px] max-h-[360px] overflow-y-auto"
              />
            </div>
          </section>

          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1">הערות פנימיות</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border-default">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-text-muted hover:bg-bg-hover">
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-lg bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProposalModal;
