
import React, { useState, useEffect, useId, useMemo, useCallback, useRef } from 'react';
import { useMatch } from 'react-router-dom';
import {
    XMarkIcon,
    WhatsappIcon,
    EnvelopeIcon,
    ChatBubbleBottomCenterTextIcon,
    PaperClipIcon,
    DocumentTextIcon,
    DocumentIcon,
    PencilIcon,
    PlusIcon,
    TrashIcon,
    ArrowUpTrayIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    PhoneIcon,
} from './Icons';
import { fetchMessageTemplatesForCompose, type MessageTemplateDto, type MessageTemplateRecipientType, filterMessageTemplatesForRecipient } from '../services/messageTemplatesApi';
import { fetchJobsForCompose, type JobComposeRow } from '../services/jobsApi';
import { sendNotificationEmail, type SendNotificationEmailAttachment } from '../services/emailSendApi';
import {
    fetchClientAttachments,
    formatAttachmentSize,
    type ClientAttachment,
} from '../services/clientAttachmentsApi';
import { logWhatsappComposeOpen, sendComposeSms } from '../services/messagingApi';
import {
    createOutboundMessageClientEvent,
    type OutboundMessageAttachmentRef,
} from '../services/clientOutboundMessageApi';
import { applyMessageTemplatePlaceholders, loadMessagingPlaceholderValues } from '../services/messageTemplatePlaceholders';
import {
    applyProposalTemplatePlaceholders,
    fetchProposalTemplates,
    type ProposalTemplateDto,
} from '../services/proposalsApi';
import {
    fetchClientLogoForProposalExport,
    trimLogoForProposalPdf,
    type ExportImagePayload,
} from '../utils/exportImagePayload';
import { applyClientLogoToEmailAttachments } from '../utils/emailAttachmentLogoStamp';
import {
    prepareProposalHtmlForDelivery,
    prepareProposalHtmlForPdf,
    wrapProposalEmailBlock,
    wrapProposalPdfDocument,
} from '../utils/proposalHtmlPrepare';
import { authHeaders } from '../utils/authHeaders';
import { useAuth } from '../context/AuthContext';
import type { MessageRecipientOption } from '../hooks/useUIState';
import { RichTextArea } from './RichTextArea';

type MessageMode = 'whatsapp' | 'sms' | 'email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CUSTOM_EMAIL_ID_PREFIX = 'custom-email:';

function recipientInitial(name: string): string {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
}

function resolveRecipientEmail(candidateEmail?: string | null, candidatePhone?: string): string {
    const e = String(candidateEmail || '').trim();
    if (e && EMAIL_RE.test(e)) return e.toLowerCase();
    const p = String(candidatePhone || '').trim();
    if (p && EMAIL_RE.test(p)) return p.toLowerCase();
    return '';
}

/** Distinct valid emails from a comma/semicolon-separated list (bulk נמענים). */
function collectRecipientEmailsFromBulkField(candidateEmail?: string | null, candidatePhone?: string): string[] {
    const raw = String(candidateEmail || '').trim();
    if (raw) {
        const parts = raw
            .split(/[,;\s\n]+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const seen = new Set<string>();
        const out: string[] = [];
        for (const p of parts) {
            if (!EMAIL_RE.test(p)) continue;
            const low = p.toLowerCase();
            if (seen.has(low)) continue;
            seen.add(low);
            out.push(low);
        }
        if (out.length) return out;
    }
    const one = resolveRecipientEmail(null, candidatePhone);
    return one ? [one] : [];
}

function optionHasChannel(opt: MessageRecipientOption, mode: MessageMode): boolean {
    if (mode === 'email') return Boolean(resolveRecipientEmail(opt.email, opt.phone));
    return Boolean(String(opt.phone || '').replace(/\D/g, '').length >= 9);
}

function defaultSelectedRecipientIds(
    options: MessageRecipientOption[],
    mode: MessageMode,
    initialIds?: string[],
): string[] {
    if (initialIds && initialIds.length) {
        const allowed = new Set(options.map((o) => o.id));
        return initialIds.filter((id) => allowed.has(id));
    }
    const withChannel = options.filter((o) => optionHasChannel(o, mode)).map((o) => o.id);
    if (withChannel.length) return withChannel.slice(0, 1);
    return options.length ? [options[0].id] : [];
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

const ATTACH_LIB_PREFIX = 'lib:';
const ATTACH_LOCAL_PREFIX = 'local:';
const ATTACH_UPLOAD_OPTION = '__upload__';

function guessAttachmentContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        zip: 'application/zip',
    };
    return map[ext] || 'application/octet-stream';
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(reader.error || new Error('קריאת קובץ נכשלה'));
        reader.readAsDataURL(file);
    });
}

