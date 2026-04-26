
import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon, CalendarIcon, ClockIcon, PhoneIcon, EnvelopeIcon, WhatsappIcon, Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon } from './Icons';
import Tooltip from './Tooltip';

type Status =
    | 'חדש'
    | 'בבדיקה'
    | 'ראיון'
    | 'הצעה'
    | 'התקבל'
    | 'נדחה'
    | 'פעיל'
    | 'הוזמן לראיון'
    | 'לא רלוונטי'
    | 'מועמד משך עניין'
    | 'בארכיון'
    | 'התקבל לעבודה'
    | 'בהמתנה'
    | 'נשלחו קו"ח';

const statusOptions: Status[] = [
    'חדש',
    'בבדיקה',
    'ראיון',
    'הצעה',
    'התקבל',
    'נדחה',
    'פעיל',
    'הוזמן לראיון',
    'לא רלוונטי',
    'מועמד משך עניין',
    'בארכיון',
    'התקבל לעבודה',
    'בהמתנה',
    'נשלחו קו"ח',
];

export type UpdateStatusFormData = {
    status: Status;
    note: string;
    dueDate: string;
    dueTime: string;
    inviteCandidate: boolean;
    inviteClient: boolean;
};

interface UpdateStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: UpdateStatusFormData) => void | Promise<void>;
    initialStatus: Status;
    onOpenNewTask: () => void;
    /** e.g. candidate name */
    contextPrimary?: string;
    /** e.g. job · client */
    contextSecondary?: string;
    initialNote?: string;
    initialDueDate?: string;
    initialDueTime?: string;
    initialInviteCandidate?: boolean;
    initialInviteClient?: boolean;
    candidatePhone?: string | null;
    candidateEmail?: string | null;
}

const digitsOnly = (s: string) => String(s || '').replace(/\D/g, '');

