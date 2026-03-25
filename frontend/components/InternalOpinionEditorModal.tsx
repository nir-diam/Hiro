import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import {
    SparklesIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
    ClipboardDocumentIcon,
} from './Icons';

const OPINION_QUILL_MODULES = {
    toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['clean'],
    ],
};

type QuillInstance = InstanceType<typeof Quill>;

function normalizeEmpty(html: string): string {
    const t = (html || '').trim();
    return t || '<p><br></p>';
}

/** Quill 2 + React 19: avoid `react-quill` (uses removed `findDOMNode`). */
const OpinionQuillEditor: React.FC<{
    jobId: string;
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
}> = ({ jobId, value, onChange, placeholder }) => {
    const hostRef = useRef<HTMLDivElement>(null);
    const quillRef = useRef<QuillInstance | null>(null);
    const onChangeRef = useRef(onChange);
    const lastEmittedRef = useRef<string>('');

    onChangeRef.current = onChange;

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        host.innerHTML = '';
        const quill = new Quill(host, {
            theme: 'snow',
            modules: {
                toolbar: OPINION_QUILL_MODULES.toolbar,
            },
            placeholder: placeholder || '',
        });
        quillRef.current = quill;

        quill.clipboard.dangerouslyPasteHTML(normalizeEmpty(value));
        lastEmittedRef.current = quill.root.innerHTML;

        const handler = () => {
            const html = quill.root.innerHTML;
            lastEmittedRef.current = html;
            onChangeRef.current(html);
        };
        quill.on('text-change', handler);

        return () => {
            quill.off('text-change', handler);
            quillRef.current = null;
            host.innerHTML = '';
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount only when job changes; initial `value` is read on mount
    }, [jobId]);

    useEffect(() => {
        const quill = quillRef.current;
        if (!quill) return;
        if (value === lastEmittedRef.current) return;
        quill.clipboard.dangerouslyPasteHTML(normalizeEmpty(value));
        lastEmittedRef.current = quill.root.innerHTML;
    }, [value]);

    return <div className="opinion-quill-host" ref={hostRef} />;
};

function htmlToPlainText(html: string): string {
    if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const d = document.createElement('div');
    d.innerHTML = html;
    return (d.innerText || d.textContent || '').trim();
}

/** Used by parent for "העתק" from modal callback */
export async function copyRichHtmlToClipboard(html: string): Promise<void> {
    const plain = htmlToPlainText(html);
    try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([
                new ClipboardItem({
                    'text/html': new Blob([html], { type: 'text/html' }),
                    'text/plain': new Blob([plain], { type: 'text/plain' }),
                }),
            ]);
            return;
        }
    } catch {
        /* fall through */
    }
    await navigator.clipboard.writeText(plain || html);
}

export interface InternalOpinionEditorJob {
    id: number | string;
    title: string;
    company: string;
}

export type InternalOpinionEditorModalProps = {
    job: InternalOpinionEditorJob | null;
    draftHtml: string;
    onDraftChange: (html: string) => void;
    candidateLabel?: string;
    onClose: () => void;
    onSave: () => void;
    saving: boolean;
    onRegenerate: () => void;
    regenerating: boolean;
    onCopy: () => void | Promise<void>;
    onReport: () => void;
};

