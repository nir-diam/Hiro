import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, ClockIcon, DocumentTextIcon, TrashIcon } from './Icons';
import { ParsedSearchTextWithTags } from './ParsedSearchTextWithTags';
import { RichTextArea, normalizeValueForEditor, type RichTextAreaHandle } from './RichTextArea';
import type { TagDetailForHighlight } from '../utils/parsedSearchTextSpans';
import { normalizeSearchTextLineBreaks } from '../utils/normalizeSearchText';
import {
    htmlToPlainText,
    isRichHtmlContent,
    sanitizeRichHtml,
} from '../utils/parsedSearchTextHtml';
import { fetchLoggedInClientLogoForExport } from '../utils/exportImagePayload';
import { downloadOriginalDocumentWithLogo } from '../utils/originalDocumentExport';
import { invalidateStaffCandidateCache } from '../utils/staffCandidateApi';
import {
    downloadParsedSearchTextAsDocx,
    parsedSearchTextDocxFilename,
} from '../utils/parsedSearchTextDocxExport';
import {
    downloadParsedSearchTextAsPdf,
    parsedSearchTextPdfFilename,
} from '../utils/parsedSearchTextPdfExport';
import {
    normalizeOriginalTextHistory,
    type ParsedTextHistoryEntry,
} from '../utils/parsedTextHistory';

export type CvFilesPdfExporter = () => Promise<void>;

export type CvFilesVersionTab = 'original' | 'searchText';

type ParsedTextVersion = {
    key: string;
    text: string;
    label: string;
    sublabel: string;
    isLatest: boolean;
    savedAt?: string | null;
    historyIndex?: number;
};

const INITIAL_PARSED_LABEL = 'טקסט מפורסר ראשוני';

function canDeleteParsedTextVersion(ver: ParsedTextVersion): boolean {
    if (ver.key === 'current' || ver.label === INITIAL_PARSED_LABEL) return false;
    return ver.historyIndex != null && Number.isInteger(ver.historyIndex);
}

function formatVersionDate(value?: string | null): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('he-IL', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

const DOC_VIEWER_HEIGHT_MIN = 400;
const DOC_VIEWER_HEIGHT_MAX = 1800;
const DOC_VIEWER_HEIGHT_STEP = 100;
const DOC_VIEWER_HEIGHT_DEFAULT = 1000;
const DOC_VIEWER_ZOOM_MIN = 75;
const DOC_VIEWER_ZOOM_MAX = 150;
const DOC_VIEWER_ZOOM_STEP = 10;
const DOC_VIEWER_ZOOM_DEFAULT = 100;

function fileKindLabel(resumeUrl: string): string {
    const lower = resumeUrl.toLowerCase();
    if (/\.pdf(\?|$)/.test(lower)) return 'PDF';
    if (/\.docx?(\?|$)/.test(lower)) return 'DOC';
    if (/\.(png|jpe?g|gif|webp)(\?|$)/.test(lower)) return 'תמונה';
    return 'קובץ';
}

function buildParsedTextVersions(
    searchText: string,
    originalText: ParsedTextHistoryEntry[],
    currentSavedAt?: string | null,
): ParsedTextVersion[] {
    const versions: ParsedTextVersion[] = [];
    const current = String(searchText ?? '').trim();
    if (current) {
        versions.push({
            key: 'current',
            text: current,
            label: INITIAL_PARSED_LABEL,
            sublabel: 'AI',
            isLatest: true,
            savedAt: currentSavedAt ?? null,
        });
    }
    const hist = originalText
        .map((e) => ({
            text: normalizeSearchTextLineBreaks(e.text),
            savedAt: e.savedAt ?? null,
        }))
        .filter((e) => e.text);
    for (let i = hist.length - 1; i >= 0; i--) {
        const n = hist.length - i;
        versions.push({
            key: `hist-${i}`,
            text: hist[i].text,
            label: hist.length === 1 && !current ? INITIAL_PARSED_LABEL : `גרסה קודמת ${n}`,
            sublabel: 'עריכה',
            isLatest: false,
            savedAt: hist[i].savedAt,
            historyIndex: i,
        });
    }
    return versions;
}

function renderParsedTextBody(text: string): React.ReactNode {
    const raw = String(text ?? '').trim();
    if (!raw) return '—';
    if (isRichHtmlContent(raw)) {
        return (
            <div
                className="leading-[2.5] text-[15px] parsed-search-rich-text break-words [&_p]:mb-4 [&_p:last-child]:mb-0"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(raw) }}
            />
        );
    }
    return (
        <div className="leading-[2.5] text-[15px] whitespace-pre-wrap break-words">{raw}</div>
    );
}