function newLocalAttachmentKey(): string {
    return `u-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeProposalPdfFilename(name: string): string {
    const cleaned = String(name || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();
    return cleaned || 'proposal';
}

type ProposalRowCustomization = {
    contentOverride?: string;
    sendAsPdf?: boolean;
};

async function buildComposeEmailAttachments(
    rows: string[],
    localFiles: Record<string, File>,
    libraryById: Map<string, ClientAttachment>,
): Promise<SendNotificationEmailAttachment[]> {
    const out: SendNotificationEmailAttachment[] = [];
    for (const row of rows) {
        if (row.startsWith(ATTACH_LIB_PREFIX)) {
            const id = row.slice(ATTACH_LIB_PREFIX.length);
            const att = libraryById.get(id);
            if (!att?.url) continue;
            const resp = await fetch(att.url);
            if (!resp.ok) throw new Error(`לא ניתן לטעון את "${att.name}" מהמאגר`);
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
            out.push({
                filename: att.name || 'attachment',
                content: btoa(binary),
                contentType: guessAttachmentContentType(att.name),
            });
        } else if (row.startsWith(ATTACH_LOCAL_PREFIX)) {
            const key = row.slice(ATTACH_LOCAL_PREFIX.length);
            const file = localFiles[key];
            if (!file) continue;
            out.push({
                filename: file.name,
                content: await fileToBase64(file),
                contentType: file.type || guessAttachmentContentType(file.name),
            });
        }
    }
    return out;
}

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: MessageMode;
  candidateName: string;
  candidatePhone: string;
  candidateEmail?: string | null;
  candidateId?: string | null;
  recipientOptions?: MessageRecipientOption[];
  initialRecipientIds?: string[];
  /** CRM journal context (single-recipient / contact profile). */
  linkedClientId?: string | null;
  linkedOrganizationId?: string | null;
  linkedOrganizationName?: string | null;
  linkedContactId?: string | null;
  recipientType?: MessageTemplateRecipientType;
}

function inferComposeRecipientType(props: {
  recipientType?: MessageTemplateRecipientType;
  candidateId?: string | null;
  linkedContactId?: string | null;
  recipientOptions?: MessageRecipientOption[];
}): MessageTemplateRecipientType {
  if (props.recipientType) return props.recipientType;
  if (props.linkedContactId) return 'client_contact';
  if (props.recipientOptions?.length && !props.candidateId) return 'client_contact';
  return 'candidate';
}

/** InforU billing: every 201 characters (or part thereof) = one SMS unit. */
const INFORU_SMS_CHARS_PER_MESSAGE = 201;

function inforuSmsBillableMessages(charCount: number): number {
    if (charCount <= 0) return 0;
    return Math.ceil(charCount / INFORU_SMS_CHARS_PER_MESSAGE);
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
    recipientOptions,
    initialRecipientIds,
    linkedClientId,
    linkedOrganizationId,
    linkedOrganizationName,
    linkedContactId,
    recipientType,
}) => {
    const [content, setContent] = useState('');
    const [subject, setSubject] = useState('');
    const [attachments, setAttachments] = useState<string[]>(['']);
    const [localAttachmentFiles, setLocalAttachmentFiles] = useState<Record<string, File>>({});
    const [clientAttachments, setClientAttachments] = useState<ClientAttachment[]>([]);
    const [clientAttachmentsLoading, setClientAttachmentsLoading] = useState(false);
    const [clientAttachmentsError, setClientAttachmentsError] = useState<string | null>(null);
    const attachmentFileInputRef = useRef<HTMLInputElement>(null);
    const pendingAttachmentUploadRowRef = useRef<number | null>(null);
    const [proposalAttachmentIds, setProposalAttachmentIds] = useState<string[]>(['']);
    const [proposalTemplates, setProposalTemplates] = useState<ProposalTemplateDto[]>([]);
    const [proposalTemplatesLoading, setProposalTemplatesLoading] = useState(false);
    const [proposalTemplatesError, setProposalTemplatesError] = useState<string | null>(null);
    const [proposalRowCustomizations, setProposalRowCustomizations] = useState<Record<number, ProposalRowCustomization>>({});
    const [proposalEditModal, setProposalEditModal] = useState<{
        rowIndex: number;
        templateName: string;
    } | null>(null);
    const [proposalEditDraft, setProposalEditDraft] = useState('');
    const [proposalLogoPayload, setProposalLogoPayload] = useState<ExportImagePayload | null>(null);
    const [resolvedLinkedOrgName, setResolvedLinkedOrgName] = useState('');
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
    const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
    const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [customRecipientEmails, setCustomRecipientEmails] = useState<string[]>([]);
    const [customEmailInputOpen, setCustomEmailInputOpen] = useState(false);
    const [customEmailDraft, setCustomEmailDraft] = useState('');
    const customEmailInputRef = useRef<HTMLInputElement>(null);
    const recipientPickerRef = useRef<HTMLDivElement>(null);
    const baseTemplateRef = useRef<{ subject: string; content: string } | null>(null);
    const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});

    const titleId = useId();
    const config = modalConfig[mode];
    const smsBillableCount =
        config.channel === 'sms' ? inforuSmsBillableMessages(content.length) : 0;
    const { user } = useAuth();
    const senderDisplayName =
        (user as { fullName?: string; name?: string; email?: string } | null)?.fullName
        || (user as { name?: string } | null)?.name
        || (user as { email?: string } | null)?.email
        || 'משתמש מערכת';

    const hasRecipientPicker = Array.isArray(recipientOptions) && recipientOptions.length > 0;

    const selectedRecipients = useMemo(() => {
        if (!hasRecipientPicker || !recipientOptions) return [];
        const byId = new Map(recipientOptions.map((o) => [o.id, o]));
        return selectedRecipientIds.map((id) => byId.get(id)).filter(Boolean) as MessageRecipientOption[];
    }, [hasRecipientPicker, recipientOptions, selectedRecipientIds]);

    const customEmailRecipients = useMemo((): MessageRecipientOption[] => {
        if (!customRecipientEmails.length) return [];
        const fallbackClientId =
            String(linkedClientId || '').trim()
            || String(selectedRecipients[0]?.clientId || '').trim()
            || String(user?.clientId || '').trim()
            || '';
        const fallbackOrgId =
            linkedOrganizationId
            || selectedRecipients[0]?.organizationId
            || null;
        return customRecipientEmails.map((email) => ({
            id: `${CUSTOM_EMAIL_ID_PREFIX}${email}`,
            name: email.split('@')[0] || email,
            email,
            phone: '',
            subtitle: 'מייל חופשי',
            clientId: fallbackClientId || null,
            organizationId: fallbackOrgId,
        }));
    }, [
        customRecipientEmails,
        linkedClientId,
        linkedOrganizationId,
        selectedRecipients,
        user?.clientId,
    ]);

    const crmRecipientsForLog = useMemo((): MessageRecipientOption[] => {
        let fromPicker: MessageRecipientOption[] = [];
        if (hasRecipientPicker && selectedRecipientIds.length > 0 && recipientOptions) {
            const byId = new Map(recipientOptions.map((o) => [o.id, o]));
            fromPicker = selectedRecipientIds.map((id) => byId.get(id)).filter(Boolean) as MessageRecipientOption[];
        } else if (linkedClientId || linkedContactId) {
            fromPicker = [{
                id: String(linkedContactId || ''),
                name: candidateName,
                email: candidateEmail || '',
                phone: candidatePhone || '',
                clientId: linkedClientId || null,
                organizationId: linkedOrganizationId || null,
            }];
        }
        return [...fromPicker, ...customEmailRecipients];
    }, [
        hasRecipientPicker,
        selectedRecipientIds,
        recipientOptions,
        linkedClientId,
        linkedContactId,
        linkedOrganizationId,
        candidateName,
        candidateEmail,
        candidatePhone,
        customEmailRecipients,
    ]);

    const resolveContactIdForLog = useCallback((recipient: MessageRecipientOption | undefined): string | null => {
        const id = String(recipient?.id || '').trim();
        if (!id || id.startsWith(CUSTOM_EMAIL_ID_PREFIX)) return linkedContactId || null;
        return id;
    }, [linkedContactId]);

    const logCrmOutboundEvents = useCallback(async (args: {
        channel: 'email' | 'whatsapp' | 'sms';
        body: string;
        subject?: string;
        /** email → map toEmail to recipient; wa/sms → one event per CRM recipient */
        emailResults?: { to: string; notificationMessageId?: string | null; providerMessageId?: string | null }[];
        emailAttachments?: SendNotificationEmailAttachment[];
        proposalTemplateNames?: string[];
        isProposal?: boolean;
    }) => {
        const recipients = crmRecipientsForLog;
        if (!recipients.length) return;

        const tasks: Promise<void>[] = [];
        if (args.channel === 'email' && args.emailResults?.length) {
            for (const result of args.emailResults) {
                const toNorm = String(result.to || '').trim().toLowerCase();
                const match =
                    recipients.find((r) => String(r.email || '').trim().toLowerCase() === toNorm)
                    || recipients[0];
                const clientId = String(match?.clientId || linkedClientId || '').trim();
                if (!clientId) continue;
                const messageId = result.notificationMessageId ? String(result.notificationMessageId).trim() : '';
                const attachmentRefs: OutboundMessageAttachmentRef[] =
                    messageId && args.emailAttachments?.length
                        ? args.emailAttachments.map((att, index) => ({
                              filename: att.filename,
                              contentType: att.contentType || null,
                              size: att.content ? Math.floor((att.content.length * 3) / 4) : null,
                              notificationMessageId: messageId,
                              index,
                              contentBase64: att.content || null,
                          }))
                        : [];
                tasks.push(
                    createOutboundMessageClientEvent({
                        clientId,
                        organizationId: match?.organizationId || linkedOrganizationId || null,
                        contactId: resolveContactIdForLog(match),
                        contactName: match?.name || candidateName,
                        channel: 'email',
                        to: result.to,
                        subject: args.subject || null,
                        body: args.body,
                        senderName: senderDisplayName,
                        notificationMessageId: result.notificationMessageId || null,
                        providerMessageId: result.providerMessageId || null,
                        deliveryStatus: 'נשלח',
                        attachments: attachmentRefs.length ? attachmentRefs : undefined,
                        proposalTemplateNames: args.proposalTemplateNames?.length
                            ? args.proposalTemplateNames
                            : undefined,
                        isProposal: args.isProposal === true,
                    }).catch((err) => {
                        console.warn('[SendMessageModal] failed to create email journal event', err);
                    }),
                );
            }
        } else {
            for (const match of recipients) {
                const clientId = String(match.clientId || linkedClientId || '').trim();
                if (!clientId) continue;
                const to =
                    args.channel === 'email'
                        ? String(match.email || '').trim()
                        : String(match.phone || '').trim();
                tasks.push(
                    createOutboundMessageClientEvent({
                        clientId,
                        organizationId: match.organizationId || linkedOrganizationId || null,
                        contactId: resolveContactIdForLog(match),
                        contactName: match.name || candidateName,
                        channel: args.channel,
                        to: to || '—',
                        subject: args.subject || null,
                        body: args.body,
                        senderName: senderDisplayName,
                        deliveryStatus: args.channel === 'whatsapp'
                            ? 'נפתח לערוץ חיצוני'
                            : 'נשלח',
                    }).catch((err) => {
                        console.warn('[SendMessageModal] failed to create journal event', err);
                    }),
                );
            }
        }
        if (tasks.length) await Promise.all(tasks);
    }, [
        crmRecipientsForLog,
        linkedClientId,
        linkedOrganizationId,
        linkedContactId,
        candidateName,
        senderDisplayName,
        resolveContactIdForLog,
    ]);

    const effectiveName = useMemo(() => {
        if (!hasRecipientPicker || selectedRecipients.length === 0) return candidateName;
        if (selectedRecipients.length === 1) return selectedRecipients[0].name;
        return `${selectedRecipients[0].name} (+${selectedRecipients.length - 1})`;
    }, [hasRecipientPicker, selectedRecipients, candidateName]);

    const effectivePhone = useMemo(() => {
        if (!hasRecipientPicker) return candidatePhone;
        return selectedRecipients
            .map((r) => String(r.phone || '').trim())
            .filter(Boolean)
            .join('; ');
    }, [hasRecipientPicker, selectedRecipients, candidatePhone]);

    const effectiveEmail = useMemo(() => {
        const contactPart = hasRecipientPicker
            ? selectedRecipients.map((r) => String(r.email || '').trim()).filter(Boolean).join(', ')
            : String(candidateEmail || '').trim();
        const merged = collectRecipientEmailsFromBulkField(
            [contactPart, ...customRecipientEmails].filter(Boolean).join(', '),
            null,
        );
        return merged.join(', ');
    }, [hasRecipientPicker, selectedRecipients, candidateEmail, customRecipientEmails]);

    const effectiveClientId = useMemo(() => {
        const linked = String(linkedClientId || '').trim();
        if (linked) return linked;
        if (hasRecipientPicker && selectedRecipients.length) {
            for (const r of selectedRecipients) {
                const cid = String(r.clientId || '').trim();
                if (cid) return cid;
            }
        }
        const own = String(user?.clientId || '').trim();
        return own || '';
    }, [linkedClientId, hasRecipientPicker, selectedRecipients, user?.clientId]);

    const primaryCrmRecipient = useMemo(() => {
        if (hasRecipientPicker && selectedRecipients.length) return selectedRecipients[0];
        if (linkedClientId || linkedContactId) {
            return {
                id: String(linkedContactId || ''),
                name: candidateName,
                email: candidateEmail,
                phone: candidatePhone,
                subtitle: null,
                clientId: linkedClientId || null,
                organizationId: linkedOrganizationId || null,
            } satisfies MessageRecipientOption;
        }
        return null;
    }, [
        hasRecipientPicker,
        selectedRecipients,
        linkedClientId,
        linkedContactId,
        linkedOrganizationId,
        candidateName,
        candidateEmail,
        candidatePhone,
    ]);

    const proposalCompanyName = useMemo(() => {
        const explicit = String(linkedOrganizationName || '').trim();
        if (explicit) return explicit;
        if (resolvedLinkedOrgName) return resolvedLinkedOrgName;
        const fromRecipient = String(primaryCrmRecipient?.subtitle || '').trim();
        if (fromRecipient && fromRecipient !== 'מייל חופשי') return fromRecipient;
        return String(placeholderValues.company_name || placeholderValues.client_name || '').trim();
    }, [
        linkedOrganizationName,
        resolvedLinkedOrgName,
        primaryCrmRecipient?.subtitle,
        placeholderValues.company_name,
        placeholderValues.client_name,
    ]);

    const proposalPlaceholderContext = useMemo(
        () => ({
            contactName: primaryCrmRecipient?.name || effectiveName,
            contactEmail: primaryCrmRecipient?.email || effectiveEmail || '',
            contactPhone: primaryCrmRecipient?.phone || effectivePhone || '',
            contactRole: primaryCrmRecipient?.subtitle || '',
            companyName: proposalCompanyName,
            repName: senderDisplayName,
            repEmail: String(user?.email || ''),
            repPhone: String(user?.phone || ''),
        }),
        [
            primaryCrmRecipient,
            effectiveName,
            effectiveEmail,
            effectivePhone,
            proposalCompanyName,
            senderDisplayName,
            user?.email,
            user?.phone,
        ],
    );

    const resolveProposalRawHtml = useCallback(
        (tpl: ProposalTemplateDto, rowIndex: number): string => {
            const override = proposalRowCustomizations[rowIndex]?.contentOverride;
            const source = override !== undefined ? override : (tpl.content || '');
            return applyProposalTemplatePlaceholders(source, proposalPlaceholderContext);
        },
        [proposalRowCustomizations, proposalPlaceholderContext],
    );

    const resolveProposalBodyHtml = useCallback(
        (tpl: ProposalTemplateDto, rowIndex: number): string =>
            prepareProposalHtmlForDelivery(resolveProposalRawHtml(tpl, rowIndex), proposalLogoPayload),
        [resolveProposalRawHtml, proposalLogoPayload],
    );

    const closeProposalEditModal = useCallback(() => {
        setProposalEditModal(null);
        setProposalEditDraft('');
    }, []);

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

    const composeRecipientType = useMemo(
        () => inferComposeRecipientType({ recipientType, candidateId, linkedContactId, recipientOptions }),
        [recipientType, candidateId, linkedContactId, recipientOptions],
    );

    const channelTemplates = useMemo(() => {
        const ch = config.channel;
        return filterMessageTemplatesForRecipient(templates, composeRecipientType).filter((t) =>
            (t.channels || []).includes(ch),
        );
    }, [templates, config.channel, composeRecipientType]);

    const recipientSummary = useMemo(() => {
        const parts = [effectiveName].filter(Boolean);
        if (effectivePhone) parts.push(effectivePhone);
        if (effectiveEmail) parts.push(effectiveEmail);
        return parts.join(' · ');
    }, [effectiveName, effectivePhone, effectiveEmail]);

    const filteredRecipientOptions = useMemo(() => {
        if (!recipientOptions) return [];
        const q = recipientSearchQuery.trim().toLowerCase();
        const base = !q
            ? recipientOptions
            : recipientOptions.filter((o) => {
                const hay = `${o.name} ${o.subtitle || ''} ${o.email || ''} ${o.phone || ''}`.toLowerCase();
                return hay.includes(q);
            });
        return [...base].sort((a, b) => {
            const orgCmp = String(a.subtitle || '').localeCompare(String(b.subtitle || ''), 'he');
            if (orgCmp !== 0) return orgCmp;
            return a.name.localeCompare(b.name, 'he');
        });
    }, [recipientOptions, recipientSearchQuery]);

    const groupRecipientOptions = useCallback((options: MessageRecipientOption[]) => {
        const groups = new Map<string, MessageRecipientOption[]>();
        for (const opt of options) {
            const key = String(opt.subtitle || '').trim() || 'ללא ארגון';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(opt);
        }
        return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'he'));
    }, []);

    const recipientPickerSections = useMemo(() => {
        const selectedSet = new Set(selectedRecipientIds);
        const selected = filteredRecipientOptions.filter((o) => selectedSet.has(o.id));
        const unselected = filteredRecipientOptions.filter((o) => !selectedSet.has(o.id));
        return {
            selectedGroups: selected.length ? groupRecipientOptions(selected) : [],
            unselectedGroups: groupRecipientOptions(unselected),
        };
    }, [filteredRecipientOptions, selectedRecipientIds, groupRecipientOptions]);

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
        if (!recipientPickerOpen) return;
        const onDoc = (e: MouseEvent) => {
            const el = recipientPickerRef.current;
            if (el && !el.contains(e.target as Node)) setRecipientPickerOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [recipientPickerOpen]);

    useEffect(() => {
        if (!isOpen) return;
        setContent('');
        setSubject('');
        setAttachments(['']);
        setLocalAttachmentFiles({});
        setClientAttachments([]);
        setClientAttachmentsError(null);
        setProposalAttachmentIds(['']);
        setProposalTemplates([]);
        setProposalTemplatesError(null);
        setProposalRowCustomizations({});
        setProposalLogoPayload(null);
        setResolvedLinkedOrgName('');
        closeProposalEditModal();
        setSelectedTemplateId('');
        setSelectedJobId('');
        setJobPickerOpen(false);
        setJobSearchQuery('');
        setRecipientPickerOpen(false);
        setRecipientSearchQuery('');
        setCustomRecipientEmails([]);
        setCustomEmailInputOpen(false);
        setCustomEmailDraft('');
        setSelectedRecipientIds(
            hasRecipientPicker && recipientOptions
                ? defaultSelectedRecipientIds(recipientOptions, mode, initialRecipientIds)
                : [],
        );
        setTemplatesError(null);
        setJobsError(null);
        setSubmitError(null);
        setIsSubmitting(false);
        baseTemplateRef.current = null;
        setPlaceholderValues({});

        let cancelled = false;
        (async () => {
            setTemplatesLoading(true);
            setJobsLoading(true);
            try {
                const [tRes, jobRows] = await Promise.all([
                    fetchMessageTemplatesForCompose(composeRecipientType),
                    fetchJobsForCompose(),
                ]);
                if (cancelled) return;
                setComposeScope(tRes.scope);
                setTemplates(
                    filterMessageTemplatesForRecipient(
                        Array.isArray(tRes.templates) ? tRes.templates : [],
                        composeRecipientType,
                    ),
                );
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
    }, [isOpen, mode, hasRecipientPicker, recipientOptions, initialRecipientIds, composeRecipientType]);

    useEffect(() => {
        if (!isOpen || mode !== 'email' || !effectiveClientId) {
            setProposalTemplates([]);
            setProposalTemplatesLoading(false);
            return;
        }
        let cancelled = false;
        setProposalTemplatesLoading(true);
        setProposalTemplatesError(null);
        void fetchProposalTemplates(effectiveClientId)
            .then((rows) => {
                if (!cancelled) setProposalTemplates(Array.isArray(rows) ? rows : []);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setProposalTemplates([]);
                const msg = e instanceof Error ? e.message : 'טעינת תבניות הצעת מחיר נכשלה';
                if (!isSilentComposeFetchError(msg)) setProposalTemplatesError(msg);
            })
            .finally(() => {
                if (!cancelled) setProposalTemplatesLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, mode, effectiveClientId]);

    useEffect(() => {
        if (!isOpen || mode !== 'email') {
            setProposalLogoPayload(null);
            return;
        }
        let cancelled = false;
        void fetchClientLogoForProposalExport(effectiveClientId)
            .then(async (payload) => {
                if (cancelled) return;
                setProposalLogoPayload(payload ? await trimLogoForProposalPdf(payload) : null);
            })
            .catch(() => {
                if (!cancelled) setProposalLogoPayload(null);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, mode, effectiveClientId]);

    useEffect(() => {
        if (!isOpen) {
            setResolvedLinkedOrgName('');
            return;
        }
        const explicit = String(linkedOrganizationName || '').trim();
        if (explicit) {
            setResolvedLinkedOrgName(explicit);
            return;
        }
        const orgId = String(
            linkedOrganizationId || primaryCrmRecipient?.organizationId || '',
        ).trim();
        if (!orgId) {
            setResolvedLinkedOrgName('');
            return;
        }
        let cancelled = false;
        const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
        void fetch(`${apiBase}/api/organizations/${encodeURIComponent(orgId)}`, {
            headers: authHeaders(true),
            credentials: 'include',
        })
            .then(async (res) => {
                if (!res.ok) return null;
                return res.json() as Promise<{ name?: string }>;
            })
            .then((row) => {
                if (cancelled) return;
                setResolvedLinkedOrgName(String(row?.name || '').trim());
            })
            .catch(() => {
                if (!cancelled) setResolvedLinkedOrgName('');
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, linkedOrganizationName, linkedOrganizationId, primaryCrmRecipient?.organizationId]);

    useEffect(() => {
        if (!isOpen || mode !== 'email' || !effectiveClientId) {
            setClientAttachments([]);
            setClientAttachmentsLoading(false);
            setClientAttachmentsError(null);
            return;
        }
        let cancelled = false;
        setClientAttachmentsLoading(true);
        setClientAttachmentsError(null);
        void fetchClientAttachments(effectiveClientId)
            .then((rows) => {
                if (!cancelled) setClientAttachments(Array.isArray(rows) ? rows : []);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setClientAttachments([]);
                const msg = e instanceof Error ? e.message : 'טעינת צרופות החברה נכשלה';
                if (!isSilentComposeFetchError(msg)) setClientAttachmentsError(msg);
            })
            .finally(() => {
                if (!cancelled) setClientAttachmentsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOpen, mode, effectiveClientId]);

    const clientAttachmentsById = useMemo(
        () => new Map(clientAttachments.map((a) => [a.id, a])),
        [clientAttachments],
    );

    const selectedProposalTemplates = useMemo(() => {
        const byId = new Map(proposalTemplates.map((t) => [t.id, t]));
        return proposalAttachmentIds
            .map((id) => String(id || '').trim())
            .filter(Boolean)
            .map((id) => byId.get(id))
            .filter(Boolean) as ProposalTemplateDto[];
    }, [proposalAttachmentIds, proposalTemplates]);

    const selectedJobRow = useMemo(
        () => (selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined),
        [jobs, selectedJobId],
    );

    const placeholderFallbackRef = useRef({
        name: '',
        phone: '',
        email: '',
    });
    placeholderFallbackRef.current = {
        name: effectiveName,
        phone: effectivePhone,
        email: effectiveEmail,
    };

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const fb = placeholderFallbackRef.current;
        const jobRow = selectedJobId ? jobs.find((j) => j.id === selectedJobId) : undefined;
        void loadMessagingPlaceholderValues({
            candidateId: resolvedCandidateId,
            jobId: selectedJobId || null,
            channel: config.channel,
            fallbackCandidateName: fb.name,
            fallbackCandidatePhone: fb.phone,
            fallbackCandidateEmail: fb.email,
            jobComposeRow: jobRow,
            recruiter: user,
        }).then((vals) => {
            if (!cancelled) setPlaceholderValues(vals as Record<string, string>);
        });
        return () => {
            cancelled = true;
        };
    }, [
        isOpen,
        resolvedCandidateId,
        selectedJobId,
        config.channel,
        jobs,
        user?.id,
        user?.email,
        user?.name,
    ]);

    const applyTemplate = useCallback(
        (templateId: string) => {
            setSelectedTemplateId(templateId);
            if (!templateId) {
                baseTemplateRef.current = null;
                setContent('');
                if (mode === 'email') setSubject('');
                return;
            }
            const t = channelTemplates.find((x) => x.id === templateId);
            if (!t) return;
            baseTemplateRef.current = { subject: t.subject || '', content: t.content || '' };
        },
        [channelTemplates, mode],
    );

    useEffect(() => {
        const base = baseTemplateRef.current;
        if (!base || !selectedTemplateId) return;
        setSubject(applyMessageTemplatePlaceholders(base.subject, placeholderValues));
        setContent(applyMessageTemplatePlaceholders(base.content, placeholderValues));
    }, [placeholderValues, selectedTemplateId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitError(null);

        if (!content.trim()) {
            setSubmitError('תוכן ההודעה חובה');
            return;
        }

        if (hasRecipientPicker && selectedRecipients.length === 0 && customRecipientEmails.length === 0) {
            setSubmitError(
                mode === 'email'
                    ? 'בחרו איש קשר או הוסיפו כתובת מייל'
                    : 'בחרו לפחות איש קשר אחד לשליחה',
            );
            return;
        }

        const trimmedContent = content.trim();
        const selectedTpl = selectedTemplateId
            ? templates.find((t) => t.id === selectedTemplateId)
            : undefined;
        const selectedJob = selectedJobRow;

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
        const textOut = `${trimmedContent}`;
        // Prefer config.channel (tied to modal UI) over mode prop to avoid channel mix-ups.
        const outboundChannel = config.channel;

        if (outboundChannel === 'whatsapp') {
            const waPhone = toWhatsAppPhoneDigits(effectivePhone);
            if (!waPhone) {
                setSubmitError('אין מספר טלפון תקין ל־WhatsApp (נדרש מספר עם קידומת או 0)');
                return;
            }
            setIsSubmitting(true);
            try {
                try {
                    await logWhatsappComposeOpen({
                        candidateId: resolvedCandidateId,
                        candidateName: effectiveName,
                        phone: effectivePhone,
                        messagePreview: textOut,
                        templateId: selectedTemplateId || null,
                        jobId: selectedJobId || null,
                    });
                } catch (auditErr) {
                    console.warn('[SendMessageModal] WhatsApp audit log failed', auditErr);
                }
                await logCrmOutboundEvents({ channel: 'whatsapp', body: textOut });
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

        if (outboundChannel === 'sms') {
            const phones = String(effectivePhone || '')
                .split(/[;,\n]+/)
                .map((s) => s.trim())
                .filter(Boolean);
            const digitsList = phones
                .map((p) => p.replace(/\D/g, ''))
                .filter((d) => d.length >= 9);
            if (!digitsList.length) {
                setSubmitError('אין מספר טלפון תקין ל־SMS');
                return;
            }
            setIsSubmitting(true);
            try {
                await sendComposeSms({
                    toPhone: phones.join(';'),
                    message: textOut,
                    candidateId: resolvedCandidateId,
                    candidateName: effectiveName,
                    templateId: selectedTemplateId || null,
                    jobId: selectedJobId || null,
                });
                await logCrmOutboundEvents({ channel: 'sms', body: textOut });
                onClose();
            } catch (err: unknown) {
                setSubmitError(err instanceof Error ? err.message : 'שליחת SMS נכשלה');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (outboundChannel !== 'email') {
            setSubmitError('שליחה דרך השרת זמינה כרגע רק למייל. השתמשו בערוץ המייל.');
            return;
        }

        const toEmails = collectRecipientEmailsFromBulkField(effectiveEmail, effectivePhone);
        if (!toEmails.length) {
            setSubmitError(
                hasRecipientPicker
                    ? 'לאנשי הקשר שנבחרו אין כתובת מייל. בחרו איש קשר עם מייל או עדכנו פרטים.'
                    : 'אין כתובת מייל לנמען. עדכנו מייל במועמד או באיש הקשר.',
            );
            return;
        }
        if (!subject.trim()) {
            setSubmitError('נושא המייל חובה');
            return;
        }

        const mainHtml = `<div dir="rtl" style="white-space:pre-wrap;font-family:sans-serif;">${escapeHtml(trimmedContent).replace(/\n/g, '<br/>')}</div>`;

        const proposalHtmlBlocks: string[] = [];
        const proposalPdfAttachments: SendNotificationEmailAttachment[] = [];
        const proposalEntries: { tpl: ProposalTemplateDto; rowIndex: number }[] = [];
        proposalAttachmentIds.forEach((id, rowIndex) => {
            const tid = String(id || '').trim();
            if (!tid) return;
            const tpl = proposalTemplates.find((t) => t.id === tid);
            if (tpl) proposalEntries.push({ tpl, rowIndex });
        });

        try {
            let deliveryLogoPayload = proposalLogoPayload;
            if (!deliveryLogoPayload && proposalEntries.length > 0) {
                const raw = await fetchClientLogoForProposalExport(effectiveClientId);
                deliveryLogoPayload = raw ? await trimLogoForProposalPdf(raw) : null;
            }

            const { renderScreeningCvHtmlToPdfBase64 } = await import('../utils/screeningCvPdfExport');
            for (const { tpl, rowIndex } of proposalEntries) {
                const rawHtml = resolveProposalRawHtml(tpl, rowIndex);
                const sendAsPdf = Boolean(proposalRowCustomizations[rowIndex]?.sendAsPdf);
                if (sendAsPdf) {
                    const pdfBodyHtml = prepareProposalHtmlForPdf(rawHtml, deliveryLogoPayload);
                    const pdfHtml = wrapProposalPdfDocument(pdfBodyHtml);
                    const pdfBase64 = await renderScreeningCvHtmlToPdfBase64(pdfHtml);
                    const baseName = sanitizeProposalPdfFilename(tpl.name);
                    const filename =
                        proposalEntries.filter((e) => e.tpl.id === tpl.id).length > 1
                            ? `${baseName}-${rowIndex + 1}.pdf`
                            : `${baseName}.pdf`;
                    proposalPdfAttachments.push({
                        filename,
                        content: pdfBase64,
                        contentType: 'application/pdf',
                    });
                } else {
                    const bodyHtml = prepareProposalHtmlForDelivery(rawHtml, deliveryLogoPayload);
                    proposalHtmlBlocks.push(wrapProposalEmailBlock(bodyHtml, escapeHtml(tpl.name)));
                }
            }
        } catch (pdfErr: unknown) {
            setSubmitError(pdfErr instanceof Error ? pdfErr.message : 'יצירת PDF להצעת מחיר נכשלה');
            return;
        }

        const proposalsHtml =
            proposalHtmlBlocks.length > 0
                ? `<div dir="rtl" style="margin-top:1.25em;font-family:sans-serif;line-height:1.55;color:#222;">${proposalHtmlBlocks.join('')}</div>`
                : '';

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
        const html = `${mainHtml}${proposalsHtml}${footerHtml}`;

        setIsSubmitting(true);
        try {
            let userEmailAttachments: SendNotificationEmailAttachment[] = [];
            const selectedAttachmentRows = attachments.filter((row) => row.trim());
            if (selectedAttachmentRows.length) {
                try {
                    userEmailAttachments = await buildComposeEmailAttachments(
                        selectedAttachmentRows,
                        localAttachmentFiles,
                        clientAttachmentsById,
                    );
                } catch (attachErr: unknown) {
                    setSubmitError(
                        attachErr instanceof Error ? attachErr.message : 'הכנת הקבצים המצורפים נכשלה',
                    );
                    setIsSubmitting(false);
                    return;
                }
                if (selectedAttachmentRows.length && userEmailAttachments.length === 0) {
                    setSubmitError('לא ניתן לצרף את הקבצים שנבחרו — נסו שוב או בחרו קבצים אחרים');
                    setIsSubmitting(false);
                    return;
                }
            }
            if (userEmailAttachments.length) {
                try {
                    userEmailAttachments = await applyClientLogoToEmailAttachments(userEmailAttachments);
                } catch (logoErr: unknown) {
                    setSubmitError(
                        logoErr instanceof Error ? logoErr.message : 'הוספת לוגו לקבצים המצורפים נכשלה',
                    );
                    setIsSubmitting(false);
                    return;
                }
            }
            let emailAttachments = [...userEmailAttachments, ...proposalPdfAttachments];

            const emailResults: {
                to: string;
                notificationMessageId?: string | null;
                providerMessageId?: string | null;
            }[] = [];
            for (const toEmail of toEmails) {
                const matchRecipient =
                    crmRecipientsForLog.find(
                        (r) => String(r.email || '').trim().toLowerCase() === toEmail.toLowerCase(),
                    ) || crmRecipientsForLog[0];
                const sendResult = await sendNotificationEmail({
                    toEmail,
                    subject: subject.trim(),
                    text: textOut,
                    html,
                    isTask: false,
                    messageType: 'message',
                    attachments: emailAttachments.length ? emailAttachments : undefined,
                    taskPayload: {
                        source: 'SendMessageModal',
                        candidateId: resolvedCandidateId,
                        candidateName: effectiveName,
                        bulkRecipientCount: toEmails.length,
                        templateId: selectedTemplateId || null,
                        jobId: selectedJobId || null,
                        composeScope: composeScope,
                        templateLabel: templateFooterLine || null,
                        jobLabel: jobFooterLine || null,
                        linkedClientId: matchRecipient?.clientId || linkedClientId || null,
                        linkedOrganizationId: matchRecipient?.organizationId || linkedOrganizationId || null,
                        linkedContactId: resolveContactIdForLog(matchRecipient),
                        linkedContactName: matchRecipient?.name || effectiveName,
                        proposalTemplateIds: selectedProposalTemplates.map((t) => t.id),
                        proposalTemplateNames: selectedProposalTemplates.map((t) => t.name),
                        attachmentCount: emailAttachments.length,
                        attachmentNames: emailAttachments.map((a) => a.filename),
                    },
                });
                emailResults.push({
                    to: toEmail,
                    notificationMessageId: sendResult.notificationMessageId ?? null,
                    providerMessageId: sendResult.messageId ?? null,
                });
            }
            await logCrmOutboundEvents({
                channel: 'email',
                body: textOut,
                subject: subject.trim(),
                emailResults,
                emailAttachments,
                proposalTemplateNames: selectedProposalTemplates.length
                    ? selectedProposalTemplates.map((t) => t.name)
                    : undefined,
                isProposal: selectedProposalTemplates.length > 0,
            });
            onClose();
        } catch (err: unknown) {
            setSubmitError(err instanceof Error ? err.message : 'שליחת המייל נכשלה');
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleRecipientId = (id: string) => {
        setSelectedRecipientIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
        });
    };

    const openCustomEmailInput = () => {
        setCustomEmailInputOpen(true);
        setSubmitError(null);
        window.setTimeout(() => customEmailInputRef.current?.focus(), 0);
    };

    const commitCustomEmail = () => {
        const raw = customEmailDraft.trim();
        if (!raw) {
            setCustomEmailInputOpen(false);
            setCustomEmailDraft('');
            return;
        }
        const email = raw.toLowerCase();
        if (!EMAIL_RE.test(email)) {
            setSubmitError('כתובת מייל לא תקינה');
            return;
        }
        const existing = collectRecipientEmailsFromBulkField(effectiveEmail, null);
        if (existing.includes(email)) {
            setCustomEmailDraft('');
            setCustomEmailInputOpen(false);
            setSubmitError(null);
            return;
        }
        setCustomRecipientEmails((prev) => [...prev, email]);
        setCustomEmailDraft('');
        setCustomEmailInputOpen(false);
        setSubmitError(null);
    };

    const removeCustomEmail = (email: string) => {
        setCustomRecipientEmails((prev) => prev.filter((e) => e !== email));
    };

    const renderRecipientPickerRow = (opt: MessageRecipientOption) => {
        const checked = selectedRecipientIds.includes(opt.id);
        const hasEmail = Boolean(resolveRecipientEmail(opt.email, opt.phone));
        const hasPhone = Boolean(String(opt.phone || '').replace(/\D/g, '').length >= 9);
        const channelOk = mode === 'email' ? hasEmail : hasPhone;
        const channelLabel =
            mode === 'email'
                ? (opt.email?.trim() || 'אין מייל')
                : (opt.phone?.trim() || 'אין טלפון');
        return (
            <li key={opt.id}>
                <label
                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border-subtle/60 last:border-b-0 ${
                        checked ? 'bg-primary-50/80' : ''
                    } ${!channelOk ? 'opacity-60' : ''}`}
                >
                    <input
                        type="checkbox"
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                        checked={checked}
                        onChange={() => toggleRecipientId(opt.id)}
                    />
                    <span className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {recipientInitial(opt.name)}
                    </span>
                    <span className="min-w-0 flex-1 text-right">
                        <span className="flex items-center justify-end gap-2 flex-wrap">
                            <span className="font-semibold text-text-default truncate">{opt.name}</span>
                            {!channelOk ? (
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">
                                    {mode === 'email' ? 'חסר מייל' : 'חסר טלפון'}
                                </span>
                            ) : null}
                        </span>
                        {opt.subtitle ? (
                            <span className="block text-xs text-text-muted truncate mt-0.5">{opt.subtitle}</span>
                        ) : null}
                        <span className="flex items-center justify-end gap-1 text-xs text-text-subtle mt-0.5 truncate">
                            {mode === 'email' ? (
                                <EnvelopeIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            ) : (
                                <PhoneIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            )}
                            <span className="truncate">{channelLabel}</span>
                        </span>
                    </span>
                </label>
            </li>
        );
    };

    const handleAttachmentChange = (index: number, value: string) => {
        if (value === ATTACH_UPLOAD_OPTION) {
            pendingAttachmentUploadRowRef.current = index;
            attachmentFileInputRef.current?.click();
            return;
        }
        const newAttachments = [...attachments];
        const prev = newAttachments[index];
        if (prev.startsWith(ATTACH_LOCAL_PREFIX)) {
            const prevKey = prev.slice(ATTACH_LOCAL_PREFIX.length);
            setLocalAttachmentFiles((files) => {
                const next = { ...files };
                delete next[prevKey];
                return next;
            });
        }
        newAttachments[index] = value;
        setAttachments(newAttachments);
    };

    const handleLocalAttachmentSelected = (file: File, rowIndex?: number) => {
        const key = newLocalAttachmentKey();
        setAttachments((prev) => {
            const next = [...prev];
            const index =
                rowIndex != null && rowIndex >= 0 && rowIndex < next.length
                    ? rowIndex
                    : next.length - 1;
            const existing = next[index];
            setLocalAttachmentFiles((files) => {
                const cleaned = { ...files, [key]: file };
                if (existing?.startsWith(ATTACH_LOCAL_PREFIX)) {
                    delete cleaned[existing.slice(ATTACH_LOCAL_PREFIX.length)];
                }
                return cleaned;
            });
            next[index] = `${ATTACH_LOCAL_PREFIX}${key}`;
            return next;
        });
    };

    const addAttachmentRow = () => {
        setAttachments([...attachments, '']);
    };

    const removeAttachmentRow = (index: number) => {
        const row = attachments[index];
        if (row.startsWith(ATTACH_LOCAL_PREFIX)) {
            const key = row.slice(ATTACH_LOCAL_PREFIX.length);
            setLocalAttachmentFiles((files) => {
                const next = { ...files };
                delete next[key];
                return next;
            });
        }
        const newAttachments = attachments.filter((_, i) => i !== index);
        setAttachments(newAttachments.length > 0 ? newAttachments : ['']);
    };

    const openLocalAttachmentUpload = () => {
        setAttachments((prev) => {
            pendingAttachmentUploadRowRef.current = prev.length;
            return [...prev, ''];
        });
        window.setTimeout(() => attachmentFileInputRef.current?.click(), 0);
    };

    const handleProposalAttachmentChange = (index: number, value: string) => {
        const next = [...proposalAttachmentIds];
        next[index] = value;
        setProposalAttachmentIds(next);
        setProposalRowCustomizations((prev) => {
            if (!prev[index]) return prev;
            const copy = { ...prev };
            delete copy[index];
            return copy;
        });
        if (proposalEditModal?.rowIndex === index) closeProposalEditModal();
    };

    const addProposalAttachmentRow = () => {
        setProposalAttachmentIds([...proposalAttachmentIds, '']);
    };

    const removeProposalAttachmentRow = (index: number) => {
        const next = proposalAttachmentIds.filter((_, i) => i !== index);
        setProposalAttachmentIds(next.length > 0 ? next : ['']);
        setProposalRowCustomizations((prev) => {
            const rebuilt: Record<number, ProposalRowCustomization> = {};
            let newIdx = 0;
            for (let oldIdx = 0; oldIdx < proposalAttachmentIds.length; oldIdx += 1) {
                if (oldIdx === index) continue;
                if (prev[oldIdx]) rebuilt[newIdx] = prev[oldIdx];
                newIdx += 1;
            }
            return rebuilt;
        });
        if (proposalEditModal?.rowIndex === index) closeProposalEditModal();
    };

    const openProposalEdit = (index: number) => {
        const tplId = String(proposalAttachmentIds[index] || '').trim();
        const tpl = proposalTemplates.find((t) => t.id === tplId);
        if (!tpl) return;
        setProposalEditDraft(resolveProposalBodyHtml(tpl, index));
        setProposalEditModal({ rowIndex: index, templateName: tpl.name });
    };

    const saveProposalEdit = () => {
        if (!proposalEditModal) return;
        setProposalRowCustomizations((prev) => ({
            ...prev,
            [proposalEditModal.rowIndex]: {
                ...prev[proposalEditModal.rowIndex],
                contentOverride: proposalEditDraft,
            },
        }));
        closeProposalEditModal();
    };

    const toggleProposalSendAsPdf = (index: number) => {
        setProposalRowCustomizations((prev) => ({
            ...prev,
            [index]: {
                ...prev[index],
                sendAsPdf: !prev[index]?.sendAsPdf,
            },
        }));
    };

    const scopeHint =
        composeScope === 'admin' ? 'תבניות מערכת (Hiro)' : composeScope === 'client' ? 'תבניות הארגון' : '';

    const templatesErrBlocksHints = !!(templatesError && !isSilentComposeFetchError(templatesError));
    const jobsErrBlocksHints = !!(jobsError && !isSilentComposeFetchError(jobsError));

    if (!isOpen) return null;

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
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <label className="block text-sm font-semibold text-text-muted">נמען:</label>
                                    {mode === 'email' ? (
                                        <button
                                            type="button"
                                            onClick={openCustomEmailInput}
                                            className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-md px-2 py-1 transition-colors"
                                            title="הוסף כתובת מייל חופשית"
                                            aria-label="הוסף כתובת מייל חופשית"
                                        >
                                            <PlusIcon className="w-3.5 h-3.5" />
                                            מייל
                                        </button>
                                    ) : null}
                                </div>

                                {(selectedRecipients.length > 0 || customRecipientEmails.length > 0) && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                        {selectedRecipients.map((r) => (
                                            <span
                                                key={r.id}
                                                className="inline-flex items-center gap-1 max-w-full text-xs font-semibold bg-primary-50 text-primary-800 border border-primary-200 rounded-full pl-1 pr-2.5 py-1"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRecipientId(r.id)}
                                                    className="w-5 h-5 rounded-full hover:bg-primary-100 flex items-center justify-center shrink-0"
                                                    aria-label={`הסר ${r.name}`}
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                </button>
                                                <span className="truncate">
                                                    {r.name}
                                                    {mode === 'email' && r.email ? (
                                                        <span className="font-normal text-primary-700/80"> · {r.email}</span>
                                                    ) : null}
                                                </span>
                                            </span>
                                        ))}
                                        {customRecipientEmails.map((email) => (
                                            <span
                                                key={email}
                                                className="inline-flex items-center gap-1 max-w-full text-xs font-semibold bg-secondary-50 text-secondary-800 border border-secondary-200 rounded-full pl-1 pr-2.5 py-1"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => removeCustomEmail(email)}
                                                    className="w-5 h-5 rounded-full hover:bg-secondary-100 flex items-center justify-center shrink-0"
                                                    aria-label={`הסר ${email}`}
                                                >
                                                    <XMarkIcon className="w-3 h-3" />
                                                </button>
                                                <EnvelopeIcon className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                                <span className="truncate">{email}</span>
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {mode === 'email' && customEmailInputOpen ? (
                                    <div className="flex items-center gap-2 mb-2">
                                        <input
                                            ref={customEmailInputRef}
                                            type="email"
                                            dir="ltr"
                                            value={customEmailDraft}
                                            onChange={(e) => setCustomEmailDraft(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    commitCustomEmail();
                                                }
                                                if (e.key === 'Escape') {
                                                    setCustomEmailInputOpen(false);
                                                    setCustomEmailDraft('');
                                                }
                                            }}
                                            placeholder="name@example.com"
                                            className="flex-1 min-w-0 bg-bg-input border border-border-default text-text-default text-sm rounded-lg px-2.5 py-2"
                                            autoComplete="off"
                                            aria-label="כתובת מייל חופשית"
                                        />
                                        <button
                                            type="button"
                                            onClick={commitCustomEmail}
                                            className="shrink-0 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-bold hover:bg-primary-700"
                                        >
                                            הוסף
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCustomEmailInputOpen(false);
                                                setCustomEmailDraft('');
                                            }}
                                            className="shrink-0 p-2 rounded-lg text-text-muted hover:bg-bg-hover"
                                            aria-label="ביטול"
                                        >
                                            <XMarkIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : null}

                                {hasRecipientPicker ? (
                                    <div className="relative" ref={recipientPickerRef}>
                                        <button
                                            type="button"
                                            onClick={() => setRecipientPickerOpen((o) => !o)}
                                            className="w-full flex items-center justify-between gap-2 bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 text-right"
                                            aria-haspopup="listbox"
                                            aria-expanded={recipientPickerOpen}
                                        >
                                            <span className="truncate flex-1 text-text-muted">
                                                {selectedRecipients.length === 0
                                                    ? 'בחרו אנשי קשר מהרשימה…'
                                                    : `${selectedRecipients.length} אנשי קשר נבחרו`}
                                            </span>
                                            <ChevronDownIcon className={`w-4 h-4 flex-shrink-0 transition-transform ${recipientPickerOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {recipientPickerOpen && (
                                            <div
                                                className="absolute z-50 mt-1 w-full rounded-lg border border-border-default bg-bg-card shadow-lg flex flex-col max-h-80 overflow-hidden"
                                                role="listbox"
                                                aria-multiselectable="true"
                                            >
                                                <div className="p-2 border-b border-border-default flex items-center gap-2 bg-bg-subtle/40">
                                                    <MagnifyingGlassIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
                                                    <input
                                                        type="search"
                                                        value={recipientSearchQuery}
                                                        onChange={(e) => setRecipientSearchQuery(e.target.value)}
                                                        placeholder="חיפוש לפי שם, חברה, מייל או טלפון…"
                                                        className="flex-1 min-w-0 bg-bg-input border border-border-default text-text-default text-sm rounded-md px-2 py-1.5"
                                                        autoComplete="off"
                                                        aria-label="חיפוש איש קשר"
                                                        onMouseDown={(e) => e.stopPropagation()}
                                                    />
                                                </div>
                                                <ul className="overflow-y-auto py-1 text-sm">
                                                    {recipientPickerSections.selectedGroups.length > 0 ? (
                                                        <>
                                                            <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary-700 bg-primary-50/70 sticky top-0 z-10">
                                                                נבחרו ({selectedRecipients.length})
                                                            </li>
                                                            {recipientPickerSections.selectedGroups.map(([groupName, opts]) => (
                                                                <React.Fragment key={`selected-${groupName}`}>
                                                                    {recipientPickerSections.selectedGroups.length > 1 ||
                                                                    recipientPickerSections.unselectedGroups.length > 0 ? (
                                                                        <li className="px-3 py-1 text-[10px] font-semibold text-text-muted bg-bg-subtle/50">
                                                                            {groupName}
                                                                        </li>
                                                                    ) : null}
                                                                    {opts.map((opt) => renderRecipientPickerRow(opt))}
                                                                </React.Fragment>
                                                            ))}
                                                        </>
                                                    ) : null}
                                                    {recipientPickerSections.unselectedGroups.map(([groupName, opts]) => (
                                                        <React.Fragment key={`all-${groupName}`}>
                                                            {(recipientPickerSections.selectedGroups.length > 0 ||
                                                                recipientPickerSections.unselectedGroups.length > 1 ||
                                                                groupName !== 'ללא ארגון') && (
                                                                <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted bg-bg-subtle/70 sticky top-0 z-10">
                                                                    {groupName}
                                                                </li>
                                                            )}
                                                            {opts.map((opt) => renderRecipientPickerRow(opt))}
                                                        </React.Fragment>
                                                    ))}
                                                </ul>
                                                {filteredRecipientOptions.length === 0 && (
                                                    <div className="px-3 py-4 text-center text-text-subtle text-xs">
                                                        לא נמצאו אנשי קשר
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={recipientSummary}
                                            disabled
                                            className="w-full bg-bg-subtle/50 border border-border-default text-text-muted text-sm rounded-lg p-2.5"
                                        />
                                        {!resolveRecipientEmail(candidateEmail, candidatePhone) &&
                                        customRecipientEmails.length === 0 &&
                                        mode === 'email' ? (
                                            <p className="text-xs text-amber-700">
                                                אין מייל לנמען — לחץ «+ מייל» כדי להוסיף כתובת ידנית.
                                            </p>
                                        ) : null}
                                    </div>
                                )}
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
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-text-subtle mt-1">
                                <span>{content.length} / 5000</span>
                                {config.channel === 'sms' && content.length > 0 ? (
                                    <span
                                        className={
                                            smsBillableCount > 1
                                                ? 'text-amber-700 font-medium'
                                                : ''
                                        }
                                        title="חיוב InforU: כל 201 תווים (או חלק מהם) = הודעה אחת"
                                    >
                                        {smsBillableCount === 1
                                            ? '1 הודעה'
                                            : `${smsBillableCount} הודעות`}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {config.allowAttachments && (
                            <div className="bg-bg-subtle/30 p-3 rounded-xl border border-border-subtle">
                                <label className="block text-sm font-semibold text-text-muted mb-2">קבצים וצרופות:</label>
                                <input
                                    ref={attachmentFileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        const rowIndex = pendingAttachmentUploadRowRef.current;
                                        pendingAttachmentUploadRowRef.current = null;
                                        if (file) handleLocalAttachmentSelected(file, rowIndex ?? undefined);
                                        e.target.value = '';
                                    }}
                                />
                                {!effectiveClientId && (
                                    <p className="text-xs text-text-subtle mb-2">
                                        לא ניתן לטעון צרופות מהמאגר — חסר הקשר לקוח. ניתן עדיין להעלות קובץ מהמחשב.
                                    </p>
                                )}
                                {effectiveClientId && clientAttachmentsLoading && (
                                    <p className="text-xs text-text-subtle mb-2">טוען צרופות מהגדרות החברה…</p>
                                )}
                                {clientAttachmentsError && !isSilentComposeFetchError(clientAttachmentsError) && (
                                    <p className="text-xs text-red-600 mb-2">{clientAttachmentsError}</p>
                                )}
                                {effectiveClientId && !clientAttachmentsLoading && clientAttachments.length === 0 && !clientAttachmentsError && (
                                    <p className="text-xs text-text-subtle mb-2">
                                        אין צרופות במאגר — ניתן להוסיף בהגדרות → צרופות ותמונות שנוצרו, או להעלות מהמחשב.
                                    </p>
                                )}
                                <div className="space-y-2">
                                    {attachments.map((att, index) => {
                                        const isLocal = att.startsWith(ATTACH_LOCAL_PREFIX);
                                        const localKey = isLocal ? att.slice(ATTACH_LOCAL_PREFIX.length) : '';
                                        const localFile = isLocal ? localAttachmentFiles[localKey] : null;
                                        return (
                                        <div key={`${index}-${att || 'empty'}`} className="flex items-center gap-2">
                                            <PaperClipIcon className="w-5 h-5 text-text-muted flex-shrink-0"/>
                                            {isLocal && localFile ? (
                                                <div className="flex-grow min-w-0 flex items-center gap-2 bg-bg-input border border-border-default text-text-default text-sm rounded-lg px-2.5 py-2">
                                                    <span className="truncate font-medium">{localFile.name}</span>
                                                    <span className="text-xs text-text-subtle shrink-0">
                                                        {formatAttachmentSize(Math.max(1, Math.round(localFile.size / 1024)))}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-secondary-700 bg-secondary-50 border border-secondary-200 rounded px-1.5 py-0.5 shrink-0">
                                                        מהמחשב
                                                    </span>
                                                </div>
                                            ) : (
                                                <select
                                                    value={att}
                                                    onChange={e => handleAttachmentChange(index, e.target.value)}
                                                    disabled={!effectiveClientId && clientAttachments.length === 0}
                                                    className="flex-grow bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 disabled:opacity-60"
                                                >
                                                    <option value="">בחר קובץ מהמאגר…</option>
                                                    {clientAttachments.map((item) => (
                                                        <option key={item.id} value={`${ATTACH_LIB_PREFIX}${item.id}`}>
                                                            {item.name}
                                                            {item.fileSize ? ` (${formatAttachmentSize(item.fileSize)})` : ''}
                                                        </option>
                                                    ))}
                                                    <option value={ATTACH_UPLOAD_OPTION}>העלאה מהמחשב…</option>
                                                </select>
                                            )}

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
                                    )})}
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={addAttachmentRow}
                                        className="flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                        הוסף מהמאגר
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openLocalAttachmentUpload()}
                                        className="flex items-center gap-1.5 text-xs font-bold text-secondary-700 hover:text-secondary-800 hover:bg-secondary-50 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                                        העלאה מהמחשב
                                    </button>
                                </div>

                                <div className="mt-4 pt-4 border-t border-border-subtle space-y-2">
                                    <label className="block text-sm font-semibold text-text-muted mb-1">הצעות מחיר:</label>
                                    {!effectiveClientId && (
                                        <p className="text-xs text-text-subtle">
                                            לא ניתן לטעון תבניות — חסר הקשר לקוח (שליחה מאיש קשר / לקוח).
                                        </p>
                                    )}
                                    {effectiveClientId && proposalTemplatesLoading && (
                                        <p className="text-xs text-text-subtle">טוען תבניות הצעת מחיר…</p>
                                    )}
                                    {proposalTemplatesError && !isSilentComposeFetchError(proposalTemplatesError) && (
                                        <p className="text-xs text-red-600">{proposalTemplatesError}</p>
                                    )}
                                    {effectiveClientId && !proposalTemplatesLoading && proposalTemplates.length === 0 && !proposalTemplatesError && (
                                        <p className="text-xs text-text-subtle">
                                            אין תבניות הצעת מחיר ללקוח זה — ניתן להגדיר בהגדרות → תבניות הצעת מחיר.
                                        </p>
                                    )}
                                    {proposalAttachmentIds.map((proposalId, index) => (
                                        <div key={`proposal-${index}`} className="flex items-center gap-2">
                                            <DocumentTextIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
                                            <select
                                                value={proposalId}
                                                onChange={(e) => handleProposalAttachmentChange(index, e.target.value)}
                                                disabled={!effectiveClientId || proposalTemplatesLoading || proposalTemplates.length === 0}
                                                className="flex-grow bg-bg-input border border-border-default text-text-default text-sm rounded-lg p-2.5 disabled:opacity-60"
                                            >
                                                <option value="">בחר תבנית הצעת מחיר…</option>
                                                {proposalTemplates.map((tpl) => (
                                                    <option key={tpl.id} value={tpl.id}>
                                                        {tpl.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {proposalId && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => openProposalEdit(index)}
                                                        title="עריכת תוכן להודעה זו בלבד"
                                                        aria-label="עריכת תוכן הצעת מחיר"
                                                        className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                                                            proposalRowCustomizations[index]?.contentOverride !== undefined
                                                                ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                                                                : 'text-text-subtle hover:text-primary-600 hover:bg-primary-50'
                                                        }`}
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleProposalSendAsPdf(index)}
                                                        title="שליחה כקובץ PDF מצורף"
                                                        aria-label="שליחה כ-PDF"
                                                        aria-pressed={Boolean(proposalRowCustomizations[index]?.sendAsPdf)}
                                                        className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                                                            proposalRowCustomizations[index]?.sendAsPdf
                                                                ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                                                                : 'text-text-subtle hover:text-primary-600 hover:bg-primary-50'
                                                        }`}
                                                    >
                                                        <DocumentIcon className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                            {(proposalAttachmentIds.length > 1 || proposalId !== '') && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeProposalAttachmentRow(index)}
                                                    className="p-2 text-text-subtle hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={addProposalAttachmentRow}
                                        disabled={!effectiveClientId || proposalTemplatesLoading || proposalTemplates.length === 0}
                                        className="mt-1 flex items-center gap-1.5 text-xs font-bold text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        <PlusIcon className="w-3.5 h-3.5" />
                                        הוספת הצעת מחיר
                                    </button>
                                </div>
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
                                      : isSubmitting && mode === 'sms'
                                        ? 'שולח…'
                                        : config.buttonText}
                            </span>
                        </button>
                    </footer>
                </form>
                <style>{`@keyframes modalFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
            </div>
            {proposalEditModal && (
                <div
                    className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/40"
                    onClick={closeProposalEditModal}
                    dir="rtl"
                >
                    <div
                        className="bg-bg-card rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col text-text-default"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="proposal-edit-title"
                    >
                        <header className="flex items-center justify-between p-4 border-b border-border-default flex-shrink-0">
                            <h3 id="proposal-edit-title" className="text-lg font-bold">
                                עריכת {proposalEditModal.templateName}
                            </h3>
                            <button
                                type="button"
                                onClick={closeProposalEditModal}
                                className="p-2 rounded-full text-text-muted hover:bg-bg-hover"
                                aria-label="סגור"
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </header>
                        <div className="p-4 overflow-y-auto flex-1 min-h-0">
                            <p className="text-xs text-text-subtle mb-3">
                                השינויים חלים רק על מייל זה — התבנית המקורית לא תישמר.
                            </p>
                            <RichTextArea
                                key={proposalEditModal.rowIndex}
                                value={proposalEditDraft}
                                onChange={setProposalEditDraft}
                                fullToolbar
                                minHeight="280px"
                                className="border border-border-default rounded-lg bg-white"
                                toolbarClassName="bg-bg-subtle/40"
                            />
                        </div>
                        <footer className="flex justify-end gap-2 p-4 border-t border-border-default flex-shrink-0">
                            <button
                                type="button"
                                onClick={closeProposalEditModal}
                                className="px-4 py-2 text-sm font-semibold text-text-muted hover:bg-bg-hover rounded-lg transition-colors"
                            >
                                ביטול
                            </button>
                            <button
                                type="button"
                                onClick={saveProposalEdit}
                                className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
                            >
                                שמירה
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SendMessageModal;
