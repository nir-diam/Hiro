
import React, { useState, useEffect, useRef, useId } from 'react';
import { XMarkIcon, CalendarDaysIcon, ClockIcon, Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon, ClipboardDocumentCheckIcon } from './Icons';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => void;
  onOpenCandidateSummary: (candidateId: number) => void;
}

type ClientContactOption = {
    email: string;
    label: string;
};

const SingleRangeSlider: React.FC<{
    label: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    name: string;
    unit?: string;
    className?: string;
}> = ({ label, min, max, step, value, onChange, name, unit = '', className='' }) => {
    const valuePercent = ((value - min) / (max - min)) * 100;
    const id = useId();

    return (
        <div className={className}>
            <div className="flex justify-between items-center mb-3">
                <label id={id} className="text-sm font-semibold text-text-muted mb-1.5">{label}</label>
                <span className="text-sm font-bold text-primary-700 tabular-nums">{value}{unit}</span>
            </div>
            <div className="relative h-8 flex items-center px-4">
                <div className="absolute w-full h-1.5 bg-bg-subtle rounded-full">
                    <div
                        className="absolute h-1.5 bg-primary-500 rounded-full"
                        style={{ width: `${valuePercent}%` }}
                    ></div>
                </div>
                <input
                    type="range" min={min} max={max} step={step} value={value} name={name} onChange={onChange}
                    aria-labelledby={id}
                    className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer"
                />
            </div>
        </div>
    );
};