export const CvFilesVersionsPanel: React.FC<{
    resumeUrl?: string;
    searchText?: string;
    originalText?: unknown;
    searchTextSavedAt?: string | null;
    resumeUploadedAt?: string | null;
    tagDetails?: TagDetailForHighlight[];
    highlightKeywords?: string[];
    createdAt?: string | null;
    updatedAt?: string | null;
    candidateId?: string | null;
    apiBase?: string;
    getAuthHeaders?: () => Record<string, string>;
    onCandidateUpdated?: (candidate: Record<string, unknown>) => void;
    initialTab?: CvFilesVersionTab;
    pdfFilenameBase?: string;
    onRegisterPdfExporter?: (exporter: CvFilesPdfExporter | null) => void;
}> = ({
    resumeUrl,
    searchText,
    originalText,
    searchTextSavedAt,
    resumeUploadedAt,
    tagDetails = [],
    highlightKeywords = [],
    createdAt,
    updatedAt,
    candidateId,
    apiBase = '',
    getAuthHeaders,
    onCandidateUpdated,
    initialTab = 'original',
    pdfFilenameBase = 'resume',
    onRegisterPdfExporter,
}) => {
    const [versionTab, setVersionTab] = useState<CvFilesVersionTab>(initialTab);
    const [selectedTextKey, setSelectedTextKey] = useState('current');
    const [editingText, setEditingText] = useState(false);
    const [draftHtml, setDraftHtml] = useState('');
    const [saving, setSaving] = useState(false);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [docViewerHeight, setDocViewerHeight] = useState(DOC_VIEWER_HEIGHT_DEFAULT);
    const [docViewerZoom, setDocViewerZoom] = useState(DOC_VIEWER_ZOOM_DEFAULT);
    const editorRef = useRef<RichTextAreaHandle>(null);
    const draftHtmlRef = useRef('');
    const [parsedTextOverride, setParsedTextOverride] = useState<{
        searchText: string;
        originalText?: unknown;
        searchTextSavedAt?: string | null;
    } | null>(null);

    const url = String(resumeUrl ?? '').trim();
    const rawSearchText = String(parsedTextOverride?.searchText ?? searchText ?? '');
    const plainSearch = isRichHtmlContent(rawSearchText)
        ? rawSearchText
        : normalizeSearchTextLineBreaks(rawSearchText);

    useEffect(() => {
        setParsedTextOverride(null);
        draftHtmlRef.current = '';
    }, [candidateId]);

    useEffect(() => {
        if (!parsedTextOverride) return;
        if (String(searchText ?? '') === parsedTextOverride.searchText) {
            setParsedTextOverride(null);
        }
    }, [searchText, parsedTextOverride]);

    const effectiveOriginalText = parsedTextOverride?.originalText ?? originalText;
    const effectiveSearchTextSavedAt =
        parsedTextOverride?.searchTextSavedAt ?? searchTextSavedAt;
    const isDocx = /\.(doc|docx)$/i.test(url);
    const docxViewerUrl = isDocx ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : '';
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);

    const originalDate = formatVersionDate(
        resumeUploadedAt ?? createdAt ?? updatedAt,
    );

    const historyEntries = useMemo(
        () => normalizeOriginalTextHistory(effectiveOriginalText),
        [effectiveOriginalText],
    );

    const currentSavedAt =
        effectiveSearchTextSavedAt ?? updatedAt ?? createdAt ?? null;

    const textVersions = useMemo(
        () => buildParsedTextVersions(plainSearch, historyEntries, currentSavedAt),
        [plainSearch, historyEntries, currentSavedAt],
    );

    useEffect(() => {
        if (!textVersions.some((v) => v.key === selectedTextKey)) {
            setSelectedTextKey(textVersions[0]?.key ?? 'current');
        }
    }, [textVersions, selectedTextKey]);

    const activeTextVersion = useMemo(
        () => textVersions.find((v) => v.key === selectedTextKey) ?? textVersions[0],
        [textVersions, selectedTextKey],
    );

    const activeDisplayText = activeTextVersion?.text ?? plainSearch;
    const isViewingCurrent = activeTextVersion?.isLatest ?? true;
    const parsedCreatedLabel = formatVersionDate(activeTextVersion?.savedAt);

    const exportParsedText = useCallback(
        async (format: 'pdf' | 'docx') => {
            if (versionTab === 'original') {
                if (!url) throw new Error('no_file');
                const clientLogo = await fetchLoggedInClientLogoForExport();
                try {
                    await downloadOriginalDocumentWithLogo(url, pdfFilenameBase, format, {
                        candidateName: pdfFilenameBase,
                        clientLogo,
                    });
                } catch (e) {
                    const code = e instanceof Error ? e.message : '';
                    if (code === 'fetch_failed' || code === 'unsupported_format') {
                        window.open(url, '_blank');
                        return;
                    }
                    throw e;
                }
                return;
            }
            const text = normalizeSearchTextLineBreaks(
                htmlToPlainText(String(activeDisplayText ?? '')),
            );
            if (!text) throw new Error('empty_text');
            const versionSlug = activeTextVersion?.isLatest
                ? 'parsed'
                : activeTextVersion?.label?.replace(/\s+/g, '_') || 'version';
            const clientLogo = await fetchLoggedInClientLogoForExport();
            const exportOptions = {
                candidateName: pdfFilenameBase,
                clientLogo,
            };
            if (format === 'pdf') {
                await downloadParsedSearchTextAsPdf(
                    text,
                    parsedSearchTextPdfFilename(pdfFilenameBase, versionSlug),
                    exportOptions,
                );
            } else {
                await downloadParsedSearchTextAsDocx(
                    text,
                    parsedSearchTextDocxFilename(pdfFilenameBase, versionSlug),
                    exportOptions,
                );
            }
        },
        [
            versionTab,
            url,
            activeDisplayText,
            activeTextVersion,
            pdfFilenameBase,
        ],
    );

    const downloadActiveAsPdf = useCallback(() => exportParsedText('pdf'), [exportParsedText]);
    const downloadActiveAsDocx = useCallback(() => exportParsedText('docx'), [exportParsedText]);

    useEffect(() => {
        if (!onRegisterPdfExporter) return undefined;
        onRegisterPdfExporter(downloadActiveAsPdf);
        return () => onRegisterPdfExporter(null);
    }, [onRegisterPdfExporter, downloadActiveAsPdf]);

    const openEditor = () => {
        const initial = normalizeValueForEditor(rawSearchText);
        draftHtmlRef.current = initial;
        setDraftHtml(initial);
        setSaveError(null);
        setEditingText(true);
    };

    const handleDraftChange = useCallback((html: string) => {
        draftHtmlRef.current = html;
        setDraftHtml(html);
    }, []);

    const handleSave = useCallback(async () => {
        const rawHtml = (editorRef.current?.getHtml() ?? draftHtmlRef.current ?? draftHtml).trim();
        const trimmedPlain = normalizeSearchTextLineBreaks(htmlToPlainText(rawHtml));
        if (!trimmedPlain) {
            setSaveError('לא ניתן לשמור טקסט ריק');
            return;
        }
        if (!candidateId) {
            setSaveError('חסר מזהה מועמד לשמירה');
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            const res = await fetch(`${apiBase}/api/candidates/${candidateId}/parsed-text`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...(getAuthHeaders?.() ?? {}) },
                body: JSON.stringify({ text: rawHtml }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.message || 'שמירה נכשלה');
            }
            const savedText = rawHtml;
            setParsedTextOverride({
                searchText: savedText,
                originalText: payload.originalText,
                searchTextSavedAt: payload.searchTextSavedAt
                    ? String(payload.searchTextSavedAt)
                    : new Date().toISOString(),
            });
            invalidateStaffCandidateCache(candidateId);
            onCandidateUpdated?.({ ...payload, searchText: savedText });
            setEditingText(false);
            setSelectedTextKey('current');
            setVersionTab('searchText');
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    }, [apiBase, candidateId, draftHtml, getAuthHeaders, onCandidateUpdated]);

    const handleDeleteVersion = useCallback(
        async (ver: ParsedTextVersion) => {
            if (!candidateId || ver.historyIndex == null) return;
            if (!window.confirm(`האם למחוק את "${ver.label}"?`)) return;
            setDeletingKey(ver.key);
            setSaveError(null);
            try {
                const res = await fetch(
                    `${apiBase}/api/candidates/${candidateId}/parsed-text/history/${ver.historyIndex}`,
                    {
                        method: 'DELETE',
                        headers: getAuthHeaders?.() ?? {},
                    },
                );
                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(payload?.message || 'מחיקה נכשלה');
                }
                setParsedTextOverride({
                    searchText: String(payload.searchText ?? plainSearch),
                    originalText: payload.originalText,
                    searchTextSavedAt: payload.searchTextSavedAt
                        ? String(payload.searchTextSavedAt)
                        : effectiveSearchTextSavedAt,
                });
                invalidateStaffCandidateCache(candidateId);
                onCandidateUpdated?.(payload);
                if (selectedTextKey === ver.key) {
                    setSelectedTextKey('current');
                    setVersionTab('searchText');
                }
            } catch (e) {
                setSaveError(e instanceof Error ? e.message : 'מחיקה נכשלה');
            } finally {
                setDeletingKey(null);
            }
        },
        [
            apiBase,
            candidateId,
            effectiveSearchTextSavedAt,
            getAuthHeaders,
            onCandidateUpdated,
            plainSearch,
            selectedTextKey,
        ],
    );

    const versionChips = (
        <div className="shrink-0">
            <div className="bg-bg-subtle/50 border-b border-border-default overflow-x-auto custom-scrollbar flex items-center justify-start p-3 gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-text-muted px-2 shrink-0">
                <ClockIcon className="w-4 h-4" />
                גרסאות:
            </div>
            <button
                type="button"
                onClick={() => {
                    setEditingText(false);
                    setVersionTab('original');
                }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-right min-w-[200px] shrink-0 ${
                    versionTab === 'original'
                        ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-100'
                        : 'bg-white/50 border-border-default hover:bg-white hover:border-border-hover'
                }`}
            >
                <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        versionTab === 'original' ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-600'
                    }`}
                >
                    <DocumentTextIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span
                            className={`font-bold text-sm truncate ${
                                versionTab === 'original' ? 'text-primary-800' : 'text-text-default'
                            }`}
                        >
                            מסמך מקורי ({url ? fileKindLabel(url) : '—'})
                        </span>
                        {versionTab !== 'original' && url ? (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 font-bold shrink-0">
                                החדש ביותר
                            </span>
                        ) : null}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5 flex gap-1 items-center truncate">
                        {originalDate} • מערכת
                    </div>
                </div>
            </button>
            {textVersions.map((ver) => {
                const isActive =
                    versionTab === 'searchText' && selectedTextKey === ver.key;
                const deletable = canDeleteParsedTextVersion(ver) && Boolean(candidateId);
                return (
                    <div
                        key={ver.key}
                        className={`flex items-stretch rounded-xl border transition-all min-w-[200px] shrink-0 overflow-hidden ${
                            isActive
                                ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-100'
                                : 'bg-white/50 border-border-default hover:bg-white hover:border-border-hover'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setEditingText(false);
                                setVersionTab('searchText');
                                setSelectedTextKey(ver.key);
                            }}
                            className="flex items-center gap-3 px-3 py-2 text-right flex-1 min-w-0"
                        >
                            <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    isActive
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-slate-100 text-slate-600'
                                }`}
                            >
                                <DocumentTextIcon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                    <span
                                        className={`font-bold text-sm truncate ${
                                            isActive ? 'text-primary-800' : 'text-text-default'
                                        }`}
                                    >
                                        {ver.label}
                                    </span>
                                    {ver.isLatest ? (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 font-bold shrink-0">
                                            החדש ביותר
                                        </span>
                                    ) : null}
                                </div>
                                <div className="text-xs text-text-muted mt-0.5 flex gap-1 items-center truncate">
                                    {formatVersionDate(ver.savedAt)} • {ver.sublabel}
                                </div>
                            </div>
                        </button>
                        {deletable ? (
                            <button
                                type="button"
                                title="מחק גרסה"
                                aria-label={`מחק ${ver.label}`}
                                disabled={deletingKey === ver.key}
                                onClick={() => void handleDeleteVersion(ver)}
                                className="px-2 border-r border-border-default text-text-subtle hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        ) : null}
                    </div>
                );
            })}
            </div>
            {saveError && !editingText ? (
                <p className="px-4 py-1.5 text-xs text-red-600 font-medium border-b border-border-default bg-red-50/50">
                    {saveError}
                </p>
            ) : null}
        </div>
    );

    return (
        <div className="h-full bg-white p-2" dir="rtl">
            <div className="flex flex-col h-full bg-white relative font-sans rounded-2xl overflow-hidden min-h-[min(70vh,640px)]">
                {versionTab === 'searchText' ? (
                    editingText ? (
                        <div className="flex flex-col h-full min-h-0">
                            <div className="flex items-center justify-between p-4 border-b border-border-default shrink-0">
                                <h3 className="font-bold text-text-default text-lg">עריכת טקסט מפורסר</h3>
                                <div className="flex flex-col items-end gap-1">
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setEditingText(false)}
                                            disabled={saving}
                                            className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-border-default hover:bg-bg-hover disabled:opacity-50"
                                        >
                                            ביטול
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleSave()}
                                            disabled={saving || !candidateId}
                                            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                                        >
                                            {saving ? 'שומר…' : 'שמור'}
                                        </button>
                                    </div>
                                    {saveError ? (
                                        <p className="text-xs text-red-600 font-medium">{saveError}</p>
                                    ) : null}
                                </div>
                            </div>
                            {versionChips}
                            <div className="flex-1 min-h-0 p-4 overflow-auto custom-scrollbar">
                                <RichTextArea
                                    ref={editorRef}
                                    value={draftHtml}
                                    onChange={handleDraftChange}
                                    fullToolbar
                                    minHeight="400px"
                                    className="border border-border-default rounded-xl bg-white h-full"
                                    toolbarClassName="bg-bg-subtle/40 sticky top-0 z-10"
                                    editorClassName="min-h-[360px] font-serif text-[15px] leading-relaxed"
                                />
                            </div>
                        </div>
                    ) : isViewingCurrent ? (
                        <ParsedSearchTextWithTags
                            searchText={activeDisplayText}
                            tagDetails={tagDetails}
                            highlightKeywords={highlightKeywords}
                            createdAtLabel={parsedCreatedLabel}
                            onEdit={activeDisplayText && candidateId ? openEditor : undefined}
                            onDownloadPdf={() => downloadActiveAsPdf()}
                            onDownloadDocx={() => downloadActiveAsDocx()}
                            toolbarBelowHeader={versionChips}
                        />
                    ) : (
                        <>
                            <div className="flex items-center justify-between p-4 border-b border-border-default bg-white shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-100 text-purple-700">
                                        <DocumentTextIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-text-default text-lg">
                                            {activeTextVersion?.label ?? 'גרסת טקסט'}
                                        </h3>
                                        <p className="text-xs text-text-muted">גרסה קודמת (לצפייה בלבד)</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => void downloadActiveAsPdf()}
                                        className="text-sm font-semibold text-rose-700 hover:text-rose-800 hover:underline"
                                    >
                                        PDF
                                    </button>
                                    <span className="text-text-subtle">|</span>
                                    <button
                                        type="button"
                                        onClick={() => void downloadActiveAsDocx()}
                                        className="text-sm font-semibold text-primary-600 hover:underline"
                                    >
                                        Word
                                    </button>
                                </div>
                            </div>
                            {versionChips}
                            <div className="flex-1 overflow-auto p-6 relative bg-bg-subtle/30 custom-scrollbar min-h-0">
                                <div className="max-w-4xl mx-auto min-h-full p-8 pb-32 bg-white border border-border-default rounded-xl shadow-sm text-sm text-text-default leading-relaxed font-serif">
                                    {renderParsedTextBody(activeDisplayText)}
                                </div>
                            </div>
                        </>
                    )
                ) : (
                    <>
                        <div className="flex items-center justify-between p-4 border-b border-border-default bg-white shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600">
                                    <DocumentTextIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-text-default text-lg">מסמך מקורי</h3>
                                    <p className="text-xs text-text-muted">נוצר בתאריך: {originalDate}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                {url ? (
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void downloadActiveAsPdf()}
                                            className="text-sm font-semibold text-rose-700 hover:text-rose-800 hover:underline"
                                        >
                                            PDF
                                        </button>
                                        <span className="text-text-subtle">|</span>
                                        <button
                                            type="button"
                                            onClick={() => void downloadActiveAsDocx()}
                                            className="text-sm font-semibold text-primary-600 hover:underline"
                                        >
                                            Word
                                        </button>
                                    </div>
                                ) : null}
                                {url ? (
                                    <div className="flex items-center gap-1 rounded-lg border border-border-default bg-bg-subtle/50 p-1">
                                        <button
                                            type="button"
                                            title="הקטן תצוגה"
                                            aria-label="הקטן תצוגה"
                                            onClick={() => {
                                                setDocViewerHeight((h) =>
                                                    Math.max(DOC_VIEWER_HEIGHT_MIN, h - DOC_VIEWER_HEIGHT_STEP),
                                                );
                                                setDocViewerZoom((z) =>
                                                    Math.max(DOC_VIEWER_ZOOM_MIN, z - DOC_VIEWER_ZOOM_STEP),
                                                );
                                            }}
                                            disabled={
                                                docViewerHeight <= DOC_VIEWER_HEIGHT_MIN &&
                                                docViewerZoom <= DOC_VIEWER_ZOOM_MIN
                                            }
                                            className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-white hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <ChevronDownIcon className="w-5 h-5" />
                                        </button>
                                        <span className="text-xs font-semibold text-text-muted tabular-nums min-w-[4.5rem] text-center">
                                            {docViewerZoom}%
                                        </span>
                                        <button
                                            type="button"
                                            title="הגדל תצוגה"
                                            aria-label="הגדל תצוגה"
                                            onClick={() => {
                                                setDocViewerHeight((h) =>
                                                    Math.min(DOC_VIEWER_HEIGHT_MAX, h + DOC_VIEWER_HEIGHT_STEP),
                                                );
                                                setDocViewerZoom((z) =>
                                                    Math.min(DOC_VIEWER_ZOOM_MAX, z + DOC_VIEWER_ZOOM_STEP),
                                                );
                                            }}
                                            disabled={
                                                docViewerHeight >= DOC_VIEWER_HEIGHT_MAX &&
                                                docViewerZoom >= DOC_VIEWER_ZOOM_MAX
                                            }
                                            className="w-8 h-8 flex items-center justify-center rounded-md text-text-muted hover:bg-white hover:text-primary-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <ChevronUpIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                ) : null}
                                {url ? (
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-sm font-semibold text-primary-600 hover:underline"
                                    >
                                        פתח / הורד
                                    </a>
                                ) : null}
                            </div>
                        </div>

                        {versionChips}

                        <div className="flex-1 overflow-auto p-4 bg-bg-subtle/30 custom-scrollbar min-h-0">
                            {url ? (
                                <div className="flex flex-col gap-3">
                                    <div
                                        className="border border-border-default rounded-2xl overflow-auto bg-black/5"
                                        style={{ height: docViewerHeight }}
                                    >
                                        {isImage ? (
                                            <img
                                                src={url}
                                                alt="מסמך מקורי"
                                                className="object-contain w-full h-full"
                                                style={{ zoom: docViewerZoom / 100 }}
                                            />
                                        ) : (
                                            <iframe
                                                style={{
                                                    width: '100%',
                                                    minWidth: '200px',
                                                    height: docViewerHeight,
                                                    zoom: docViewerZoom / 100,
                                                }}
                                                src={isDocx ? docxViewerUrl : url}
                                                title="מסמך מקורי"
                                                className="w-full border-0"
                                            />
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted text-center py-16">לא הועלה קובץ מקורי.</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
