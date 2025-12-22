
import React from 'react';
import { BriefcaseIcon } from './Icons';

interface Experience {
    industry: string;
    years: number;
}

interface Candidate {
    id: number;
    name: string;
    title: string;
    lastActive: string;
    location: string;
    avatarUrl: string;
    experience: Experience[];
    highlights: string[];
    jobScopes: string[];
}

interface CandidateRowProps {
    candidate: Candidate;
    onViewProfile: (candidate: Candidate) => void;
    selectionMode: boolean;
    isSelected: boolean;
    onSelect: (id: number) => void;
}

const CandidateRow: React.FC<CandidateRowProps> = ({ candidate, onViewProfile, selectionMode, isSelected, onSelect }) => {
    
    const handleRowClick = () => {
        if (selectionMode) {
            onSelect(candidate.id);
        } else {
            onViewProfile(candidate);
        }
    };
    
    return (
        <div
            onClick={handleRowClick}
            className={`grid grid-cols-[auto_2fr_1.5fr_1fr_1fr] gap-4 items-center p-4 transition-colors cursor-pointer ${isSelected ? 'bg-primary-50' : 'hover:bg-bg-hover'}`}
        >
            {selectionMode && (
                <div className="flex items-center justify-center">
                    <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelect(candidate.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-border-default text-primary-600 focus:ring-primary-500"
                    />
                </div>
            )}
            {/* Candidate Info */}
            <div className={`flex items-center gap-3 ${!selectionMode ? 'col-start-1' : ''}`}>
                <img src={candidate.avatarUrl} alt={candidate.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                    <p className="font-bold text-text-default">{candidate.name}</p>
                     <div className="flex items-center gap-2">
                        <p className="text-sm text-text-muted">{candidate.title}</p>
                        <div className="flex items-center gap-1">
                            {candidate.jobScopes.slice(0, 2).map(scope => (
                                <span key={scope} className="text-xs font-semibold bg-bg-subtle text-text-muted px-1.5 py-0.5 rounded">{scope}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Highlights */}
            <div className="hidden lg:flex flex-wrap gap-1">
                {candidate.highlights.map((highlight, index) => (
                    <span key={index} className="text-xs font-semibold bg-primary-100 text-primary-800 px-2 py-1 rounded-full">{highlight}</span>
                ))}
            </div>

            {/* Last Active */}
            <p className="text-sm text-text-muted hidden lg:block">{candidate.lastActive} &bull; {candidate.location}</p>

            {/* Actions */}
            <div className="flex justify-end">
                <button 
                    onClick={(e) => {
                         e.stopPropagation();
                         if (!selectionMode) {
                            onViewProfile(candidate);
                         }
                    }}
                    className="bg-primary-100/70 text-primary-700 font-bold py-2 px-4 rounded-lg hover:bg-primary-200 transition-colors text-sm">
                    צפייה בפרופיל
                </button>
            </div>
        </div>
    );
};

export default CandidateRow;