export const InternalOpinionEditorModal: React.FC<InternalOpinionEditorModalProps> = ({
    job,
    draftHtml,
    onDraftChange,
    candidateLabel,
    onClose,
    onSave,
    saving,
    onRegenerate,
    regenerating,
    onCopy,
    onReport,
}) => {
    if (!job || typeof document === 'undefined') return null;

    const modal = (
        <div
            className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 md:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="internal-opinion-editor-title"
            onClick={onClose}
        >
            <div
                className="bg-bg-card w-full max-w-4xl h-full max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-4 border-b border-border-default flex items-center justify-between bg-bg-subtle/30 flex-shrink-0 gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
                            <SparklesIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                            <h3 id="internal-opinion-editor-title" className="font-bold text-lg text-text-default truncate">
                                עריכת חוות דעת AI
                            </h3>
                            <p className="text-xs text-text-muted truncate">
                                {candidateLabel ? `${candidateLabel} · ` : ''}
                                {job.title} @ {job.company}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => void onCopy()}
                            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-white border border-border-default rounded-lg text-sm font-medium text-text-default hover:bg-bg-subtle transition-colors"
                            title="העתק מעוצב למייל"
                        >
                            <ClipboardDocumentIcon className="w-4 h-4 text-primary-600" />
                            <span className="hidden sm:inline">העתק</span>
                        </button>
                        <button
                            type="button"
                            onClick={onRegenerate}
                            disabled={regenerating}
                            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-white border border-border-default rounded-lg text-sm font-medium text-text-default hover:bg-bg-subtle transition-colors disabled:opacity-50"
                            title="הפק מחדש"
                        >
                            <SparklesIcon className="w-4 h-4 text-primary-600" />
                            <span className="hidden sm:inline">{regenerating ? 'מייצר...' : 'הפק מחדש'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={onReport}
                            className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 bg-white border border-border-default rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                            title="דווח על בעיה"
                        >
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            <span className="hidden sm:inline">דווח</span>
                        </button>
                        <div className="w-px h-6 bg-border-default mx-1 hidden sm:block" />
                        <button type="button" onClick={onClose} className="p-2 hover:bg-bg-hover rounded-full text-text-muted transition-colors" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col relative bg-bg-subtle/5 min-h-0">
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        <div className="flex justify-center p-4 md:p-8 min-h-full">
                            <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-border-default flex flex-col h-fit mb-8">
                                <div className="quill-editor-container flex flex-col">
                                    <OpinionQuillEditor
                                        jobId={String(job.id)}
                                        value={draftHtml}
                                        onChange={onDraftChange}
                                        placeholder="כתוב כאן את חוות הדעת..."
                                    />
                                </div>
                                <style>{`
                            .quill-editor-container .ql-container.ql-snow {
                                border: none !important;
                                font-family: inherit;
                                font-size: 1.1rem;
                            }
                            .quill-editor-container .ql-editor {
                                min-height: 420px;
                                padding: 2rem;
                                line-height: 1.8;
                                direction: rtl;
                                text-align: right;
                                overflow-y: visible;
                            }
                            @media (min-width: 768px) {
                                .quill-editor-container .ql-editor {
                                    min-height: 520px;
                                    padding: 4rem;
                                }
                            }
                            .quill-editor-container .ql-toolbar.ql-snow {
                                border: none !important;
                                border-bottom: 1px solid var(--color-border-default, #e5e7eb) !important;
                                background: rgba(255, 255, 255, 0.98);
                                backdrop-filter: blur(8px);
                                padding: 0.75rem;
                                display: flex;
                                justify-content: center;
                                gap: 0.25rem;
                                flex-wrap: wrap;
                                position: sticky;
                                top: 0;
                                z-index: 40;
                                border-top-left-radius: 0.75rem;
                                border-top-right-radius: 0.75rem;
                            }
                            .ql-snow .ql-picker:not(.ql-color-picker):not(.ql-icon-picker) svg {
                                right: 0;
                                left: auto;
                            }
                            .ql-snow .ql-picker-label {
                                padding-right: 18px;
                                padding-left: 2px;
                            }
                            .quill-editor-container .ql-editor h1,
                            .quill-editor-container .ql-editor h2,
                            .quill-editor-container .ql-editor h3 {
                                color: #1e1b4b;
                                font-weight: 800;
                                margin-top: 2rem;
                                margin-bottom: 1rem;
                            }
                            .quill-editor-container .ql-editor p {
                                margin-bottom: 1.25rem;
                            }
                            .quill-editor-container .ql-editor strong {
                                color: #4338ca;
                                font-weight: 700;
                            }
                            .quill-editor-container .ql-editor ul,
                            .quill-editor-container .ql-editor ol {
                                padding-right: 1.5rem;
                                margin-bottom: 1.25rem;
                            }
                        `}</style>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-border-default bg-bg-subtle/30 flex justify-end gap-3 flex-shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 font-bold text-text-muted hover:bg-bg-hover rounded-xl transition-colors"
                    >
                        ביטול
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={saving}
                        className="px-8 py-2.5 font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-lg shadow-primary-200 transition-all transform active:scale-95 disabled:opacity-60"
                    >
                        {saving ? 'שומר...' : 'שמור וסגור'}
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modal, document.body);
};

export default InternalOpinionEditorModal;
