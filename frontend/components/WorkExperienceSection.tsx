import React, { useState } from 'react';
import { PencilIcon, TrashIcon, PlusIcon, CheckIcon, XMarkIcon } from './Icons';

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

    return (
         <div className="space-y-4 p-4 bg-primary-50/50 rounded-lg border border-primary-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" value={formData.title} onChange={handleChange} placeholder="תפקיד" className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm" />
                <input name="company" value={formData.company} onChange={handleChange} placeholder="חברה" className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm" />
            </div>
            <input name="companyField" value={formData.companyField} onChange={handleChange} placeholder="תחום עיסוק החברה" className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm" />
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                 <div className="flex items-center gap-2">
                    <input type="month" name="startDate" value={formData.startDate} onChange={handleChange} className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm text-text-muted" />
                    <span>-</span>
                     <input type="month" name="endDate" value={formData.endDate === 'Present' ? '' : formData.endDate} onChange={handleEndDateChange} disabled={formData.endDate === 'Present'} className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm text-text-muted disabled:bg-bg-subtle" />
                 </div>
                 <label className="flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" name="endDate" checked={formData.endDate === 'Present'} onChange={handleEndDateChange} className="w-4 h-4 text-primary-600 rounded" />
                    אני עובד/ת כאן כיום
                </label>
             </div>
            <textarea name="description" value={formData.description} onChange={handleChange} rows={3} placeholder="תיאור התפקיד..." className="w-full bg-bg-input border-border-default rounded-md p-2 text-sm"></textarea>
            <div className="flex justify-end gap-2">
                <button onClick={onCancel} className="p-2 text-text-muted hover:bg-bg-hover rounded-full"><XMarkIcon className="w-5 h-5"/></button>
                <button onClick={() => onSave(formData)} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><CheckIcon className="w-5 h-5"/></button>
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
            onExperienceChange([...experience, { ...item, id: Date.now() }]);
        }
        setEditingId(null);
    };

    return (
        <div className="space-y-4">
            <div className="relative border-r-2 border-primary-200 pr-8 space-y-8">
                {experience.map(item => (
                    <div key={item.id} className="relative">
                        <div className="absolute top-1 -right-[41px] w-4 h-4 rounded-full bg-bg-card ring-4 ring-primary-200"></div>
                        {editingId === item.id ? (
                            <ExperienceForm 
                                item={item}
                                onSave={handleSave}
                                onCancel={() => setEditingId(null)}
                            />
                        ) : (
                            <div className="bg-bg-subtle/50 p-4 rounded-lg group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-base text-text-default">{item.title}</h4>
                                        <p className="text-sm font-semibold text-text-muted">{item.company} &middot; {item.companyField}</p>
                                        <p className="text-xs text-text-subtle mt-1">{new Date(item.startDate).toLocaleDateString('he-IL', {year: 'numeric', month: 'short'})} - {item.endDate === 'Present' ? 'כיום' : new Date(item.endDate).toLocaleDateString('he-IL', {year: 'numeric', month: 'short'})} &middot; <span className="font-semibold">{calculateDuration(item.startDate, item.endDate)}</span></p>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => setEditingId(item.id)} className="p-2 text-text-muted hover:text-primary-600 rounded-full"><PencilIcon className="w-5 h-5"/></button>
                                        <button onClick={() => onExperienceChange(experience.filter(exp => exp.id !== item.id))} className="p-2 text-text-muted hover:text-red-500 rounded-full"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>
                                <p className="text-sm text-text-muted mt-2 whitespace-pre-line">{item.description}</p>
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
                <div className="pt-4 border-t border-border-default">
                    <button onClick={() => setEditingId('new')} className="w-full flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-primary-200 transition">
                        <PlusIcon className="w-5 h-5" />
                        <span>הוסף ניסיון תעסוקתי</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default WorkExperienceSection;