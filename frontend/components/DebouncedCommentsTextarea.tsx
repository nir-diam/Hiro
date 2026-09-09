import React, { useEffect, useRef, useState } from 'react';

type Props = {
    value: string | null | undefined;
    onSave: (comments: string) => Promise<void>;
    debounceMs?: number;
    placeholder?: string;
    className?: string;
    wrapperClassName?: string;
    rows?: number;
};

/** Local textarea that persists via onSave after the user stops typing. */
export default function DebouncedCommentsTextarea({
    value,
    onSave,
    debounceMs = 600,
    placeholder = 'הוסף הערה…',
    className = '',
    wrapperClassName = 'min-w-[160px] max-w-[220px] mx-auto',
    rows = 3,
}: Props) {
    const [text, setText] = useState(value ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastSaved = useRef(value ?? '');
    const skipNextDebounce = useRef(false);
    const onSaveRef = useRef(onSave);
    onSaveRef.current = onSave;

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

        const t = setTimeout(() => {
            const toSave = text;
            setSaving(true);
            setError(null);
            void onSaveRef
                .current(toSave)
                .then(() => {
                    lastSaved.current = toSave;
                })
                .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'שגיאה בשמירה');
                })
                .finally(() => setSaving(false));
        }, debounceMs);

        return () => clearTimeout(t);
    }, [text, debounceMs]);

    return (
        <div className={`flex flex-col gap-1 ${wrapperClassName}`}>
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={rows}
                placeholder={placeholder}
                dir="auto"
                className={`w-full text-xs leading-relaxed rounded-lg border border-border-default bg-white px-2.5 py-2 text-text-default placeholder:text-text-muted/70 focus:outline-none focus:ring-2 focus:ring-orange-400/40 focus:border-orange-300 resize-y min-h-[64px] ${className}`}
            />
            <div className="h-3 text-[10px] text-text-muted text-right">
                {saving ? 'שומר…' : error ? <span className="text-rose-600">{error}</span> : null}
            </div>
        </div>
    );
}