const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onSave, onOpenCandidateSummary }) => {
    const [isTaskMode, setIsTaskMode] = useState(false);
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [contactsLoading, setContactsLoading] = useState(false);
    const [clientContactOptions, setClientContactOptions] = useState<ClientContactOption[]>([]);
    const [formData, setFormData] = useState({
        messageText: '',
        assignee: '',
        category: 'כללי',
        dueDate: '',
        dueTime: '',
        submissionPopup: false,
        submissionEmail: true,
        sla: 'בינונית' as 'נמוכה' | 'בינונית' | 'גבוהה',
        allocatedDays: 3,
    });
    const modalRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const previouslyFocusedElement = useRef<HTMLElement | null>(null);
    const titleId = useId();
    const contentId = useId();

    useEffect(() => {
        if (isOpen) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const formattedDate = `${year}-${month}-${day}`;

            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const formattedTime = `${hours}:${minutes}`;

            setFormData({
                messageText: '',
                assignee: '',
                category: 'כללי',
                dueDate: formattedDate,
                dueTime: formattedTime,
                submissionPopup: false,
                submissionEmail: true,
                sla: 'בינונית',
                allocatedDays: 3,
            });
            setIsTaskMode(false);
            
            previouslyFocusedElement.current = document.activeElement as HTMLElement;
            setTimeout(() => closeButtonRef.current?.focus(), 100);

            const handleKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Tab' && modalRef.current) {
                    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];

                    if (event.shiftKey) { // Shift+Tab
                        if (document.activeElement === firstElement) {
                            lastElement.focus();
                            event.preventDefault();
                        }
                    } else { // Tab
                        if (document.activeElement === lastElement) {
                            firstElement.focus();
                            event.preventDefault();
                        }
                    }
                } else if (event.key === 'Escape') {
                    onClose();
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                previouslyFocusedElement.current?.focus();
            };
        }
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen || !apiBase) return;
        let active = true;

        const loadContacts = async () => {
            setContactsLoading(true);
            try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
                const headers: Record<string, string> = {
                    Accept: 'application/json',
                    'Cache-Control': 'no-cache',
                };
                if (token) headers.Authorization = `Bearer ${token}`;

                const res = await fetch(`${apiBase}/api/clients/all-contacts`, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                    headers,
                });

                if (!res.ok) {
                    const t = await res.text().catch(() => '');
                    throw new Error(t || `HTTP ${res.status}`);
                }

                const data: unknown = await res.json();
                const rows = Array.isArray(data) ? data : Array.isArray((data as any)?.data) ? (data as any).data : [];

                const options: ClientContactOption[] = [];
                const unique = new Map<string, ClientContactOption>();

                for (const row of rows as any[]) {
                    const email = String(row?.email || '').trim();
                    if (!email) continue;
                    const name = String(row?.name || row?.client?.name || '').trim();
                    const label = name ? `${name} (${email})` : email;
                    unique.set(email, { email, label });
                }

                options.push(...Array.from(unique.values()));

                if (!active) return;
                setClientContactOptions(options);

                // If user didn't pick anything yet, default to the first available email.
                setFormData((prev) => {
                    if (prev.assignee) return prev;
                    return { ...prev, assignee: options[0]?.email || '' };
                });
            } catch (err) {
                console.error('[NewTaskModal] Failed to load client contacts for assignee', err);
                if (!active) return;
                setClientContactOptions([]);
            } finally {
                if (!active) return;
                setContactsLoading(false);
            }
        };

        void loadContacts();
        return () => {
            active = false;
        };
    }, [isOpen, apiBase]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        
        if (type === 'range') {
             setFormData(prev => ({ ...prev, [name]: Number(value) }));
             return;
        }

        const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
        setFormData(prev => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const taskPayload = { ...formData, isTask: isTaskMode };

        if (formData.submissionEmail) {
            try {
                if (!apiBase) throw new Error('VITE_API_BASE is not set');
                if (!formData.assignee) throw new Error('בחר כתובת אימייל ב"\"למען\""');
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

                const subjectBase = isTaskMode ? 'משימה חדשה' : 'תזכורת';
                const subject = `${subjectBase}: ${formData.category || 'כללי'}${
                    formData.dueDate && formData.dueTime ? ` (${formData.dueDate} ${formData.dueTime})` : ''
                }`;

                const res = await fetch(`${apiBase}/api/email-uploads/send`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({
                        // `to` is already an email address selected from client contacts.
                        to: formData.assignee,
                        subject,
                        text: formData.messageText || '',
                        isTask: isTaskMode,
                        messageType: isTaskMode ? 'task' : 'message',
                        assignee: formData.assignee,
                        category: formData.category,
                        dueDate: formData.dueDate,
                        dueTime: formData.dueTime,
                        submissionPopup: formData.submissionPopup,
                        submissionEmail: formData.submissionEmail,
                        sla: isTaskMode ? formData.sla : null,
                        allocatedDays: isTaskMode ? formData.allocatedDays : null,
                        taskPayload,
                    }),
                });

                if (!res.ok) {
                    const t = await res.text().catch(() => '');
                    throw new Error(t || `HTTP ${res.status}`);
                }
            } catch (err: any) {
                console.error('[NewTaskModal] email send failed', err);
                alert(err?.message || 'שליחת מייל נכשלה');
            }
        }

        onSave(taskPayload);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-bg-card rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[90vh] border border-border-default/50"
                onClick={e => e.stopPropagation()}
                style={{ animation: 'modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                    <header className="flex items-center justify-between p-6 border-b border-border-default/50 bg-bg-subtle/30 flex-shrink-0">
                        <h2 id={titleId} className="text-2xl font-black text-text-default tracking-tight">יצירת פעילות חדשה <span className="text-text-muted font-medium text-lg ml-2">(הודעה / משימה)</span></h2>
                         <button ref={closeButtonRef} type="button" onClick={onClose} className="p-2.5 rounded-full text-text-muted hover:bg-bg-hover hover:text-text-default transition-colors" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>

                    <main className="p-8 overflow-y-auto flex-grow bg-bg-card">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8">
                             {/* Right Column (in RTL): Textarea */}
                            <div className="flex flex-col h-full order-1 lg:order-2">
                                <label htmlFor={contentId} className="block text-sm font-bold text-text-default mb-2">תוכן הפעילות</label>
                                <textarea
                                    id={contentId}
                                    name="messageText"
                                    value={formData.messageText}
                                    onChange={handleChange as any}
                                    className="w-full flex-grow bg-bg-input border border-border-default text-text-default text-base rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-4 transition-all shadow-sm resize-none"
                                    placeholder="כתוב כאן את תוכן ההודעה או המשימה..."
                                />
                            </div>
                            
                            {/* Left Column (in RTL): Controls */}
                            <div className="space-y-6 order-2 lg:order-1">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-bold text-text-default mb-2">למען</label>
                                        <select
                                            name="assignee"
                                            value={formData.assignee}
                                            onChange={handleChange}
                                            disabled={contactsLoading || clientContactOptions.length === 0}
                                            className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3.5 transition-all shadow-sm disabled:opacity-50"
                                        >
                                            {contactsLoading ? (
                                                <option value="">טוען אנשי קשר...</option>
                                            ) : (
                                                <>
                                                    <option value="">בחר כתובת אימייל...</option>
                                                    {clientContactOptions.map((opt) => (
                                                        <option key={opt.email} value={opt.email}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-text-default mb-2">קטגוריה</label>
                                        <select name="category" value={formData.category} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3.5 transition-all shadow-sm">
                                            <option>כללי</option>
                                            <option>גיוס</option>
                                            <option>מכירות</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-text-default mb-2">במועד</label>
                                        <div className="relative">
                                            <CalendarDaysIcon className="w-5 h-5 text-text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3.5 pr-11 transition-all shadow-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-text-default mb-2">שעת יעד</label>
                                        <div className="relative">
                                            <ClockIcon className="w-5 h-5 text-text-muted absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="time" name="dueTime" value={formData.dueTime} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3.5 pr-11 transition-all shadow-sm" />
                                        </div>
                                    </div>
                                </div>
                                
                                <button
                                    type="button"
                                    onClick={() => setIsTaskMode(!isTaskMode)}
                                    className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-xl text-base font-bold transition-all duration-300 border-2 shadow-sm ${
                                        isTaskMode
                                            ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-primary-500/20'
                                            : 'bg-bg-card border-border-default text-text-default hover:bg-bg-subtle hover:border-primary-300'
                                    }`}
                                >
                                    <ClipboardDocumentCheckIcon className={`w-6 h-6 ${isTaskMode ? 'text-primary-600' : 'text-text-muted'}`} />
                                    <span>{isTaskMode ? 'מוגדר כמשימה' : 'הפוך למשימה'}</span>
                                </button>
                                
                                {isTaskMode && (
                                    <div className="animate-content-fade-in space-y-5 p-5 bg-bg-subtle/30 rounded-2xl border border-border-default/80">
                                        <div>
                                            <label className="block text-sm font-bold text-text-default mb-2">דחיפות</label>
                                            <select name="sla" value={formData.sla} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block p-3.5 transition-all shadow-sm">
                                                <option>נמוכה</option>
                                                <option>בינונית</option>
                                                <option>גבוהה</option>
                                            </select>
                                        </div>
                                        <SingleRangeSlider
                                            label="ימים מוקצים למשימה"
                                            min={1}
                                            max={30}
                                            step={1}
                                            value={formData.allocatedDays}
                                            onChange={handleChange}
                                            name="allocatedDays"
                                            unit=" ימים"
                                        />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                     <div className="p-5 rounded-2xl border border-border-default/80 bg-bg-subtle/30 space-y-4">
                                        <h3 className="text-sm font-bold text-text-default">התראות וזימונים</h3>
                                        <div className="flex flex-col gap-3">
                                            <label className="flex items-center gap-3 text-sm font-medium text-text-default cursor-pointer group">
                                                <input type="checkbox" name="submissionEmail" checked={formData.submissionEmail} onChange={handleChange} className="w-5 h-5 text-primary-600 bg-bg-input border-border-default rounded focus:ring-primary-500 transition-colors cursor-pointer" />
                                                <span className="group-hover:text-primary-700 transition-colors">תזכורת מייל</span>
                                            </label>
                                            <label className="flex items-center gap-3 text-sm font-medium text-text-default cursor-pointer group">
                                                <input type="checkbox" name="submissionPopup" checked={formData.submissionPopup} onChange={handleChange} className="w-5 h-5 text-primary-600 bg-bg-input border-border-default rounded focus:ring-primary-500 transition-colors cursor-pointer" />
                                                <span className="group-hover:text-primary-700 transition-colors">התראה קופצת</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-3 pt-2">
                                            <button type="button" title="Microsoft 365" className="p-2.5 rounded-xl border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 hover:shadow-sm transition-all"><Microsoft365Icon className="w-6 h-6"/></button>
                                            <button type="button" title="Outlook" className="p-2.5 rounded-xl border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 hover:shadow-sm transition-all"><OutlookTaskIcon className="w-6 h-6"/></button>
                                            <button type="button" title="Google Calendar" className="p-2.5 rounded-xl border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 hover:shadow-sm transition-all"><GoogleCalendarIcon className="w-6 h-6"/></button>
                                        </div>
                                    </div>
                                    <div className="p-5 rounded-2xl border border-border-default/80 bg-bg-subtle/30 flex flex-col">
                                      <h3 className="text-sm font-bold text-text-default mb-3">מידע מקושר</h3>
                                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm items-center flex-grow">
                                          <span className="font-medium text-text-muted justify-self-end">מועמד:</span>
                                          <button
                                            type="button"
                                            onClick={() => onOpenCandidateSummary(1)}
                                            className="text-primary-600 font-bold hover:underline text-right hover:text-primary-700 transition-colors"
                                          >
                                            שפירא גדעון
                                          </button>
                                          <span className="font-medium text-text-muted justify-self-end">משרה:</span>
                                          <span className="text-text-default font-bold">מחסנאי.ת בוקר למודיעין*</span>
                                          <span className="font-medium text-text-muted justify-self-end">לקוח:</span>
                                          <span className="text-text-default font-bold">UPS</span>
                                      </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    <footer className="flex justify-end items-center p-6 bg-bg-subtle/50 border-t border-border-default/50 flex-shrink-0 gap-4">
                        <button type="button" onClick={onClose} className="px-6 py-3 text-base font-bold text-text-default hover:bg-bg-hover rounded-xl transition-colors">
                            ביטול
                        </button>
                        <button type="submit" className="bg-primary-600 text-white font-bold py-3 px-10 rounded-xl hover:bg-primary-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-base">
                            {isTaskMode ? 'צור משימה' : 'שליחה'}
                        </button>
                    </footer>
                </form>
                <style>{`
                    @keyframes modalFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
                    @keyframes contentFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-content-fade-in { animation: contentFadeIn 0.3s ease-out forwards; }
                    input[type=range]::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        pointer-events: all;
                        width: 20px;
                        height: 20px;
                        background-color: rgb(var(--color-bg-card));
                        border-radius: 50%;
                        border: 4px solid var(--color-primary-500);
                        cursor: pointer;
                        margin-top: -8px;
                    }
                    input[type=range]::-moz-range-thumb {
                        pointer-events: all;
                        width: 12px;
                        height: 12px;
                        background-color: rgb(var(--color-bg-card));
                        border-radius: 50%;
                        border: 4px solid var(--color-primary-500);
                        cursor: pointer;
                    }
                `}</style>
            </div>
        </div>
    );
};

export default NewTaskModal;
