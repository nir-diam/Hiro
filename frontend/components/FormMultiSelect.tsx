import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, XMarkIcon } from './Icons';

export type FormMultiSelectOption = { value: string; label: string };

type FormMultiSelectProps = {
    label: string;
    options: FormMultiSelectOption[];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
};

export const FormMultiSelect: React.FC<FormMultiSelectProps> = ({
    label,
    options,
    value,
    onChange,
    placeholder = 'בחר',
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const mergedOptions = useMemo(() => {
        const byVal = new Map<string, FormMultiSelectOption>();
        for (const o of options) {
            const rawVal = String(o.value ?? '').trim();
            const label = String(o.label ?? '').trim() || rawVal;
            const key = rawVal || label;
            if (!key) continue;
            byVal.set(key, { value: key, label: label || key });
        }
        for (const v of value) {
            const s = String(v ?? '').trim();
            if (s && !byVal.has(s)) byVal.set(s, { value: s, label: s });
        }
        return Array.from(byVal.values());
    }, [options, value]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const labelFor = (v: string) => mergedOptions.find((o) => o.value === v)?.label ?? v;

    const toggle = (v: string) => {
        if (value.includes(v)) onChange(value.filter((x) => x !== v));
        else onChange([...value, v]);
    };

    const removeChip = (e: React.MouseEvent, v: string) => {
        e.stopPropagation();
        onChange(value.filter((x) => x !== v));
    };

    return (
        <div className="relative" ref={rootRef}>
            <span className="block text-sm font-semibold text-text-muted mb-1">{label}</span>
            <div
                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg focus-within:ring-primary-500 focus-within:border-primary-500 p-2.5 min-h-[42px] cursor-pointer flex flex-wrap gap-2 items-center transition shadow-sm"
                onClick={() => setOpen((o) => !o)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpen((o) => !o);
                    }
                }}
                role="combobox"
                aria-expanded={open}
                tabIndex={0}
            >
                {value.length === 0 && <span className="text-text-muted px-0.5">{placeholder}</span>}
                {value.map((v) => (
                    <span
                        key={v}
                        className="bg-primary-50 text-primary-700 text-xs font-semibold px-2 py-1 rounded-md inline-flex items-center gap-1 border border-primary-100"
                    >
                        {labelFor(v)}
                        <button
                            type="button"
                            onClick={(e) => removeChip(e, v)}
                            className="hover:text-primary-900 rounded-full p-0.5 -mr-0.5"
                            aria-label="הסר"
                        >
                            <XMarkIcon className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                <span className="grow min-w-2" />
                <ChevronDownIcon className={`w-4 h-4 text-text-subtle shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
            {open && (
                <div
                    className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-default rounded-lg shadow-xl z-[300] max-h-48 overflow-y-auto py-1"
                    role="listbox"
                >
                    {mergedOptions.map((opt) => {
                        const checked = value.includes(opt.value);
                        return (
                            <div
                                key={opt.value}
                                role="option"
                                aria-selected={checked}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggle(opt.value);
                                }}
                                className="px-3 py-2 hover:bg-bg-hover cursor-pointer flex items-center gap-2 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    readOnly
                                    checked={checked}
                                    className="w-4 h-4 rounded border-border-default text-primary-600 focus:ring-primary-500 pointer-events-none"
                                />
                                <span className={checked ? 'font-semibold text-primary-700' : 'text-text-default'}>
                                    {opt.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
