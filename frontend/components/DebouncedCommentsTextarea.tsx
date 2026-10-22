import React, { useEffect, useRef, useState } from 'react';

type Props = {
    value: string | null | undefined;
    onSave: (comments: string) => Promise<void>;
    debounceMs?: number;
    placeholder?: string;
    className?: string;
    wrapperClassName?: string;
    rows?: number;
    autoFocus?: boolean;
};

/** Local textarea that persists via onSave after the user stops typing, or immediately via שמור. */
export default function DebouncedCommentsTextarea({
    value,
    onSave,
    debounceMs = 600,
    placeholder = 'הוסף הערה…',
    className = '',
    wrapperClassName = 'min-w-[160px] max-w-[220px] mx-auto',
    rows = 3,
    autoFocus = false,
}: Props) {
    const [text, setText] = useState(value ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastSaved = useRef(value ?? '');
    const skipNextDebounce = useRef(false);
    const onSaveRef = useRef(onSave);
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveGenerationRef = useRef(0);
    onSaveRef.current = onSave;

    const persist = (toSave: string) => {
        if (toSave === lastSaved.current) return;
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
        }
        const gen = ++saveGenerationRef.current;
        setSaving(true);
        setError(null);
        void onSaveRef
            .current(toSave)
            .then(() => {
                if (gen !== saveGenerationRef.current) return;
                lastSaved.current = toSave;
            })
            .catch((err: unknown) => {
                if (gen !== saveGenerationRef.current) return;
                setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
            })
            .finally(() => {
                if (gen === saveGenerationRef.current) setSaving(false);
            });
    };

    useEffect(() => {
        const next = value ?? '';
        if (next === lastSaved.current) {
            skipNextDebounce.current = true;
            setText(next);
        }
    }, [value]);

    useEffect(() => {
        if (skipNextDebounce.current) {
            skipNextDebounce.current = false;
            return;
        }
        if (text === lastSaved.current) return;

        debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;
            persist(text);
        }, debounceMs);

        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = null;
            }
        };
    }, [text, debounceMs]);

    const canSave = !saving && text !== lastSaved.current;

    return (
        <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={rows}
                autoFocus={autoFocus}
                placeholder={placeholder}
                dir="auto"
                className={`w-full text-xs leading-relaxed rounded-lg border border-border-default bg-white px-2.5 py-2 text-text-default placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 resize-y min-h-[64px] ${className}`}
            />
            <div className="flex items-center justify-between gap-2 min-h-6">
                <span className="text-[10px] text-text-muted text-right">
                    {saving ? 'שומר…' : error ? <span className="text-rose-600">{error}</span> : null}
                </span>
                <button
                    type="button"
                    onClick={() => persist(text)}
                    disabled={!canSave}
                    className="shrink-0 text-[11px] font-bold px-2.5 py-0.5 rounded-md border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-40 disabled:pointer-events-none"
                >
                    שמור
                </button>
            </div>
        </div>
    );
}
