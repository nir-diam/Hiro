
import React, { useState } from 'react';
import { XMarkIcon, FlagIcon, PaperAirplaneIcon } from './Icons';

interface AIFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  context?: string; // To know where the report came from (e.g., "CV Parsing", "Match Score")
}

const AIFeedbackModal: React.FC<AIFeedbackModalProps> = ({ isOpen, onClose, context }) => {
    const [feedback, setFeedback] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        // Simulate API call
        setTimeout(() => {
            console.log(`Feedback report for [${context}]:`, feedback);
            setIsSubmitting(false);
            setIsSuccess(true);
            setTimeout(() => {
                setIsSuccess(false);
                setFeedback('');
                onClose();
            }, 1500);
        }, 800);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-bg-card rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden text-text-default transform transition-all scale-100" 
                onClick={e => e.stopPropagation()}
            >
                {!isSuccess ? (
                    <form onSubmit={handleSubmit} className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 text-red-600">
                                <FlagIcon className="w-5 h-5" />
                                <h3 className="text-lg font-bold text-text-default">דיווח על אי-דיוק</h3>
                            </div>
                            <button type="button" onClick={onClose} className="text-text-muted hover:bg-bg-hover rounded-full p-1">
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <p className="text-sm text-text-muted mb-4">
                            המשוב שלך עוזר לנו לשפר את המודל. אם מצאת טעות בניתוח, נשמח אם תתאר אותה בקצרה.
                        </p>

                        <textarea
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            placeholder="תאר את הבעיה (רשות)..."
                            rows={4}
                            className="w-full bg-bg-input border border-border-default rounded-lg p-3 text-sm focus:ring-primary-500 focus:border-primary-500 mb-4 resize-none"
                        />

                        <div className="flex justify-end gap-2">
                            <button 
                                type="button" 
                                onClick={onClose} 
                                className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg transition-colors"
                            >
                                ביטול
                            </button>
                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
                            >
                                {isSubmitting ? 'שולח...' : 'שלח דיווח'}
                                {!isSubmitting && <PaperAirplaneIcon className="w-4 h-4" />}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div className="p-8 text-center">
                        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-text-default mb-2">תודה רבה!</h3>
                        <p className="text-text-muted text-sm">הדיווח שלך התקבל בהצלחה.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIFeedbackModal;
