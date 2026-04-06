import React from 'react';
import {
    BoldIcon,
    ItalicIcon,
    ListBulletIcon,
    UnderlineIcon,
    LinkIcon,
    ListNumberIcon,
} from './Icons';

/** Plain text with newlines → HTML with `<br>` / `<p>` for proper line breaks in the editor. */
export function normalizeValueForEditor(value: string): string {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/<\s*[a-zA-Z][^>]*>/.test(trimmed)) {
        const paragraphs = trimmed.split(/\n\s*\n/);
        return (
            paragraphs
                .map((p) => {
                    const line = p.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
                    if (!line) return '';
                    const withBr = line.replace(/\n/g, '<br>');
                    return `<p>${withBr}</p>`;
                })
                .filter(Boolean)
                .join('') || trimmed.replace(/\n/g, '<br>')
        );
    }
    return value;
}

const richTextSyncEffect = (
    editorRef: React.RefObject<HTMLDivElement | null>,
    value: string,
    isUserInput: React.MutableRefObject<boolean>,
    onChange: (html: string) => void
) => {
    if (!editorRef.current) return;
    if (isUserInput.current) {
        isUserInput.current = false;
        return;
    }
    const next = normalizeValueForEditor(value ?? '');
    if (editorRef.current.innerHTML !== next) editorRef.current.innerHTML = next;
};

const RICH_TEXT_BUTTON =
    'p-2 rounded-lg hover:bg-black/8 hover:text-text-default text-text-muted transition-colors';
const RICH_TEXT_TOOLBAR_BASE = 'flex items-center gap-1 p-2 border-b border-border-default flex-wrap';

const FONT_FAMILIES = [
    { label: 'ברירת מחדל', value: '' },
    { label: 'Heebo', value: 'Heebo' },
    { label: 'Assistant', value: 'Assistant' },
    { label: 'Rubik', value: 'Rubik' },
    { label: 'Arial', value: 'Arial' },
    { label: 'David', value: 'David' },
];
const FONT_SIZES = [
    { label: 'קטן', value: '1' },
    { label: 'רגיל', value: '3' },
    { label: 'בינוני', value: '4' },
    { label: 'גדול', value: '5' },
    { label: 'כותרת', value: '6' },
];
const TEXT_COLORS = [
    { label: 'שחור', color: '#111827' },
    { label: 'אפור כהה', color: '#4b5563' },
    { label: 'כחול', color: '#1d4ed8' },
    { label: 'ירוק', color: '#15803d' },
    { label: 'אדום', color: '#b91c1c' },
    { label: 'סגול', color: '#6b21a8' },
];

