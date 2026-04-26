import React, { useEffect, useRef, useState } from 'react';
import { InformationCircleIcon } from './Icons';
import { useReferenceInfo } from '../hooks/useReferenceInfo';

interface ReferenceInfoIconProps {
    /** key matching a row in the admin "מידע עזר" screen */
    infoKey: string;
    /** optional fallback text shown when no entry is found in the DB */
    fallback?: string;
    /** override the icon size class (defaults to w-5 h-5) */
    iconClassName?: string;
    /** appended to the wrapper - useful for absolute positioning tweaks */
    className?: string;
}

/**
 * "i" icon that opens a tooltip popover with the value/description from the
 * `reference_info` admin table for the given key.
 *
 * - Hover (desktop): tooltip appears immediately.
 * - Click / focus (touch + keyboard): tooltip pinned until clicked outside.
 */
const ReferenceInfoIcon: React.FC<ReferenceInfoIconProps> = ({
    infoKey,
    fallback,
    iconClassName = 'w-5 h-5',
    className = '',
}) => {
    const { entry, loading, error } = useReferenceInfo(infoKey);
    const [pinned, setPinned] = useState(false);
    const [hovered, setHovered] = useState(false);
    const wrapperRef = useRef<HTMLSpanElement | null>(null);

    const visible = pinned || hovered;

    useEffect(() => {
        if (!pinned) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(event.target as Node)) {
                setPinned(false);
            }
        };
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setPinned(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [pinned]);

    const hasContent = Boolean(entry?.value);
    const showFallback = !hasContent && !loading;
    const fallbackText = fallback || (error ? error : 'אין מידע זמין למפתח זה.');

    return (
        <span
            ref={wrapperRef}
            className={`relative inline-flex items-center ${className}`}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPinned((p) => !p);
                }}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                className="inline-flex items-center justify-center text-text-subtle hover:text-primary-600 focus:text-primary-600 focus:outline-none rounded-full transition-colors"
                aria-label={entry?.key ? `מידע עזר: ${entry.key}` : 'מידע עזר'}
                aria-expanded={visible}
            >
                <InformationCircleIcon className={`${iconClassName} flex-shrink-0`} />
            </button>

            {visible && (
                <span
                    role="tooltip"
                    dir="rtl"
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                    className="absolute z-50 top-full right-0 mt-2 w-72 max-w-[20rem] rounded-xl border border-border-default bg-white p-3 text-right shadow-2xl text-xs text-text-default"
                    style={{ direction: 'rtl' }}
                >
                    {loading && !entry ? (
                        <span className="text-text-muted">טוען מידע...</span>
                    ) : showFallback ? (
                        <span className="text-text-muted italic">{fallbackText}</span>
                    ) : (
                        <span className="block">
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-text-muted mb-1">
                                תיאור
                            </span>
                            <span className="block whitespace-pre-wrap break-words text-text-default">
                                {entry?.value}
                            </span>
                        </span>
                    )}
                    <span
                        aria-hidden
                        className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-border-default bg-white"
                    />
                </span>
            )}
        </span>
    );
};

export default ReferenceInfoIcon;
