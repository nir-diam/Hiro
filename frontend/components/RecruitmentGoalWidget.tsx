
import React from 'react';
import { TargetIcon, SparklesIcon, TrophyIcon } from './Icons';

interface RecruitmentGoalWidgetProps {
    current: number;
    target: number;
}

const RecruitmentGoalWidget: React.FC<RecruitmentGoalWidgetProps> = ({ current, target }) => {
    const percentage = Math.min(Math.round((current / target) * 100), 100);
    const remaining = Math.max(0, target - current);
    
    // Determine visuals based on progress
    let gradient = 'from-red-500 to-orange-500';
    let textColor = 'text-red-600';
    let bgColor = 'bg-red-50';
    let statusText = 'החודש רק התחיל, תנו גז!';
    let icon = <TargetIcon className="w-6 h-6 text-white" />;

    if (percentage >= 100) {
        gradient = 'from-emerald-500 to-green-400';
        textColor = 'text-emerald-700';
        bgColor = 'bg-emerald-50';
        statusText = 'יעד הושג! עבודה מדהימה! 🏆';
        icon = <TrophyIcon className="w-6 h-6 text-white" />;
    } else if (percentage >= 75) {
        gradient = 'from-primary-600 to-purple-400';
        textColor = 'text-primary-700';
        bgColor = 'bg-primary-50';
        statusText = `עוד ${remaining} גיוסים ליעד. אתם קרובים!`;
        icon = <SparklesIcon className="w-6 h-6 text-white" />;
    } else if (percentage >= 40) {
        gradient = 'from-orange-500 to-yellow-400';
        textColor = 'text-orange-700';
        bgColor = 'bg-orange-50';
        statusText = 'בחצי הדרך, להמשיך לדחוף!';
    }

    return (
        <div className="bg-bg-card rounded-2xl border border-border-default shadow-sm p-6 relative overflow-hidden h-full flex flex-col justify-between group hover:shadow-md transition-shadow duration-300">
            {/* Background Glow */}
            <div className={`absolute -top-10 -right-10 w-40 h-40 bg-gradient-to-br ${gradient} opacity-10 rounded-full blur-2xl pointer-events-none group-hover:opacity-15 transition-opacity`}></div>
            
            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-text-default">יעד גיוסים חודשי</h3>
                        <p className="text-sm text-text-muted mt-1">יעד מחלקתי (השמות)</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm bg-gradient-to-br ${gradient}`}>
                        {icon}
                    </div>
                </div>

                <div className="flex items-end gap-3 mb-2">
                    <span className="text-5xl font-extrabold text-text-default tracking-tighter">{current}</span>
                    <span className="text-lg text-text-muted font-medium mb-1.5">/ {target}</span>
                </div>
                
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${bgColor} ${textColor} mb-6`}>
                    {statusText}
                </div>
            </div>

            <div className="relative z-10">
                <div className="flex justify-between text-xs font-semibold text-text-subtle mb-2">
                    <span>התקדמות</span>
                    <span>{percentage}%</span>
                </div>
                <div className="h-3 w-full bg-bg-subtle rounded-full overflow-hidden border border-border-subtle">
                    <div 
                        style={{ width: `${percentage}%` }} 
                        className={`h-full rounded-full bg-gradient-to-r ${gradient} shadow-[0_0_10px_rgba(0,0,0,0.1)] transition-all duration-1000 ease-out relative`}
                    >
                        <div className="absolute top-0 left-0 w-full h-full bg-white opacity-20 animate-[shimmer_2s_infinite]"></div>
                    </div>
                </div>
            </div>
            
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
            `}</style>
        </div>
    );
};

export default RecruitmentGoalWidget;
