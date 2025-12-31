
import React, { useState, useEffect } from 'react';
import { XMarkIcon, BriefcaseIcon, BuildingOffice2Icon, LinkIcon, CalendarDaysIcon, DocumentTextIcon } from './Icons';

interface Application {
    id: number;
    company: string;
    role: string;
    link?: string;
    cvFile?: string;
    date: string;
    notes?: string;
}

interface AddApplicationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (app: Omit<Application, 'id'>) => void;
    initialData?: Application | null;
}

const AddApplicationModal: React.FC<AddApplicationModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
    const [formData, setFormData] = useState({
        company: '',
        role: '',
        link: '',
        cvFile: 'שי שני ניהול הפצה', // Default mock file name
        date: new Date().toISOString().split('T')[0],
        notes: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                company: initialData.company,
                role: initialData.role,
                link: initialData.link || '',
                cvFile: initialData.cvFile || 'שי שני ניהול הפצה',
                date: initialData.date,
                notes: initialData.notes || ''
            });
        } else {
            setFormData({
                company: '',
                role: '',
                link: '',
                cvFile: 'שי שני ניהול הפצה',
                date: new Date().toISOString().split('T')[0],
                notes: ''
            });
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl border border-border-default flex flex-col overflow-hidden animate-fade-in">
                <header className="flex items-center justify-between p-6 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">
                        {initialData ? 'עריכת הגשה' : 'הוסף הגשה חדשה'}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-bg-hover text-text-muted transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted">תאריך הגשה</label>
                            <div className="relative">
                                <CalendarDaysIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="date" 
                                    required
                                    value={formData.date}
                                    onChange={e => setFormData({...formData, date: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
                                />
                            </div>
                        </div>
                        
                         <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted">שם חברה</label>
                            <div className="relative">
                                <BuildingOffice2Icon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    required
                                    placeholder="שם החברה..."
                                    value={formData.company}
                                    onChange={e => setFormData({...formData, company: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
                                />
                            </div>
                        </div>

                         <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted">שם המשרה</label>
                            <div className="relative">
                                <BriefcaseIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    required
                                    placeholder="כותרת התפקיד..."
                                    value={formData.role}
                                    onChange={e => setFormData({...formData, role: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
                                />
                            </div>
                        </div>
                        
                         <div className="space-y-2">
                            <label className="text-sm font-bold text-text-muted">לינק למשרה</label>
                            <div className="relative">
                                <LinkIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="url" 
                                    placeholder="https://..."
                                    value={formData.link}
                                    onChange={e => setFormData({...formData, link: e.target.value})}
                                    className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-text-muted">שם קובץ קורות חיים</label>
                         <div className="relative">
                            <DocumentTextIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input 
                                type="text" 
                                value={formData.cvFile}
                                onChange={e => setFormData({...formData, cvFile: e.target.value})}
                                className="w-full bg-bg-input border border-border-default rounded-xl py-3 pl-3 pr-10 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-text-muted">הערות</label>
                        <textarea 
                            rows={3}
                            placeholder="הערות אישיות למעקב..."
                            value={formData.notes}
                            onChange={e => setFormData({...formData, notes: e.target.value})}
                            className="w-full bg-bg-input border border-border-default rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none transition-shadow resize-none"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
                        <button type="button" onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-text-muted hover:bg-bg-hover transition-colors">
                            ביטול
                        </button>
                        <button type="submit" className="px-8 py-2.5 rounded-xl font-bold text-white bg-primary-600 hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all">
                            {initialData ? 'שמור שינויים' : 'שמור הגשה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddApplicationModal;