const UpdateStatusModal: React.FC<UpdateStatusModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialStatus,
    onOpenNewTask,
    contextPrimary,
    contextSecondary,
    initialNote,
    initialDueDate,
    initialDueTime,
    initialInviteCandidate,
    initialInviteClient,
    candidatePhone,
    candidateEmail,
}) => {
    const [formData, setFormData] = useState<UpdateStatusFormData>({
        status: initialStatus,
        note: '',
        dueDate: '',
        dueTime: '',
        inviteCandidate: false,
        inviteClient: false,
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        const now = new Date();
        const isoDate = now.toISOString().split('T')[0];
        const isoTime = now.toTimeString().substring(0, 5);
        setError(null);
        setFormData({
            status: initialStatus,
            note: initialNote != null ? String(initialNote) : '',
            dueDate: initialDueDate != null && String(initialDueDate).trim() !== '' ? String(initialDueDate).trim() : isoDate,
            dueTime: initialDueTime != null && String(initialDueTime).trim() !== '' ? String(initialDueTime).trim() : isoTime,
            inviteCandidate: Boolean(initialInviteCandidate),
            inviteClient: Boolean(initialInviteClient),
        });
    }, [isOpen, initialStatus, initialNote, initialDueDate, initialDueTime, initialInviteCandidate, initialInviteClient]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };

    const handleSave = async () => {
        setError(null);
        setSaving(true);
        try {
            await Promise.resolve(onSave(formData));
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'שמירה נכשלה';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateReminder = () => {
        onClose();
        onOpenNewTask();
    };

    const openTel = () => {
        const p = digitsOnly(candidatePhone || '');
        if (!p) {
            setError('אין מספר טלפון למועמד בפרופיל');
            return;
        }
        window.location.href = `tel:${p}`;
    };

    const openMailto = () => {
        const em = String(candidateEmail || '').trim();
        if (!em) {
            setError('אין כתובת אימייל למועמד בפרופיל');
            return;
        }
        window.location.href = `mailto:${encodeURIComponent(em)}`;
    };

    const openWhatsapp = () => {
        let p = digitsOnly(candidatePhone || '');
        if (p.startsWith('0')) p = `972${p.slice(1)}`;
        if (!p) {
            setError('אין מספר טלפון לוואטסאפ');
            return;
        }
        window.open(`https://wa.me/${p}`, '_blank', 'noopener,noreferrer');
    };

    const calTitle = encodeURIComponent(
        [contextPrimary, contextSecondary].filter(Boolean).join(' — ') || 'הירו — עדכון סטטוס',
    );
    const openGoogleCal = () => {
        window.open(
            `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${calTitle}`,
            '_blank',
            'noopener,noreferrer',
        );
    };

    const openOutlook = () => {
        window.open('https://outlook.office.com/calendar/action/compose', '_blank', 'noopener,noreferrer');
    };

    const openM365 = () => {
        window.open('https://www.office.com/launch/outlook', '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-bg-card w-full h-full sm:w-[750px] sm:max-w-[95vw] sm:h-auto sm:max-h-[90vh] sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden text-text-default transform transition-transform"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0 gap-3">
                    <div className="min-w-0 text-right flex-1">
                        <h2 className="text-xl font-bold text-text-default">עדכון סטטוס מתועד</h2>
                        {(contextPrimary || contextSecondary) && (
                            <p className="text-sm text-text-muted mt-1 truncate" title={[contextPrimary, contextSecondary].filter(Boolean).join(' · ')}>
                                {contextPrimary && <span className="font-semibold text-text-default">{contextPrimary}</span>}
                                {contextPrimary && contextSecondary && ' · '}
                                {contextSecondary}
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover flex-shrink-0" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="p-4 sm:p-6 flex-1 overflow-y-auto">
                    {error && (
                        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 text-right" role="alert">
                            {error}
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                        <div className="flex flex-col gap-5">
                            <div>
                                <label className="block text-sm font-bold text-text-muted mb-1.5 text-right">סטטוס:</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 outline-none focus:border-primary-400 transition-colors"
                                >
                                    {statusOptions.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-text-muted mb-1.5 text-right">תאריך יעד:</label>
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-1">
                                        <CalendarIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="date"
                                            name="dueDate"
                                            value={formData.dueDate}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 pr-9 outline-none focus:border-primary-400 transition-colors cursor-pointer"
                                        />
                                    </div>
                                    <div className="relative flex-1">
                                        <ClockIcon className="w-4 h-4 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="time"
                                            name="dueTime"
                                            value={formData.dueTime}
                                            onChange={handleChange}
                                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5 pr-9 outline-none focus:border-primary-400 transition-colors cursor-pointer"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 border-t border-border-default pt-4">
                                <div>
                                    <label className="block text-sm font-bold text-text-muted mb-1.5 text-right">עדכן מועמד דרך:</label>
                                    <div className="flex items-center gap-2">
                                        <Tooltip content="טלפון">
                                            <button
                                                type="button"
                                                onClick={openTel}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <PhoneIcon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="אימייל">
                                            <button
                                                type="button"
                                                onClick={openMailto}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <EnvelopeIcon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="וואטסאפ">
                                            <button
                                                type="button"
                                                onClick={openWhatsapp}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <WhatsappIcon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-text-muted mb-1.5 text-right">שליחת זימון חדש:</label>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Tooltip content="Microsoft 365">
                                            <button
                                                type="button"
                                                onClick={openM365}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <Microsoft365Icon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Outlook Task">
                                            <button
                                                type="button"
                                                onClick={openOutlook}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <OutlookTaskIcon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                        <Tooltip content="Google Calendar">
                                            <button
                                                type="button"
                                                onClick={openGoogleCal}
                                                className="p-2 sm:p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition flex-1 flex justify-center"
                                            >
                                                <GoogleCalendarIcon className="w-5 h-5" />
                                            </button>
                                        </Tooltip>
                                    </div>
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-text-default hover:text-primary-700 transition">
                                            <input
                                                type="checkbox"
                                                name="inviteCandidate"
                                                checked={formData.inviteCandidate}
                                                onChange={handleChange}
                                                className="w-4 h-4 text-primary-600 rounded border-border-default focus:ring-primary-500/20"
                                            />
                                            למועמד
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-text-default hover:text-primary-700 transition">
                                            <input
                                                type="checkbox"
                                                name="inviteClient"
                                                checked={formData.inviteClient}
                                                onChange={handleChange}
                                                className="w-4 h-4 text-primary-600 rounded border-border-default focus:ring-primary-500/20"
                                            />
                                            ללקוח
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 h-full">
                            <div className="flex-1 flex flex-col min-h-[150px]">
                                <label htmlFor="internal-note" className="block text-sm font-bold text-text-muted mb-1.5 text-right">
                                    הערה פנימית (תיעוד הפעולה):
                                </label>
                                <textarea
                                    id="internal-note"
                                    name="note"
                                    value={formData.note}
                                    onChange={handleChange}
                                    className="w-full h-full min-h-[120px] bg-bg-input border border-border-default text-sm rounded-lg p-3 resize-none outline-none focus:border-primary-400 transition-colors"
                                    placeholder="הוסף מידע רלוונטי, סיכום הפעולה או הערות להמשך הטיפול..."
                                />
                            </div>
                        </div>
                    </div>
                </main>
                <footer className="flex justify-between items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0 sticky bottom-0 z-10">
                    <button
                        onClick={handleCreateReminder}
                        type="button"
                        className="flex items-center gap-2 bg-white border border-border-default text-text-default font-semibold py-2.5 px-4 rounded-xl hover:bg-bg-hover transition shadow-sm text-sm"
                    >
                        <PaperAirplaneIcon className="w-5 h-5" />
                        <span>תזכורת</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 text-sm disabled:opacity-60"
                    >
                        {saving ? 'שומר…' : 'שמירה'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default UpdateStatusModal;
