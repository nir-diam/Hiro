
import React, { useState } from 'react';
import { XMarkIcon, ShieldCheckIcon, EyeIcon, LockClosedIcon, BuildingOffice2Icon, PlusIcon, TrashIcon } from './Icons';
import { companiesData } from './AdminCompaniesView'; // Assuming we can use this mock data for autocomplete, or just free text

interface CandidatePrivacyModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: {
        allowDownloadCV: boolean;
        appearInSearch: boolean;
        appearInPool: boolean;
        blockedCompanies: string[];
    };
    onSave: (settings: any) => void;
}

const CandidatePrivacyModal: React.FC<CandidatePrivacyModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [formData, setFormData] = useState(settings);
    const [newBlockCompany, setNewBlockCompany] = useState('');

    if (!isOpen) return null;

    const handleAddBlock = () => {
        if (newBlockCompany && !formData.blockedCompanies.includes(newBlockCompany)) {
            setFormData({
                ...formData,
                blockedCompanies: [...formData.blockedCompanies, newBlockCompany]
            });
            setNewBlockCompany('');
        }
    };

    const handleRemoveBlock = (company: string) => {
        setFormData({
            ...formData,
            blockedCompanies: formData.blockedCompanies.filter(c => c !== company)
        });
    };

    const handleSave = () => {
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default animate-fade-in" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-5 border-b border-border-default bg-gray-50/50">
                    <div className="flex items-center gap-2">
                         <ShieldCheckIcon className="w-6 h-6 text-primary-600" />
                        <h2 className="text-xl font-bold">הגדרות פרטיות ודיסקרטיות</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover transition-colors">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>

                <main className="p-6 overflow-y-auto space-y-8">
                    
                    {/* Section 1: General Visibility */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">נראות כללית</h3>
                        
                        <label className="flex items-start gap-3 p-3 rounded-xl border border-border-default cursor-pointer hover:border-primary-300 transition-colors bg-white">
                            <div className={`mt-0.5 p-1 rounded-full ${formData.allowDownloadCV ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                {formData.allowDownloadCV ? <EyeIcon className="w-5 h-5" /> : <LockClosedIcon className="w-5 h-5" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm text-text-default">אפשר הורדת קובץ קורות חיים</span>
                                    <input 
                                        type="checkbox" 
                                        checked={formData.allowDownloadCV} 
                                        onChange={e => setFormData({...formData, allowDownloadCV: e.target.checked})} 
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" 
                                    />
                                </div>
                                <p className="text-xs text-text-muted mt-1">כאשר כבוי, מגייסים יוכלו לראות את הפרופיל הדיגיטלי אך לא להוריד את הקובץ המקורי.</p>
                            </div>
                        </label>

                         <label className="flex items-start gap-3 p-3 rounded-xl border border-border-default cursor-pointer hover:border-primary-300 transition-colors bg-white">
                            <div className={`mt-0.5 p-1 rounded-full ${formData.appearInPool ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                <UserGroupIcon className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-sm text-text-default">הופעה במאגר המועמדים (Talent Pool)</span>
                                    <input 
                                        type="checkbox" 
                                        checked={formData.appearInPool} 
                                        onChange={e => setFormData({...formData, appearInPool: e.target.checked})} 
                                        className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" 
                                    />
                                </div>
                                <p className="text-xs text-text-muted mt-1">מאפשר למגייסים למצוא אותך בחיפושים אקטיביים במערכת.</p>
                            </div>
                        </label>
                    </div>

                    <div className="h-px bg-border-default"></div>

                    {/* Section 2: Blocked Companies */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                             <h3 className="text-sm font-bold text-text-muted uppercase tracking-wider">דיסקרטיות (חסימת חברות)</h3>
                             <span className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded-full">מומלץ לפסיביים</span>
                        </div>
                        
                        <p className="text-sm text-text-muted">
                            הוסף שמות של חברות (למשל המעסיק הנוכחי) שתרצה להסתיר מהן את הפרופיל שלך במאגר.
                        </p>

                        <div className="flex gap-2">
                            <div className="relative flex-grow">
                                <BuildingOffice2Icon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                                <input 
                                    type="text" 
                                    value={newBlockCompany}
                                    onChange={e => setNewBlockCompany(e.target.value)}
                                    placeholder="שם החברה לחסימה..." 
                                    className="w-full bg-bg-input border border-border-default rounded-lg py-2.5 pl-3 pr-10 text-sm focus:ring-primary-500 focus:border-primary-500"
                                    onKeyDown={e => e.key === 'Enter' && handleAddBlock()}
                                />
                            </div>
                            <button 
                                onClick={handleAddBlock}
                                disabled={!newBlockCompany}
                                className="bg-bg-subtle text-text-default border border-border-default hover:bg-bg-hover font-semibold px-4 rounded-lg transition disabled:opacity-50"
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        </div>

                        {formData.blockedCompanies.length > 0 ? (
                            <div className="flex flex-wrap gap-2 mt-2">
                                {formData.blockedCompanies.map((company, idx) => (
                                    <span key={idx} className="flex items-center gap-1 bg-red-50 text-red-700 border border-red-100 text-xs font-semibold px-3 py-1.5 rounded-full">
                                        <BuildingOffice2Icon className="w-3 h-3" />
                                        {company}
                                        <button onClick={() => handleRemoveBlock(company)} className="mr-1 hover:text-red-900 bg-red-200/50 rounded-full p-0.5">
                                            <XMarkIcon className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs text-text-muted italic bg-bg-subtle/30 p-2 rounded text-center">
                                אין חברות חסומות כרגע. הפרופיל גלוי לכולם במאגר.
                            </div>
                        )}
                    </div>

                </main>

                <footer className="p-5 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3">
                    <button onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition text-sm">ביטול</button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-primary-700 transition shadow-sm text-sm">
                        שמור הגדרות
                    </button>
                </footer>
            </div>
             <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out; }
            `}</style>
        </div>
    );
};

export default CandidatePrivacyModal;
import { UserGroupIcon } from './Icons'; // Make sure this is imported or added if missing in Icons.tsx
