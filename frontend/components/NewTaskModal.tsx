import React, { useState, useEffect, useRef, useId } from 'react';
import { XMarkIcon, CalendarDaysIcon, ClockIcon, Microsoft365Icon, OutlookTaskIcon, GoogleCalendarIcon, ClipboardDocumentCheckIcon } from './Icons';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskData: any) => void;
  onOpenCandidateSummary: (candidateId: number) => void;
}

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
                    className="absolute w-full h-1.5 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto"
                />
            </div>
        </div>
    );
};


const NewTaskModal: React.FC<NewTaskModalProps> = ({ isOpen, onClose, onSave, onOpenCandidateSummary }) => {
    const [isTaskMode, setIsTaskMode] = useState(false);
    const [formData, setFormData] = useState({
        messageText: '',
        assignee: 'גילעד',
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
                assignee: 'גילעד',
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ ...formData, isTask: isTaskMode });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[90vh]"
                onClick={e => e.stopPropagation()}
                style={{ animation: 'modalFadeIn 0.2s ease-out' }}
            >
                <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                    <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                        <h2 id={titleId} className="text-xl font-bold text-text-default">{isTaskMode ? 'יצירת משימה חדשה' : 'שליחת הודעה / תזכורת'}</h2>
                         <button ref={closeButtonRef} type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>

                    <main className="p-6 overflow-y-auto flex-grow">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                             {/* Right Column (in RTL): Textarea */}
                            <div className="flex flex-col h-full order-1 lg:order-2">
                                <label htmlFor={contentId} className="block text-sm font-semibold text-text-muted mb-1.5">תוכן:</label>
                                <textarea
                                    id={contentId}
                                    name="messageText"
                                    value={formData.messageText}
                                    onChange={handleChange as any}
                                    className="w-full flex-grow bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm"
                                    placeholder="כתוב כאן את תוכן ההודעה או המשימה..."
                                />
                            </div>
                            
                            {/* Left Column (in RTL): Controls */}
                            <div className="space-y-4 order-2 lg:order-1">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">למען:</label>
                                        <select name="assignee" value={formData.assignee} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                                            <option>גילעד</option>
                                            <option>דנה כהן</option>
                                            <option>אביב לוי</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">קטגוריה:</label>
                                        <select name="category" value={formData.category} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
                                            <option>כללי</option>
                                            <option>גיוס</option>
                                            <option>מכירות</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">במועד:</label>
                                        <div className="relative">
                                            <CalendarDaysIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 pr-10 transition shadow-sm" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-text-muted mb-1.5">שעת יעד:</label>
                                        <div className="relative">
                                            <ClockIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                            <input type="time" name="dueTime" value={formData.dueTime} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 pr-10 transition shadow-sm" />
                                        </div>
                                    </div>
                                </div>
                                
                                <button
                                    type="button"
                                    onClick={() => setIsTaskMode(!isTaskMode)}
                                    className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 border-2 ${
                                        isTaskMode
                                            ? 'bg-primary-50 border-primary-500 text-primary-700'
                                            : 'bg-bg-subtle border-bg-subtle text-text-muted hover:bg-bg-hover hover:border-border-default'
                                    }`}
                                >
                                    <ClipboardDocumentCheckIcon className="w-5 h-5" />
                                    <span>{isTaskMode ? 'זוהי משימה' : 'הפוך למשימה'}</span>
                                </button>
                                
                                {isTaskMode && (
                                    <div className="animate-content-fade-in space-y-4 p-4 bg-bg-subtle/50 rounded-lg border border-border-default">
                                        <div>
                                            <label className="block text-sm font-semibold text-text-muted mb-1.5">דחיפות:</label>
                                            <select name="sla" value={formData.sla} onChange={handleChange} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm">
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                     <div className="p-4 rounded-lg border border-border-default bg-bg-subtle/50 space-y-3">
                                        <h3 className="text-sm font-semibold text-text-muted">התראות וזימונים</h3>
                                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                            <label className="flex items-center gap-2 text-sm font-medium text-text-default">
                                                <input type="checkbox" name="submissionEmail" checked={formData.submissionEmail} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500" />
                                                תזכורת מייל
                                            </label>
                                            <label className="flex items-center gap-2 text-sm font-medium text-text-default">
                                                <input type="checkbox" name="submissionPopup" checked={formData.submissionPopup} onChange={handleChange} className="w-4 h-4 text-primary-600 bg-bg-subtle border-border-default rounded focus:ring-primary-500" />
                                                קופצת
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-3 pt-1">
                                            <button type="button" title="Microsoft 365" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><Microsoft365Icon className="w-6 h-6"/></button>
                                            <button type="button" title="Outlook" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><OutlookTaskIcon className="w-6 h-6"/></button>
                                            <button type="button" title="Google Calendar" className="p-2 rounded-lg border bg-bg-card border-border-default text-text-muted hover:border-primary-400 hover:text-primary-600 transition"><GoogleCalendarIcon className="w-6 h-6"/></button>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-lg border border-border-default bg-bg-subtle/50">
                                      <h3 className="text-sm font-semibold text-text-muted mb-2">מידע מקושר</h3>
                                      <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm items-center">
                                          <span className="font-medium text-text-muted justify-self-end">מועמד:</span>
                                          <button
                                            type="button"
                                            onClick={() => onOpenCandidateSummary(1)}
                                            className="text-primary-600 font-semibold hover:underline text-right"
                                          >
                                            שפירא גדעון
                                          </button>
                                          <span className="font-medium text-text-muted justify-self-end">משרה:</span>
                                          <span className="text-text-default font-semibold">מחסנאי.ת בוקר למודיעין*</span>
                                          <span className="font-medium text-text-muted justify-self-end">לקוח:</span>
                                          <span className="text-text-default font-semibold">UPS</span>
                                      </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
                        <button type="submit" className="bg-primary-500 text-white font-bold py-2 px-8 rounded-lg hover:bg-primary-600 transition shadow-sm">
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