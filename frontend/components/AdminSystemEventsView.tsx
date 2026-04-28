import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccordionSection from './AccordionSection';
import { InformationCircleIcon, TrashIcon, ChevronUpIcon, ChevronDownIcon, Bars2Icon } from './Icons';
import { useLanguage } from '../context/LanguageContext';
import {
    SystemEventApiRow,
    SystemEventInput,
    createSystemEvent,
    deleteSystemEvent,
    fetchSystemEvents,
    updateSystemEvent,
} from '../services/systemEventsApi';

// --- TYPES ---
interface SystemEventSetting {
    id: string;
    isActive: boolean;
    triggerName: string;
    eventName: string;
    contentTemplate: string;
    forCandidate: boolean;
    forJob: boolean;
    forClient: boolean;
    textColor: string;
    bgColor: string;
}

type ColumnKey = keyof SystemEventSetting | 'actions';

interface ColumnDef {
    key: ColumnKey;
    label: string;
    sortable?: boolean;
    align?: 'center' | 'left' | 'right';
    width?: string;
}

const NEW_ROW_ID = '__new__';

const newSystemEventInitialState: SystemEventSetting = {
    id: NEW_ROW_ID,
    isActive: true,
    triggerName: '',
    eventName: '',
    contentTemplate: '',
    forCandidate: false,
    forJob: false,
    forClient: false,
    textColor: '#000000',
    bgColor: '#ffffff',
};

const mapApiRow = (row: SystemEventApiRow): SystemEventSetting => ({
    id: row.id,
    isActive: row.isActive,
    triggerName: row.triggerName,
    eventName: row.eventName,
    contentTemplate: row.contentTemplate,
    forCandidate: row.forCandidate,
    forJob: row.forJob,
    forClient: row.forClient,
    textColor: row.textColor,
    bgColor: row.bgColor,
});

const toApiPayload = (row: SystemEventSetting): SystemEventInput => ({
    isActive: row.isActive,
    triggerName: row.triggerName,
    eventName: row.eventName,
    contentTemplate: row.contentTemplate,
    forCandidate: row.forCandidate,
    forJob: row.forJob,
    forClient: row.forClient,
    textColor: row.textColor,
    bgColor: row.bgColor,
});

