
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    PlusIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    TrashIcon,
    EnvelopeIcon,
    ChatBubbleBottomCenterTextIcon,
    WhatsappIcon,
    PaperClipIcon,
    XMarkIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchClientMessageTemplates,
    createClientMessageTemplate,
    updateClientMessageTemplate,
    deleteClientMessageTemplate,
    uploadClientMessageTemplateAttachment,
    type MessageTemplateDto,
} from '../services/messageTemplatesApi';
import { messageTemplateParameters } from '../services/messageTemplatePlaceholders';

export { messageTemplateParameters };

const ADMIN_MESSAGE_TEMPLATES_CLIENT_KEY = 'hiro.admin.messageTemplates.clientId';
interface Template {
    id: string;
    templateKey: string | null;
    name: string;
    subject: string;
    content: string;
    lastUpdated: string | null;
    updatedBy: string;
    channels: ('email' | 'sms' | 'whatsapp')[];
    isSystem: boolean;
    attachmentUrl?: string | null;
    attachmentFileName?: string | null;
    attachmentContentType?: string | null;
    attachmentFileSize?: number | null;
}

function dtoToTemplate(row: MessageTemplateDto): Template {
    return {
        id: row.id,
        templateKey: row.templateKey,
        name: row.name,
        subject: row.subject,
        content: row.content,
        lastUpdated: row.lastUpdated,
        updatedBy: row.updatedBy,
        channels: row.channels?.length ? row.channels : ['email'],
        isSystem: row.isSystem,
        attachmentUrl: row.attachmentUrl ?? null,
        attachmentFileName: row.attachmentFileName ?? null,
        attachmentContentType: row.attachmentContentType ?? null,
        attachmentFileSize: row.attachmentFileSize ?? null,
    };
}

export function formatMessageTemplateDisplayDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('he-IL');
    } catch {
        return iso;
    }
}

