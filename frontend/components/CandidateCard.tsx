
import React from 'react';
import { BookmarkIcon, BriefcaseIcon, AcademicCapIcon, LanguageIcon, BookmarkIconSolid, ExclamationTriangleIcon, MapPinIcon, AvatarIcon, SparklesIcon } from './Icons';
import { Candidate } from './CandidatesListView';

interface CandidateCardProps {
    candidate: Candidate;
    onViewProfile: (id: number) => void;
    onOpenSummary: (id: number) => void;
    missingFields: string[];
    isFavorite: boolean;
    onToggleFavorite: (id: number) => void;
    selectionMode?: boolean;
    isSelected?: boolean;
    onSelect?: (id: number) => void;
}

const statusStyles: { [key: string]: string } = {
  'עבר בדיקה ראשונית': 'bg-blue-100 text-blue-800',
  'חדש': 'bg-primary-100 text-primary-800',
  'בבדיקה': 'bg-yellow-100 text-yellow-800',
  'ראיון HR': 'bg-secondary-100 text-secondary-800',
  'נדחה': 'bg-gray-200 text-gray-700',
};

// Updated MatchScoreIndicator for CandidateCard - Identical to CandidatesListView but local if needed, or imported if exported. 
// Since we are duplicating logic to keep components self-contained as per request pattern:
const MatchScoreIndicator: React.FC<{ 
    score: number; 
    analysis?: { jobTitle: string; reason: string; } 
}> = ({ score, analysis }) => {
    const getBarColor = (level: number) => {
        if (score >= 90) return 'bg-green-500';
        if (score >= 75) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="relative group flex items-center gap-2 cursor-help w-full max-w-[140px]">
             {/* The Bar */}
            <div className="flex-grow h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${getBarColor(score)}`}
                    style={{ width: `${score}%` }}
                ></div>
            </div>
            <span className="text-xs font-bold text-text-subtle w-8 text-left">{score}%</span>

            {/* The Tooltip */}
            {analysis && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-bg-card border border-border-default rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[9999] text-right">
                    <div className="flex items-start gap-2 mb-2">
                        <SparklesIcon className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                        <h4 className="font-bold text-text-default text-xs leading-tight">
                            ניתוח התאמה AI
                        </h4>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-text-muted font-semibold">
                            משרה: <span className="text-text-default">{analysis.jobTitle}</span>
                        </p>
                        <p className="text-xs text-text-subtle leading-relaxed">
                            {analysis.reason}
                        </p>
                    </div>
                    {/* Arrow */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-border-default"></div>
                </div>
            )}
        </div>
    );
};

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onViewProfile, onOpenSummary, missingFields, isFavorite, onToggleFavorite, selectionMode, isSelected, onSelect }) => {
    const hasMissingFields = missingFields.length > 0;

    // Theme-aware color cycle for the bars
    const colorCycle = [
        'bg-primary-500', 
        'bg-secondary-500', 
        'bg-accent-500'
    ];

    return (
        <div 
            onClick={() => selectionMode && onSelect ? onSelect(candidate.id) : onOpenSummary(candidate.id)} 
            className={`bg-bg-card rounded-lg border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow flex flex-col h-full relative ${isSelected ? 'ring-2 ring-primary-500 border-primary-500' : ''}`}
        >
             {selectionMode ? (
                <div className="absolute top-3 left-3 z-10 bg-bg-card/50 backdrop-blur-sm p-1 rounded-full">
                    <input type="checkbox" checked={isSelected} readOnly className="h-5 w-5 rounded-full border-2 border-white text-primary-600 focus:ring-primary-500 pointer-events-none" />
                </div>
            ) : (
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(candidate.id); }} 
                    className="absolute top-3 left-3 p-1.5 text-text-subtle hover:text-primary-500 transition-colors z-10"
                    title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                >
                    {isFavorite ? <BookmarkIconSolid className="w-5 h-5 text-primary-500" /> : <BookmarkIcon className="w-5 h-5" />}
                </button>
            )}

            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <AvatarIcon initials={candidate.avatar} size={40} fontSize={16} bgClassName="fill-primary-100" textClassName="fill-primary-700 font-bold" />
                    <div>
                        <p className="font-bold text-primary-700 hover:underline flex items-center gap-1.5" onClick={(e) => { e.stopPropagation(); onViewProfile(candidate.id); }}>
                            {candidate.name}
                            {hasMissingFields && (
                                <span title={`חסרים פרטים: ${missingFields.join(', ')}`}>
                                    <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />
                                </span>
                            )}
                        </p>
                        <p className="text-sm text-text-muted">{candidate.title || 'לא צוין תפקיד'}</p>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2 mt-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyles[candidate.status] || 'bg-gray-100 text-gray-800'}`}>{candidate.status}</span>
                    <MatchScoreIndicator score={candidate.matchScore} analysis={candidate.matchAnalysis} />
                </div>
            </div>

            <div className="flex-grow mt-4 space-y-3">
                {/* Industry Experience Bar - ONLY if data exists */}
                {candidate.industryAnalysis && candidate.industryAnalysis.industries && candidate.industryAnalysis.industries.length > 0 && (
                    <div className="w-full">
                        <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-xs font-bold text-text-default">ניסיון בתעשייה</span>
                        </div>
                        
                        {/* The Bar */}
                        <div className="flex h-2 w-full rounded-full overflow-hidden bg-bg-subtle">
                            {candidate.industryAnalysis.industries.map((item, index) => (
                                <div 
                                    key={index} 
                                    className={`h-full ${colorCycle[index % colorCycle.length]}`} 
                                    style={{ width: `${item.percentage}%` }} 
                                    title={`${item.label}: ${item.percentage}%`}
                                />
                            ))}
                        </div>

                        {/* The Legend */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                            {candidate.industryAnalysis.industries.slice(0, 3).map((item, index) => (
                                <div key={index} className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full ${colorCycle[index % colorCycle.length]}`}></span>
                                    <span className="text-[10px] text-text-muted font-medium truncate max-w-[100px]" title={item.label}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <p className="text-xs text-text-subtle">פעילות אחרונה: {candidate.lastActivity}</p>
                    <p className="text-xs text-text-subtle">מקור: {candidate.source}</p>
                </div>

                <div className="flex flex-wrap gap-1 mt-2 min-h-[26px]">
                    {(candidate.tags || []).slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs font-semibold bg-bg-subtle text-text-muted px-2 py-1 rounded-full border border-border-subtle">{tag}</span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default CandidateCard;
