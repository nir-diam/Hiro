import React from 'react';
import { LockClosedIcon } from './Icons';

type TagLike = {
    isProtected?: boolean;
    protectionNote?: string | null;
};

export const TagProtectedLock: React.FC<{ tag: TagLike; className?: string }> = ({ tag, className = '' }) => {
    if (!tag.isProtected) return null;
    return (
        <LockClosedIcon
            className={`w-3.5 h-3.5 text-amber-600 shrink-0 ${className}`.trim()}
            title={tag.protectionNote?.trim() || 'תגית מוגנת'}
        />
    );
};
