import React, { useState, useEffect, useMemo, useRef } from 'react';
import { XMarkIcon, PlusIcon } from './Icons';
import { fetchEventTypes, filterEventTypesForContext, type EventTypeApiRow } from '../services/eventTypesApi';
import { normalizeEventTypes } from '../utils/eventTypeChips';

export interface AddJobEventSavePayload {
  eventType: string;
  notes: string;
  /** ISO string for job timeline; defaults to now if omitted */
  date?: string;
  linkedTo?: { type: string; name: string }[];
}

interface AddJobEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: AddJobEventSavePayload) => void | Promise<void>;
  /** `type` may be a joined string (`"a / b"`) from a previous save, or a single label */
  eventToEdit?: { id?: string; type: string; description: string; date?: string } | null;
  /** Disables submit while parent persists to the API */
  isSubmitting?: boolean;
}

/** Shown when the API is unreachable or returns no rows for jobs. */
const fallbackJobEventTypes = [
  'התקבל עדכון מהלקוח על משרות חדשות',
  'לקוח עדכן סטטוס מועמדים',
  'לקוח עדכן- המשרה נסגרה+ סטטוס מועמ',
  'נשלח מייל ללקוח לגבי משרות חדשות / עי',
  'נשלח דיוור',
  'נשלח סטטוס מועמדים',
  'הערה חופשית',
  'סטטוס מועמד',
  'עריכת משרה',
  'הערה',
  'הוספת מועמד',
];

