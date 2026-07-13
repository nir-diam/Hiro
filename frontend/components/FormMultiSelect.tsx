import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, XMarkIcon } from './Icons';
import { brandAccentStyle, brandOrPrimary } from '../utils/brandAccent';

export type FormMultiSelectOption = { value: string; label: string };

type FormMultiSelectProps = {
    label?: string;
    options: FormMultiSelectOption[];
    value: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    compact?: boolean;
    disabled?: boolean;
    searchable?: boolean;
    searchPlaceholder?: string;
    accentColor?: string;
    className?: string;
};

export const FormMultiSelect: React.FC<FormMultiSelectProps> = ({
    label,
    options,
    value,
    onChange,
    placeholder = 'בחר',
    compact = false,
    disabled = false,
    searchable = false,
    searchPlaceholder = 'חיפוש...',
    accentColor,
    className = '',
}) => {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const rootRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

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
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    useEffect(() => {
        if (open && searchable) {
            searchInputRef.current?.focus();
        }
        if (!open) setSearchQuery('');
    }, [open, searchable]);

    const filteredOptions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return mergedOptions;
        return mergedOptions.filter(
            (opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q),
        );
    }, [mergedOptions, searchQuery]);

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
        <div className={`relative ${className}`} ref={rootRef} style={brandAccentStyle(accentColor)}>
            {label ? (
                <span className={`block font-semibold text-text-muted mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>
                    {label}
                </span>
            ) : null}
            <div
                className={`w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg flex flex-wrap gap-2 items-center transition shadow-sm ${
                    brandOrPrimary(accentColor, 'focus-within:ring-[var(--brand-accent)] focus-within:border-[var(--brand-accent)]', 'focus-within:ring-primary-500 focus-within:border-primary-500')
                } ${compact ? 'rounded-xl py-2 px-3 min-h-[38px]' : 'p-2.5 min-h-[42px]'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                onClick={() => { if (!disabled) setOpen((o) => !o); }}
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
                        className={`text-xs font-semibold px-2 py-1 rounded-md inline-flex items-center gap-1 border ${brandOrPrimary(accentColor, 'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)] border-[var(--brand-accent-border)]', 'bg-primary-50 text-primary-700 border-primary-100')}`}
                    >
                        {labelFor(v)}
                        <button
                            type="button"
                            onClick={(e) => removeChip(e, v)}
                            className={brandOrPrimary(accentColor, 'hover:opacity-80', 'hover:text-primary-900')}
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
                    className="absolute top-full left-0 right-0 mt-1 bg-bg-card border border-border-default rounded-lg shadow-xl z-[300] max-h-56 overflow-hidden flex flex-col py-1"
                    role="listbox"
                >
                    {searchable && (
                        <div className="px-2 pb-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder={searchPlaceholder}
                                className={`w-full px-2.5 py-1.5 text-sm border border-border-default rounded-md bg-bg-input text-text-default outline-none ${brandOrPrimary(accentColor, 'focus:ring-1 focus:ring-[var(--brand-accent)] focus:border-[var(--brand-accent)]', 'focus:ring-1 focus:ring-primary-500 focus:border-primary-500')}`}
                                onKeyDown={(e) => e.stopPropagation()}
                            />
                        </div>
                    )}
                    <div className="overflow-y-auto max-h-44">
                    {filteredOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-text-muted">לא נמצאו תוצאות</div>
                    ) : (
                    filteredOptions.map((opt) => {
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
                                    className={`w-4 h-4 rounded border-border-default pointer-events-none ${brandOrPrimary(accentColor, 'accent-[var(--brand-accent)]', 'text-primary-600 focus:ring-primary-500')}`}
                                />
                                <span className={checked ? `font-semibold ${brandOrPrimary(accentColor, 'text-[var(--brand-accent)]', 'text-primary-700')}` : 'text-text-default'}>
                                    {opt.label}
                                </span>
                            </div>
                        );
                    })
                    )}
                    </div>
                </div>
            )}
        </div>
    );
};
