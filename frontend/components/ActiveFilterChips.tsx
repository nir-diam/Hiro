import React from 'react';
import { XMarkIcon } from './Icons';

export type ActiveFilterChip = {
    id: string;
    label: string;
    /** Optional prefix shown muted before label (e.g. filter group name). */
    group?: string;
    onRemove?: () => void;
};

type ActiveFilterChipsProps = {
    chips: ActiveFilterChip[];
    className?: string;
    maxVisible?: number;
};

const ActiveFilterChips: React.FC<ActiveFilterChipsProps> = ({
    chips,
    className = '',
    maxVisible = 24,
}) => {
    if (!chips.length) return null;

    const visible = chips.slice(0, maxVisible);
    const hiddenCount = chips.length - visible.length;

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            {visible.map((chip) => (
                <span
                    key={chip.id}
                    className="inline-flex items-center gap-1 max-w-[min(100%,280px)] rounded-full border border-primary-300 bg-primary-100 text-primary-900 text-xs font-semibold pl-2.5 pr-1 py-1 shadow-sm"
                    title={chip.group ? `${chip.group}: ${chip.label}` : chip.label}
                >
                    {chip.group ? (
                        <span className="text-primary-600/80 font-bold shrink-0">{chip.group}:</span>
                    ) : null}
                    <span className="truncate">{chip.label}</span>
                    {chip.onRemove ? (
                        <button
                            type="button"
                            onClick={chip.onRemove}
                            className="shrink-0 p-0.5 rounded-full hover:bg-primary-200/80 text-primary-600 hover:text-primary-900 transition-colors"
                            aria-label={`הסר סינון ${chip.label}`}
                        >
                            <XMarkIcon className="w-3 h-3" />
                        </button>
                    ) : null}
                </span>
            ))}
            {hiddenCount > 0 ? (
                <span className="text-[11px] font-semibold text-text-muted px-1.5">
                    +{hiddenCount} נוספים
                </span>
            ) : null}
        </div>
    );
};

export default ActiveFilterChips;