const AddJobEventModal: React.FC<AddJobEventModalProps> = ({ isOpen, onClose, onSave, eventToEdit, isSubmitting = false }) => {
  const [formData, setFormData] = useState<{
    type: string;
    date: string;
    time: string;
    description: string;
  }>({
    type: '',
    date: '',
    time: '',
    description: '',
  });

  const [links, setLinks] = useState<{ type: string; name: string }[]>([]);
  const [apiRows, setApiRows] = useState<EventTypeApiRow[]>([]);
  const [typesLoading, setTypesLoading] = useState(false);
  const wasTypesLoadingRef = useRef(false);

  const apiBase = import.meta.env.VITE_API_BASE || '';

  const jobRows = useMemo(() => filterEventTypesForContext(apiRows, 'job'), [apiRows]);

  const selectOptions = useMemo(() => {
    const fromApi = jobRows.map((r) => r.name).filter((n) => n.trim() !== '');
    const base = fromApi.length > 0 ? fromApi : [...fallbackJobEventTypes];
    const raw = eventToEdit?.type;
    const parts =
      raw != null && String(raw).includes(' / ')
        ? String(raw).split(/\s*\/\s*/)
        : raw;
    const existing = normalizeEventTypes(parts);
    const validExisting = existing.filter((n) => base.includes(n));
    const merged = Array.from(new Set([...validExisting, ...base]));
    return merged.length > 0 ? merged : [...fallbackJobEventTypes];
  }, [jobRows, eventToEdit?.type]);

  useEffect(() => {
    if (!isOpen) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    let cancelled = false;
    setTypesLoading(true);
    fetchEventTypes(apiBase, token)
      .then((rows) => {
        if (!cancelled) setApiRows(rows);
      })
      .finally(() => {
        if (!cancelled) setTypesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, apiBase]);

  useEffect(() => {
    if (!isOpen) return;
    if (eventToEdit) {
      const d = eventToEdit.date ? new Date(eventToEdit.date) : new Date();
      const parsed = normalizeEventTypes(
        eventToEdit.type != null && String(eventToEdit.type).includes(' / ')
          ? String(eventToEdit.type).split(/\s*\/\s*/)
          : eventToEdit.type,
      );
      const inList = parsed.find((n) => selectOptions.includes(n)) || null;
      const one =
        inList || parsed[0] || (selectOptions.length > 0 ? selectOptions[0] : fallbackJobEventTypes[0]) || '';
      setFormData({
        type: one,
        date: d.toISOString().split('T')[0],
        time: d.toTimeString().substring(0, 5),
        description: eventToEdit.description || '',
      });
      setLinks([]);
    } else {
      const def =
        selectOptions.length > 0 ? selectOptions[0] : fallbackJobEventTypes[0] || '';
      setFormData({
        type: def,
        date: new Date().toISOString().split('T')[0],
        time: new Date().toTimeString().substring(0, 5),
        description: '',
      });
      setLinks([]);
    }
  }, [eventToEdit, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) {
      wasTypesLoadingRef.current = false;
      return;
    }
    if (eventToEdit) {
      wasTypesLoadingRef.current = typesLoading;
      return;
    }
    if (wasTypesLoadingRef.current && !typesLoading && selectOptions.length > 0) {
      setFormData((prev) => ({ ...prev, type: selectOptions[0] || prev.type }));
    }
    wasTypesLoadingRef.current = typesLoading;
  }, [isOpen, eventToEdit, typesLoading, selectOptions]);

  useEffect(() => {
    if (!isOpen || eventToEdit) return;
    setFormData((prev) => {
      if (prev.type && selectOptions.includes(prev.type)) return prev;
      const one = selectOptions[0] || fallbackJobEventTypes[0] || '';
      return { ...prev, type: one };
    });
  }, [isOpen, eventToEdit, selectOptions]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddLink = () => {
    setLinks([...links, { type: 'משרה', name: '' }]);
  };

  const handleUpdateLink = (index: number, field: 'type' | 'name', value: string) => {
    const newLinks = [...links];
    newLinks[index][field] = value;
    setLinks(newLinks);
  };

  const handleRemoveLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const finalDate =
      formData.date && formData.time
        ? new Date(`${formData.date}T${formData.time}`).toISOString()
        : new Date().toISOString();
    const validLinks = links.filter((link) => link.name.trim() !== '');
    const t =
      formData.type.trim() ||
      (selectOptions.length > 0 ? selectOptions[0] : 'פגישה');

    await Promise.resolve(
      onSave({
        eventType: t,
        notes: formData.description,
        date: finalDate,
        linkedTo: validLinks.length > 0 ? validLinks : undefined,
      }),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-40 p-4 pt-10 sm:pt-14 pb-8"
      onClick={onClose}
    >
      <div
        className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-text-default border border-border-default"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <header className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle">
            <h2 className="text-lg font-bold text-text-default">{eventToEdit ? 'עריכת אירוע' : 'יצירת אירוע'}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full text-text-muted hover:bg-bg-hover transition-colors"
              aria-label="סגור"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </header>

          <main className="p-5 space-y-4 text-right" dir="rtl">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="add-job-event-type" className="block text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  סוג אירוע
                </label>
                {typesLoading ? <span className="text-[10px] text-text-muted">טוען…</span> : null}
              </div>
              {selectOptions.length === 0 ? (
                <span className="text-[11px] text-text-muted block">אין סוגי אירוע מוגדרים</span>
              ) : (
                <select
                  id="add-job-event-type"
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none"
                >
                  {selectOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1" />
              <div className="flex-none flex items-center gap-1.5 bg-primary-50 border border-primary-100 rounded-lg h-[38px] px-3 relative group focus-within:border-primary-400 transition-all">
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="bg-transparent border-none p-0 text-[13px] font-bold text-primary-700 outline-none w-[120px] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
                />
                <div className="w-px h-4 bg-primary-200 mx-1" />
                <input
                  type="time"
                  name="time"
                  value={formData.time}
                  onChange={handleChange}
                  className="bg-transparent border-none p-0 text-[13px] font-bold text-primary-700 outline-none w-[90px] cursor-pointer [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-1 uppercase tracking-wider">תיאור ופרטים</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="הוסף תיאור קצר..."
                className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-text-muted mb-2 uppercase tracking-wider">קישורים משויכים</label>
              <div className="flex flex-col gap-2">
                {links.map((link, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <select
                      value={link.type}
                      onChange={(e) => handleUpdateLink(idx, 'type', e.target.value)}
                      className="bg-bg-input border border-border-default rounded-lg p-2 text-sm focus:ring-2 focus:ring-primary-500/20 outline-none w-[100px]"
                    >
                      <option value="משרה">משרה</option>
                      <option value="לקוח">לקוח</option>
                      <option value="מועמד">מועמד</option>
                      <option value="צוות">צוות</option>
                      <option value="אחר">אחר</option>
                    </select>
                    <input
                      type="text"
                      value={link.name}
                      onChange={(e) => handleUpdateLink(idx, 'name', e.target.value)}
                      placeholder="שם הקישור..."
                      className="flex-1 bg-bg-input border-b border-transparent focus:border-primary-400 hover:border-border-strong rounded-none p-2 text-sm focus:ring-0 outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(idx)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-text-muted hover:text-white hover:bg-danger-500 rounded-lg transition-all"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddLink}
                  className="flex items-center gap-1.5 text-sm text-primary-600 font-bold self-start mt-1 hover:text-primary-700 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  הוסף קישור
                </button>
              </div>
            </div>
          </main>

          <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted font-bold text-sm py-2 px-4 rounded-lg hover:bg-bg-hover transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary-600 text-white font-bold text-sm py-2 px-6 rounded-lg hover:bg-primary-700 transition-all shadow-sm active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
            >
              {isSubmitting ? 'שומר…' : 'שמור'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

export default AddJobEventModal;
