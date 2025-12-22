
import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon } from './Icons';

type JobStatus = 'פתוחה' | 'מוקפאת' | 'מאוישת' | 'טיוטה';

interface JobStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentStatus: JobStatus;
    jobTitle: string;
    onSave: (newStatus: JobStatus, note: string) => void;
}

const statusOptions: JobStatus[] = ['פתוחה', 'מוקפאת', 'מאוישת', 'טיוטה'];

const statusColors: Record<JobStatus, string> = {
    'פתוחה': 'bg-green-100 text-green-800 border-green-200',
    'מוקפאת': 'bg-amber-100 text-amber-800 border-amber-200',
    'מאוישת': 'bg-gray-100 text-gray-800 border-gray-200',
    'טיוטה': 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

const JobStatusModal: React.FC<JobStatusModalProps> = ({ isOpen, onClose, currentStatus, jobTitle, onSave }) => {
    const [status, setStatus] = useState<JobStatus>(currentStatus);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (isOpen) {
            setStatus(currentStatus);
            setNote('');
        }
    }, [isOpen, currentStatus]);

    if (!isOpen) return null;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(status, note);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-text-default" 
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-lg font-bold text-text-default">עדכון סטטוס משרה</h2>
                        <p className="text-xs text-text-muted truncate max-w-[250px]">{jobTitle}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </header>

                <form onSubmit={handleSave} className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-3">בחר סטטוס חדש</label>
                        <div className="grid grid-cols-2 gap-3">
                            {statusOptions.map((opt) => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setStatus(opt)}
                                    className={`py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-all duration-200 ${
                                        status === opt 
                                            ? `${statusColors[opt]} border-current shadow-sm scale-105` 
                                            : 'bg-bg-card border-border-default text-text-muted hover:border-primary-300'
                                    }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-text-default mb-2">
                            הערה לשינוי <span className="text-text-subtle font-normal">(אופציונלי)</span>
                        </label>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            placeholder="למשל: הלקוח ביקש להקפיא עקב חוסר תקציב..."
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button 
                            type="submit" 
                            className="flex items-center gap-2 bg-primary-600 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20"
                        >
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>עדכן סטטוס</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default JobStatusModal;
