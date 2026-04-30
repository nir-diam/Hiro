
import React, { useState, useEffect, useId, useMemo, useCallback, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import {
    XMarkIcon,
    WhatsappIcon,
    EnvelopeIcon,
    ChatBubbleBottomCenterTextIcon,
    PaperClipIcon,
    PlusIcon,
    TrashIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
} from './Icons';
import { fetchMessageTemplatesForCompose, type MessageTemplateDto } from '../services/messageTemplatesApi';
import { fetchJobsForCompose, type JobComposeRow } from '../services/jobsApi';
import { sendNotificationEmail } from '../services/emailSendApi';
import { logWhatsappComposeOpen } from '../services/messagingApi';

type MessageMode = 'whatsapp' | 'sms' | 'email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveRecipientEmail(candidateEmail?: string | null, candidatePhone?: string): string {
    const e = String(candidateEmail || '').trim();
    if (e && EMAIL_RE.test(e)) return e.toLowerCase();
    const p = String(candidatePhone || '').trim();
    if (p && EMAIL_RE.test(p)) return p.toLowerCase();
    return '';
}

function escapeHtml(s: string) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Audit block from `message_templates` row (compose API / MessageTemplateDto). */
function formatMessageTemplateAuditBlock(t: MessageTemplateDto): string {
    const lines: string[] = [t.name];
    if (t.templateKey) lines.push(`מפתח: ${t.templateKey}`);
    lines.push(`נושא: ${t.subject}`);
    if (t.lastUpdated) {
        let d = t.lastUpdated;
        try {
            d = new Date(t.lastUpdated).toLocaleString('he-IL');
        } catch {
            /* keep raw */
        }
        lines.push(`עודכן: ${d}${t.updatedBy ? ` · ${t.updatedBy}` : ''}`);
    }
    lines.push(`מזהה: ${t.id}`);
    return lines.join('\n');
}

function messageTemplateTaskLabel(t: MessageTemplateDto): string {
    return `${t.name}${t.templateKey ? ` (${t.templateKey})` : ''} · ${t.id}`;
}

function jobComposeRowLabel(j: JobComposeRow): string {
    return `${j.title} (${j.client})${j.postingCode ? ` · ${j.postingCode}` : ''}`;
}

/** E.164 digits without + for https://api.whatsapp.com/send?phone= */
function toWhatsAppPhoneDigits(raw: string): string {
    const d = String(raw || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('972')) return d;
    if (d.startsWith('0') && d.length >= 9 && d.length <= 11) return `972${d.slice(1)}`;
    if (d.length === 9 && d.startsWith('5')) return `972${d}`;
    return d;
}

/** Optional compose lists: don't surface auth/token failures under the dropdowns. */
function isSilentComposeFetchError(message: string): boolean {
    return /invalid\s+token|unauthorized|jwt\s+(expired|invalid|malformed)|token\s+expired|^401(\s|$)|\b401\b|forbidden|^403(\s|$)/i.test(
        message.trim(),
    );
}

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: MessageMode;
  candidateName: string;
  candidatePhone: string;
  candidateEmail?: string | null;
  candidateId?: string | null;
}

const modalConfig = {
    whatsapp: {
        title: "שליחת WhatsApp",
        buttonText: "שליחת WhatsApp",
        buttonIcon: <WhatsappIcon className="w-5 h-5" />,
        buttonClass: "bg-[#25D366] hover:bg-[#128C7E]",
        showSubject: false,
        allowAttachments: false,
        channel: 'whatsapp' as const,
    },
    sms: {
        title: "שליחת SMS",
        buttonText: "שליחת SMS",
        buttonIcon: <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />,
        buttonClass: "bg-primary-600 hover:bg-primary-700",
        showSubject: false,
        allowAttachments: false,
        channel: 'sms' as const,
    },
    email: {
        title: "שליחת מייל",
        buttonText: "שליחת מייל",
        buttonIcon: <EnvelopeIcon className="w-5 h-5" />,
        buttonClass: "bg-secondary-600 hover:bg-secondary-700",
        showSubject: true,
        allowAttachments: true,
        channel: 'email' as const,
    },
};