const formatAttachmentSize = (bytes: number | null | undefined) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// --- SUB-COMPONENTS ---
const TemplateForm: React.FC<{
    template: Partial<Template> | null;
    onSave: (
        template: Partial<Template>,
        opts?: { pendingFile?: File | null; removeAttachment?: boolean },
    ) => void | Promise<void>;
    onCancel: () => void;
    saving?: boolean;
}> = ({ template, onSave, onCancel, saving }) => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState<Partial<Template>>(
        template || { name: '', subject: '', content: '', channels: ['email'] },
    );
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [removeAttachment, setRemoveAttachment] = useState(false);

    useEffect(() => {
        setFormData(template || { name: '', subject: '', content: '', channels: ['email'] });
        setPendingFile(null);
        setRemoveAttachment(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [template]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleChannelChange = (channel: 'email' | 'sms' | 'whatsapp') => {
        setFormData((prev) => {
            const currentChannels = prev.channels || [];
            const newChannels = currentChannels.includes(channel)
                ? currentChannels.filter((c) => c !== channel)
                : [...currentChannels, channel];
            return { ...prev, channels: newChannels.length ? newChannels : ['email'] };
        });
    };

    const handleInsertParam = (param: string) => {
        if (!contentRef.current) return;
        const { selectionStart, selectionEnd, value } = contentRef.current;
        const newContent = value.substring(0, selectionStart) + param + value.substring(selectionEnd);
        setFormData((prev) => ({ ...prev, content: newContent }));

        setTimeout(() => {
            if (contentRef.current) {
                contentRef.current.focus();
                contentRef.current.selectionStart = contentRef.current.selectionEnd = selectionStart + param.length;
            }
        }, 0);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const len = formData.content?.length ?? 0;
        if (len > 5000) return;
        await onSave(formData, { pendingFile, removeAttachment });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) {
            window.alert('גודל הקובץ המקסימלי הוא 15MB');
            e.target.value = '';
            return;
        }
        setPendingFile(file);
        setRemoveAttachment(false);
    };

    const hasExistingAttachment = Boolean(formData.attachmentUrl && !removeAttachment);
    const displayAttachmentName = pendingFile?.name || formData.attachmentFileName || 'קובץ מצורף';
    const displayAttachmentSize = pendingFile?.size ?? formData.attachmentFileSize ?? null;

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-bold text-text-default">{template?.id ? t('templates.edit_title') : t('templates.create_title')}</h2>

            <div className="bg-bg-card border border-border-default rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_name')}*</label>
                        <input
                            name="name"
                            value={formData.name ?? ''}
                            onChange={handleChange}
                            required
                            className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-semibold text-text-muted">{t('templates.channels')}</label>
                        <div className="flex items-center gap-3">
                            {(
                                [
                                    ['email', <EnvelopeIcon key="e" />],
                                    ['sms', <ChatBubbleBottomCenterTextIcon key="s" />],
                                    ['whatsapp', <WhatsappIcon key="w" />],
                                ] as const
                            ).map(([channel, icon]) => (
                                <button
                                    type="button"
                                    key={channel}
                                    onClick={() => handleChannelChange(channel)}
                                    className={`p-2 rounded-lg border-2 transition ${
                                        formData.channels?.includes(channel)
                                            ? 'bg-primary-50 border-primary-500 text-primary-600'
                                            : 'bg-bg-subtle border-transparent text-text-muted hover:border-border-default'
                                    }`}
                                >
                                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_subject')}*</label>
                    <input
                        name="subject"
                        value={formData.subject ?? ''}
                        onChange={handleChange}
                        required
                        className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_content')}*</label>
                    <textarea
                        ref={contentRef}
                        name="content"
                        value={formData.content ?? ''}
                        onChange={handleChange}
                        required
                        rows={8}
                        maxLength={5000}
                        className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                    />
                    <div className="text-xs text-text-subtle text-left mt-1">
                        {formData.content?.length || 0} / 5000
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_attachment')}</label>
                    <p className="text-xs text-text-subtle mb-2">{t('templates.attachment_hint')}</p>
                    {(hasExistingAttachment || pendingFile) && (
                        <div className="flex items-center justify-between gap-3 p-3 mb-3 rounded-lg border border-border-default bg-bg-subtle">
                            <div className="flex items-center gap-2 min-w-0">
                                <PaperClipIcon className="w-4 h-4 text-primary-600 flex-shrink-0" />
                                {hasExistingAttachment && formData.attachmentUrl && !pendingFile ? (
                                    <a
                                        href={formData.attachmentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm font-medium text-primary-700 hover:underline truncate"
                                    >
                                        {displayAttachmentName}
                                    </a>
                                ) : (
                                    <span className="text-sm font-medium text-text-default truncate">{displayAttachmentName}</span>
                                )}
                                {displayAttachmentSize ? (
                                    <span className="text-xs text-text-muted flex-shrink-0">
                                        ({formatAttachmentSize(displayAttachmentSize)})
                                    </span>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPendingFile(null);
                                    setRemoveAttachment(true);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                }}
                                className="p-1.5 rounded-full hover:bg-bg-hover text-text-muted hover:text-red-600 flex-shrink-0"
                                title={t('templates.remove_attachment')}
                            >
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.zip"
                        onChange={handleFileChange}
                        className="block w-full text-sm text-text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-semibold hover:file:bg-primary-100"
                    />
                </div>
            </div>

            <div className="bg-bg-card border border-border-default rounded-lg p-6">
                <h3 className="text-base font-bold text-text-default mb-3">{t('templates.params_title')}</h3>
                <div className="flex flex-wrap gap-2">
                    {messageTemplateParameters.map((param) => (
                        <button
                            key={param.value}
                            type="button"
                            onClick={() => handleInsertParam(param.value)}
                            className="bg-bg-subtle text-text-default text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-primary-100 hover:text-primary-800 transition"
                        >
                            {param.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover"
                >
                    {t('client_form.cancel')}
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                    {saving ? '…' : t('client_form.save')}
                </button>
            </div>
        </form>
    );
};

const MessageTemplatesView: React.FC = () => {
    const { t } = useLanguage();
    const { user, ready: authReady } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const ownClientId = user?.clientId?.trim() || null;
    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

    const [adminClientId, setAdminClientId] = useState<string | null>(() => {
        if (typeof sessionStorage === 'undefined') return null;
        return sessionStorage.getItem(ADMIN_MESSAGE_TEMPLATES_CLIENT_KEY);
    });
    const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [view, setView] = useState<'list' | 'form'>('list');
    const [activeTab, setActiveTab] = useState<'saved' | 'system'>('saved');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const clientId = isPlatformAdmin ? adminClientId : ownClientId;

    const handleAdminClientChange = useCallback((val: string) => {
        const id = val || null;
        setAdminClientId(id);
        setView('list');
        setEditingTemplate(null);
        if (typeof sessionStorage !== 'undefined') {
            if (id) sessionStorage.setItem(ADMIN_MESSAGE_TEMPLATES_CLIENT_KEY, id);
            else sessionStorage.removeItem(ADMIN_MESSAGE_TEMPLATES_CLIENT_KEY);
        }
    }, []);

    useEffect(() => {
        if (!isPlatformAdmin || !apiBase) {
            setClientOptions([]);
            return;
        }
        let cancelled = false;
        setClientsLoading(true);
        fetch(`${apiBase}/api/clients?activeOnly=true`, {
            headers: authHeaders(true),
            cache: 'no-store',
        })
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: unknown) => {
                if (cancelled) return;
                const list = Array.isArray(rows) ? rows : ((rows as { data?: unknown })?.data ?? []);
                const opts = (Array.isArray(list) ? list : [])
                    .map((c: Record<string, unknown>) => ({
                        id: String(c.id ?? ''),
                        label: String(c.displayName || c.name || '').trim(),
                    }))
                    .filter((o) => o.id && o.label)
                    .sort((a, b) => a.label.localeCompare(b.label, 'he'));
                setClientOptions(opts);
            })
            .catch(() => {
                if (!cancelled) setClientOptions([]);
            })
            .finally(() => {
                if (!cancelled) setClientsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiBase, isPlatformAdmin]);

    useEffect(() => {
        if (!isPlatformAdmin || adminClientId || !clientOptions.length) return;
        const saved =
            typeof sessionStorage !== 'undefined'
                ? sessionStorage.getItem(ADMIN_MESSAGE_TEMPLATES_CLIENT_KEY)
                : null;
        const savedValid = saved && clientOptions.some((o) => o.id === saved);
        handleAdminClientChange(savedValid ? saved! : clientOptions[0].id);
    }, [isPlatformAdmin, adminClientId, clientOptions, handleAdminClientChange]);

    const reload = useCallback(async () => {
        setLoadError(null);
        setLoading(true);
        try {
            if (!clientId) {
                setTemplates([]);
                setLoadError(
                    isPlatformAdmin
                        ? 'בחר לקוח מהרשימה כדי לצפות ולנהל תבניות הודעה.'
                        : 'אין הקשר חברה — התבניות שייכות לחשבון חברה. לתבניות מערכת השתמש בניהול מערכת.',
                );
                return;
            }
            const rows = await fetchClientMessageTemplates(isPlatformAdmin ? clientId : undefined);
            setTemplates(rows.map(dtoToTemplate));
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'שגיאת טעינה');
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    }, [clientId, isPlatformAdmin]);

    useEffect(() => {
        if (!authReady) return;
        void reload();
    }, [authReady, reload]);

    const filteredTemplates = useMemo(() => {
        const byTab = templates.filter((tpl) => (activeTab === 'system' ? tpl.isSystem : !tpl.isSystem));
        const q = searchTerm.toLowerCase().trim();
        if (!q) return byTab;
        return byTab.filter(
            (tpl) =>
                tpl.name.toLowerCase().includes(q) ||
                tpl.content.toLowerCase().includes(q) ||
                (tpl.subject && tpl.subject.toLowerCase().includes(q)),
        );
    }, [templates, searchTerm, activeTab]);

    const handleEdit = (tpl: Template) => {
        setEditingTemplate(tpl);
        setView('form');
    };

    const handleCreate = () => {
        if (!clientId) {
            window.alert(isPlatformAdmin ? 'יש לבחור לקוח לפני יצירת תבנית' : 'אין הקשר חברה');
            return;
        }
        setEditingTemplate(null);
        setView('form');
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם למחוק את התבנית?')) return;
        try {
            await deleteClientMessageTemplate(id, isPlatformAdmin ? clientId : undefined);
            await reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'מחיקה נכשלה');
        }
    };

    const handleSave = async (
        templateData: Partial<Template>,
        opts?: { pendingFile?: File | null; removeAttachment?: boolean },
    ) => {
        if (!clientId) {
            window.alert(isPlatformAdmin ? 'יש לבחור לקוח לפני שמירת תבנית' : 'אין הקשר חברה');
            return;
        }
        setSaving(true);
        try {
            const scopeClientId = isPlatformAdmin ? clientId : undefined;
            const payload = {
                name: templateData.name ?? '',
                subject: templateData.subject ?? '',
                content: templateData.content ?? '',
                channels: templateData.channels,
            };
            let row: MessageTemplateDto;
            if (templateData.id) {
                row = await updateClientMessageTemplate(
                    templateData.id,
                    {
                        ...payload,
                        ...(opts?.removeAttachment ? { clearAttachment: true } : {}),
                    },
                    scopeClientId,
                );
                if (opts?.pendingFile) {
                    row = await uploadClientMessageTemplateAttachment(
                        templateData.id,
                        opts.pendingFile,
                        scopeClientId,
                    );
                }
                setTemplates((prev) => prev.map((x) => (x.id === row.id ? dtoToTemplate(row) : x)));
            } else {
                row = await createClientMessageTemplate(payload, scopeClientId);
                if (opts?.pendingFile) {
                    row = await uploadClientMessageTemplateAttachment(row.id, opts.pendingFile, scopeClientId);
                }
                setTemplates((prev) => [dtoToTemplate(row), ...prev]);
            }
            setView('list');
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    if (!authReady || (loading && templates.length === 0 && !loadError && (!isPlatformAdmin || !!clientId))) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-6 items-center justify-center text-text-muted min-h-[240px]">
                טוען…
            </div>
        );
    }

    if (!isPlatformAdmin && loadError && !ownClientId) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-6 text-text-default">
                <p className="text-text-muted mb-4">{loadError}</p>
            </div>
        );
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            {isPlatformAdmin ? (
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                    <label className="text-sm font-semibold text-text-muted whitespace-nowrap">לקוח:</label>
                    <select
                        value={adminClientId ?? ''}
                        disabled={clientsLoading}
                        onChange={(e) => handleAdminClientChange(e.target.value)}
                        className="bg-bg-input border border-border-default text-sm rounded-md p-2 min-w-[220px] disabled:opacity-50"
                    >
                        <option value="">— בחר לקוח —</option>
                        {clientOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    {clientsLoading ? (
                        <span className="text-xs text-text-muted">טוען לקוחות...</span>
                    ) : null}
                </div>
            ) : null}
            {loadError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</div>
            )}
            {view === 'list' ? (
                <>
                    <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                        <div>
                            <div className="border-b border-border-default">
                                <nav className="flex items-center -mb-px">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('saved')}
                                        className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${
                                            activeTab === 'saved'
                                                ? 'border-primary-500 text-primary-600'
                                                : 'border-transparent text-text-muted hover:text-text-default'
                                        }`}
                                    >
                                        {t('templates.tab_saved')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('system')}
                                        className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${
                                            activeTab === 'system'
                                                ? 'border-primary-500 text-primary-600'
                                                : 'border-transparent text-text-muted hover:text-text-default'
                                        }`}
                                    >
                                        {t('templates.tab_system')}
                                    </button>
                                </nav>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={!clientId}
                            className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm disabled:opacity-50"
                        >
                            <PlusIcon className="w-5 h-5" />
                            <span>{t('templates.new_template')}</span>
                        </button>
                    </header>

                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-default mb-4">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder={t('templates.search_placeholder')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm"
                            />
                        </div>
                    </div>

                    <main className="flex-1 overflow-y-auto">
                        <div className="overflow-x-auto bg-bg-card rounded-lg border border-border-default">
                            <table className="w-full text-sm text-right min-w-[800px]">
                                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                    <tr>
                                        <th className="p-4">{t('templates.col_name')}</th>
                                        <th className="p-4">{t('templates.col_content')}</th>
                                        <th className="p-4">{t('templates.col_attachment')}</th>
                                        <th className="p-4">{t('templates.col_last_updated')}</th>
                                        <th className="p-4">{t('templates.col_updated_by')}</th>
                                        <th className="p-4">{t('templates.col_actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredTemplates.map((tpl) => (
                                        <tr key={tpl.id} className="hover:bg-bg-hover">
                                            <td className="p-4 font-semibold text-primary-700">{tpl.name}</td>
                                            <td className="p-4 text-text-muted max-w-sm truncate" title={tpl.content}>
                                                {tpl.content}
                                            </td>
                                            <td className="p-4 text-text-muted">
                                                {tpl.attachmentFileName ? (
                                                    <a
                                                        href={tpl.attachmentUrl || '#'}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-primary-700 hover:underline max-w-[180px] truncate"
                                                        title={tpl.attachmentFileName}
                                                    >
                                                        <PaperClipIcon className="w-4 h-4 flex-shrink-0" />
                                                        <span className="truncate">{tpl.attachmentFileName}</span>
                                                    </a>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="p-4 text-text-muted">{formatMessageTemplateDisplayDate(tpl.lastUpdated)}</td>
                                            <td className="p-4 text-text-muted">{tpl.updatedBy || '—'}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEdit(tpl)}
                                                        className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    {!tpl.isSystem && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(tpl.id)}
                                                            className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-red-600"
                                                        >
                                                            <TrashIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!loading && filteredTemplates.length === 0 && (
                                <div className="p-8 text-center text-text-muted">אין תבניות להצגה</div>
                            )}
                        </div>
                    </main>
                </>
            ) : (
                <TemplateForm
                    template={editingTemplate}
                    onSave={handleSave}
                    onCancel={() => setView('list')}
                    saving={saving}
                />
            )}
        </div>
    );
};

export default MessageTemplatesView;
