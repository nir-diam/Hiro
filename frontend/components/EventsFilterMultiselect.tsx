import React, { useState, useEffect, useRef } from 'react';
import { ChevronDownIcon } from './Icons';

export type EventsFilterMultiselectProps = {
    options: string[];
    value: string[];
    onChange: (next: string[]) => void;
    triggerId: string;
};

export const EventsFilterMultiselect: React.FC<EventsFilterMultiselectProps> = ({
    options,
    value,
    onChange,
    triggerId,
}) => {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);

    const summary =
        value.length === 0 ? 'הכל' : value.length === 1 ? value[0] : `${value.length} נבחרו`;

    const toggle = (opt: string) => {
        if (value.includes(opt)) {
            onChange(value.filter((x) => x !== opt));
        } else {
            onChange([...value, opt]);
        }
    };

    return (
        <div className="relative" ref={wrapRef}>
            <button
                type="button"
                id={triggerId}
                onClick={() => setOpen((o) => !o)}
                className="w-full bg-bg-input border border-border-default rounded-lg py-2 px-3 text-sm text-right flex items-center justify-between gap-2 min-h-[38px] focus:ring-2 focus:ring-primary-500/20 outline-none cursor-pointer"
                aria-expanded={open}
                aria-haspopup="listbox"
            >
                <span className="truncate flex-1 min-w-0">{summary}</span>
                <ChevronDownIcon
                    className={`w-4 h-4 flex-shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <div
                    className="absolute z-40 mt-1 w-full min-w-0 max-h-48 overflow-y-auto bg-bg-card border border-border-default rounded-lg shadow-lg py-1.5"
                    role="listbox"
                    dir="rtl"
                >
                    {options.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-text-muted">אין אפשרויות</div>
                    ) : (
                        options.map((opt) => (
                            <label
                                key={opt}
                                className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-hover"
                            >
                                <input
                                    type="checkbox"
                                    checked={value.includes(opt)}
                                    onChange={() => toggle(opt)}
                                    className="rounded border-border-default text-primary-600 focus:ring-primary-500/30 shrink-0"
                                />
                                <span className="flex-1 min-w-0 truncate">{opt}</span>
                            </label>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
