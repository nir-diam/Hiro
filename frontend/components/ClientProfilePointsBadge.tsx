import React from 'react';
import { TrophyIcon } from './Icons';

type ClientProfilePointsBadgeProps = {
    points: number;
    size?: 'sm' | 'md';
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
};

const ClientProfilePointsBadge: React.FC<ClientProfilePointsBadgeProps> = ({
    points,
    size = 'md',
    className = '',
    onClick,
}) => {
    const dim = size === 'sm' ? 'w-8 h-8' : 'w-11 h-11';
    const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
    const text = size === 'sm' ? 'text-[10px]' : 'text-xs';
    const title = onClick
        ? `${points} נקודות — לחץ להיסטוריית עדכונים`
        : `${points} נקודות — +1 כשמנהל מאשר עדכון פרופיל חברה`;

    const sharedClass = `inline-flex flex-col items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-amber-200 border-2 border-amber-400 shadow-sm shrink-0 ${dim} ${className}${
        onClick ? ' cursor-pointer hover:brightness-95 hover:shadow-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500' : ''
    }`;

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className={sharedClass}
                title={title}
                aria-label="היסטוריית ניקוד ועדכוני פרופיל"
            >
                <TrophyIcon className={`${icon} text-amber-700 ${size === 'sm' ? '' : 'mb-0.5'}`} />
                <span className={`${text} font-black text-amber-900 leading-none`}>{points}</span>
            </button>
        );
    }

    return (
        <div className={sharedClass} title={title}>
            <TrophyIcon className={`${icon} text-amber-700 ${size === 'sm' ? '' : 'mb-0.5'}`} />
            <span className={`${text} font-black text-amber-900 leading-none`}>{points}</span>
        </div>
    );
};

export default ClientProfilePointsBadge;