const SendMessageModal: React.FC<SendMessageModalProps> = ({
    isOpen,
    onClose,
    mode,
    candidateName,
    candidatePhone,
    candidateEmail,
    candidateId,
}) => {
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    const [attachments, setAttachments] = useState<string[]>(['']);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [templates, setTemplates] = useState<MessageTemplateDto[]>([]);
    const [composeScope, setComposeScope] = useState<'client' | 'admin' | null>(null);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [jobs, setJobs] = useState<JobComposeRow[]>([]);
    const [jobsLoading, setJobsLoading] = useState(false);
    const [jobsError, setJobsError] = useState<string | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [selectedJobId, setSelectedJobId] = useState('');
    const [jobPickerOpen, setJobPickerOpen] = useState(false);
    const [jobSearchQuery, setJobSearchQuery] = useState('');
    const jobPickerRef = useRef<HTMLDivElement>(null);

    const titleId = useId();
    const config = modalConfig[mode];

    /** Prefer prop from opener; fall back to URL e.g. #/candidates/:candidateId when modal is global. */
    const candidateRouteMatch = useMatch({ path: '/candidates/:candidateId', end: false });
    const resolvedCandidateId = useMemo(() => {
        const fromProp = candidateId != null && String(candidateId).trim() ? String(candidateId).trim() : '';
        if (fromProp) return fromProp;
        const fromRoute = candidateRouteMatch?.params?.candidateId;
        if (
            fromRoute &&
            String(fromRoute).trim() &&
            String(fromRoute).toLowerCase() !== 'new'
        ) {
            return String(fromRoute).trim();
        }
        return null;
    }, [candidateId, candidateRouteMatch?.params?.candidateId]);

    const channelTemplates = useMemo(() => {
        const ch = config.channel;
        return templates.filter((t) => (t.channels || []).includes(ch));
    }, [templates, config.channel]);

    const recipientSummary = useMemo(() => {
        const parts = [candidateName].filter(Boolean);
        if (candidatePhone) parts.push(candidatePhone);
        if (candidateEmail) parts.push(candidateEmail);
        return parts.join(' · ');
    }, [candidateName, candidatePhone, candidateEmail]);

    const filteredJobsForPicker = useMemo(() => {
        const q = jobSearchQuery.trim().toLowerCase();
        if (!q) return jobs;
        return jobs.filter((j) => {
            const hay = `${j.title} ${j.client} ${j.postingCode || ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [jobs, jobSearchQuery]);

    useEffect(() => {
        if (!jobPickerOpen) return;
        const onDoc = (e: MouseEvent) => {
            const el = jobPickerRef.current;
            if (el && !el.contains(e.target as Node)) setJobPickerOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [jobPickerOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setContent('');
        setSubject('');
        setAttachments(['']);
        setSelectedTemplateId('');
        setSelectedJobId('');
        setJobPickerOpen(false);
        setJobSearchQuery('');
        setTemplatesError(null);
        setJobsError(null);
        setSubmitError(null);
        setIsSubmitting(false);

        let cancelled = false;
        (async () => {
            setTemplatesLoading(true);
            setJobsLoading(true);
            try {
                const [tRes, jobRows] = await Promise.all([
                    fetchMessageTemplatesForCompose(),
                    fetchJobsForCompose(),
                ]);
                if (cancelled) return;
                setComposeScope(tRes.scope);
                setTemplates(Array.isArray(tRes.templates) ? tRes.templates : []);
                setJobs(Array.isArray(jobRows) ? jobRows : []);
            } catch (e: unknown) {
                if (cancelled) return;
                const msg = e instanceof Error ? e.message : 'טעינה נכשלה';
                setTemplates([]);
                setJobs([]);
                setComposeScope(null);
                if (isSilentComposeFetchError(msg)) {
                    setTemplatesError(null);
                    setJobsError(null);
                } else {
                    setTemplatesError(msg);
                    setJobsError(msg);
                }
            } finally {
                if (!cancelled) {
                    setTemplatesLoading(false);
                    setJobsLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, mode]);

    const applyTemplate = useCallback(
        (templateId: string) => {
            setSelectedTemplateId(templateId);
            if (!templateId) return;
            const t = channelTemplates.find((x) => x.id === templateId);
            if (!t) return;
            setContent(t.content || '');
            if (mode === 'email') {
                setSubject(t.subject || '');
            }
        },
        [channelTemplates, mode],
    );

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!content.trim()) {
            setSubmitError('תוכן ההודעה חובה');
            return;
        }

        const trimmedContent = content.trim();
        const selectedTpl = selectedTemplateId
            ? templates.find((t) => t.id === selectedTemplateId)
            : undefined;
        const selectedJob = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined;

        const templateAuditPlain = selectedTpl ? formatMessageTemplateAuditBlock(selectedTpl) : '';
        const jobValuePlain = selectedJob ? jobComposeRowLabel(selectedJob) : '';
        const composeScopeSubline =
            composeScope === 'admin' ? 'תבניות מערכת (Hiro)' : composeScope === 'client' ? 'תבניות הארגון' : '';

        const templateFooterLine = selectedTpl ? `תבנית שמורה: ${messageTemplateTaskLabel(selectedTpl)}` : '';
        const jobFooterLine = selectedJob ? `משרה מקושרת: ${jobValuePlain}` : '';

        const footerPlainParts: string[] = [];
        if (selectedTpl) {
            let block = `תבנית שמורה:\n${templateAuditPlain}`;
            if (composeScopeSubline) block += `\n${composeScopeSubline}`;
            footerPlainParts.push(block);
        }
        if (selectedJob) {
            footerPlainParts.push(`משרה מקושרת:\n${jobValuePlain}`);
        }
        const footerPlain = footerPlainParts.length ? `\n\n—\n${footerPlainParts.join('\n\n')}` : '';
        const textOut = `${trimmedContent}`;

        if (mode === 'whatsapp') {
            const waPhone = toWhatsAppPhoneDigits(candidatePhone);
            if (!waPhone) {
                setSubmitError('אין מספר טלפון תקין ל־WhatsApp (נדרש מספר עם קידומת או 0)');
                return;
            }
            setIsSubmitting(true);
            try {
                await logWhatsappComposeOpen({
                    candidateId: resolvedCandidateId,
                    candidateName,
                    phone: candidatePhone,
                    messagePreview: textOut,
                    templateId: selectedTemplateId || null,
                    jobId: selectedJobId || null,
                });
                const url = `https://api.whatsapp.com/send?phone=${encodeURIComponent(waPhone)}&text=${encodeURIComponent(textOut)}`;
                window.open(url, '_blank', 'noopener,noreferrer');
                onClose();
            } catch (err: unknown) {
                setSubmitError(err instanceof Error ? err.message : 'רישום ביקורת נכשל — נסו שוב');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (mode !== 'email') {
            setSubmitError('שליחה דרך השרת זמינה כרגע רק למייל. השתמשו בערוץ המייל.');
            return;
        }

        const toEmail = resolveRecipientEmail(candidateEmail, candidatePhone);
        if (!toEmail) {
            setSubmitError('אין כתובת מייל לנמען. עדכנו מייל במועמד או באיש הקשר.');
            return;
        }
        if (!subject.trim()) {
            setSubmitError('נושא המייל חובה');
            return;
        }

        const mainHtml = `<div dir="rtl" style="white-space:pre-wrap;font-family:sans-serif;">${escapeHtml(trimmedContent).replace(/\n/g, '<br/>')}</div>`;

        const footerBlocks: string[] = [];
        if (selectedTpl) {
            const scopeHtml = composeScopeSubline
                ? `<div style="font-size:11px;color:#888;margin-top:0.35em;">${escapeHtml(composeScopeSubline)}</div>`
                : '';
            footerBlocks.push(
                `<div style="margin-bottom:0.9em;">` +
                    `<div style="font-weight:700;color:#333;font-size:13px;">תבנית שמורה:</div>` +
                    `<div style="color:#555;margin-top:0.25em;white-space:pre-wrap;">${escapeHtml(templateAuditPlain)}</div>` +
                    scopeHtml +
                `</div>`,
            );
        }
        if (selectedJob) {
            footerBlocks.push(
                `<div>` +
                    `<div style="font-weight:700;color:#333;font-size:13px;">משרה מקושרת:</div>` +
                    `<div style="color:#555;margin-top:0.25em;">${escapeHtml(jobValuePlain)}</div>` +
                `</div>`,
            );
        }
        const footerHtml =
            footerBlocks.length > 0
                ? `<div dir="rtl" style="margin-top:1.25em;padding-top:1em;border-top:1px solid #ccc;color:#444;font-size:13px;line-height:1.55;font-family:sans-serif;">${footerBlocks.join('')}</div>`
                : '';
        const html = `${mainHtml}${footerHtml}`;

        setIsSubmitting(true);
        try {
            await sendNotificationEmail({
                toEmail,
                subject: subject.trim(),
                text: textOut,
                html,
                isTask: false,
                messageType: 'message',
                taskPayload: {
                    source: 'SendMessageModal',
                    candidateId: resolvedCandidateId,
                    candidateName,
                    templateId: selectedTemplateId || null,
                    jobId: selectedJobId || null,
                    composeScope: composeScope,
                    templateLabel: templateFooterLine || null,
                    jobLabel: jobFooterLine || null,
                },
            });
            onClose();
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : 'שליחת המייל נכשלה');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAttachmentChange = (index: number, value: string) => {
        const newAttachments = [...attachments];
        newAttachments[index] = value;
        setAttachments(newAttachments);
    };

    const addAttachmentRow = () => {
        setAttachments([...attachments, '']);
    };

    const removeAttachmentRow = (index: number) => {
        const newAttachments = attachments.filter((_, i) => i !== index);
        setAttachments(newAttachments.length > 0 ? newAttachments : ['']);
    };

    const scopeHint =
        composeScope === 'admin' ? 'תבניות מערכת (Hiro)' : composeScope === 'client' ? 'תבניות הארגון' : '';

    const templatesErrBlocksHints = !!(templatesError && !isSilentComposeFetchError(templatesError));
    const jobsErrBlocksHints = !!(jobsError && !isSilentComposeFetchError(jobsError));
    const selectedJobRow = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-[70] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-bg-card rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden text-text-default" onClick={e => e.stopPropagation()} style={{ animation: 'modalFadeIn 0.2s ease-out' }}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full max-h-[80vh]">
                    <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                        <h2 id={titleId} className="text-xl font-bold text-text-default">{config.title}</h2>
                        <button type="button" onClick={onClose} className="p-2 rounded-full text-text-muted hover:bg-bg-hover" aria-label="סגור">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </header>

                    <main className="p-6 space-y-4 overflow-y-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">נמען:</label>
                                <input type="text" value={recipientSummary} disabled className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">תבנית שמורה :</label>
                                <select
                                    className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                    value={selectedTemplateId}
                                    onChange={(e) => applyTemplate(e.target.value)}
                                    disabled={templatesLoading}
                                    aria-label="תבנית הודעה — אופציונלי"
                                >
                                    <option value="">ללא תבנית</option>
                                    {channelTemplates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                            {t.templateKey ? ` (${t.templateKey})` : ''}
                                        </option>
                                    ))}
                                </select>
                                {templatesLoading && (
                                    <p className="text-xs text-text-subtle mt-1">טוען תבניות…</p>
                                )}
                                {templatesError && !isSilentComposeFetchError(templatesError) && (
                                    <p className="text-xs text-red-600 mt-1">{templatesError}</p>
                                )}
                                {!templatesLoading && !templatesErrBlocksHints && scopeHint && (
                                    <p className="text-xs text-text-subtle mt-1">{scopeHint}</p>
                                )}
                                {!templatesLoading && !templatesErrBlocksHints && channelTemplates.length === 0 && (
                                    <p className="text-xs text-text-subtle mt-1">אין תבנית לערוץ זה</p>
                                )}
                            </div>
                        </div>

                        <div>
                             <label className="block text-sm font-semibold text-text-muted mb-1.5">משרה מקושרת:</label>
                            <div className="relative" ref={jobPickerRef}>
                                <button
                                    type="button"
                                    disabled={jobsLoading}
                                    onClick={() => {
                                        if (jobsLoading) return;
                                        setJobPickerOpen((o) => !o);
                                    }}
                                    className="w-full flex items-center justify-between gap-2 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 text-right disabled:opacity-60"
                                    aria-haspopup="listbox"
                                    aria-expanded={jobPickerOpen}
                                >
                                    <span className="truncate flex-1">
                                        {selectedJobRow ? jobComposeRowLabel(selectedJobRow) : '---'}
                                    </span>
                                    <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 transition-transform ${jobPickerOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {jobPickerOpen && !jobsLoading && (
                                    <div
                                        className="absolute z-50 mt-1 w-full rounded-lg border border-border-default bg-bg-card shadow-lg flex flex-col max-h-72 overflow-hidden"
                                        role="listbox"
                                    >
                                        <div className="p-2 border-b border-border-default flex items-center gap-2 bg-bg-subtle/40">
                                            <MagnifyingGlassIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                                            <input
                                                type="search"
                                                value={jobSearchQuery}
                                                onChange={(e) => setJobSearchQuery(e.target.value)}
                                                placeholder="חיפוש לפי שם משרה, לקוח או קוד…"
                                                className="flex-1 min-w-0 bg-bg-input border border-border-default text-text-default text-sm rounded-md px-2 py-1.5"
                                                autoComplete="off"
                                                aria-label="חיפוש משרה"
                                                onMouseDown={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <ul className="overflow-y-auto py-1 text-sm">
                                            <li>
                                                <button
                                                    type="button"
                                                    role="option"
                                                    className="w-full text-right px-3 py-2 hover:bg-bg-hover text-text-muted"
                                                    onClick={() => {
                                                        setSelectedJobId('');
                                                        setJobPickerOpen(false);
                                                    }}
                                                >
                                                    —
                                                </button>
                                            </li>
                                            {filteredJobsForPicker.map((j) => (
                                                <li key={j.id}>
                                                    <button
                                                        type="button"
                                                        role="option"
                                                        className={`w-full text-right px-3 py-2 hover:bg-bg-hover ${
                                                            j.id === selectedJobId ? 'bg-primary-50 text-primary-800 font-medium' : ''
                                                        }`}
                                                        onClick={() => {
                                                            setSelectedJobId(j.id);
                                                            setJobPickerOpen(false);
                                                            setJobSearchQuery('');
                                                        }}
                                                    >
                                                        {jobComposeRowLabel(j)}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                        {filteredJobsForPicker.length === 0 && jobs.length > 0 && (
                                            <div className="px-3 py-4 text-center text-text-subtle text-xs">
                                                לא נמצאו משרות התואמות לחיפוש
                                            </div>
                                        )}
                                        {jobs.length === 0 && (
                                            <div className="px-3 py-4 text-center text-text-subtle text-xs">אין משרות ברשימה</div>
                                        )}
                                    </div>
                                )}
                            </div>
                            {jobsLoading && (
                                <p className="text-xs text-text-subtle mt-1">טוען משרות…</p>
                            )}
                            {jobsError && !isSilentComposeFetchError(jobsError) && (
                                <p className="text-xs text-red-600 mt-1">{jobsError}</p>
                            )}
                            {!jobsLoading && !jobsErrBlocksHints && jobs.length === 0 && (
                                <p className="text-xs text-text-subtle mt-1">אין משרות להצגה — ניתן לשלוח מייל בלי קישור משרה</p>
                            )}
                        </div>

                         {config.showSubject && (
                            <div>
                                <label className="block text-sm font-semibold text-text-muted mb-1.5">נושא:</label>
                                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                            </div>
                        )}

                        <div>
                             <label className="block text-sm font-semibold text-text-muted mb-1.5">תוכן ההודעה:</label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                rows={8}
                                className="w-full bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                            ></textarea>
                            <div className="text-xs text-text-subtle text-left mt-1">{content.length} / 5000</div>
                        </div>

                        {config.allowAttachments && (
                            <div className="bg-bg-subtle/30 p-3 rounded-xl border border-border-subtle">
                                <label className="block text-sm font-semibold text-text-muted mb-2">קבצים וצרופות:</label>
                                <div className="space-y-2">
                                    {attachments.map((att, index) => (
                                        <div key={index} className="flex items-center gap-2">
                                            <PaperClipIcon className="w-5 h-5 text-text-muted flex-shrink-0"/>
                                            <select
                                                value={att}
                                                onChange={e => handleAttachmentChange(index, e.target.value)}
                                                className="flex-grow bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5"
                                            >
                                                <option value="">בחר קובץ מהמאגר...</option>
                                                <option value="brochure">ברושור חברה 2025</option>
                                                <option value="pricing">מחירון שירותים</option>
                                                <option value="quote_101">הצעת מחיר QT-2025-001</option>
                                                <option value="cv_file">קורות חיים (Gideon_CV.pdf)</option>
                                            </select>

                                            {(attachments.length > 1 || att !== '') && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeAttachmentRow(index)}
                                                    className="p-2 text-text-subtle hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={addAttachmentRow}
                                    className="mt-3 flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    <PlusIcon className="w-3.5 h-3.5" />
                                    הוסף קובץ נוסף
                                </button>
                            </div>
                        )}

                        {!config.allowAttachments && (
                             <div className="text-xs text-text-muted italic bg-bg-subtle/30 p-2 rounded text-center">
                                * שליחת קבצים אינה נתמכת בערוץ זה (WhatsApp/SMS). אנא השתמש במייל לשליחת מסמכים.
                            </div>
                        )}

                        {submitError && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
                                {submitError}
                            </div>
                        )}

                    </main>
                     <footer className="flex justify-end items-center p-4 bg-bg-subtle border-t border-border-default flex-shrink-0">
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`flex items-center gap-2 text-white font-bold py-2 px-6 rounded-lg transition shadow-sm disabled:opacity-60 disabled:pointer-events-none ${config.buttonClass}`}
                        >
                            {config.buttonIcon}
                            <span>
                                {isSubmitting && mode === 'email'
                                    ? 'שולח…'
                                    : isSubmitting && mode === 'whatsapp'
                                      ? 'פותח…'
                                      : config.buttonText}
                            </span>
                        </button>
                    </footer>
                </form>
                <style>{`@keyframes modalFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
            </div>
        </div>
    );
};

export default SendMessageModal;
