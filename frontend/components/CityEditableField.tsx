import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PencilIcon } from './Icons';
import {
    fetchCitySearchOptions,
    resolveCityById,
    resolveExactCityName,
    type CitySearchOption,
} from '../utils/citySearchApi';

type CityEditableFieldProps = {
    value: string;
    placeholder: string;
    onSave: (cityName: string) => void;
    className?: string;
    icon?: React.ReactNode;
    /** When true, omit pencil button (parent supplies layout). */
    compact?: boolean;
};

const CityEditableField: React.FC<CityEditableFieldProps> = ({
    value,
    placeholder,
    onSave,
    className = '',
    icon,
    compact = false,
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [query, setQuery] = useState('');
    const [options, setOptions] = useState<CitySearchOption[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [highlightIdx, setHighlightIdx] = useState(-1);
    const [pickRequiredHint, setPickRequiredHint] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedInvalid, setSavedInvalid] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);

    const displayValue = value.trim();

    useEffect(() => {
        let cancelled = false;
        if (!displayValue) {
            setSavedInvalid(false);
            return;
        }
        void resolveExactCityName(displayValue).then((ok) => {
            if (!cancelled) setSavedInvalid(!ok);
        });
        return () => {
            cancelled = true;
        };
    }, [displayValue]);

    useEffect(() => {
        if (isEditing) {
            setQuery(displayValue);
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing, displayValue]);

    useEffect(() => {
        if (!isEditing) {
            setOptions([]);
            setOpen(false);
            setHighlightIdx(-1);
            setPickRequiredHint(false);
            return;
        }

        const q = query.trim();
        if (q.length < 2) {
            setOptions([]);
            setOpen(false);
            setHighlightIdx(-1);
            return;
        }

        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);
            void fetchCitySearchOptions(q)
                .then((rows) => {
                    if (cancelled) return;
                    setOptions(rows);
                    setOpen(rows.length > 0);
                    setHighlightIdx(-1);
                    setPickRequiredHint(false);
                })
                .catch(() => {
                    if (!cancelled) {
                        setOptions([]);
                        setOpen(false);
                    }
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, 280);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, isEditing]);

    const cancelEdit = useCallback(() => {
        setQuery(displayValue);
        setIsEditing(false);
        setOpen(false);
        setPickRequiredHint(false);
    }, [displayValue]);

    const pickOption = useCallback(
        async (opt: CitySearchOption) => {
            setSaving(true);
            setPickRequiredHint(false);
            setQuery(opt.name);
            try {
                const canonical =
                    (await resolveCityById(opt.id)) ||
                    (await resolveExactCityName(opt.name)) ||
                    opt.name;
                onSave(canonical);
                setSavedInvalid(false);
                setIsEditing(false);
                setOpen(false);
            } catch {
                setPickRequiredHint(true);
            } finally {
                setSaving(false);
            }
        },
        [onSave],
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!options.length) return;
            setOpen(true);
            setHighlightIdx((i) => (i < options.length - 1 ? i + 1 : 0));
            setPickRequiredHint(false);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (!options.length) return;
            setOpen(true);
            setHighlightIdx((i) => (i > 0 ? i - 1 : options.length - 1));
            setPickRequiredHint(false);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIdx >= 0 && options[highlightIdx]) {
                void pickOption(options[highlightIdx]);
            } else {
                setPickRequiredHint(true);
            }
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };

    useEffect(() => {
        if (!isEditing) return;
        const onDocDown = (ev: MouseEvent) => {
            if (!rootRef.current?.contains(ev.target as Node)) {
                cancelEdit();
            }
        };
        document.addEventListener('mousedown', onDocDown);
        return () => document.removeEventListener('mousedown', onDocDown);
    }, [isEditing, cancelEdit]);

    const showHint = isEditing && query.trim().length < 2 && !loading;
    const showEmpty = isEditing && query.trim().length >= 2 && !loading && options.length === 0;

    const startEdit = () => {
        setQuery(savedInvalid ? '' : displayValue);
        setIsEditing(true);
    };

    return (
        <div ref={rootRef} className={`relative group flex items-start gap-2 min-w-0 ${className}`}>
            {icon ? <span className="mt-1 text-text-subtle shrink-0">{icon}</span> : null}
            <div className="flex-grow min-w-0">
                {isEditing ? (
                    <div className="relative z-40">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setPickRequiredHint(false);
                            }}
                            onKeyDown={handleKeyDown}
                            disabled={saving}
                            className={`w-full bg-bg-input border rounded-lg px-2 py-1 text-inherit outline-none focus:ring-2 text-sm disabled:opacity-60 ${
                                pickRequiredHint
                                    ? 'border-amber-400 focus:ring-amber-200'
                                    : 'border-primary-500 focus:ring-primary-200'
                            }`}
                            placeholder={placeholder}
                            autoComplete="off"
                            role="combobox"
                            aria-expanded={open}
                            aria-autocomplete="list"
                        />
                        {showHint ? (
                            <p className="text-[10px] text-text-muted mt-1">הקלד לפחות 2 תווים ובחר עיר מהרשימה</p>
                        ) : null}
                        {loading || saving ? (
                            <p className="text-[10px] text-text-muted mt-1">{saving ? 'שומר…' : 'טוען ערים…'}</p>
                        ) : null}
                        {showEmpty ? (
                            <p className="text-[10px] text-amber-700 mt-1">לא נמצאו ערים — בחר מהרשימה בלבד</p>
                        ) : null}
                        {pickRequiredHint ? (
                            <p className="text-[10px] text-amber-700 font-semibold mt-1">יש ללחוץ על עיר מהרשימה</p>
                        ) : null}
                        {open && options.length > 0 ? (
                            <ul
                                className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-card shadow-lg z-50 py-1"
                                role="listbox"
                            >
                                {options.map((opt, idx) => (
                                    <li key={opt.id} role="option" aria-selected={idx === highlightIdx}>
                                        <button
                                            type="button"
                                            className={`w-full text-right px-3 py-2 text-sm hover:bg-bg-hover transition-colors ${
                                                idx === highlightIdx ? 'bg-primary-50 text-primary-800' : 'text-text-default'
                                            }`}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void pickOption(opt);
                                            }}
                                        >
                                            <span className="font-medium">{opt.name}</span>
                                            {opt.region ? (
                                                <span className="text-text-muted text-xs mr-2">({opt.region})</span>
                                            ) : null}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                ) : (
                    <div className={`relative ${compact ? '' : 'pr-6'}`}>
                        <div
                            onClick={startEdit}
                            className={`cursor-pointer hover:bg-bg-hover/50 rounded-md py-0.5 px-1 min-h-[1.5em] ${
                                savedInvalid ? 'ring-1 ring-amber-300 bg-amber-50/80' : ''
                            }`}
                        >
                            <p className="whitespace-pre-line break-words leading-relaxed">
                                {displayValue ? (
                                    <>
                                        {displayValue}
                                        {savedInvalid ? (
                                            <span className="block text-[10px] text-amber-700 font-semibold mt-0.5">
                                                עיר לא תקינה — בחר מהרשימה
                                            </span>
                                        ) : null}
                                    </>
                                ) : (
                                    <span className="text-text-subtle opacity-60 italic">{placeholder}</span>
                                )}
                            </p>
                        </div>
                        {!compact ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    startEdit();
                                }}
                                className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-text-subtle hover:text-primary-600 z-20"
                                aria-label="ערוך"
                            >
                                <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CityEditableField;