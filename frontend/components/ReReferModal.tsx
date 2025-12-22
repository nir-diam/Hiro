import React, { useState, useEffect } from 'react';
import { XMarkIcon, PaperAirplaneIcon } from './Icons';

// Assuming Referral and ClientContact types are available or defined here
interface ClientContact {
    id: number;
    name: string;
    email: string;
}

interface Referral {
    id: number;
    candidateName: string;
    jobTitle: string;
    clientName: string;
    clientContacts: ClientContact[];
}


interface ReReferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (data: { notes: string; nextStatus: string; contacts: number[] }) => void;
    referral: Referral | null;
}

const nextStatusOptions = ['נשלחו קו"ח', 'בבדיקה', 'ראיון', 'הצעה'];

const ReReferModal: React.FC<ReReferModalProps> = ({ isOpen, onClose, onSend, referral }) => {
    const [notes, setNotes] = useState('');
    const [nextStatus, setNextStatus] = useState('נשלחו קו"ח');
    const [selectedContacts, setSelectedContacts] = useState<number[]>([]);
    
    useEffect(() => {
        if (referral && isOpen) {
            setNotes('');
            setNextStatus('נשלחו קו"ח');
            // Select all contacts by default when opening
            setSelectedContacts(referral.clientContacts.map(c => c.id));
        }
    }, [referral, isOpen]);

    if (!isOpen || !referral) return null;

    const handleContactToggle = (contactId: number) => {
        setSelectedContacts(prev => prev.includes(contactId) ? prev.filter(id => id !== contactId) : [...prev, contactId]);
    };

    const handleSend = () => {
        onSend({ notes, nextStatus, contacts: selectedContacts });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">שליחה ללקוח (ללא אירוע הפניה נוסף)</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">הערות שליחה:</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm" placeholder="יבוא מתקציר..."></textarea>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">הסטטוס הבא:</label>
                        <select value={nextStatus} onChange={e => setNextStatus(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg p-2.5 text-sm">
                            {nextStatusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-semibold text-text-muted mb-2">לשלוח אל:</label>
                        <div className="space-y-2 max-h-32 overflow-y-auto border border-border-default rounded-lg p-2 bg-bg-subtle/50">
                            {referral.clientContacts.map(contact => (
                                <label key={contact.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-hover cursor-pointer">
                                    <input type="checkbox" checked={selectedContacts.includes(contact.id)} onChange={() => handleContactToggle(contact.id)} className="w-4 h-4 text-primary-600 rounded" />
                                    <div>
                                        <span className="font-semibold text-text-default">{contact.name}</span>
                                        <span className="text-xs text-text-subtle block">{contact.email}</span>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button onClick={handleSend} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm flex items-center gap-2">
                        <PaperAirplaneIcon className="w-5 h-5" />
                        שליחה
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default ReReferModal;