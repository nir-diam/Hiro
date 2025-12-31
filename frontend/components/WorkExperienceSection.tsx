
import React, { useState } from 'react';
import { PencilIcon, TrashIcon, PlusIcon, CheckIcon, XMarkIcon, ChevronUpIcon, ChevronDownIcon, SparklesIcon } from './Icons';
import { GoogleGenAI } from '@google/genai';

interface Experience {
    id: number;
    title: string;
    company: string;
    companyField: string;
    startDate: string; // YYYY-MM
    endDate: string;   // YYYY-MM or "Present"
    description: string;
}

interface WorkExperienceSectionProps {
    experience: Experience[];
    onExperienceChange: (newExperience: Experience[]) => void;
}

const calculateDuration = (startDate: string, endDate: string): string => {
    const start = new Date(startDate);
    const end = endDate === 'Present' ? new Date() : new Date(endDate);
    
    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    if (years === 0 && months === 0) return "חודש";
    
    const yearStr = years > 0 ? `${years} שנ${years > 1 ? 'ים' : 'ה'}` : '';
    const monthStr = months > 0 ? `${months} חודש${months > 1 ? 'ים' : ''}` : '';

    return [yearStr, monthStr].filter(Boolean).join(' ו');
};


const ExperienceForm: React.FC<{
    item: Omit<Experience, 'id'> | Experience;
    onSave: (item: Omit<Experience, 'id'> | Experience) => void;
    onCancel: () => void;
}> = ({ item, onSave, onCancel }) => {
    const [formData, setFormData] = useState(item);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const { name, value, type, checked } = e.target;
         if (name === 'endDate' && type === 'checkbox') {
             setFormData(prev => ({...prev, endDate: checked ? 'Present' : ''}));
         } else {
             setFormData(prev => ({...prev, [name]: value }));
         }
    };

    const handleGenerateDescription = async () => {
        if (!formData.title) return;
        setIsGenerating(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            
            const contextParts = [];
            contextParts.push(`תפקיד: ${formData.title}`);
            if (formData.company) contextParts.push(`חברה: ${formData.company}`);
            if (formData.companyField) contextParts.push(`תחום עיסוק החברה: ${formData.companyField}`);

            const prompt = `
            כתוב תיאור תפקיד מקצועי ותמציתי (3-4 נקודות, בולטים) בעברית עבור קורות חיים, בהתבסס על הפרטים הבאים:
            ${contextParts.join(', ')}.
            הניסוח צריך להיות מרשים, בגוף ראשון (למשל: "ניהלתי", "פיתחתי"), ולהדגיש אחריות והישגים.
            `;

            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
            });

            if (response.text) {
                setFormData(prev => ({ ...prev, description: response.text.trim() }));
            }
        } catch (error) {
            console.error("AI Generation failed", error);
            alert("אירעה שגיאה ביצירת התיאור. אנא נסה שנית.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
         <div className="space-y-4 p-4 bg-primary-50/50 rounded-lg border border-primary-200 shadow-sm animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">תפקיד</label>
                    <input name="title" value={formData.title} onChange={handleChange} placeholder="לדוגמה: מנהל מוצר" className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500" />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-text-muted mb-1">חברה</label>
                    <input name="company" value={formData.company} onChange={handleChange} placeholder="שם החברה" className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500" />
                </div>
            </div>
            <div>
                 <label className="block text-xs font-semibold text-text-muted mb-1">תחום עיסוק החברה</label>
                 <input name="companyField" value={formData.companyField} onChange={handleChange} placeholder="לדוגמה: הייטק / פינטק" className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500" />
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                 <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <label className="block text-xs font-semibold text-text-muted mb-1">תאריך התחלה</label>
                        <input type="month" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm text-text-muted focus:ring-1 focus:ring-primary-500" />
                    </div>
                    <span className="mt-6">-</span>
                    <div className="flex-1">
                         <label className="block text-xs font-semibold text-text-muted mb-1">תאריך סיום</label>
                         <input type="month" name="endDate" value={formData.endDate === 'Present' ? '' : formData.endDate} onChange={handleEndDateChange} disabled={formData.endDate === 'Present'} className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm text-text-muted disabled:bg-bg-subtle focus:ring-1 focus:ring-primary-500" />
                    </div>
                 </div>
                 <label className="flex items-center gap-2 text-sm font-medium cursor-pointer mt-6">
                    <input type="checkbox" name="endDate" checked={formData.endDate === 'Present'} onChange={handleEndDateChange} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                    אני עובד/ת כאן כיום
                </label>
             </div>
            
            <div className="relative">
                <div className="flex justify-between items-end mb-1">
                    <label className="block text-xs font-semibold text-text-muted">תיאור התפקיד</label>
                    <button 
                        onClick={handleGenerateDescription}
                        disabled={!formData.title || isGenerating}
                        className={`text-xs flex items-center gap-1 font-bold transition-colors ${
                            !formData.title 
                            ? 'text-gray-300 cursor-not-allowed' 
                            : 'text-purple-600 hover:text-purple-700'
                        }`}
                        title={!formData.title ? "יש להזין תפקיד תחילה" : "צור תיאור אוטומטי בעזרת AI"}
                    >
                        {isGenerating ? (
                             <span className="animate-pulse">חושב...</span>
                        ) : (
                            <>
                                <SparklesIcon className="w-3 h-3" />
                                <span>כתוב עבורי</span>
                            </>
                        )}
                    </button>
                </div>
                <textarea 
                    name="description" 
                    value={formData.description} 
                    onChange={handleChange} 
                    rows={4} 
                    placeholder="פרט על תחומי האחריות, הישגים מרכזיים וטכנולוגיות..." 
                    className="w-full bg-bg-input border border-border-default rounded-md p-2 text-sm focus:ring-1 focus:ring-primary-500"
                ></textarea>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                <button onClick={onCancel} className="p-2 text-text-muted hover:bg-bg-hover rounded-full transition-colors"><XMarkIcon className="w-5 h-5"/></button>
                <button onClick={() => onSave(formData)} className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-full transition-colors shadow-sm"><CheckIcon className="w-5 h-5"/></button>
            </div>
        </div>
    );
};


