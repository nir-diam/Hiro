import React from 'react';

interface TooltipProps {
    content: string;
    children: React.ReactNode;
}

/** Hover label; wrapper is flex-1 so it stays aligned in icon button rows. */
const Tooltip: React.FC<TooltipProps> = ({ content, children }) => (
    <div className="relative flex min-w-0 flex-1 group">
        <div className="w-full">{children}</div>
        <span
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
        >
            {content}
        </span>
    </div>
);

export default Tooltip;