// Sub-component for expandable textarea
const ExpandableContent = ({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder: string }) => {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="relative flex items-start w-full group">
            <textarea
                dir="rtl"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={expanded ? 4 : 1}
                className={`w-full min-w-[250px] bg-bg-input border ${expanded ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-border-default'} text-xs rounded-md p-2 font-mono text-left transition-all resize-none shadow-sm pb-2`}
            />
            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className={`absolute left-2 top-2 p-1 bg-white rounded shadow-sm text-text-muted hover:text-indigo-600 border border-border-subtle z-10 transition-opacity ${expanded ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
                title={expanded ? 'כווץ' : 'הרחב'}
            >
                {expanded ? <ChevronUpIcon className="w-3 h-3"/> : <ChevronDownIcon className="w-3 h-3"/>}
            </button>
        </div>
    );
};

const AdminSystemEventsView: React.FC = () => {
    const { t } = useLanguage();
    const [systemEvents, setSystemEvents] = useState<SystemEventSetting[]>([]);
    const [newEvent, setNewEvent] = useState<SystemEventSetting>(newSystemEventInitialState);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [rowError, setRowError] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const savedByIdRef = useRef<Record<string, SystemEventSetting>>({});

    // Sort & Column State
    const [sortConfig, setSortConfig] = useState<{ key: ColumnKey | '', direction: 'asc' | 'desc' }>({ key: '', direction: 'asc' });
    const [draggedColIdx, setDraggedColIdx] = useState<number | null>(null);

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const getToken = useCallback(() => {
        return typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
    }, []);

    const flashSuccess = useCallback((text: string) => {
        setSuccessMessage(text);
        setTimeout(() => setSuccessMessage(null), 2500);
    }, []);

    const defaultColumns: ColumnDef[] = useMemo(() => ([
        { key: 'isActive', label: t('event_types.col_active'), sortable: true, align: 'center', width: '60px' },
        { key: 'triggerName', label: t('event_types.col_trigger'), sortable: true, width: '160px' },
        { key: 'eventName', label: t('event_types.col_name'), sortable: true, width: '240px' },
        { key: 'forCandidate', label: t('event_types.col_for_candidate'), sortable: true, align: 'center', width: '80px' },
        { key: 'forJob', label: t('event_types.col_for_job'), sortable: true, align: 'center', width: '80px' },
        { key: 'forClient', label: t('event_types.col_for_client'), sortable: true, align: 'center', width: '80px' },
        { key: 'textColor', label: t('event_types.col_text_color'), width: '70px' },
        { key: 'bgColor', label: t('event_types.col_bg_color'), width: '70px' },
        { key: 'contentTemplate', label: t('event_types.col_content_template'), width: '300px' },
        { key: 'actions', label: t('event_types.col_actions'), align: 'center', width: '120px' },
    ]), [t]);

    const [columns, setColumns] = useState<ColumnDef[]>(defaultColumns);

    const loadList = useCallback(async () => {
        if (!apiBase) {
            setListError('חסרה הגדרת שרת (VITE_API_BASE).');
            setLoading(false);
            setSystemEvents([]);
            return;
        }
        setListError(null);
        setLoading(true);
        try {
            const rows = await fetchSystemEvents(apiBase, getToken());
            const mapped = rows.map(mapApiRow);
            setSystemEvents(mapped);
            savedByIdRef.current = Object.fromEntries(mapped.map((r) => [r.id, { ...r }]));
        } catch (e: unknown) {
            setSystemEvents([]);
            savedByIdRef.current = {};
            setListError(e instanceof Error ? e.message : 'שגיאה בטעינה');
        } finally {
            setLoading(false);
        }
    }, [apiBase, getToken]);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const handleSystemEventUpdate = (id: string, field: keyof SystemEventSetting, value: string | boolean) => {
        setRowError(null);
        setSystemEvents(prev => prev.map(et => et.id === id ? { ...et, [field]: value } : et));
    };

    const handleNewEventChange = (field: keyof SystemEventSetting, value: string | boolean) => {
        setNewEvent(prev => ({ ...prev, [field]: value }));
    };

    const handleAddNewEvent = async () => {
        if (!newEvent.eventName.trim() || !newEvent.triggerName.trim()) {
            setRowError('יש למלא לפחות "שם טריגר" ו-"שם אירוע"');
            return;
        }
        if (!apiBase) {
            setRowError('חסרה הגדרת שרת (VITE_API_BASE).');
            return;
        }
        setRowError(null);
        setAdding(true);
        try {
            const created = await createSystemEvent(apiBase, getToken(), toApiPayload(newEvent));
            const mapped = mapApiRow(created);
            setSystemEvents(prev => [mapped, ...prev]);
            savedByIdRef.current[mapped.id] = { ...mapped };
            setNewEvent(newSystemEventInitialState);
            flashSuccess('האירוע נוסף בהצלחה.');
        } catch (e: unknown) {
            setRowError(e instanceof Error ? e.message : 'יצירת האירוע נכשלה.');
        } finally {
            setAdding(false);
        }
    };

    const handleSaveRow = async (id: string) => {
        const row = systemEvents.find(e => e.id === id);
        if (!row || !apiBase) return;
        setRowError(null);
        setSavingId(id);
        try {
            const updated = await updateSystemEvent(apiBase, getToken(), id, toApiPayload(row));
            const mapped = mapApiRow(updated);
            setSystemEvents(prev => prev.map(et => et.id === id ? mapped : et));
            savedByIdRef.current[id] = { ...mapped };
            flashSuccess('האירוע עודכן.');
        } catch (e: unknown) {
            setRowError(e instanceof Error ? e.message : 'העדכון נכשל.');
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם לחלוטין למחוק את הטריגר ממערכת האירועים? הפעולה עשויה לדרוש עדכון קוד אם הטריגר עדיין משודר מהרשת!')) {
            return;
        }
        if (!apiBase) {
            setRowError('חסרה הגדרת שרת (VITE_API_BASE).');
            return;
        }
        setRowError(null);
        setDeletingId(id);
        try {
            await deleteSystemEvent(apiBase, getToken(), id);
            setSystemEvents(prev => prev.filter(et => et.id !== id));
            delete savedByIdRef.current[id];
            flashSuccess('האירוע נמחק.');
        } catch (e: unknown) {
            setRowError(e instanceof Error ? e.message : 'המחיקה נכשלה.');
        } finally {
            setDeletingId(null);
        }
    };

    const isRowDirty = (row: SystemEventSetting) => {
        const saved = savedByIdRef.current[row.id];
        if (!saved) return true;
        return (
            saved.isActive !== row.isActive ||
            saved.triggerName !== row.triggerName ||
            saved.eventName !== row.eventName ||
            saved.contentTemplate !== row.contentTemplate ||
            saved.forCandidate !== row.forCandidate ||
            saved.forJob !== row.forJob ||
            saved.forClient !== row.forClient ||
            saved.textColor !== row.textColor ||
            saved.bgColor !== row.bgColor
        );
    };

    // --- Drag and Drop Handlers for Columns ---
    const handleColDragStart = (e: React.DragEvent, index: number) => {
        setDraggedColIdx(index);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleColDragOver = (e: React.DragEvent, _index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleColDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedColIdx === null || draggedColIdx === index) return;

        setColumns(prev => {
            const newCols = [...prev];
            const [draggedCol] = newCols.splice(draggedColIdx, 1);
            newCols.splice(index, 0, draggedCol);
            return newCols;
        });
        setDraggedColIdx(null);
    };

    // --- Sorting ---
    const handleSort = (key: ColumnKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedEvents = useMemo(() => {
        if (!sortConfig.key || sortConfig.key === 'actions') return systemEvents;
        const key = sortConfig.key as keyof SystemEventSetting;
        return [...systemEvents].sort((a, b) => {
            const aValue = a[key] ?? '';
            const bValue = b[key] ?? '';
            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [systemEvents, sortConfig]);

    const renderCell = (col: ColumnDef, event: SystemEventSetting, changeHandler: (field: keyof SystemEventSetting, value: string | boolean) => void, isNew: boolean) => {
        switch (col.key) {
            case 'isActive':
                return <div className="flex justify-center"><input type="checkbox" checked={event.isActive} onChange={(e) => changeHandler('isActive', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" /></div>;
            case 'triggerName':
                return isNew ? (
                     <input type="text" placeholder="שם טריגר קוד..." value={event.triggerName} onChange={(e) => changeHandler('triggerName', e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2" />
                ) : (
                     <input type="text" value={event.triggerName} onChange={(e) => changeHandler('triggerName', e.target.value)} className="w-full bg-bg-input border border-border-default text-xs rounded-md p-2 font-semibold text-text-muted" />
                );
            case 'eventName':
                return <input type="text" value={event.eventName} placeholder="סוג אירוע לתצוגה..." onChange={(e) => changeHandler('eventName', e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2" />;
            case 'forCandidate':
                return <div className="flex justify-center"><input type="checkbox" checked={event.forCandidate} onChange={(e) => changeHandler('forCandidate', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" /></div>;
            case 'forJob':
                return <div className="flex justify-center"><input type="checkbox" checked={event.forJob} onChange={(e) => changeHandler('forJob', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" /></div>;
            case 'forClient':
                return <div className="flex justify-center"><input type="checkbox" checked={event.forClient} onChange={(e) => changeHandler('forClient', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500" /></div>;
            case 'textColor':
                return <div className="relative"><input type="color" value={event.textColor} onChange={(e) => changeHandler('textColor', e.target.value)} className="w-full h-8 rounded-md border-none cursor-pointer p-0" /><span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10"></span></div>;
            case 'bgColor':
                return <div className="relative"><input type="color" value={event.bgColor} onChange={(e) => changeHandler('bgColor', e.target.value)} className="w-full h-8 rounded-md border-none cursor-pointer p-0" /><span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10"></span></div>;
            case 'contentTemplate':
                return <ExpandableContent value={event.contentTemplate} onChange={(val) => changeHandler('contentTemplate', val)} placeholder="תבנית, למשל: Hello {name}..." />;
            case 'actions':
                return (
                    <div className="flex items-center justify-center gap-2">
                        {isNew ? (
                            <button
                                onClick={handleAddNewEvent}
                                disabled={adding}
                                className="text-sm font-semibold text-indigo-600 bg-indigo-100 py-1.5 px-4 rounded-md hover:bg-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {adding ? 'מוסיף…' : 'הוסף'}
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => handleSaveRow(event.id)}
                                    disabled={savingId === event.id || !isRowDirty(event)}
                                    className="text-xs font-semibold text-text-muted border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {savingId === event.id ? 'שומר…' : 'שמירה'}
                                </button>
                                <button
                                    onClick={() => handleDelete(event.id)}
                                    disabled={deletingId === event.id}
                                    className="p-2 text-text-subtle hover:text-red-600 transition-colors bg-white rounded-md border border-transparent hover:border-red-100 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </>
                        )}
                    </div>
                );
            default:
                return null;
        }
    };

    const renderSystemEventRow = (event: SystemEventSetting, isNew: boolean = false) => {
        const id = event.id;
        const changeHandler: (field: keyof SystemEventSetting, value: string | boolean) => void = isNew
            ? handleNewEventChange
            : (field, value) => handleSystemEventUpdate(id, field, value);

        return (
            <tr key={isNew ? 'new' : event.id} className={`${isNew ? "bg-indigo-50/30 border-b-2 border-indigo-200" : "bg-bg-card hover:bg-bg-hover transition-colors"}`}>
                {columns.map(col => (
                    <td key={col.key} className="p-2">
                        {renderCell(col, event, changeHandler, isNew)}
                    </td>
                ))}
            </tr>
        );
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl font-bold text-text-default">{t('event_types.tab_system')} (מנהל מערכת)</h1>

            <AccordionSection title={t('event_types.system_instructions_title')} icon={<InformationCircleIcon className="w-5 h-5" />} defaultOpen>
                <div className="text-sm text-text-muted space-y-2 bg-indigo-50/50 p-5 rounded-lg border border-indigo-100">
                    <p className="font-medium text-text-default mb-2">ניהול אדמין של כל אירועי המערכת שמיוצרים באופן אוטומטי.</p>
                    <ul className="list-disc list-inside space-y-2 marker:text-indigo-500">
                        <li><strong className="text-text-default">פעיל/כיבוי (Toggle):</strong> אם אירוע גורם ל"רעש" מיותר, ניתן לכבות אותו ואז המערכת תפסיק לתעד פעולות מקור אלו.</li>
                        <li><strong className="text-text-default">הוספה ומחיקה:</strong> ניתן ליצור אירועי מערכת חדשים ולהגדיר עבורם תבנית תוכן שתמתין לאירוע מצד השרת.</li>
                        <li><strong className="text-text-default">מיקרו-קופי/תבנית תוכן:</strong> שנו את הניסוח של האירוע האוטומטי. שימו לב לערכים בין סוגריים מסולסלים {'{id}'} אשר יוחלפו בערך חי. <span className="text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded text-xs">טיפ: לחצו על החץ להרחבת שדה הטקסט.</span></li>
                        <li><strong className="text-text-default">סידור וסינון:</strong> גררו עמודות באמצעות האייקון בכותרת כדי לשנות את סדר התצוגה שלהן, ולחצו על כותרת העמודה כדי למיין לפי א"ב ולמעלה/למטה.</li>
                    </ul>
                </div>
            </AccordionSection>

            {listError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                    {listError}
                </div>
            )}
            {rowError && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
                    {rowError}
                </div>
            )}
            {successMessage && (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                    {successMessage}
                </div>
            )}

            <div className="overflow-x-auto border border-border-default rounded-lg flex-1 custom-scrollbar">
                <table className="w-full text-sm text-right min-w-[1200px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle sticky top-0 z-10 select-none">
                        <tr>
                            {columns.map((col, idx) => (
                                <th
                                    key={col.key}
                                    draggable
                                    onDragStart={(e) => handleColDragStart(e, idx)}
                                    onDragOver={(e) => handleColDragOver(e, idx)}
                                    onDrop={(e) => handleColDrop(e, idx)}
                                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                                    className={`p-3 group border-b border-border-default bg-bg-subtle ${col.sortable ? 'cursor-pointer hover:bg-border-subtle' : ''} ${draggedColIdx === idx ? 'opacity-30' : ''} transition-colors`}
                                    style={{ width: col.width || 'auto' }}
                                >
                                    <div className={`flex items-center gap-2 ${col.align === 'center' ? 'justify-center' : 'justify-start'}`}>
                                        <div className="cursor-grab active:cursor-grabbing p-1 -m-1 text-border-default hover:text-text-default opacity-0 group-hover:opacity-100 transition-opacity" title="גרור לסידור העמודה">
                                            <Bars2Icon className="w-4 h-4" />
                                        </div>
                                        <span>{col.label}</span>
                                        {col.sortable && (
                                            <div className={`flex flex-col items-center justify-center transition-opacity ${sortConfig.key === col.key ? 'opacity-100 text-indigo-600' : 'opacity-0 group-hover:opacity-40 text-text-muted'}`}>
                                                {sortConfig.key === col.key && sortConfig.direction === 'desc' ? (
                                                    <ChevronDownIcon className="w-3.5 h-3.5 -mt-0.5" />
                                                ) : sortConfig.key === col.key && sortConfig.direction === 'asc' ? (
                                                    <ChevronUpIcon className="w-3.5 h-3.5 -mb-0.5" />
                                                ) : (
                                                    <ChevronDownIcon className="w-3.5 h-3.5" />
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {renderSystemEventRow(newEvent, true)}
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length} className="p-6 text-center text-sm text-text-muted">
                                    טוען נתונים…
                                </td>
                            </tr>
                        ) : sortedEvents.length === 0 && !listError ? (
                            <tr>
                                <td colSpan={columns.length} className="p-6 text-center text-sm text-text-muted">
                                    אין אירועי מערכת מוגדרים עדיין.
                                </td>
                            </tr>
                        ) : (
                            sortedEvents.map(et => renderSystemEventRow(et))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminSystemEventsView;
