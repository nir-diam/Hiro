import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClockIcon, DocumentTextIcon } from './Icons';
import { ParsedSearchTextWithTags } from './ParsedSearchTextWithTags';
import type { TagDetailForHighlight } from '../utils/parsedSearchTextSpans';
import { normalizeSearchTextLineBreaks } from '../utils/normalizeSearchText';
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
};

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
            label: 'טקסט מפורסר ראשוני',
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
            label: hist.length === 1 && !current ? 'טקסט מפורסר ראשוני' : `גרסת טקסט ${n}`,
            sublabel: 'עריכה',
            isLatest: false,
            savedAt: hist[i].savedAt,
        });
    }
    return versions;
}

export const CvFilesVersionsPanel: React.FC<{
    resumeUrl?: string;
    searchText?: string;
    originalText?: unknown;
    searchTextSavedAt?: string | null;
    resumeUploadedAt?: string | null;
    tagDetails?: TagDetailForHighlight[];
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
    const [draftText, setDraftText] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const url = String(resumeUrl ?? '').trim();
    const plainSearch = normalizeSearchTextLineBreaks(searchText);
    const isDocx = /\.(doc|docx)$/i.test(url);
    const docxViewerUrl = isDocx ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` : '';
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(url);

    const originalDate = formatVersionDate(
        resumeUploadedAt ?? createdAt ?? updatedAt,
    );

    const historyEntries = useMemo(
        () => normalizeOriginalTextHistory(originalText),
        [originalText],
    );

    const currentSavedAt =
        searchTextSavedAt ?? updatedAt ?? createdAt ?? null;

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
                window.open(url, '_blank');
                return;
            }
            const text = String(activeDisplayText ?? '').trim();
            if (!text) throw new Error('empty_text');
            const versionSlug = activeTextVersion?.isLatest
                ? 'parsed'
                : activeTextVersion?.label?.replace(/\s+/g, '_') || 'version';
            if (format === 'pdf') {
                await downloadParsedSearchTextAsPdf(
                    text,
                    parsedSearchTextPdfFilename(pdfFilenameBase, versionSlug),
                    { candidateName: pdfFilenameBase },
                );
            } else {
                await downloadParsedSearchTextAsDocx(
                    text,
                    parsedSearchTextDocxFilename(pdfFilenameBase, versionSlug),
                    { candidateName: pdfFilenameBase },
                );
            }
        },
        [versionTab, url, activeDisplayText, activeTextVersion, pdfFilenameBase],
    );

    const downloadActiveAsPdf = useCallback(() => exportParsedText('pdf'), [exportParsedText]);
    const downloadActiveAsDocx = useCallback(() => exportParsedText('docx'), [exportParsedText]);

    useEffect(() => {
        if (!onRegisterPdfExporter) return undefined;
        onRegisterPdfExporter(downloadActiveAsPdf);
        return () => onRegisterPdfExporter(null);
    }, [onRegisterPdfExporter, downloadActiveAsPdf]);

    const openEditor = () => {
        setDraftText(plainSearch);
        setSaveError(null);
        setEditingText(true);
    };

    const handleSave = useCallback(async () => {
        const trimmed = draftText.trim();
        if (!trimmed) {
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
                body: JSON.stringify({ text: trimmed }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.message || 'שמירה נכשלה');
            }
            onCandidateUpdated?.(payload);
            setEditingText(false);
            setSelectedTextKey('current');
            setVersionTab('searchText');
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    }, [apiBase, candidateId, draftText, getAuthHeaders, onCandidateUpdated]);

    const versionChips = (
        <div className="bg-bg-subtle/50 border-b border-border-default overflow-x-auto custom-scrollbar flex shrink-0 items-center justify-start p-3 gap-3">
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
            {textVersions.map((ver) => (
                <button
                    key={ver.key}
                    type="button"
                    onClick={() => {
                        setEditingText(false);
                        setVersionTab('searchText');
                        setSelectedTextKey(ver.key);
                    }}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-all text-right min-w-[200px] shrink-0 ${
                        versionTab === 'searchText' && selectedTextKey === ver.key
                            ? 'bg-white border-primary-300 shadow-sm ring-1 ring-primary-100'
                            : 'bg-white/50 border-border-default hover:bg-white hover:border-border-hover'
                    }`}
                >
                    <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            versionTab === 'searchText' && selectedTextKey === ver.key
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
                                    versionTab === 'searchText' && selectedTextKey === ver.key
                                        ? 'text-primary-800'
                                        : 'text-text-default'
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
            ))}
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
                            <textarea
                                className="flex-1 w-full p-4 text-sm font-mono resize-none border-0 focus:ring-0 custom-scrollbar min-h-0"
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                dir="rtl"
                            />
                        </div>
                    ) : isViewingCurrent ? (
                        <ParsedSearchTextWithTags
                            searchText={activeDisplayText}
                            tagDetails={tagDetails}
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
                                <div className="max-w-4xl mx-auto min-h-full p-8 pb-32 bg-white border border-border-default rounded-xl shadow-sm text-sm text-text-default leading-relaxed font-serif whitespace-pre-wrap">
                                    <div className="leading-[2.5] text-[15px] whitespace-pre-wrap break-words">
                                        {activeDisplayText || '—'}
                                    </div>
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

                        {versionChips}

                        <div className="flex-1 overflow-auto p-4 bg-bg-subtle/30 custom-scrollbar min-h-0">
                            {url ? (
                                <div className="flex flex-col gap-3 h-full min-h-[50vh]">
                                    <div className="flex-1 min-h-[50vh] border border-border-default rounded-2xl overflow-auto bg-black/5">
                                        {isImage ? (
                                            <img
                                                src={url}
                                                alt="מסמך מקורי"
                                                className="object-contain w-full h-full min-h-[50vh]"
                                            />
                                        ) : (
                                            <iframe
                                                style={{
                                                    width: '100%',
                                                    minWidth: '200px',
                                                    height: '100%',
                                                    minHeight: '50vh',
                                                }}
                                                src={isDocx ? docxViewerUrl : url}
                                                title="מסמך מקורי"
                                                className="w-full"
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
