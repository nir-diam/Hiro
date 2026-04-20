
import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon, CalendarIcon, ClockIcon, PhoneIcon, EnvelopeIcon, WhatsappIcon, Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon } from './Icons';

type Status = 'חדש' | 'בבדיקה' | 'ראיון' | 'הצעה' | 'התקבל' | 'נדחה' | 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון' | 'התקבל לעבודה' | 'בהמתנה';

const statusOptions: Status[] = ['חדש', 'בבדיקה', 'ראיון', 'הצעה', 'התקבל', 'נדחה', 'פעיל', 'הוזמן לראיון', 'לא רלוונטי', 'מועמד משך עניין', 'בארכיון', 'התקבל לעבודה', 'בהמתנה'];

interface UpdateStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** May return a Promise; reject with Error to show message in modal */
    onSave: (data: any) => void | Promise<void>;
    initialStatus: Status;
    onOpenNewTask: () => void;
    /** Bold line under title (e.g. candidate name) */
    contextPrimary?: string;
    /** Muted second line (e.g. job · client) */
    contextSecondary?: string;
    /** Pre-fill from server (screening CV referral / notification row) */
    initialNote?: string;
    initialDueDate?: string;
    initialDueTime?: string;
}

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialStatus,
    onOpenNewTask,
    contextPrimary,
    contextSecondary,
    initialNote = '',
    initialDueDate,
    initialDueTime,
}) => {
    const [formData, setFormData] = useState({
        status: initialStatus,
        note: '',
        dueDate: '',
        dueTime: '',
        inviteCandidate: false,
        inviteClient: false
    });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    
    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            const defaultDate = now.toISOString().split('T')[0];
            const defaultTime = now.toTimeString().substring(0, 5);
            setSaveError(null);
            setFormData({
                status: initialStatus,
                note: initialNote != null ? String(initialNote) : '',
                dueDate: initialDueDate != null && String(initialDueDate).trim() !== '' ? String(initialDueDate).trim() : defaultDate,
                dueTime: initialDueTime != null && String(initialDueTime).trim() !== '' ? String(initialDueTime).trim() : defaultTime,
                inviteCandidate: false,
                inviteClient: false
            });
        }
    }, [isOpen, initialStatus, initialNote, initialDueDate, initialDueTime]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData(prev => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };
    
    const handleSave = async () => {
        setSaveError(null);
        setSaving(true);
        try {
            await Promise.resolve(onSave(formData));
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateReminder = () => {
        if (saving) return;
        onClose();
        onOpenNewTask();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => !saving && onClose()}>
            <div 
                className="bg-bg-card w-full h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-text-default transform transition-transform" 
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-3 p-4 border-b border-border-default bg-bg-subtle/30 flex-shrink-0">
                    <div className="min-w-0 flex-1 text-right">
                        <h2 className="text-lg sm:text-xl font-bold text-text-default leading-tight">עדכון סטטוס</h2>
                        {(contextPrimary || contextSecondary) && (
                            <div className="mt-2 space-y-0.5">
                                {contextPrimary ? (
                                    <p className="text-sm font-semibold text-text-default truncate" title={contextPrimary}>
                                        {contextPrimary}
                                    </p>
                                ) : null}
                                {contextSecondary ? (
                                    <p className="text-xs text-text-muted leading-snug line-clamp-2" title={contextSecondary}>
                                        {contextSecondary}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => !saving && onClose()}
                        disabled={saving}
                        className="p-2 rounded-full text-text-muted hover:bg-bg-hover shrink-0 disabled:opacity-50"
                        aria-label="סגור"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
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
                <footer className="p-4 bg-bg-subtle border-t border-border-default flex-shrink-0 sticky bottom-0 z-10 space-y-3">
                    {saveError ? (
                        <p className="text-sm text-red-600 text-center" role="alert">
                            {saveError}
                        </p>
                    ) : null}
                    <div className="flex justify-between items-center gap-2">
                        <button
                            onClick={handleCreateReminder}
                            type="button"
                            disabled={saving}
                            className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2.5 px-4 rounded-xl hover:bg-bg-hover transition shadow-sm text-sm disabled:opacity-50"
                        >
                            <PaperAirplaneIcon className="w-5 h-5" />
                            <span>תזכורת</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleSave()}
                            disabled={saving}
                            className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm disabled:opacity-60"
                        >
                            {saving ? 'שומר…' : 'שמירה'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default UpdateStatusModal;
