import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownTrayIcon, PencilIcon, SparklesIcon } from './Icons';
import {
    chipClassForRawType,
    collectKeywordHighlightSpans,
    collectSearchTextHighlightSpans,
    type TagDetailForHighlight,
} from '../utils/parsedSearchTextSpans';
import { clampCenteredPopoverX, popoverTopBelowAnchor } from '../utils/clampPopoverPosition';
import { normalizeSearchTextLineBreaks } from '../utils/normalizeSearchText';

const TAG_TOOLTIP_WIDTH = 300;
const TAG_TOOLTIP_EST_HEIGHT = 280;

function confidenceLabel(detail: TagDetailForHighlight): { label: string; tone: 'high' | 'medium' | 'low' } {
    const score = typeof detail.confidenceScore === 'number' ? detail.confidenceScore : undefined;
    const final = typeof detail.finalScore === 'number' ? detail.finalScore : undefined;
    if ((score != null && score >= 0.95) || (final != null && final >= 250)) {
        return { label: 'גבוהה (מפורש)', tone: 'high' };
    }
    if ((score != null && score >= 0.75) || (final != null && final >= 150)) {
        return { label: 'בינונית', tone: 'medium' };
    }
    return { label: 'נמוכה', tone: 'low' };
}

const TagTooltipCard: React.FC<{
    title: string;
    detail: TagDetailForHighlight;
    conf: ReturnType<typeof confidenceLabel>;
    sourcePath: string;
}> = ({ title, detail, conf, sourcePath }) => (
    <div className="relative flex flex-col items-center">
        <span className="mx-auto w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-slate-900 drop-shadow-md" />
        <div
            className="bg-slate-900 text-slate-200 rounded-xl shadow-2xl border border-slate-700/60 w-full overflow-hidden font-sans text-right"
            dir="rtl"
        >
            <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/80 flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[10px] text-primary-400 font-bold uppercase tracking-widest">
                        {detail.rawType || 'תגית'}
                    </span>
                    <span className="text-sm font-extrabold text-white leading-tight">{title}</span>
                </div>
                <span className="flex items-center gap-1 bg-primary-500/20 text-primary-300 px-1.5 py-0.5 rounded border border-primary-500/30 shrink-0">
                    <SparklesIcon className="w-3 h-3" />
                    <span className="text-[9px] font-bold">Hiro AI</span>
                </span>
            </div>
            <div className="grid grid-cols-2 divide-x-reverse divide-x divide-slate-700/50 border-b border-slate-700/50 bg-slate-800/30">
                <div className="p-3">
                    <div className="text-[9px] text-slate-400 mb-0.5 font-medium">ניסיון</div>
                    <div className="text-xs font-bold text-white">{detail.isCurrent ? 'נוכחי' : '—'}</div>
                </div>
                <div className="p-3">
                    <div className="text-[9px] text-slate-400 mb-0.5 font-medium">רמת ביטחון</div>
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                conf.tone === 'high'
                                    ? 'bg-emerald-500'
                                    : conf.tone === 'medium'
                                      ? 'bg-amber-400'
                                      : 'bg-slate-400'
                            }`}
                        />
                        <span className="text-xs font-bold text-white">{conf.label}</span>
                    </div>
                </div>
            </div>
            <div className="p-4 space-y-3">
                {sourcePath ? (
                    <div>
                        <div className="text-[9px] text-slate-400 mb-1 font-medium">מזוהה מתוך</div>
                        <div className="text-[11px] text-slate-300 font-mono bg-slate-800 rounded px-2 py-1 inline-block border border-slate-700/50">
                            {sourcePath}
                        </div>
                    </div>
                ) : null}
                {detail.tagReason ? (
                    <div>
                        <div className="text-[9px] text-slate-400 mb-1 font-medium">סיבת בחירה</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed border-r-2 border-primary-500/50 pr-2">
                            {detail.tagReason}
                        </p>
                    </div>
                ) : null}
                {detail.descriptionHe ? (
                    <div>
                        <div className="text-[9px] text-slate-400 mb-1 font-medium">תיאור</div>
                        <p className="text-[11px] text-slate-400 italic leading-relaxed">
                            &quot;{detail.descriptionHe}&quot;
                        </p>
                    </div>
                ) : null}
            </div>
        </div>
    </div>
);

const ParsedTagSpan: React.FC<{ text: string; detail: TagDetailForHighlight }> = ({ text, detail }) => {
    const chip = chipClassForRawType(detail.rawType);
    const title = detail.displayNameHe || detail.displayNameEn || detail.tagKey || text;
    const conf = confidenceLabel(detail);
    const sourcePath = ['קורות חיים', detail.category, detail.context].filter(Boolean).join(' > ');
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [tipOpen, setTipOpen] = useState(false);
    const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

    const syncTipPosition = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const centerX = r.left + r.width / 2;
        setTipPos({
            left: clampCenteredPopoverX(centerX, TAG_TOOLTIP_WIDTH),
            top: popoverTopBelowAnchor(r.top, r.bottom, TAG_TOOLTIP_EST_HEIGHT),
        });
    }, []);

    const openTip = useCallback(() => {
        syncTipPosition();
        setTipOpen(true);
    }, [syncTipPosition]);

    const closeTip = useCallback(() => setTipOpen(false), []);

    return (
        <>
            <span
                ref={anchorRef}
                className="inline-block relative cursor-pointer mx-0.5 align-baseline"
                onMouseEnter={openTip}
                onMouseLeave={closeTip}
                onFocus={openTip}
                onBlur={closeTip}
            >
                <span className={`${chip} px-1.5 py-0.5 rounded font-semibold border shadow-sm transition-all hover:brightness-95`}>
                    {text}
                </span>
            </span>
            {tipOpen && typeof document !== 'undefined'
                ? createPortal(
                      <div
                          className="fixed z-[1100] pointer-events-none animate-in fade-in duration-150"
                          style={{
                              top: tipPos.top,
                              left: tipPos.left,
                              width: TAG_TOOLTIP_WIDTH,
                          }}
                          onMouseEnter={openTip}
                          onMouseLeave={closeTip}
                      >
                          <TagTooltipCard title={title} detail={detail} conf={conf} sourcePath={sourcePath} />
                      </div>,
                      document.body,
                  )
                : null}
        </>
    );
};

export const ParsedSearchTextWithTags: React.FC<{
    searchText: string;
    tagDetails?: TagDetailForHighlight[];
    /** Terms from complex-query search — highlighted in red in CV text. */
    highlightKeywords?: string[];
    createdAtLabel?: string | null;
    onEdit?: () => void;
    onDownloadPdf?: () => void | Promise<void>;
    onDownloadDocx?: () => void | Promise<void>;
    toolbarBelowHeader?: React.ReactNode;
}> = ({ searchText, tagDetails = [], highlightKeywords = [], createdAtLabel, onEdit, onDownloadPdf, onDownloadDocx, toolbarBelowHeader }) => {
    const [exportBusy, setExportBusy] = useState<'pdf' | 'docx' | null>(null);

    const runExport = (kind: 'pdf' | 'docx', fn?: () => void | Promise<void>) => {
        if (!fn) return;
        setExportBusy(kind);
        void Promise.resolve(fn()).finally(() => setExportBusy(null));
    };
    const plain = normalizeSearchTextLineBreaks(searchText);
    const spans = useMemo(() => {
        const tagSpans = collectSearchTextHighlightSpans(plain, tagDetails);
        const kwSpans = collectKeywordHighlightSpans(plain, highlightKeywords);
        const merged = [...tagSpans, ...kwSpans].sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
        const out: typeof tagSpans = [];
        for (const span of merged) {
            const last = out[out.length - 1];
            if (!last || span.start >= last.end) out.push(span);
        }
        return out;
    }, [plain, tagDetails, highlightKeywords]);

    const body = useMemo(() => {
        if (!plain) return null;
        if (!spans.length) {
            return (
                <div className="leading-[2.5] text-[15px] whitespace-pre-wrap break-words">{plain}</div>
            );
        }
        const nodes: React.ReactNode[] = [];
        let cursor = 0;
        spans.forEach((span, i) => {
            if (span.start > cursor) {
                nodes.push(<span key={`t-${i}-pre`}>{plain.slice(cursor, span.start)}</span>);
            }
            nodes.push(
                <ParsedTagSpan key={`tag-${i}`} text={plain.slice(span.start, span.end)} detail={span.detail} />,
            );
            cursor = span.end;
        });
        if (cursor < plain.length) {
            nodes.push(<span key="tail">{plain.slice(cursor)}</span>);
        }
        return <div className="leading-[2.5] text-[15px]">{nodes}</div>;
    }, [plain, spans]);

    if (!plain) {
        return (
            <p className="text-sm text-text-muted text-center py-16">אין טקסט מפורסר ראשוני למועמד זה.</p>
        );
    }

    return (
        <div className="flex flex-col h-full bg-white relative font-sans rounded-2xl overflow-hidden" dir="rtl">
            <div className="flex items-center justify-between p-4 border-b border-border-default bg-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 text-purple-700">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                            className="w-6 h-6"
                            aria-hidden
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3 className="font-bold text-text-default text-lg">טקסט מפורסר ראשוני</h3>
                        {createdAtLabel ? (
                            <p className="text-xs text-text-muted flex items-center gap-1">
                                נוצר בתאריך: {createdAtLabel}
                            </p>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    {onDownloadPdf ? (
                        <button
                            type="button"
                            disabled={exportBusy !== null}
                            onClick={() => runExport('pdf', onDownloadPdf)}
                            className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 border-rose-200 bg-gradient-to-l from-rose-50 to-white text-rose-800 font-bold text-sm shadow-sm hover:border-rose-300 hover:from-rose-100 hover:shadow transition-all disabled:opacity-50"
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white text-[10px] font-extrabold tracking-tight group-hover:bg-rose-700">
                                PDF
                            </span>
                            <span className="flex flex-col items-start leading-tight">
                                <span>הורד PDF</span>
                                <span className="text-[10px] font-medium text-rose-600/80">מעוצב להדפסה</span>
                            </span>
                            <ArrowDownTrayIcon
                                className={`w-4 h-4 text-rose-600 ${exportBusy === 'pdf' ? 'animate-pulse' : ''}`}
                            />
                        </button>
                    ) : null}
                    {onDownloadDocx ? (
                        <button
                            type="button"
                            disabled={exportBusy !== null}
                            onClick={() => runExport('docx', onDownloadDocx)}
                            className="group flex items-center gap-2 px-3.5 py-2 rounded-xl border-2 border-primary-200 bg-gradient-to-l from-primary-50 to-white text-primary-900 font-bold text-sm shadow-sm hover:border-primary-300 hover:from-primary-100 hover:shadow transition-all disabled:opacity-50"
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white text-[10px] font-extrabold tracking-tight group-hover:bg-primary-700">
                                DOCX
                            </span>
                            <span className="flex flex-col items-start leading-tight">
                                <span>הורד Word</span>
                                <span className="text-[10px] font-medium text-primary-600/80">עריכה ב-Word</span>
                            </span>
                            <ArrowDownTrayIcon
                                className={`w-4 h-4 text-primary-600 ${exportBusy === 'docx' ? 'animate-pulse' : ''}`}
                            />
                        </button>
                    ) : null}
                    {onEdit ? (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-border-default text-text-default font-semibold text-sm rounded-lg hover:bg-bg-hover hover:text-primary-600 transition-colors shadow-sm"
                        >
                            <PencilIcon className="w-4 h-4" />
                            ערוך טקסט
                        </button>
                    ) : null}
                </div>
            </div>

            {toolbarBelowHeader}

            <div className="flex-1 overflow-auto p-6 relative bg-bg-subtle/30 custom-scrollbar min-h-0">
                <div className="max-w-4xl mx-auto min-h-full p-8 pb-32 bg-white border border-border-default rounded-xl shadow-sm text-sm text-text-default leading-relaxed font-serif whitespace-pre-wrap">
                    {body}
                </div>
            </div>
        </div>
    );
};
