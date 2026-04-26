
import React, { useState, useEffect, useCallback, useRef } from 'react';
import AccordionSection from './AccordionSection';
import { InformationCircleIcon, TrashIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

interface EventTypeSetting {
  id: string;
  isActive: boolean;
  name: string;
  textColor: string;
  bgColor: string;
  forCandidate: boolean;
  forJob: boolean;
  forClient: boolean;
  forFlight: boolean;
}

function mapApiRow(row: Record<string, unknown>): EventTypeSetting {
  return {
    id: String(row.id),
    isActive: Boolean(row.isActive),
    name: String(row.name ?? ''),
    textColor: String(row.textColor ?? '#000000'),
    bgColor: String(row.bgColor ?? '#ffffff'),
    forCandidate: Boolean(row.forCandidate),
    forJob: Boolean(row.forJob),
    forClient: Boolean(row.forClient),
    forFlight: Boolean(row.forFlight),
  };
}

const newEventTypeInitialState = {
  isActive: true,
  name: '',
  textColor: '#000000',
  bgColor: '#ffffff',
  forCandidate: false,
  forJob: false,
  forClient: false,
  forFlight: false,
};

const EventTypesSettingsView: React.FC = () => {
  const { t } = useLanguage();
  const [eventTypes, setEventTypes] = useState<EventTypeSetting[]>([]);
  const [newEvent, setNewEvent] = useState(newEventTypeInitialState);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const savedByIdRef = useRef<Record<string, EventTypeSetting>>({});

  const apiBase = import.meta.env.VITE_API_BASE || '';

  const authHeaders = useCallback((): HeadersInit => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!apiBase) {
      setListError('חסרה הגדרת שרת (VITE_API_BASE).');
      setLoading(false);
      setEventTypes([]);
      return;
    }
    setListError(null);
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/event-types`, { headers: authHeaders() });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'טעינת הרשימה נכשלה');
      }
      const rows = Array.isArray(data) ? data.map((r) => mapApiRow(r as Record<string, unknown>)) : [];
      setEventTypes(rows);
      savedByIdRef.current = Object.fromEntries(rows.map((r) => [r.id, { ...r }]));
    } catch (e: unknown) {
      setEventTypes([]);
      savedByIdRef.current = {};
      setListError(e instanceof Error ? e.message : 'שגיאה בטעינה');
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const handleUpdate = (id: string, field: keyof EventTypeSetting, value: string | boolean) => {
    setRowError(null);
    setEventTypes((prev) => prev.map((et) => (et.id === id ? { ...et, [field]: value } : et)));
  };

  const handleNewEventChange = (field: keyof typeof newEventTypeInitialState, value: string | boolean) => {
    setNewEvent((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveRow = async (id: string) => {
    const row = eventTypes.find((e) => e.id === id);
    if (!row || !apiBase) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setRowError('נדרשת התחברות לשמירה.');
      return;
    }
    setRowError(null);
    setSavingId(id);
    try {
      const res = await fetch(`${apiBase}/api/event-types/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          isActive: row.isActive,
          name: row.name,
          textColor: row.textColor,
          bgColor: row.bgColor,
          forCandidate: row.forCandidate,
          forJob: row.forJob,
          forClient: row.forClient,
          forFlight: row.forFlight,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'שמירה נכשלה');
      }
      const updated = mapApiRow(data as Record<string, unknown>);
      setEventTypes((prev) => prev.map((et) => (et.id === id ? updated : et)));
      savedByIdRef.current[id] = { ...updated };
    } catch (e: unknown) {
      setRowError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSavingId(null);
    }
  };

  const handleCancelRow = (id: string) => {
    setRowError(null);
    const snap = savedByIdRef.current[id];
    if (!snap) {
      void loadList();
      return;
    }
    setEventTypes((prev) => prev.map((et) => (et.id === id ? { ...snap } : et)));
  };

  const handleAddNewEvent = async () => {
    if (!newEvent.name.trim()) return;
    if (!apiBase) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setRowError('נדרשת התחברות להוספה.');
      return;
    }
    setRowError(null);
    setAdding(true);
    try {
      const res = await fetch(`${apiBase}/api/event-types`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          isActive: newEvent.isActive,
          name: newEvent.name.trim(),
          textColor: newEvent.textColor,
          bgColor: newEvent.bgColor,
          forCandidate: newEvent.forCandidate,
          forJob: newEvent.forJob,
          forClient: newEvent.forClient,
          forFlight: newEvent.forFlight,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'הוספה נכשלה');
      }
      const created = mapApiRow(data as Record<string, unknown>);
      setEventTypes((prev) => [...prev, created]);
      savedByIdRef.current[created.id] = { ...created };
      setNewEvent(newEventTypeInitialState);
    } catch (e: unknown) {
      setRowError(e instanceof Error ? e.message : 'הוספה נכשלה');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את סוג האירוע?')) return;
    if (!apiBase) return;
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setRowError('נדרשת התחברות למחיקה.');
      return;
    }
    setRowError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`${apiBase}/api/event-types/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data?.message === 'string' ? data.message : 'מחיקה נכשלה');
      }
      setEventTypes((prev) => prev.filter((et) => et.id !== id));
      delete savedByIdRef.current[id];
    } catch (e: unknown) {
      setRowError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setDeletingId(null);
    }
  };

  const renderRow = (event: EventTypeSetting | typeof newEventTypeInitialState, isNew: boolean) => {
    const id = 'id' in event ? event.id : '';
    const changeHandler = isNew
      ? handleNewEventChange
      : (field: keyof EventTypeSetting, value: string | boolean) => handleUpdate(id, field, value);
    const busy = !isNew && (savingId === id || deletingId === id);

    return (
      <tr key={isNew ? 'new-row' : id} className={isNew ? 'bg-primary-50/50' : 'bg-bg-card hover:bg-bg-hover'}>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={event.isActive}
            onChange={(e) => changeHandler('isActive', e.target.checked)}
            disabled={busy}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </td>
        <td className="p-2">
          <input
            type="text"
            value={event.name}
            onChange={(e) => changeHandler('name', e.target.value)}
            disabled={busy}
            className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2"
          />
        </td>
        <td className="p-2">
          <div className="relative">
            <input
              type="color"
              value={event.textColor}
              onChange={(e) => changeHandler('textColor', e.target.value)}
              disabled={busy}
              className="w-full h-9 rounded-md border-none cursor-pointer disabled:opacity-50"
            />
            <span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10" />
          </div>
        </td>
        <td className="p-2">
          <div className="relative">
            <input
              type="color"
              value={event.bgColor}
              onChange={(e) => changeHandler('bgColor', e.target.value)}
              disabled={busy}
              className="w-full h-9 rounded-md border-none cursor-pointer disabled:opacity-50"
            />
            <span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10" />
          </div>
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={event.forCandidate}
            onChange={(e) => changeHandler('forCandidate', e.target.checked)}
            disabled={busy}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={event.forJob}
            onChange={(e) => changeHandler('forJob', e.target.checked)}
            disabled={busy}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={event.forClient}
            onChange={(e) => changeHandler('forClient', e.target.checked)}
            disabled={busy}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </td>
        <td className="p-2 text-center">
          <input
            type="checkbox"
            checked={event.forFlight}
            onChange={(e) => changeHandler('forFlight', e.target.checked)}
            disabled={busy}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </td>
        <td className="p-2 text-center">
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {isNew ? (
              <button
                type="button"
                onClick={() => void handleAddNewEvent()}
                disabled={adding || !newEvent.name.trim()}
                className="text-sm font-semibold text-primary-600 bg-primary-100 py-1.5 px-4 rounded-md hover:bg-primary-200 disabled:opacity-50"
              >
                {adding ? '…' : t('event_types.add')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleSaveRow(id)}
                  disabled={busy}
                  className="text-xs font-semibold text-text-muted border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover disabled:opacity-50"
                >
                  {savingId === id ? '…' : t('event_types.save')}
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelRow(id)}
                  disabled={busy}
                  className="text-xs font-semibold text-text-muted border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover disabled:opacity-50"
                >
                  {t('event_types.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(id)}
                  disabled={busy}
                  className="p-2 text-text-subtle hover:text-red-600 disabled:opacity-50"
                  aria-label="מחק"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold text-text-default">{t('event_types.title')}</h1>

      {listError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {listError}
        </div>
      )}
      {rowError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {rowError}
        </div>
      )}

      <AccordionSection title={t('event_types.instructions_title')} icon={<InformationCircleIcon className="w-5 h-5" />} defaultOpen>
        <div className="text-sm text-text-muted space-y-1 bg-amber-50 p-4 rounded-lg border border-amber-200">
          <p>ממשק זה מאפשר ליצור ולערוך סוגי אירועים בנוסף לסוגי מערכת.</p>
          <p><strong className="text-text-default">סוג אירוע פעיל</strong> - ניתן ליצור אירוע ידני מסוג זה. סוג אירוע שאינו פעיל, אירועים קיימים מסוג זה יישארו. סוג אירוע עדיין יופיע במסננים של טבלאות אירועים.</p>
          <p><strong className="text-text-default">סוג אירוע לא פעיל</strong> - לא ניתן ליצור אירוע ידני מסוג זה, הוא לא יופיע בטבלאות אירועים, וכל האירועים הקיימים מסוג זה יימחקו ללא אפשרות שיחזור.</p>
          <p><strong className="text-text-default">צבע טקסט/רקע</strong> - אירועים מסוג זה יוצגו בצבעים הנבחרים בטבלאות האירועים.</p>
          <p><strong className="text-text-default">מועמד/משרה/לקוח</strong> - אירועים מסוג זה יוצגו בהתאם בטבלאות האירועים שמופיעות בכרטיסי הישות (מועמד, משרה, לקוח). אירוע שנוצר עבור מועמד ורלוונטי רק למשרה/לקוח, עדיין יוצג ב-V אחד. הערה: אירועי מערכת לא מופיעים ברשימה זו ואין צורך או אפשרות לערוך אותם.</p>
        </div>
      </AccordionSection>

      <div className="overflow-x-auto border border-border-default rounded-lg flex-1">
        <table className="w-full text-sm text-right min-w-[1000px]">
          <thead className="text-xs text-text-muted uppercase bg-bg-subtle sticky top-0 z-10">
            <tr>
              <th className="p-3 text-center">{t('event_types.col_active')}</th>
              <th className="p-3">{t('event_types.col_name')}</th>
              <th className="p-3">{t('event_types.col_text_color')}</th>
              <th className="p-3">{t('event_types.col_bg_color')}</th>
              <th className="p-3 text-center">{t('event_types.col_for_candidate')}</th>
              <th className="p-3 text-center">{t('event_types.col_for_job')}</th>
              <th className="p-3 text-center">{t('event_types.col_for_client')}</th>
              <th className="p-3 text-center">{t('event_types.col_for_flight')}</th>
              <th className="p-3 text-center">{t('event_types.col_actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-text-muted">
                  טוען…
                </td>
              </tr>
            ) : (
              <>
                {eventTypes.map((et) => renderRow(et, false))}
                {renderRow(newEvent, true)}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EventTypesSettingsView;
