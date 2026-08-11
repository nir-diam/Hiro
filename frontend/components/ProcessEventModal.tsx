import React, { useEffect, useState } from 'react';
import { XMarkIcon } from './Icons';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { authHeaders } from '../utils/authHeaders';

export type ProcessEventSavePayload = {
  title: string;
  processId: string;
  processName: string;
  stageId: string;
  stageName: string;
  contactId?: string | null;
  contactName: string;
  clientName: string;
  assignee: string;
  priority: 'high' | 'medium' | 'low';
  slaDays: number;
  description: string;
};

type ContactOption = { id: string; name: string };

interface ProcessEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: ProcessEventSavePayload) => void | Promise<void>;
  clientId: string;
  clientName?: string;
  /** Pre-select contact when opened from contact profile */
  contactId?: string | null;
  contactName?: string;
  initialData?: Partial<ProcessEventSavePayload> | null;
}

const ProcessEventModal: React.FC<ProcessEventModalProps> = ({
  isOpen,
  onClose,
  onSave,
  clientId,
  clientName = '',
  contactId = null,
  contactName = '',
  initialData = null,
}) => {
  const apiBase = import.meta.env.VITE_API_BASE || '';
  const [pipelines, setPipelines] = useState<PipelineDto[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    processId: '',
    stageId: '',
    contactId: contactId || '',
    contactName: contactName || '',
    clientName: clientName || '',
    assignee: 'אני',
    priority: 'medium' as 'high' | 'medium' | 'low',
    slaDays: 3,
    description: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    setFormData({
      title: initialData?.title || '',
      processId: initialData?.processId || '',
      stageId: initialData?.stageId || '',
      contactId: initialData?.contactId || contactId || '',
      contactName: initialData?.contactName || contactName || '',
      clientName: initialData?.clientName || clientName || '',
      assignee: initialData?.assignee || 'אני',
      priority: initialData?.priority || 'medium',
      slaDays: initialData?.slaDays ?? 3,
      description: initialData?.description || '',
    });
    setError(null);
  }, [isOpen, initialData, clientName, contactId, contactName]);

  useEffect(() => {
    if (!isOpen || !clientId || !apiBase) return;
    let cancelled = false;
    setLoadingMeta(true);
    setError(null);

    Promise.all([
      fetchPipelines(clientId).catch(() => [] as PipelineDto[]),
      fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/contacts`, {
        credentials: 'include',
        headers: authHeaders(),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          const list = Array.isArray(data) ? data : data?.data ?? [];
          return list
            .map((c: { id?: string; name?: string }) => ({
              id: String(c.id || ''),
              name: String(c.name || '').trim(),
            }))
            .filter((c: ContactOption) => c.id && c.name);
        })
        .catch(() => [] as ContactOption[]),
    ])
      .then(([pls, cts]) => {
        if (cancelled) return;
        setPipelines(pls);
        setContacts(cts);
        setFormData((prev) => {
          const processId = prev.processId || pls[0]?.id || '';
          const pipeline = pls.find((p) => p.id === processId) || pls[0];
          const stageId = prev.stageId || pipeline?.stages?.[0]?.id || '';
          let nextContactId = prev.contactId;
          let nextContactName = prev.contactName;
          if (nextContactId) {
            const match = cts.find((c) => c.id === nextContactId);
            if (match) nextContactName = match.name;
          } else if (nextContactName) {
            const match = cts.find((c) => c.name === nextContactName);
            if (match) nextContactId = match.id;
          }
          return {
            ...prev,
            processId,
            stageId,
            contactId: nextContactId,
            contactName: nextContactName,
            clientName: prev.clientName || clientName,
          };
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, clientId, apiBase, clientName]);

  if (!isOpen) return null;

  const activePipeline = pipelines.find((p) => p.id === formData.processId) || pipelines[0];
  const stages = activePipeline?.stages || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    const pipeline = pipelines.find((p) => p.id === formData.processId);
    const stage = stages.find((s) => s.id === formData.stageId) || stages[0];
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: formData.title.trim(),
        processId: pipeline?.id || formData.processId,
        processName: pipeline?.name || '',
        stageId: stage?.id || formData.stageId,
        stageName: stage?.name || '',
        contactId: formData.contactId || null,
        contactName: formData.contactName,
        clientName: formData.clientName || clientName,
        assignee: formData.assignee || 'אני',
        priority: formData.priority,
        slaDays: formData.slaDays,
        description: formData.description,
      });
      onClose();
    } catch (err) {
      setError((err as Error)?.message || 'שגיאה בשמירת האירוע');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 sm:p-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-bg-card w-full max-w-[900px] max-h-[90vh] rounded-3xl shadow-2xl border border-border-default overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-border-default/50 relative flex-shrink-0">
          <h3 className="font-black text-xl text-text-default text-center w-full">יצירת אירוע תהליכי חדש</h3>
          <button
            type="button"
            onClick={onClose}
            className="absolute left-6 p-2 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <form onSubmit={(e) => void handleSubmit(e)} className="p-6 sm:p-8 flex flex-col h-full">
            {error ? (
              <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </div>
            ) : null}
            {loadingMeta ? (
              <div className="text-center text-text-muted py-6">טוען תהליכים ואנשי קשר...</div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
              <div className="lg:col-span-7 space-y-5 order-2 lg:order-1">
                <div>
                  <label className="block text-sm font-bold text-text-default mb-2">כותרת האירוע</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all shadow-sm"
                    placeholder="למשל: תיאום פגישת היכרות..."
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">תהליך</label>
                    <select
                      value={formData.processId}
                      onChange={(e) => {
                        const newProcess = e.target.value;
                        const newPipeline = pipelines.find((p) => p.id === newProcess);
                        setFormData({
                          ...formData,
                          processId: newProcess,
                          stageId: newPipeline?.stages?.[0]?.id || '',
                        });
                      }}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                      disabled={!pipelines.length}
                    >
                      {pipelines.length === 0 ? (
                        <option value="">אין תהליכים מוגדרים</option>
                      ) : (
                        pipelines.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">סטטוס (שלב)</label>
                    <select
                      value={formData.stageId}
                      onChange={(e) => setFormData({ ...formData, stageId: e.target.value })}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                      disabled={!stages.length}
                    >
                      {stages.length === 0 ? (
                        <option value="">אין שלבים</option>
                      ) : (
                        stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">חברה/לקוח</label>
                    <input
                      type="text"
                      value={formData.clientName}
                      readOnly
                      className="w-full bg-bg-subtle border border-border-default rounded-xl p-3.5 text-sm text-text-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">איש קשר</label>
                    <select
                      value={formData.contactId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const match = contacts.find((c) => c.id === id);
                        setFormData({
                          ...formData,
                          contactId: id,
                          contactName: match?.name || '',
                        });
                      }}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                    >
                      <option value="">-- בחר איש קשר --</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">הקצאה ל-</label>
                    <input
                      type="text"
                      value={formData.assignee}
                      onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">דחיפות</label>
                    <select
                      value={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: e.target.value as 'high' | 'medium' | 'low',
                        })
                      }
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                    >
                      <option value="high">גבוהה (דחוף)</option>
                      <option value="medium">בינונית (רגיל)</option>
                      <option value="low">נמוכה (רקע)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-text-default mb-2">התראת SLA (ימים)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.slaDays}
                      onChange={(e) =>
                        setFormData({ ...formData, slaDays: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-primary-500 transition-all shadow-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex flex-col order-1 lg:order-2 min-h-[200px]">
                <label className="block text-sm font-bold text-text-default mb-2">תיאור והערות</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="flex-1 w-full bg-bg-input border border-border-default rounded-xl p-3.5 text-sm resize-none focus:ring-2 focus:ring-primary-500 transition-all shadow-sm min-h-[250px]"
                  placeholder="פרטים נוספים לגבי האירוע התהליכי..."
                />
              </div>
            </div>

            <div className="flex justify-center gap-4 pt-6 mt-8 border-t border-border-default/50">
              <button
                type="submit"
                disabled={saving || !formData.title.trim()}
                className="w-full max-w-[200px] bg-primary-600 text-white font-bold py-3.5 px-6 rounded-xl hover:bg-primary-700 transition-all shadow-md disabled:opacity-50 text-base"
              >
                {saving ? 'שומר...' : 'פתח אירוע'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full max-w-[200px] py-3.5 px-6 font-bold text-text-default hover:bg-bg-subtle rounded-xl transition-all border border-transparent hover:border-border-default text-base"
              >
                ביטול
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProcessEventModal;
