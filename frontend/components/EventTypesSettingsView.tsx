import React, { useState } from 'react';
import AccordionSection from './AccordionSection';
import { InformationCircleIcon, TrashIcon } from './Icons';

// --- TYPES ---
interface EventTypeSetting {
  id: number;
  isActive: boolean;
  name: string;
  textColor: string;
  bgColor: string;
  forCandidate: boolean;
  forJob: boolean;
  forClient: boolean;
}

// --- MOCK DATA ---
const initialEventTypes: EventTypeSetting[] = [
  { id: 1, isActive: true, name: 'התקבל עדכון מהלקוח על משרות חדשות', textColor: '#000000', bgColor: '#dbeafe', forCandidate: true, forJob: true, forClient: true },
  { id: 2, isActive: true, name: 'לקוח עדכן סטטוס מועמדים', textColor: '#ffffff', bgColor: '#4b0082', forCandidate: true, forJob: true, forClient: true },
  { id: 3, isActive: true, name: 'לקוח עדכן- המשרה נסגרה+ סטטוס מועמ', textColor: '#000000', bgColor: '#87ceeb', forCandidate: true, forJob: true, forClient: true },
  { id: 4, isActive: true, name: 'נשלח מייל ללקוח לגבי משרות חדשות / עי', textColor: '#ffffff', bgColor: '#ff0000', forCandidate: true, forJob: false, forClient: false },
  { id: 5, isActive: true, name: 'נשלח דיוור', textColor: '#ffffff', bgColor: '#008000', forCandidate: false, forJob: true, forClient: false },
  { id: 6, isActive: true, name: 'נשלח סטטוס מועמדים', textColor: '#000000', bgColor: '#ee82ee', forCandidate: true, forJob: true, forClient: false },
  { id: 7, isActive: true, name: 'סוג אירוע חדש', textColor: '#000000', bgColor: '#ffffff', forCandidate: false, forJob: false, forClient: true },
];

const newEventTypeInitialState = {
    isActive: true,
    name: '',
    textColor: '#000000',
    bgColor: '#ffffff',
    forCandidate: false,
    forJob: false,
    forClient: false,
};


const EventTypesSettingsView: React.FC = () => {
    const [eventTypes, setEventTypes] = useState<EventTypeSetting[]>(initialEventTypes);
    const [newEvent, setNewEvent] = useState(newEventTypeInitialState);

    const handleUpdate = (id: number, field: keyof EventTypeSetting, value: string | boolean) => {
        setEventTypes(prev => prev.map(et => et.id === id ? { ...et, [field]: value } : et));
    };
    
    const handleNewEventChange = (field: keyof typeof newEventTypeInitialState, value: string | boolean) => {
        setNewEvent(prev => ({ ...prev, [field]: value }));
    };

    const handleAddNewEvent = () => {
        if (!newEvent.name.trim()) return;
        const newEntry: EventTypeSetting = { id: Date.now(), ...newEvent };
        setEventTypes(prev => [...prev, newEntry]);
        setNewEvent(newEventTypeInitialState);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את סוג האירוע?')) {
            setEventTypes(prev => prev.filter(et => et.id !== id));
        }
    };

    const renderRow = (event: EventTypeSetting | typeof newEventTypeInitialState, isNew: boolean) => {
        const id = 'id' in event ? event.id : 0;
        const changeHandler = isNew ? handleNewEventChange : (field: any, value: any) => handleUpdate(id, field, value);

        return (
            <tr className={isNew ? "bg-primary-50/50" : "bg-bg-card hover:bg-bg-hover"}>
                <td className="p-2 text-center"><input type="checkbox" checked={event.isActive} onChange={(e) => changeHandler('isActive', e.target.checked)} className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500" /></td>
                <td className="p-2"><input type="text" value={event.name} onChange={(e) => changeHandler('name', e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2" /></td>
                <td className="p-2"><div className="relative"><input type="color" value={event.textColor} onChange={(e) => changeHandler('textColor', e.target.value)} className="w-full h-9 rounded-md border-none cursor-pointer" /><span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10"></span></div></td>
                <td className="p-2"><div className="relative"><input type="color" value={event.bgColor} onChange={(e) => changeHandler('bgColor', e.target.value)} className="w-full h-9 rounded-md border-none cursor-pointer" /><span className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-inset ring-black/10"></span></div></td>
                <td className="p-2 text-center"><input type="checkbox" checked={event.forCandidate} onChange={(e) => changeHandler('forCandidate', e.target.checked)} className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500" /></td>
                <td className="p-2 text-center"><input type="checkbox" checked={event.forJob} onChange={(e) => changeHandler('forJob', e.target.checked)} className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500" /></td>
                <td className="p-2 text-center"><input type="checkbox" checked={event.forClient} onChange={(e) => changeHandler('forClient', e.target.checked)} className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500" /></td>
                <td className="p-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                        {isNew ? (
                            <button onClick={handleAddNewEvent} className="text-sm font-semibold text-primary-600 bg-primary-100 py-1.5 px-4 rounded-md hover:bg-primary-200">הוסף</button>
                        ) : (
                            <>
                                <button className="text-xs font-semibold text-text-muted border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover">שמירה</button>
                                <button className="text-xs font-semibold text-text-muted border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover">ביטול</button>
                                <button onClick={() => handleDelete(id)} className="p-2 text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                            </>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6 space-y-6">
            <h1 className="text-2xl font-bold text-text-default">עריכת סוגי אירועים</h1>

            <AccordionSection title="הוראות שימוש" icon={<InformationCircleIcon className="w-5 h-5" />} defaultOpen>
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
                            <th className="p-3 text-center">פעיל</th>
                            <th className="p-3">סוג אירוע</th>
                            <th className="p-3">צבע טקסט</th>
                            <th className="p-3">צבע רקע</th>
                            <th className="p-3 text-center">מועמד</th>
                            <th className="p-3 text-center">משרה</th>
                            <th className="p-3 text-center">לקוח</th>
                            <th className="p-3 text-center">פעולות</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {eventTypes.map(et => renderRow(et, false))}
                        {renderRow(newEvent, true)}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default EventTypesSettingsView;
