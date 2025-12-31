
import React, { useRef } from 'react';
import { BookmarkIcon, BookmarkIconSolid, ExclamationTriangleIcon, MapPinIcon, ClockIcon, BriefcaseIcon, SparklesIcon } from './Icons';
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
    onScoreClick?: (e: React.MouseEvent, id: number) => void; // Added prop
}

const statusStyles: { [key: string]: string } = {
  'עבר בדיקה ראשונית': 'bg-blue-50 text-blue-700 border-blue-100',
  'חדש': 'bg-purple-50 text-purple-700 border-purple-100',
  'בבדיקה': 'bg-yellow-50 text-yellow-700 border-yellow-100',
  'ראיון HR': 'bg-pink-50 text-pink-700 border-pink-100',
  'נדחה': 'bg-gray-50 text-gray-600 border-gray-100',
};

// Simplified ScoreCircle - Just triggers the click
const ScoreCircle: React.FC<{ score: number; onClick: (e: React.MouseEvent) => void }> = ({ score, onClick }) => {
    let colorClass = 'text-gray-500 border-gray-200 bg-gray-50';
    if (score >= 90) colorClass = 'text-green-600 border-green-200 bg-green-50';
    else if (score >= 75) colorClass = 'text-yellow-600 border-yellow-200 bg-yellow-50';
    else if (score >= 60) colorClass = 'text-orange-600 border-orange-200 bg-orange-50';
    else colorClass = 'text-red-600 border-red-200 bg-red-50';

    return (
        <div 
            onClick={onClick}
            className={`w-12 h-12 rounded-full flex items-center justify-center border-2 text-sm font-bold shadow-sm cursor-pointer transition-transform active:scale-95 ${colorClass}`}
            title="לחץ לניתוח התאמה"
        >
            {score}%
        </div>
    );
};

// Simple Avatar Component
const Avatar: React.FC<{ initials: string; size?: number }> = ({ initials, size = 48 }) => (
    <div 
        className="rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold border-2 border-white shadow-sm"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
        {initials}
    </div>
);

const CandidateCard: React.FC<CandidateCardProps> = ({ candidate, onViewProfile, onOpenSummary, missingFields, isFavorite, onToggleFavorite, selectionMode, isSelected, onSelect, onScoreClick }) => {
    const hasMissingFields = missingFields.length > 0;

    return (
        <div 
            onClick={() => selectionMode && onSelect ? onSelect(candidate.id) : onOpenSummary(candidate.id)} 
            className={`bg-bg-card rounded-xl border border-border-default shadow-sm p-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full relative group ${isSelected ? 'ring-2 ring-primary-500 border-primary-500 bg-primary-50/10' : ''}`}
        >
             {/* Selection / Favorite Action */}
             <div className="absolute top-4 end-4 z-10">
                {selectionMode ? (
                    <div className="bg-bg-card/80 backdrop-blur-sm p-1 rounded-full">
                        <input type="checkbox" checked={isSelected} readOnly className="h-5 w-5 rounded-md border-2 border-border-default text-primary-600 focus:ring-primary-500 pointer-events-none" />
                    </div>
                ) : (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(candidate.id); }} 
                        className={`p-1.5 rounded-full transition-colors ${isFavorite ? 'text-primary-500' : 'text-text-subtle hover:text-primary-500 hover:bg-bg-subtle'}`}
                        title={isFavorite ? "הסר ממועדפים" : "הוסף למועדפים"}
                    >
                        {isFavorite ? <BookmarkIconSolid className="w-5 h-5" /> : <BookmarkIcon className="w-5 h-5" />}
                    </button>
                )}
            </div>

            {/* Header: Avatar + Name */}
            <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 pt-1">
                     <Avatar initials={candidate.avatar} />
                </div>
                
                <div className="flex-1 min-w-0 pr-6"> {/* pr-6 to avoid overlap with favorite button */}
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <h3 
                            className="font-bold text-lg text-text-default hover:text-primary-600 transition-colors truncate"
                            onClick={(e) => { e.stopPropagation(); onViewProfile(candidate.id); }}
                            title={candidate.name}
                        >
                            {candidate.name}
                        </h3>
                        {hasMissingFields && (
                            <span title={`חסרים פרטים: ${missingFields.join(', ')}`} className="flex items-center text-amber-500">
                                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-text-muted truncate" title={candidate.title || 'לא צוין תפקיד'}>
                        {candidate.title || 'לא צוין תפקיד'}
                    </p>
                </div>
            </div>

            {/* Status Badge + Match Score Row */}
            <div className="flex justify-between items-center mb-4">
                <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${statusStyles[candidate.status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                    {candidate.status}
                </span>
                
                <div className="flex items-center gap-1.5">
                    <ScoreCircle 
                        score={candidate.matchScore} 
                        onClick={(e) => onScoreClick && onScoreClick(e, candidate.id)} 
                    />
                </div>
            </div>

            {/* Info Grid (Location, Last Active, Source) */}
            <div className="grid grid-cols-2 gap-y-2 gap-x-1 text-xs text-text-muted mt-auto mb-4 border-t border-border-subtle pt-3">
                {candidate.address && (
                    <div className="flex items-center gap-1.5 col-span-2">
                        <MapPinIcon className="w-3.5 h-3.5 text-text-subtle" />
                        <span className="truncate">{candidate.address}</span>
                    </div>
                )}
                <div className="flex items-center gap-1.5">
                    <ClockIcon className="w-3.5 h-3.5 text-text-subtle" />
                    <span className="truncate" title={candidate.lastActivity}>{candidate.lastActivity.split(' ')[0]}</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <BriefcaseIcon className="w-3.5 h-3.5 text-text-subtle" />
                    <span className="truncate" title={`מקור: ${candidate.source}`}>{candidate.source}</span>
                </div>
            </div>

            {/* Tags (Fixed Height to prevent layout jumping) */}
            <div className="h-[28px] overflow-hidden flex flex-wrap gap-1.5">
                {(candidate.tags || []).slice(0, 3).map(tag => (
                    <span key={tag} className="text-[11px] font-medium bg-bg-subtle text-text-muted px-2 py-0.5 rounded-full border border-border-subtle whitespace-nowrap">
                        {tag}
                    </span>
                ))}
                {(candidate.tags?.length || 0) > 3 && (
                    <span className="text-[10px] text-text-subtle self-center">+{candidate.tags.length - 3}</span>
                )}
            </div>
        </div>
    );
};

export default CandidateCard;
