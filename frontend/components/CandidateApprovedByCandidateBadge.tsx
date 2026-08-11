import React from 'react';
import { CheckCircleIcon } from './Icons';

type CandidateApprovedByCandidateBadgeProps = {
    approved?: boolean;
    className?: string;
    title?: string;
};

const CandidateApprovedByCandidateBadge: React.FC<CandidateApprovedByCandidateBadgeProps> = ({
    approved,
    className = 'w-5 h-5',
    title = 'המועמד אישר את הפרופיל',
}) => {
    if (!approved) return null;
    return (
        <span title={title} aria-label={title} className="inline-flex shrink-0">
            <CheckCircleIcon className={`${className} text-blue-600`} />
        </span>
    );
};

export default CandidateApprovedByCandidateBadge;
