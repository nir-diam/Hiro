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
    fetchMessageTemplateCatalog,
    createMessageTemplateCatalog,
    updateMessageTemplateCatalog,
    deleteMessageTemplateCatalog,
    type MessageTemplateCatalogDto,
} from '../services/messageTemplatesApi';
import { fetchClientOptions, type ClientOptionDto } from '../services/usersApi';
import { messageTemplateParameters, formatMessageTemplateDisplayDate } from './MessageTemplatesView';

interface CatalogRow {
    id: string;
    templateKey: string | null;
    name: string;
    subject: string;
    content: string;
    lastUpdated: string | null;
    updatedBy: string;
    channels: ('email' | 'sms' | 'whatsapp')[];
    isSystem: boolean;
    scope: 'admin' | 'client';
    clientId: string | null;
    clientName: string | null;
}

function dtoToRow(row: MessageTemplateCatalogDto): CatalogRow {
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
        scope: row.scope,
        clientId: row.clientId,
        clientName: row.clientName,
    };
}

const CatalogTemplateForm: React.FC<{
    template: Partial<CatalogRow> | null;
    clients: ClientOptionDto[];
    onSave: (data: Partial<CatalogRow> & { newScope?: 'admin' | 'client'; newClientId?: string }) => void | Promise<void>;
    onCancel: () => void;
    saving?: boolean;
}> = ({ template, clients, onSave, onCancel, saving }) => {
    const { t } = useLanguage();
    const isEdit = Boolean(template?.id);
    const [newScope, setNewScope] = useState<'admin' | 'client'>(template?.scope === 'client' ? 'client' : 'admin');
    const [newClientId, setNewClientId] = useState(template?.clientId || (clients[0]?.id ?? ''));
    const [formData, setFormData] = useState<Partial<CatalogRow>>(
        template || { name: '', subject: '', content: '', channels: ['email'] },
    );
    const contentRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setFormData(template || { name: '', subject: '', content: '', channels: ['email'] });
        setNewScope(template?.scope === 'client' ? 'client' : 'admin');
        setNewClientId(template?.clientId || (clients[0]?.id ?? ''));
    }, [template, clients]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleChannelChange = (channel: 'email' | 'sms' | 'whatsapp') => {
        setFormData((prev) => {
            const currentChannels = prev.channels || [];
            const next = currentChannels.includes(channel)
                ? currentChannels.filter((c) => c !== channel)
                : [...currentChannels, channel];
            return { ...prev, channels: next.length ? next : ['email'] };
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
        await onSave({
            ...formData,
            ...(isEdit ? {} : { newScope, newClientId: newScope === 'client' ? newClientId : undefined }),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-bold text-text-default">
                {template?.id ? t('templates.edit_title') : t('templates.create_title')}
            </h2>

            {isEdit && template && (
                <div className="flex flex-wrap gap-3 text-sm">
                    <span
                        className={`px-3 py-1 rounded-full font-semibold ${
                            template.scope === 'admin' ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-900'
                        }`}
                    >
                        {template.scope === 'admin' ? 'Hiro' : 'חברה'}
                    </span>
                    {template.scope === 'client' && (
                        <span className="px-3 py-1 rounded-full bg-bg-subtle text-text-default">
                            {template.clientName || template.clientId || '—'}
                        </span>
                    )}
                </div>
            )}

            {!isEdit && (
                <div className="bg-bg-card border border-border-default rounded-lg p-6 space-y-4">
                    <p className="text-sm font-semibold text-text-muted">סוג תבנית</p>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="tplScope"
                                checked={newScope === 'admin'}
                                onChange={() => setNewScope('admin')}
                            />
                            <span>Hiro (אדמין — ללא חברה)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                name="tplScope"
                                checked={newScope === 'client'}
                                onChange={() => setNewScope('client')}
                            />
                            <span>חברה (לקוח)</span>
                        </label>
                    </div>
                    {newScope === 'client' && (
                        <div>
                            <label className="block text-sm font-semibold text-text-muted mb-1.5">חברה *</label>
                            <select
                                value={newClientId}
                                onChange={(e) => setNewClientId(e.target.value)}
                                required={newScope === 'client'}
                                className="w-full max-w-md bg-bg-input border border-border-default text-sm rounded-lg p-2.5"
                            >
                                <option value="">— בחרו חברה —</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}

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
                    <div className="text-xs text-text-subtle text-left mt-1">{formData.content?.length || 0} / 5000</div>
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
                <button type="button" onClick={onCancel} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">
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

const AdminMessageTemplatesView: React.FC = () => {
    const { t } = useLanguage();
    const { ready: authReady } = useAuth();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [activeTab, setActiveTab] = useState<'saved' | 'system'>('saved');
    const [rows, setRows] = useState<CatalogRow[]>([]);
    const [clients, setClients] = useState<ClientOptionDto[]>([]);
    const [editing, setEditing] = useState<Partial<CatalogRow> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterKind, setFilterKind] = useState<'all' | 'admin' | 'client'>('all');
    const [filterClientId, setFilterClientId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoadError(null);
        setLoading(true);
        try {
            const [catalog, clientOpts] = await Promise.all([fetchMessageTemplateCatalog(), fetchClientOptions()]);
            setRows(catalog.map(dtoToRow));
            setClients(clientOpts);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : 'שגיאת טעינה');
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!authReady) return;
        void reload();
    }, [authReady, reload]);

    const filteredRows = useMemo(() => {
        let list = rows.filter((r) => (activeTab === 'system' ? r.isSystem : !r.isSystem));
        if (filterKind === 'admin') list = list.filter((r) => r.scope === 'admin');
        if (filterKind === 'client') list = list.filter((r) => r.scope === 'client');
        if (filterClientId) list = list.filter((r) => r.clientId === filterClientId);
        const q = searchTerm.toLowerCase().trim();
        if (!q) return list;
        return list.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                r.content.toLowerCase().includes(q) ||
                (r.subject && r.subject.toLowerCase().includes(q)) ||
                (r.clientName && r.clientName.toLowerCase().includes(q)),
        );
    }, [rows, activeTab, filterKind, filterClientId, searchTerm]);

    const handleDelete = async (id: string) => {
        if (!window.confirm('האם למחוק את התבנית?')) return;
        try {
            await deleteMessageTemplateCatalog(id);
            await reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'מחיקה נכשלה');
        }
    };

    const handleSave = async (
        data: Partial<CatalogRow> & { newScope?: 'admin' | 'client'; newClientId?: string },
    ) => {
        setSaving(true);
        try {
            const payload = {
                name: data.name ?? '',
                subject: data.subject ?? '',
                content: data.content ?? '',
                channels: data.channels,
            };
            if (data.id) {
                const updated = await updateMessageTemplateCatalog(data.id, payload);
                setRows((prev) => prev.map((x) => (x.id === updated.id ? dtoToRow(updated) : x)));
            } else {
                const scope = data.newScope ?? 'admin';
                if (scope === 'client' && !data.newClientId) {
                    window.alert('נא לבחור חברה');
                    return;
                }
                const created = await createMessageTemplateCatalog({
                    scope,
                    clientId: scope === 'client' ? data.newClientId : undefined,
                    ...payload,
                });
                setRows((prev) => [dtoToRow(created), ...prev]);
            }
            setView('list');
            setEditing(null);
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'שמירה נכשלה');
        } finally {
            setSaving(false);
        }
    };

    if (!authReady || (loading && rows.length === 0 && !loadError)) {
        return (
            <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-6 items-center justify-center text-text-muted min-h-[240px]">
                טוען…
            </div>
        );
    }

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            {loadError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</div>
            )}
            <p className="text-sm text-text-muted mb-4">
                ניהול מרכזי: תבניות Hiro (אדמין) ותבניות של כל החברות. תבנית Hiro מסומנת ב־<code className="text-xs">scope=admin</code> וללא{' '}
                <code className="text-xs">client_id</code>.
            </p>
            {view === 'list' ? (
                <>
                    <header className="flex flex-col gap-3 mb-4">
                        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                            <div className="border-b border-border-default">
                                <nav className="flex items-center -mb-px flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('saved')}
                                        className={`py-3 px-4 font-bold text-sm transition border-b-4 ${
                                            activeTab === 'saved'
                                                ? 'border-primary-500 text-primary-600'
                                                : 'border-transparent text-text-muted'
                                        }`}
                                    >
                                        {t('templates.tab_saved')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('system')}
                                        className={`py-3 px-4 font-bold text-sm transition border-b-4 ${
                                            activeTab === 'system'
                                                ? 'border-primary-500 text-primary-600'
                                                : 'border-transparent text-text-muted'
                                        }`}
                                    >
                                        {t('templates.tab_system')}
                                    </button>
                                </nav>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditing(null);
                                    setView('form');
                                }}
                                className="flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 shadow-sm"
                            >
                                <PlusIcon className="w-5 h-5" />
                                <span>{t('templates.new_template')}</span>
                            </button>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                            <select
                                value={filterKind}
                                onChange={(e) => {
                                    setFilterKind(e.target.value as 'all' | 'admin' | 'client');
                                    if (e.target.value === 'admin') setFilterClientId('');
                                }}
                                className="bg-bg-input border border-border-default text-sm rounded-lg py-2 px-3 min-w-[160px]"
                            >
                                <option value="all">הכל</option>
                                <option value="admin">Hiro בלבד</option>
                                <option value="client">חברות בלבד</option>
                            </select>
                            {(filterKind === 'all' || filterKind === 'client') && (
                                <select
                                    value={filterClientId}
                                    onChange={(e) => setFilterClientId(e.target.value)}
                                    className="bg-bg-input border border-border-default text-sm rounded-lg py-2 px-3 min-w-[200px]"
                                >
                                    <option value="">כל החברות</option>
                                    {clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
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
                            <table className="w-full text-sm text-right min-w-[920px]">
                                <thead className="text-xs text-text-muted uppercase bg-bg-subtle">
                                    <tr>
                                        <th className="p-3">סוג</th>
                                        <th className="p-3">חברה</th>
                                        <th className="p-3">{t('templates.col_name')}</th>
                                        <th className="p-3">{t('templates.col_content')}</th>
                                        <th className="p-3">{t('templates.col_last_updated')}</th>
                                        <th className="p-3">{t('templates.col_updated_by')}</th>
                                        <th className="p-3">{t('templates.col_actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle">
                                    {filteredRows.map((r) => (
                                        <tr key={r.id} className="hover:bg-bg-hover">
                                            <td className="p-3">
                                                <span
                                                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                        r.scope === 'admin' ? 'bg-violet-100 text-violet-800' : 'bg-amber-100 text-amber-900'
                                                    }`}
                                                >
                                                    {r.scope === 'admin' ? 'Hiro' : 'חברה'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-text-muted max-w-[140px] truncate" title={r.clientName || r.clientId || ''}>
                                                {r.scope === 'admin' ? '—' : r.clientName || r.clientId || '—'}
                                            </td>
                                            <td className="p-3 font-semibold text-primary-700">{r.name}</td>
                                            <td className="p-3 text-text-muted max-w-xs truncate" title={r.content}>
                                                {r.content}
                                            </td>
                                            <td className="p-3 text-text-muted whitespace-nowrap">
                                                {formatMessageTemplateDisplayDate(r.lastUpdated)}
                                            </td>
                                            <td className="p-3 text-text-muted">{r.updatedBy || '—'}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditing(r);
                                                            setView('form');
                                                        }}
                                                        className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"
                                                    >
                                                        <PencilIcon className="w-4 h-4" />
                                                    </button>
                                                    {!r.isSystem && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(r.id)}
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
                            {!loading && filteredRows.length === 0 && (
                                <div className="p-8 text-center text-text-muted">אין תבניות להצגה</div>
                            )}
                        </div>
                    </main>
                </>
            ) : (
                <CatalogTemplateForm
                    template={editing}
                    clients={clients}
                    onSave={handleSave}
                    onCancel={() => {
                        setView('list');
                        setEditing(null);
                    }}
                    saving={saving}
                />
            )}
        </div>
    );
};

export default AdminMessageTemplatesView;
