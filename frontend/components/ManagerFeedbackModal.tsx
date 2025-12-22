
import React, { useState, useEffect } from 'react';
import { XMarkIcon, HandThumbUpIcon, HandThumbDownIcon, PaperAirplaneIcon, ChevronDownIcon, ArrowRightIcon } from './Icons';

interface ManagerFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (feedback: { rating: 'up' | 'down' | null; notes: string; recommendation: 'advance' | 'reject' | 'hold'; newStatus?: string }) => void;
  candidateName: string;
}

const advanceStatuses = ['ראיון HR', 'ראיון מקצועי', 'מבחן בית', 'בדיקת ממליצים', 'הצעת שכר', 'התקבל'];

const ManagerFeedbackModal: React.FC<ManagerFeedbackModalProps> = ({ isOpen, onClose, onSave, candidateName }) => {
    const [rating, setRating] = useState<'up' | 'down' | null>(null);
    const [notes, setNotes] = useState('');
    const [recommendation, setRecommendation] = useState<'advance' | 'reject' | 'hold'>('hold');
    const [newStatus, setNewStatus] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            setRating(null);
            setNotes('');
            setRecommendation('hold');
            setNewStatus('');
        }
    }, [isOpen]);

    const handleRecommendationChange = (rec: 'advance' | 'reject' | 'hold') => {
        setRecommendation(rec);
        if (rec === 'reject') {
            setNewStatus('נדחה');
        } else if (rec === 'advance') {
            setNewStatus(advanceStatuses[0]); // Default to first
        } else {
            setNewStatus('');
        }
    };

    if (!isOpen) return null;

    const handleSave = () => {
        onSave({ rating, notes, recommendation, newStatus: newStatus || undefined });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()}>
                <header className="flex items-center justify-between p-4 border-b border-border-default">
                    <h2 className="text-xl font-bold text-text-default">חוות דעת על {candidateName}</h2>
                    <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </header>
                
                <main className="p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-text-default mb-3 text-center">מה דעתך הכללית?</label>
                        <div className="flex justify-center gap-6">
                            <button 
                                onClick={() => setRating('up')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${rating === 'up' ? 'border-green-500 bg-green-50 text-green-700' : 'border-border-default hover:bg-bg-hover text-text-muted'}`}
                            >
                                <HandThumbUpIcon className="w-10 h-10" />
                                <span className="font-semibold">חיובית</span>
                            </button>
                            <button 
                                onClick={() => setRating('down')}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${rating === 'down' ? 'border-red-500 bg-red-50 text-red-700' : 'border-border-default hover:bg-bg-hover text-text-muted'}`}
                            >
                                <HandThumbDownIcon className="w-10 h-10" />
                                <span className="font-semibold">שלילית</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">הערות מילוליות:</label>
                        <textarea 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            rows={4} 
                            className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500" 
                            placeholder="כתוב כאן את התרשמותך מהמועמד..."
                        ></textarea>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">המלצה להמשך:</label>
                        <div className="flex bg-bg-subtle p-1 rounded-lg mb-4">
                            <button 
                                onClick={() => handleRecommendationChange('advance')} 
                                className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${recommendation === 'advance' ? 'bg-green-500 text-white shadow' : 'text-text-muted hover:text-text-default'}`}
                            >
                                לקדם
                            </button>
                            <button 
                                onClick={() => handleRecommendationChange('hold')} 
                                className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${recommendation === 'hold' ? 'bg-white text-text-default shadow' : 'text-text-muted hover:text-text-default'}`}
                            >
                                להתלבט
                            </button>
                            <button 
                                onClick={() => handleRecommendationChange('reject')} 
                                className={`flex-1 py-2 text-sm font-semibold rounded-md transition ${recommendation === 'reject' ? 'bg-red-500 text-white shadow' : 'text-text-muted hover:text-text-default'}`}
                            >
                                לדחות
                            </button>
                        </div>

                        {recommendation === 'advance' && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 animate-fade-in">
                                <div className="flex items-center gap-2 text-sm font-semibold text-green-800 mb-2">
                                    <ArrowRightIcon className="w-4 h-4" />
                                    לאיזה שלב לקדם?
                                </div>
                                <div className="relative">
                                    <select 
                                        value={newStatus} 
                                        onChange={(e) => setNewStatus(e.target.value)}
                                        className="w-full bg-white border border-green-300 text-green-900 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 block p-2.5 appearance-none"
                                    >
                                        {advanceStatuses.map(status => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                    <ChevronDownIcon className="w-4 h-4 text-green-700 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
                                </div>
                            </div>
                        )}
                        
                        {recommendation === 'reject' && (
                             <div className="bg-red-50 border border-red-200 rounded-lg p-3 animate-fade-in text-center">
                                <p className="text-sm font-semibold text-red-800">
                                    המועמד יעודכן לסטטוס "נדחה".
                                </p>
                            </div>
                        )}
                    </div>
                </main>

                <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default gap-3">
                    <button type="button" onClick={onClose} className="text-text-muted font-semibold py-2 px-5 rounded-lg hover:bg-bg-hover transition">ביטול</button>
                    <button onClick={handleSave} className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 transition shadow-sm flex items-center gap-2">
                        <PaperAirplaneIcon className="w-5 h-5" />
                        שלח משוב
                    </button>
                </footer>
                <style>{`
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                    .animate-fade-in { animation: fadeIn 0.3s ease-out forwards; }
                `}</style>
            </div>
        </div>
    );
};

export default ManagerFeedbackModal;
