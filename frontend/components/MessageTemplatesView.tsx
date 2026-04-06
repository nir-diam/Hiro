
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
    PlusIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    TrashIcon,
    EnvelopeIcon,
    ChatBubbleBottomCenterTextIcon,
    WhatsappIcon,
} from './Icons';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import {
    fetchClientMessageTemplates,
    createClientMessageTemplate,
    updateClientMessageTemplate,
    deleteClientMessageTemplate,
    type MessageTemplateDto,
} from '../services/messageTemplatesApi';

// --- TYPES ---
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
}

export const messageTemplateParameters = [
    { label: 'שם פרטי מועמד', value: '{candidate_first_name}' },
    { label: 'שם משפחה מועמד', value: '{candidate_last_name}' },
    { label: 'טלפון מועמד', value: '{candidate_phone}' },
    { label: 'מייל מועמד', value: '{candidate_email}' },
    { label: 'לינק קורות חיים', value: '{candidate_cv_link}' },
    { label: 'תעודת זהות מועמד', value: '{candidate_id}' },
    { label: 'משרות והפניות', value: '{job_referrals}' },
    { label: 'שם חברה', value: '{company_name}' },
    { label: 'שם חברה (לקוח)', value: '{client_name}' },
    { label: 'שם איש קשר', value: '{contact_name}' },
    { label: 'טלפון איש קשר', value: '{contact_phone}' },
    { label: 'מייל איש קשר', value: '{contact_email}' },
    { label: 'כותרת משרה', value: '{job_title}' },
    { label: 'תיאור משרה', value: '{job_description}' },
    { label: 'דרישות משרה', value: '{job_requirements}' },
    { label: 'שם רכז', value: '{recruiter_name}' },
    { label: 'מייל רכז', value: '{recruiter_email}' },
    { label: 'טלפון רכז', value: '{recruiter_phone}' },
    { label: 'תאריך שליחה', value: '{send_date}' },
    { label: 'מדיניות הפרטיות', value: '{privacy_policy_link}' },
    { label: 'כתובת דף תודה', value: '{thank_you_page_link}' },
];

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

// --- SUB-COMPONENTS ---
const TemplateForm: React.FC<{
    template: Partial<Template> | null;
    onSave: (template: Partial<Template>) => void | Promise<void>;
    onCancel: () => void;
    saving?: boolean;
}> = ({ template, onSave, onCancel, saving }) => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState<Partial<Template>>(
        template || { name: '', subject: '', content: '', channels: ['email'] },
    );
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setFormData(template || { name: '', subject: '', content: '', channels: ['email'] });
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
        await onSave(formData);
    };

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
    const [view, setView] = useState<'list' | 'form'>('list');
    const [activeTab, setActiveTab] = useState<'saved' | 'system'>('saved');
    const [templates, setTemplates] = useState<Template[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoadError(null);
        setLoading(true);
        try {
            if (!user?.clientId) {
                setTemplates([]);
                setLoadError('אין הקשר חברה — התבניות שייכות לחשבון חברה. לתבניות מערכת השתמש בניהול מערכת.');
                return;
            }
            const rows = await fetchClientMessageTemplates();
            setTemplates(rows.map(dtoToTemplate));
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'שגיאת טעינה');
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    }, [user?.clientId]);

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
        setEditingTemplate(null);
        setView('form');
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם למחוק את התבנית?')) return;
        try {
            await deleteClientMessageTemplate(id);
            await reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'מחיקה נכשלה');
        }
    };

    const handleSave = async (templateData: Partial<Template>) => {
        setSaving(true);
        try {
            const payload = {
                name: templateData.name ?? '',
                subject: templateData.subject ?? '',
                content: templateData.content ?? '',
                channels: templateData.channels,
            };
            if (templateData.id) {
                const row = await updateClientMessageTemplate(templateData.id, payload);
                setTemplates((prev) => prev.map((x) => (x.id === row.id ? dtoToTemplate(row) : x)));
            } else {
                const row = await createClientMessageTemplate(payload);
                setTemplates((prev) => [dtoToTemplate(row), ...prev]);
            }
            setView('list');
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    if (!authReady || (loading && templates.length === 0 && !loadError)) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-6 items-center justify-center text-text-muted min-h-[240px]">
                טוען…
            </div>
        );
    }

    if (loadError && !user?.clientId) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-6 text-text-default">
                <p className="text-text-muted mb-4">{loadError}</p>
                {user && ['super_admin', 'admin'].includes(user.role || '') && (
                    <p className="text-sm text-text-subtle">
                        ניתן לערוך תבניות Hiro תחת: ניהול מערכת ← ניהול מערכת (הגדרות) ← תבניות הודעה.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
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
                            className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm"
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
