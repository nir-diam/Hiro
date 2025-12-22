
import React, { useState } from 'react';
import { CheckCircleIcon, LightBulbIcon, FlagIcon } from './Icons';
import AIFeedbackModal from './AIFeedbackModal';

interface AIAnalysisResultProps {
  result: {
    matchScore: number;
    strengths: string[];
    suggestions: string[];
  };
  onBack: () => void;
}

const AIAnalysisResult: React.FC<AIAnalysisResultProps> = ({ result, onBack }) => {
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const score = result.matchScore;
    const scoreColor = score > 80 ? 'text-green-500' : score > 60 ? 'text-yellow-500' : 'text-red-500';

    const size = 100;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (score / 100) * circumference;
    
    return (
        <div className="text-center">
            <h3 className="text-lg font-bold text-text-default">ניתוח התאמה למשרה</h3>
            
            <div className="relative inline-flex items-center justify-center my-6">
                <svg className="transform -rotate-90" width={size} height={size}>
                    <circle
                        className="text-bg-subtle"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        fill="transparent"
                        r={radius}
                        cx={size/2}
                        cy={size/2}
                    />
                    <circle
                        className={`${scoreColor} transition-all duration-1000 ease-in-out`}
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        fill="transparent"
                        r={radius}
                        cx={size/2}
                        cy={size/2}
                    />
                </svg>
                <span className={`absolute text-2xl font-extrabold ${scoreColor}`}>
                    {score}%
                </span>
            </div>

            <div className="text-right space-y-6">
                <div>
                    <h4 className="font-bold text-text-default mb-2 flex items-center gap-2">
                        <CheckCircleIcon className="w-5 h-5 text-green-500"/>
                        נקודות חוזק
                    </h4>
                    <ul className="space-y-1 list-disc list-inside text-sm text-text-muted pr-4">
                        {result.strengths.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                </div>
                <div>
                    <h4 className="font-bold text-text-default mb-2 flex items-center gap-2">
                        <LightBulbIcon className="w-5 h-5 text-yellow-500"/>
                        הזדמנויות לשיפור
                    </h4>
                    <ul className="space-y-1 list-disc list-inside text-sm text-text-muted pr-4">
                        {result.suggestions.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                     <p className="text-xs text-text-subtle mt-2 pr-4">זכור/י: אלו המלצות בלבד. מומלץ לעדכן את קורות החיים ולשלוח שוב.</p>
                </div>
            </div>

            <div className="mt-8 flex flex-col gap-3">
                 <button
                    onClick={onBack}
                    className="bg-primary-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-primary-700 transition w-full"
                >
                    חזור לטופס
                </button>
                <button 
                    onClick={() => setIsFeedbackModalOpen(true)}
                    className="text-xs text-text-subtle hover:text-text-muted flex items-center justify-center gap-1.5 transition-colors"
                >
                    <FlagIcon className="w-3.5 h-3.5" />
                    <span>דווח על אי-דיוק בניתוח</span>
                </button>
            </div>
            
             <AIFeedbackModal 
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                context="CV Optimization Analysis"
            />
        </div>
    );
};

export default AIAnalysisResult;
