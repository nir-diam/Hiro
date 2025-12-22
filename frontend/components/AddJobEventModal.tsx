
import React, { useState, useEffect } from 'react';
import { XMarkIcon, CheckCircleIcon } from './Icons';

interface AddJobEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: { eventType: string; notes: string }) => void;
  eventToEdit?: { type: string; description: string } | null;
}

const eventTypeOptions = [
    'התקבל עדכון מהלקוח על משרות חדשות', 
    'לקוח עדכן סטטוס מועמדים', 
    'לקוח עדכן- המשרה נסגרה+ סטטוס מועמ', 
    'נשלח מייל ללקוח לגבי משרות חדשות / עי', 
    'נשלח דיוור', 
    'נשלח סטטוס מועמדים', 
    'הערה חופשית',
    'סטטוס מועמד',
    'עריכת משרה',
    'הערה',
    'הוספת מועמד'
];

const AddJobEventModal: React.FC<AddJobEventModalProps> = ({ isOpen, onClose, onSave, eventToEdit }) => {
    const [eventType, setEventType] = useState(eventTypeOptions[0]);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (eventToEdit) {
                // Try to match existing type, or default to first if not found (or add it)
                setEventType(eventTypeOptions.includes(eventToEdit.type) ? eventToEdit.type : eventTypeOptions[0]);
                setNotes(eventToEdit.description);
            } else {
                setEventType(eventTypeOptions[0]);
                setNotes('');
            }
        }
    }, [isOpen, eventToEdit]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ eventType, notes });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 h-screen w-screen" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
            
            {/* Modal Content */}
            <div 
                className="relative bg-bg-card rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default border border-border-default transform scale-100 transition-all" 
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-bg-subtle/30">
                    <div>
                        <h2 className="text-xl font-bold text-text-default">{eventToEdit ? 'עריכת אירוע' : 'הוספת אירוע חדש'}</h2>
                        <p className="text-xs text-text-muted mt-0.5">תיעוד ביומן המשרה לצוות הגיוס</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="flex flex-col">
                    <main className="p-6 space-y-5">
                        <div>
                            <label htmlFor="event-type" className="block text-sm font-bold text-text-muted mb-2 uppercase tracking-wide">סוג אירוע</label>
                            <select
                                id="event-type"
                                value={eventType}
                                onChange={(e) => setEventType(e.target.value)}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-3 transition shadow-sm outline-none cursor-pointer"
                            >
                                {eventTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="event-notes" className="block text-sm font-bold text-text-muted mb-2 uppercase tracking-wide">תוכן האירוע / הערה</label>
                            <textarea
                                id="event-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={6}
                                required
                                placeholder="כתוב כאן את פרטי העדכון..."
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 block p-4 transition shadow-sm outline-none resize-none"
                            ></textarea>
                        </div>
                    </main>
                    
                    <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
                        <button type="button" onClick={onClose} className="text-text-muted font-bold py-2.5 px-5 rounded-xl hover:bg-bg-hover transition text-sm">ביטול</button>
                        <button type="submit" className="bg-primary-600 text-white font-bold py-2.5 px-8 rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-500/20 flex items-center gap-2">
                            <CheckCircleIcon className="w-5 h-5" />
                            <span>{eventToEdit ? 'שמור שינויים' : 'יצירת אירוע'}</span>
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
};

export default AddJobEventModal;
