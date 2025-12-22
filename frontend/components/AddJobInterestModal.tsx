import React, { useState, useEffect } from 'react';
import { XMarkIcon } from './Icons';
import JobFieldSelector, { SelectedJobField } from './JobFieldSelector';

type Status = 'פעיל' | 'הוזמן לראיון' | 'לא רלוונטי' | 'מועמד משך עניין' | 'בארכיון';

interface MatchDetails {
  positive: string[];
  negative: string[];
  summary: string;
}

export interface JobInterest {
  id: number;
  industry: string;
  role: string;
  jobTitle: string;
  company: string;
  location: string;
  lastUpdated: string;
  status: Status;
  matchScore: number;
  matchDetails: MatchDetails;
}


interface AddJobInterestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (interest: JobInterest) => void;
}

const FormInput: React.FC<{ label: string; name: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }> = ({ label, name, value, onChange, placeholder }) => (
    <div>
        <label className="block text-sm font-semibold text-text-muted mb-1.5">{label}</label>
        <input type="text" name={name} value={value} onChange={onChange} placeholder={placeholder} className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus:ring-primary-500 focus:border-primary-500 block p-2.5 transition shadow-sm" />
    </div>
);

const AddJobInterestModal: React.FC<AddJobInterestModalProps> = ({ isOpen, onClose, onSave }) => {
    const [jobField, setJobField] = useState<SelectedJobField | null>(null);
    const [jobTitle, setJobTitle] = useState('');
    const [company, setCompany] = useState('');
    const [location, setLocation] = useState('');
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Reset state and auto-open the selector when the modal becomes visible
            setJobField(null);
            setJobTitle('');
            setCompany('');
            setLocation('');
            setIsSelectorOpen(true);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        if (!jobField || !jobTitle || !company) {
            alert('Please fill all fields');
            return;
        }

        const newInterest: JobInterest = {
            id: Date.now(),
            industry: jobField.category,
            role: jobField.role,
            jobTitle: jobTitle,
            company: company,
            location: location,
            lastUpdated: new Date().toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit', year: 'numeric'}),
            status: 'פעיל',
            matchScore: Math.floor(Math.random() * 40) + 60, // random score 60-100
            matchDetails: {
                positive: ['נוסף ידנית'],
                negative: [],
                summary: 'התעניינות נוספה ידנית על ידי המגייס.'
            }
        };
        onSave(newInterest);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">הוספת התעניינות חדשה</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                <main className="p-6 space-y-4">
                    <JobFieldSelector 
                        value={jobField} 
                        onChange={setJobField}
                        isModalOpen={isSelectorOpen}
                        setIsModalOpen={setIsSelectorOpen}
                    />
                    <FormInput label="כותרת משרה" name="jobTitle" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="לדוגמה: מפתח/ת Fullstack" />
                    <FormInput label="חברה" name="company" value={company} onChange={e => setCompany(e.target.value)} placeholder="לדוגמה: Google" />
                    <FormInput label="מיקום" name="location" value={location} onChange={e => setLocation(e.target.value)} placeholder="לדוגמה: תל אביב" />
                </main>
                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button type="button" onClick={handleSave} className="bg-primary-500 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-600 transition shadow-sm mr-2">שמור</button>
                </footer>
            </div>
        </div>
    );
};

export default AddJobInterestModal;