const WorkExperienceSection: React.FC<WorkExperienceSectionProps> = ({ experience, onExperienceChange }) => {
    const [editingId, setEditingId] = useState<number | null | 'new'>(null);

    const handleSave = (item: Omit<Experience, 'id'> | Experience) => {
        if ('id' in item) { // Editing existing
            onExperienceChange(experience.map(exp => exp.id === item.id ? item : exp));
        } else { // Adding new
            onExperienceChange([{ ...item, id: Date.now() }, ...experience]); // Add new to top
        }
        setEditingId(null);
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        const newExperience = [...experience];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        if (targetIndex >= 0 && targetIndex < newExperience.length) {
            // Swap items
            [newExperience[index], newExperience[targetIndex]] = [newExperience[targetIndex], newExperience[index]];
            onExperienceChange(newExperience);
        }
    };

    return (
        <div className="space-y-4">
            <div className="relative border-r-2 border-primary-200 pr-8 space-y-8">
                {experience.map((item, index) => (
                    <div key={item.id} className="relative transition-all duration-300">
                        {/* Timeline Dot */}
                        <div className="absolute top-4 -right-[41px] w-4 h-4 rounded-full bg-bg-card ring-4 ring-primary-200 z-10"></div>
                        
                        {editingId === item.id ? (
                            <ExperienceForm 
                                item={item}
                                onSave={handleSave}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <div className="bg-bg-subtle/40 border border-border-default hover:border-primary-200 p-4 rounded-lg group transition-all hover:bg-bg-card hover:shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-base text-text-default">{item.title}</h4>
                                        <p className="text-sm font-semibold text-text-muted">{item.company} {item.companyField && `· ${item.companyField}`}</p>
                                        <p className="text-xs text-text-subtle mt-1">{new Date(item.startDate).toLocaleDateString('he-IL', {year: 'numeric', month: 'short'})} - {item.endDate === 'Present' ? 'כיום' : new Date(item.endDate).toLocaleDateString('he-IL', {year: 'numeric', month: 'short'})} &middot; <span className="font-semibold">{calculateDuration(item.startDate, item.endDate)}</span></p>
                                    </div>
                                    
                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-card/80 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-border-subtle">
                                        <div className="flex flex-col border-l border-border-default pl-1 ml-1">
                                            <button 
                                                onClick={() => handleMoveItem(index, 'up')} 
                                                disabled={index === 0}
                                                className="p-1 text-text-subtle hover:text-primary-600 disabled:opacity-30 disabled:hover:text-text-subtle transition-colors"
                                                title="הזז למעלה"
                                            >
                                                <ChevronUpIcon className="w-3.5 h-3.5"/>
                                            </button>
                                            <button 
                                                onClick={() => handleMoveItem(index, 'down')} 
                                                disabled={index === experience.length - 1}
                                                className="p-1 text-text-subtle hover:text-primary-600 disabled:opacity-30 disabled:hover:text-text-subtle transition-colors"
                                                title="הזז למטה"
                                            >
                                                <ChevronDownIcon className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                        <button onClick={() => setEditingId(item.id)} className="p-1.5 text-text-muted hover:text-primary-600 rounded-md hover:bg-primary-50 transition-colors" title="ערוך">
                                            <PencilIcon className="w-4 h-4"/>
                                        </button>
                                        <button onClick={() => onExperienceChange(experience.filter(exp => exp.id !== item.id))} className="p-1.5 text-text-muted hover:text-red-500 rounded-md hover:bg-red-50 transition-colors" title="מחק">
                                            <TrashIcon className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </div>
                                {item.description && (
                                    <p className="text-sm text-text-muted mt-3 whitespace-pre-line leading-relaxed border-t border-border-subtle pt-2">
                                        {item.description}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {editingId === 'new' ? (
                <ExperienceForm
                    item={{ title: '', company: '', companyField: '', startDate: '', endDate: 'Present', description: '' }}
                    onSave={handleSave}
                    onCancel={() => setEditingId(null)}
                />
            ) : (
                <div className="pt-2">
                    <button onClick={() => setEditingId('new')} className="w-full flex items-center justify-center gap-2 bg-white border-2 border-dashed border-primary-200 text-primary-600 font-semibold py-3 px-4 rounded-xl hover:bg-primary-50 hover:border-primary-300 transition-all group">
                        <div className="bg-primary-100 p-1 rounded-full group-hover:scale-110 transition-transform">
                             <PlusIcon className="w-4 h-4" />
                        </div>
                        <span>הוסף ניסיון תעסוקתי</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default WorkExperienceSection;
