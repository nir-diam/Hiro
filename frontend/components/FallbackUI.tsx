import React from 'react';
import { BugAntIcon, ArrowUturnLeftIcon } from './Icons';

const FallbackUI: React.FC = () => {
    const handleGoHome = () => {
        // Navigate to the home page (candidate list).
        // Since this component is outside the router context,
        // a hard navigation is the simplest and most reliable way.
        // FIX: Set hash and then reload to avoid a race condition and ensure navigation.
        window.location.hash = '/candidates';
        window.location.reload();
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen w-screen bg-bg-default text-text-default p-4 text-center" dir="rtl">
            <div className="max-w-md">
                <BugAntIcon className="w-24 h-24 text-primary-400 mx-auto mb-6" />
                <h1 className="text-4xl font-extrabold text-text-default mb-4">אופס! משהו השתבש.</h1>
                <p className="text-lg text-text-muted mb-8">
                    נתקלנו בתקלה לא צפויה. הצוות שלנו קיבל התראה ואנחנו עובדים על התיקון.
                    תוכל/י לחזור למסך הבית ולהמשיך משם.
                </p>
                <button
                    onClick={handleGoHome}
                    className="flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-8 rounded-xl hover:bg-primary-700 transition-transform transform hover:scale-105 shadow-lg shadow-primary-500/30"
                >
                    <ArrowUturnLeftIcon className="w-5 h-5" />
                    <span>חזרה למסך הבית</span>
                </button>
            </div>
        </div>
    );
};

export default FallbackUI;