export const RichTextArea: React.FC<{
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    rows?: number;
    className?: string;
    toolbarClassName?: string;
    editorClassName?: string;
    minHeight?: string;
    fullToolbar?: boolean;
}> = ({
    value,
    onChange,
    placeholder,
    minHeight = '120px',
    className = '',
    toolbarClassName = '',
    editorClassName = '',
    fullToolbar = false,
}) => {
    const editorRef = React.useRef<HTMLDivElement>(null);
    const isUserInput = React.useRef(false);
    React.useEffect(() => {
        richTextSyncEffect(editorRef, value, isUserInput, onChange);
    }, [value]);
    const execCmd = (cmd: string, arg?: string) => {
        try {
            if (cmd === 'fontName' && arg) document.execCommand('fontName', false, arg);
            else if (cmd === 'fontSize' && arg) document.execCommand('fontSize', false, arg);
            else if (cmd === 'foreColor' && arg) document.execCommand('foreColor', false, arg);
            else document.execCommand(cmd, false, arg);
        } catch (_) {}
        if (editorRef.current) onChange(editorRef.current.innerHTML);
        editorRef.current?.focus();
    };
    const toolbar = (
        <div className={`${RICH_TEXT_TOOLBAR_BASE} ${toolbarClassName}`}>
            <select
                title="גופן"
                onChange={(e) => {
                    const v = e.target.value;
                    if (v) {
                        editorRef.current?.focus();
                        execCmd('fontName', v);
                    }
                }}
                className="text-xs border border-border-default rounded-lg px-2 py-1.5 bg-white text-text-default min-w-0 max-w-[110px] cursor-pointer"
            >
                {FONT_FAMILIES.map((f) => (
                    <option key={f.value || 'default'} value={f.value || undefined}>
                        {f.label}
                    </option>
                ))}
            </select>
            <select
                title="גודל גופן"
                onChange={(e) => {
                    const v = e.target.value;
                    editorRef.current?.focus();
                    execCmd('fontSize', v);
                }}
                defaultValue="3"
                className="text-xs border border-border-default rounded-lg px-2 py-1.5 bg-white text-text-default min-w-0 max-w-[90px] cursor-pointer"
            >
                {FONT_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                        {s.label}
                    </option>
                ))}
            </select>
            <div className="flex items-center gap-0.5" title="צבע טקסט">
                {TEXT_COLORS.map((c) => (
                    <button
                        key={c.color}
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('foreColor', c.color);
                        }}
                        className="w-6 h-6 rounded border border-border-default hover:ring-2 hover:ring-offset-1 ring-primary-400 transition-all"
                        style={{ backgroundColor: c.color }}
                        title={c.label}
                    />
                ))}
            </div>
            <span className="w-px h-5 bg-border-default mx-0.5" />
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    execCmd('bold');
                }}
                className={RICH_TEXT_BUTTON}
                title="מודגש"
            >
                <BoldIcon className="w-4 h-4" />
            </button>
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    execCmd('italic');
                }}
                className={RICH_TEXT_BUTTON}
                title="נטוי"
            >
                <ItalicIcon className="w-4 h-4" />
            </button>
            {fullToolbar && (
                <>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('underline');
                        }}
                        className={RICH_TEXT_BUTTON}
                        title="קו תחתון"
                    >
                        <UnderlineIcon className="w-4 h-4" />
                    </button>
                    <span className="w-px h-5 bg-border-default mx-0.5" />
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('formatBlock', 'h2');
                        }}
                        className={`${RICH_TEXT_BUTTON} text-xs font-bold`}
                        title="כותרת 2"
                    >
                        H2
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('formatBlock', 'h3');
                        }}
                        className={`${RICH_TEXT_BUTTON} text-xs font-bold`}
                        title="כותרת 3"
                    >
                        H3
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('formatBlock', 'p');
                        }}
                        className={`${RICH_TEXT_BUTTON} text-xs`}
                        title="פסקה"
                    >
                        P
                    </button>
                    <span className="w-px h-5 bg-border-default mx-0.5" />
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('insertUnorderedList');
                        }}
                        className={RICH_TEXT_BUTTON}
                        title="רשימת תבליטים"
                    >
                        <ListBulletIcon className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            execCmd('insertOrderedList');
                        }}
                        className={RICH_TEXT_BUTTON}
                        title="רשימה ממוספרת"
                    >
                        <ListNumberIcon className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const url = window.prompt('הזן קישור URL:');
                            if (url) execCmd('createLink', url);
                        }}
                        className={RICH_TEXT_BUTTON}
                        title="קישור"
                    >
                        <LinkIcon className="w-4 h-4" />
                    </button>
                </>
            )}
            {!fullToolbar && (
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        execCmd('insertUnorderedList');
                    }}
                    className={RICH_TEXT_BUTTON}
                    title="רשימה"
                >
                    <ListBulletIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    );
    return (
        <div
            className={`border-2 rounded-2xl overflow-hidden shadow-sm transition-shadow focus-within:shadow-md ${className}`}
        >
            {toolbar}
            <div
                ref={editorRef}
                contentEditable
                onInput={() => {
                    if (editorRef.current) {
                        isUserInput.current = true;
                        onChange(editorRef.current.innerHTML);
                    }
                }}
                data-placeholder={placeholder}
                className={`rich-text-editor-content outline-none p-4 overflow-y-auto text-right w-full resize-y rich-text-area-empty ${editorClassName}`}
                style={{
                    minHeight,
                    direction: 'rtl',
                    fontFamily: 'Heebo, Assistant, Rubik, Arial, sans-serif',
                    fontSize: '15px',
                    lineHeight: 1.65,
                    color: 'var(--color-text-default, #111827)',
                }}
            />
            <style>{`
                .rich-text-area-empty:empty::before { content: attr(data-placeholder); color: var(--color-text-muted, #6b7280); font-size: 0.9375rem; }
                .rich-text-editor-content p { margin-bottom: 1em; line-height: 1.7; display: block; }
                .rich-text-editor-content p:last-child { margin-bottom: 0; }
                .rich-text-editor-content p + p { margin-top: 0.25em; }
                .rich-text-editor-content br { display: block; content: ''; margin-bottom: 0.35em; line-height: 1.7; }
                .rich-text-editor-content h2 { font-size: 1.25rem; font-weight: 700; margin-top: 1em; margin-bottom: 0.4em; line-height: 1.35; display: block; }
                .rich-text-editor-content h3 { font-size: 1.1rem; font-weight: 700; margin-top: 0.85em; margin-bottom: 0.35em; line-height: 1.4; display: block; }
                .rich-text-editor-content ul, .rich-text-editor-content ol { margin: 0.5em 0 0.75em 1.25em; padding-right: 0.5em; }
                .rich-text-editor-content li { margin-bottom: 0.35em; line-height: 1.6; }
                .rich-text-editor-content div { margin-bottom: 0.5em; line-height: 1.65; }
                .rich-text-editor-content br + br { display: block; content: ''; margin-top: 0.5em; }
            `}</style>
        </div>
    );
};
