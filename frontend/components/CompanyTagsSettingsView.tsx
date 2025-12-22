
import React, { useState } from 'react';
import { PlusIcon, TrashIcon, PencilIcon, XMarkIcon, CheckCircleIcon, InformationCircleIcon } from './Icons';

interface TagRule {
    id: number;
    name: string;
    color: string;
    positiveExpressions: string; // Comma separated
    negativeExpressions: string; // Comma separated
    isActive: boolean;
}

const initialTags: TagRule[] = [
    { id: 1, name: 'דובר רוסית', color: '#3B82F6', positiveExpressions: 'רוסית, Russian, ברית המועצות', negativeExpressions: '', isActive: true },
    { id: 2, name: 'בוגר טכניון', color: '#10B981', positiveExpressions: 'הטכניון, Technion, מכון טכנולוגי לישראל', negativeExpressions: '', isActive: true },
    { id: 3, name: 'ניהול בכיר', color: '#8B5CF6', positiveExpressions: 'סמנכ"ל, VP, C-Level, מנכ"ל, Director', negativeExpressions: 'Assistant, עוזר, מזכיר', isActive: true },
];

const colors = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', 
    '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#F43F5E', '#64748B'
];

const CompanyTagsSettingsView: React.FC = () => {
    const [tags, setTags] = useState<TagRule[]>(initialTags);
    const [isEditing, setIsEditing] = useState(false);
    const [currentTag, setCurrentTag] = useState<TagRule>({
        id: 0, name: '', color: '#3B82F6', positiveExpressions: '', negativeExpressions: '', isActive: true
    });

    const handleAddNew = () => {
        setCurrentTag({ id: 0, name: '', color: '#3B82F6', positiveExpressions: '', negativeExpressions: '', isActive: true });
        setIsEditing(true);
    };

    const handleEdit = (tag: TagRule) => {
        setCurrentTag({ ...tag });
        setIsEditing(true);
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק תגית זו?')) {
            setTags(prev => prev.filter(t => t.id !== id));
            if (currentTag.id === id) setIsEditing(false);
        }
    };

    const handleSave = () => {
        if (!currentTag.name) return;
        
        if (currentTag.id === 0) {
            setTags(prev => [...prev, { ...currentTag, id: Date.now() }]);
        } else {
            setTags(prev => prev.map(t => t.id === currentTag.id ? currentTag : t));
        }
        setIsEditing(false);
    };

    return (
        <div className="h-full flex flex-col md:flex-row gap-6 animate-fade-in">
            {/* List Side */}
            <div className="w-full md:w-1/3 flex flex-col gap-4 border-l border-border-default pl-0 md:pl-6">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-text-default">רשימת תגיות חברה</h3>
                    <button onClick={handleAddNew} className="flex items-center gap-2 text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition">
                        <PlusIcon className="w-4 h-4" />
                        חדש
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[600px] pr-1">
                    {tags.map(tag => (
                        <div 
                            key={tag.id} 
                            onClick={() => handleEdit(tag)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-center ${currentTag.id === tag.id && isEditing ? 'border-primary-500 bg-primary-50 shadow-sm' : 'border-border-default bg-bg-card hover:border-primary-300'}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }}></div>
                                <span className="font-semibold text-text-default">{tag.name}</span>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(tag.id); }} className="text-text-subtle hover:text-red-500 p-1">
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Edit Side */}
            <div className="w-full md:w-2/3 bg-bg-card rounded-xl border border-border-default p-6 shadow-sm">
                {!isEditing ? (
                    <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-60">
                        <InformationCircleIcon className="w-16 h-16 mb-4" />
                        <p>בחר תגית לעריכה או צור תגית חדשה</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center border-b border-border-default pb-4">
                            <h3 className="text-xl font-bold text-text-default">{currentTag.id === 0 ? 'יצירת תגית חדשה' : 'עריכת תגית'}</h3>
                            <button onClick={() => setIsEditing(false)} className="text-text-muted hover:bg-bg-hover p-2 rounded-full"><XMarkIcon className="w-5 h-5"/></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-text-muted mb-1.5">שם התגית <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        value={currentTag.name} 
                                        onChange={e => setCurrentTag({...currentTag, name: e.target.value})}
                                        className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="לדוגמה: מועמד VIP"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-text-muted mb-1.5">צבע הדגשה</label>
                                    <div className="flex flex-wrap gap-2">
                                        {colors.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setCurrentTag({...currentTag, color: c})}
                                                className={`w-8 h-8 rounded-full border-2 transition-all ${currentTag.color === c ? 'border-text-default scale-110' : 'border-transparent hover:scale-105'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-bg-subtle/50 p-4 rounded-lg border border-border-default">
                                <h4 className="font-bold text-sm text-text-default mb-3 flex items-center gap-2">
                                    <InformationCircleIcon className="w-4 h-4 text-primary-500"/>
                                    תיוג אוטומטי
                                </h4>
                                <p className="text-xs text-text-muted mb-4">המערכת תסרוק את קורות החיים ותתייג אוטומטית בהתאם לביטויים שתגדיר.</p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-green-700 mb-1">ביטויים חיוביים (תנאי 'או')</label>
                                        <textarea 
                                            value={currentTag.positiveExpressions}
                                            onChange={e => setCurrentTag({...currentTag, positiveExpressions: e.target.value})}
                                            className="w-full bg-white border border-green-200 text-text-default text-sm rounded-lg p-2.5 focus:ring-green-500 focus:border-green-500 min-h-[80px]"
                                            placeholder="מופרד בפסיק. לדוגמה: מנהל, ראש צוות"
                                        />
                                        <p className="text-[10px] text-text-subtle mt-1">אם אחד מהביטויים נמצא, התגית תווסף.</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-red-700 mb-1">ביטויים שליליים (פסילה)</label>
                                        <textarea 
                                            value={currentTag.negativeExpressions}
                                            onChange={e => setCurrentTag({...currentTag, negativeExpressions: e.target.value})}
                                            className="w-full bg-white border border-red-200 text-text-default text-sm rounded-lg p-2.5 focus:ring-red-500 focus:border-red-500 min-h-[60px]"
                                            placeholder="מופרד בפסיק. לדוגמה: עוזר, זוטר"
                                        />
                                        <p className="text-[10px] text-text-subtle mt-1">אם אחד מהביטויים נמצא, התגית לא תווסף גם אם יש התאמה חיובית.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
                             <button onClick={() => setIsEditing(false)} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                             <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition shadow-sm">שמור תגית</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompanyTagsSettingsView;
