
import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon, CalendarIcon, ClockIcon, PhoneIcon, EnvelopeIcon, SmsSlashIcon, WhatsappIcon, Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon } from './Icons';

type Status = 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'נדחה' | 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון' | 'התקבל לעבודה' | 'בהמתנה';

const statusOptions: Status[] = ['חדש', 'בבדיקה', 'ראיון', 'הצעה', 'התקבל', 'נדחה', 'פעיל', 'הוזמן לראיון', 'לא רלוונטי', 'מועמד משך עניין', 'בארכיון', 'התקבל לעבודה', 'בהמתנה'];

interface UpdateStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => void;
    initialStatus: Status;
    onOpenNewTask: () => void;
}

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({ isOpen, onClose, onSave, initialStatus, onOpenNewTask }) => {
    const [formData, setFormData] = useState({
        status: initialStatus,
        note: '',
        dueDate: '',
        dueTime: '',
        inviteCandidate: false,
        inviteClient: false
    });
    
    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            setFormData({
                status: initialStatus,
                note: '',
                dueDate: now.toISOString().split('T')[0],
                dueTime: now.toTimeString().substring(0,5),
                inviteCandidate: false,
                inviteClient: false
            });
        }
    }, [isOpen, initialStatus]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData(prev => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };
    
    const handleSave = () => {
        onSave(formData);
    };

    const handleCreateReminder = () => {
        onClose();
        onOpenNewTask();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div 
                className="bg-bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-text-default transform transition-transform" 
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                    <h2 className="text-xl font-bold text-text-default">עדכון סטטוס</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור"><XMarkIcon className="w-6 h-6" /></button>
                </header>

                <main className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto">
                    <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr] items-stretch sm:items-center gap-4 sm:gap-x-4 sm:gap-y-6">
                        <label className="font-semibold text-text-muted text-right text-sm sm:text-base">סטטוס:</label>
                        <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm sm:text-base rounded-lg p-3 sm:p-2.5">
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <label className="font-semibold text-text-muted text-right text-sm sm:text-base">תאריך יעד:</label>
                        <div className="flex items-center gap-2">
                             <div className="relative flex-1">
                                <CalendarIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm sm:text-base rounded-lg p-3 sm:p-2.5 pr-9" />
                            </div>
                             <div className="relative flex-1">
                                <ClockIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input type="time" name="dueTime" value={formData.dueTime} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm sm:text-base rounded-lg p-3 sm:p-2.5 pr-9" />
                            </div>
                        </div>
                        
                        <label htmlFor="internal-note" className="font-semibold text-text-muted text-right self-start pt-2 text-sm sm:text-base">הערה פנימית:</label>
                        <textarea 
                            id="internal-note" 
                            name="note" 
                            value={formData.note} 
                            onChange={handleChange} 
                            rows={4} 
                            className="w-full bg-bg-input border border-border-default text-sm sm:text-base rounded-lg p-3 sm:p-2.5 resize-none"
                            placeholder="הוסף הערה..."
                        ></textarea>
                    </div>
                    
                    <div className="space-y-4 pt-2 border-t border-border-default sm:border-0 sm:pt-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm font-semibold text-text-muted">
                           <span className="mb-1 sm:mb-0">עדכן מועמד:</span>
                           <div className="flex items-center gap-2">
                                <button title="Phone" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><PhoneIcon className="w-5 h-5"/></button>
                                <button title="Email" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><EnvelopeIcon className="w-5 h-5"/></button>
                                <button title="Whatsapp" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><WhatsappIcon className="w-5 h-5"/></button>
                           </div>
                        </div>
                         <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm font-semibold text-text-muted">
                           <span className="mb-1 sm:mb-0">שליחת זימון אל:</span>
                           <div className="flex items-center gap-2">
                                <button title="Microsoft 365" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><Microsoft365Icon className="w-5 h-5"/></button>
                                <button title="Outlook Task" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><OutlookTaskIcon className="w-5 h-5"/></button>
                                <button title="Google Calendar" className="p-2.5 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"><GoogleCalendarIcon className="w-5 h-5"/></button>
                           </div>
                            <div className="flex gap-4 mt-2 sm:mt-0">
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="inviteCandidate" checked={formData.inviteCandidate} onChange={handleChange} className="w-5 h-5 text-primary-600 rounded" /> מועמד</label>
                                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="inviteClient" checked={formData.inviteClient} onChange={handleChange} className="w-5 h-5 text-primary-600 rounded" /> לקוח</label>
                            </div>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-between items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0 sticky bottom-0 z-10">
                    <button onClick={handleCreateReminder} type="button" className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2.5 px-4 rounded-xl hover:bg-bg-hover transition shadow-sm text-sm">
                        <PaperAirplaneIcon className="w-5 h-5" />
                        <span>תזכורת</span>
                    </button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm">
                        שמירה
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UpdateStatusModal;
