import React from 'react';

/** Small count pill on profile nav tabs (hidden when zero). */
const ProfileTabCountBadge: React.FC<{ count?: number }> = ({ count }) => {
    if (count == null || count <= 0) return null;
    return (
        <span
            className="min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-primary-100 text-primary-800 text-[11px] font-bold leading-none tabular-nums"
            aria-label={`${count}`}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
};

export default ProfileTabCountBadge;
