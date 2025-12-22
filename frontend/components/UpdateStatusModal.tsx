
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
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">עדכון סטטוס</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור"><XMarkIcon className="w-6 h-6" /></button>
                </header>

                <main className="p-6 space-y-6">
                    <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-6">
                        <label className="font-semibold text-text-muted text-right">סטטוס:</label>
                        <select name="status" value={formData.status} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5">
                            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>

                        <label className="font-semibold text-text-muted text-right">תאריך יעד:</label>
                        <div className="flex items-center gap-2">
                             <div className="relative flex-1">
                                <CalendarIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 pr-9" />
                            </div>
                             <div className="relative flex-1">
                                <ClockIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input type="time" name="dueTime" value={formData.dueTime} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 pr-9" />
                            </div>
                        </div>
                        
                        <label htmlFor="internal-note" className="font-semibold text-text-muted text-right self-start pt-2">הערה פנימית:</label>
                        <textarea id="internal-note" name="note" value={formData.note} onChange={handleChange} rows={4} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"></textarea>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-sm font-semibold text-text-muted">
                           <span>עדכן מועמד:</span>
                           <div className="flex items-center gap-2">
                                <button title="Phone" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><PhoneIcon className="w-5 h-5"/></button>
                                <button title="Email" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><EnvelopeIcon className="w-5 h-5"/></button>
                                <button title="SMS (disabled)" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted cursor-not-allowed"><SmsSlashIcon className="w-5 h-5"/></button>
                                <button title="Whatsapp" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><WhatsappIcon className="w-5 h-5"/></button>
                           </div>
                        </div>
                         <div className="flex items-center gap-4 text-sm font-semibold text-text-muted">
                           <span>שליחת זימון אל:</span>
                           <div className="flex items-center gap-2">
                                <button title="Microsoft 365" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><Microsoft365Icon className="w-5 h-5"/></button>
                                <button title="Outlook Task" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><OutlookTaskIcon className="w-5 h-5"/></button>
                                <button title="Google Calendar" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><GoogleCalendarIcon className="w-5 h-5"/></button>
                           </div>
                            <label className="flex items-center gap-2"><input type="checkbox" name="inviteCandidate" checked={formData.inviteCandidate} onChange={handleChange} className="w-4 h-4 text-primary-600 rounded" /> מועמד</label>
                            <label className="flex items-center gap-2"><input type="checkbox" name="inviteClient" checked={formData.inviteClient} onChange={handleChange} className="w-4 h-4 text-primary-600 rounded" /> לקוח</label>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-between items-center p-4 bg-bg-subtle border-t border-border-default">
                    <button onClick={handleCreateReminder} type="button" className="flex items-center gap-2 bg-bg-card border border-border-default text-text-default font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover transition shadow-sm">
                        <PaperAirplaneIcon className="w-5 h-5" />
                        <span>יצירת תזכורת</span>
                    </button>
                    <button onClick={handleSave} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm">
                        שמירה
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UpdateStatusModal;