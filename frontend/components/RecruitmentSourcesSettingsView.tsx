
import React, { useState } from 'react';
import AccordionSection from './AccordionSection';
import { InformationCircleIcon, TrashIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
interface Source {
  id: number;
  name: string;
  addresses: string;
  exclusivityMonths: number;
}

// --- MOCK DATA from user prompt ---
const initialSourcesData: Source[] = [
  { id: 1, name: 'AllJobs', addresses: 'alljob.co.il;alljobs', exclusivityMonths: 0 },
  { id: 2, name: 'Facebook', addresses: 'facebook;facebookmail', exclusivityMonths: 0 },
  { id: 3, name: 'Indeed', addresses: 'indeed;indeedemail;indeedemployers', exclusivityMonths: 0 },
  { id: 4, name: 'Jobhunt', addresses: 'jobhunt.co.il', exclusivityMonths: 0 },
  { id: 5, name: 'JobMaster', addresses: 'jobmaster', exclusivityMonths: 0 },
  { id: 6, name: 'JobNet', addresses: 'jobnet', exclusivityMonths: 0 },
  { id: 7, name: 'LinkedIn', addresses: '', exclusivityMonths: 0 },
  { id: 8, name: 'mploy', addresses: 'mploy', exclusivityMonths: 0 },
  { id: 9, name: 'techit', addresses: 'techit@techit.co.il', exclusivityMonths: 0 },
  { id: 10, name: 'ג\'וב קרוב', addresses: 'jobkarov.com', exclusivityMonths: 0 },
  { id: 11, name: 'הומלס', addresses: 'homeless.co.il', exclusivityMonths: 0 },
  { id: 12, name: 'חבר מביא חבר', addresses: '', exclusivityMonths: 0 },
  { id: 13, name: 'יבוא', addresses: '', exclusivityMonths: 0 },
  { id: 14, name: 'לשכת התעסוקה', addresses: 'taasukaservice@ies.gov.il', exclusivityMonths: 0 },
  { id: 15, name: 'מובטל', addresses: 'muvtal', exclusivityMonths: 0 },
  { id: 16, name: 'נגב ג\'ובס', addresses: 'negevjobs', exclusivityMonths: 0 },
  { id: 17, name: 'סחבק', addresses: 'sahbak.co.il', exclusivityMonths: 0 },
  { id: 18, name: 'ע.יזומה - ווצאפים', addresses: '', exclusivityMonths: 0 },
  { id: 19, name: 'ע.יזומה - פייסבוק', addresses: '', exclusivityMonths: 0 },
  { id: 20, name: 'פורטל דרושים', addresses: 'drushim.co.il', exclusivityMonths: 0 },
];

const newSourceInitialState = {
    id: 0,
    name: 'מקור חדש',
    addresses: '',
    exclusivityMonths: 0,
};

const RecruitmentSourcesSettingsView: React.FC = () => {
    const { t } = useLanguage();
    const [sources, setSources] = useState<Source[]>(initialSourcesData);
    const [newSource, setNewSource] = useState(newSourceInitialState);

    const handleUpdate = (id: number, field: keyof Source, value: string | number) => {
        setSources(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)));
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק את מקור הגיוס?')) {
            setSources(prev => prev.filter(s => s.id !== id));
        }
    };
    
    const handleNewSourceChange = (field: keyof Omit<Source, 'id'>, value: string | number) => {
        setNewSource(prev => ({ ...prev, [field]: value }));
    };

    const handleAddNewSource = () => {
        if (!newSource.name.trim() || newSource.name === 'מקור חדש') {
            alert('נא להזין שם למקור הגיוס החדש.');
            return;
        }
        const newEntry: Source = { id: Date.now(), ...newSource };
        setSources(prev => [...prev, newEntry]);
        setNewSource(newSourceInitialState);
    };


    const renderRow = (source: Source, isNew = false) => {
        const changeHandler = isNew ? handleNewSourceChange : (field: any, value: any) => handleUpdate(source.id, field, value);
        const data = isNew ? newSource : source;

        return (
            <tr key={isNew ? 'new' : source.id} className={isNew ? "bg-primary-50/50" : "bg-bg-card hover:bg-bg-hover"}>
                <td className="p-2"><input type="text" value={data.name} onChange={(e) => changeHandler('name', e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2" /></td>
                <td className="p-2"><input type="text" value={data.addresses} onChange={(e) => changeHandler('addresses', e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-md p-2" /></td>
                <td className="p-2"><input type="number" min="0" value={data.exclusivityMonths} onChange={(e) => changeHandler('exclusivityMonths', parseInt(e.target.value) || 0)} className="w-24 bg-bg-input border border-border-default text-sm rounded-md p-2 text-center" /></td>
                <td className="p-2">
                    <div className="flex items-center justify-center gap-2">
                        {isNew ? (
                            <button onClick={handleAddNewSource} className="text-sm font-semibold text-primary-600 bg-primary-100 py-1.5 px-4 rounded-md hover:bg-primary-200">{t('sources.add')}</button>
                        ) : (
                            <>
                                <button className="text-xs font-semibold text-text-default border border-border-default bg-bg-card py-1 px-3 rounded-md hover:bg-bg-hover">{t('sources.save')}</button>
                                <button className="text-xs font-semibold text-text-muted hover:text-text-default">{t('sources.cancel')}</button>
                                <button onClick={() => handleDelete(source.id)} className="p-2 text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                            </>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-text-default">{t('sources.title')}</h1>

            <AccordionSection title={t('sources.instructions_title')} icon={<InformationCircleIcon className="w-5 h-5" />}>
                <div className="text-sm text-text-muted space-y-2 bg-amber-50 p-4 rounded-lg border border-amber-200">
                    <p><strong className="text-text-default">שם המקור:</strong> חייב להיות שם לא ריק וייחודי בתוך החברה.</p>
                    <p><strong className="text-text-default">כתובת של המקור:</strong> רשימה של מפרידים על ידי נקודה-פסיק, כאשר כל עצם יכול להיות אחת מ-3 אופציות:
                        <ul className="list-disc pr-6 mt-1 space-y-1">
                            <li>כתובת דוא"ל המקושרת למקור הגיוס (לדוגמה: <span className="font-mono">name@example.com</span>).</li>
                            <li>החלק של אותו דוא"ל אחרי ה-@ (לדוגמה: <span className="font-mono">@example.com</span>).</li>
                            <li>שם הדומיין (לדוגמה: <span className="font-mono">example</span>).</li>
                        </ul>
                    </p>
                    <p className="mt-2">כל עצם יכול להיות כתובת דוא"ל בתוך כתובת דוא"ל. כלומר, אם תזינו כתובת דוא"ל <span className="font-mono">@example.com</span>, המערכת תתעלם מרווחים חוקיים, שיכולים להיות בתוך כתובת דוא"ל (נמחקים אוטומטית).</p>
                    <p>אם אותה כתובת דוא"ל מדווחת בעצמה על מקורות שונים, אז אחד מהם מדווח בצורה שרירותית. אם הרשימה ריקה עבור המקורות שכבר לא בשימוש, או עבור מקורות שלא ניתן לזהות על פי כתובת מייל של מועמד.</p>
                    <p><strong className="text-text-default">חודשי בלעדיות:</strong> ניתן לקבוע לכמה חודשים המקור יהיה בלעדי. חייב להיות מספר שלם חיובי או 0.</p>
                    <p><strong className="text-text-default">מחיקה:</strong> ניתן למחוק מקור גיוס בלחיצה על אייקון הפח האדום. אזהרה! מחיקת המקור הינה לצמיתות ללא אפשרות שחזור. מומלץ לוודא שלא קיימים מועמדים שמשויכים אליהם, מאחר וזה ישפיע על מחיקת מקור הגיוס מהמועמדים.</p>
                </div>
            </AccordionSection>

            <div className="overflow-x-auto border border-border-default rounded-lg">
                <table className="w-full text-sm text-right min-w-[900px]">
                    <thead className="text-xs text-text-muted uppercase bg-bg-subtle sticky top-0 z-10">
                        <tr>
                            <th className="p-3 w-1/4">{t('sources.col_name')}</th>
                            <th className="p-3 w-1/2">{t('sources.col_addresses')}</th>
                            <th className="p-3">{t('sources.col_exclusivity')}</th>
                            <th className="p-3 text-center">{t('sources.col_actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {sources.map(s => renderRow(s, false))}
                        {renderRow(newSourceInitialState, true)}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end pt-4">
                <button className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-md">{t('sources.save')}</button>
            </div>
        </div>
    );
};

export default RecruitmentSourcesSettingsView;
