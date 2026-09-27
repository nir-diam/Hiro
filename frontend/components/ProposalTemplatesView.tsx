import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, PhotoIcon, PaperClipIcon } from './Icons';
import ProposalTemplateTinyMceEditor, { type ProposalTemplateEditorHandle } from './ProposalTemplateTinyMceEditor';
import CompanyMediaPickerModal, { type CompanyMediaPickResult } from './CompanyMediaPickerModal';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';
import { isImageAttachment, type ClientAttachment } from '../services/clientAttachmentsApi';
import {
    createProposalTemplate,
    deleteProposalTemplate,
    fetchProposalTemplates,
    updateProposalTemplate,
    type ProposalTemplateDto,
} from '../services/proposalsApi';

const ADMIN_PROPOSAL_TEMPLATES_CLIENT_KEY = 'hiro.admin.proposalTemplates.clientId';

interface ProposalTemplate {
    id: string;
    name: string;
    content: string;
    lastUpdated: string;
    updatedBy: string;
}

const mapDto = (t: ProposalTemplateDto): ProposalTemplate => ({
    id: t.id,
    name: t.name,
    content: t.content,
    lastUpdated: t.lastUpdated || '',
    updatedBy: t.updatedByName || '',
});

const parameters = [
    { label: "שם פרטי איש קשר", value: "{contact_first_name}" },
    { label: "שם משפחה איש קשר", value: "{contact_last_name}" },
    { label: "שם מלא איש קשר", value: "{contact_full_name}" },
    { label: "תפקיד איש קשר", value: "{contact_role}" },
    { label: "טלפון איש קשר", value: "{contact_phone}" },
    { label: "אימייל איש קשר", value: "{contact_email}" },
    { label: "ת.ז. איש קשר", value: "{contact_id}" },
    { label: "שם חברה", value: "{company_name}" },
    { label: "לוגו חברה (ממורכז)", value: "{company_logo}" },
    { label: "ח.פ חברה", value: "{company_id}" },
    { label: "כתובת חברה", value: "{company_address}" },
    { label: "עיר חברה", value: "{company_city}" },
    { label: "מספר הצעת מחיר", value: "{proposal_number}" },
    { label: "תאריך יצירה", value: "{proposal_date}" },
    { label: "סכום כולל", value: "{proposal_total}" },
    { label: "מטבע", value: "{proposal_currency}" },
    { label: "תאריך תוקף", value: "{proposal_valid_until}" },
    { label: "שם נציג/מפיק", value: "{rep_name}" },
    { label: "אימייל נציג", value: "{rep_email}" },
    { label: "טלפון נציג", value: "{rep_phone}" },
    { label: "תאריך נוכחי", value: "{current_date}" },
    { label: "קישור לחתימה דיגיטלית", value: "{digital_signature_link}" }
];

const ProposalTemplateForm: React.FC<{
    template: Partial<ProposalTemplate> | null;
    clientId: string | null;
    onSave: (template: Partial<ProposalTemplate>) => void;
    onCancel: () => void;
}> = ({ template, clientId, onSave, onCancel }) => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const [formData, setFormData] = useState<Partial<ProposalTemplate>>(
        template || { name: '', content: '' }
    );
    const editorRef = useRef<ProposalTemplateEditorHandle>(null);
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const [mediaPickerTab, setMediaPickerTab] = useState<'images' | 'attachments'>('images');

    const insertAttachmentHtml = (attachment: ClientAttachment) => {
        const url = attachment.url?.trim();
        if (!url) return;
        const safeUrl = url.replace(/"/g, '&quot;');
        const safeName = (attachment.name || 'צרופה')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const html = isImageAttachment(attachment)
            ? `<img src="${safeUrl}" alt="${safeName}" style="max-width:100%;height:auto;" />`
            : `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a>`;
        editorRef.current?.insertContent(html);
    };

    const insertImageUrl = (url: string, alt = '') => {
        const trimmed = url.trim();
        if (!trimmed) return;
        const safeAlt = alt.replace(/"/g, '&quot;');
        editorRef.current?.insertContent(
            `<img src="${trimmed.replace(/"/g, '&quot;')}" alt="${safeAlt}" style="max-width:100%;height:auto;" />`,
        );
    };

    const handleMediaPick = (result: CompanyMediaPickResult) => {
        if (result.kind === 'image') {
            insertImageUrl(result.url, result.label || '');
        } else {
            insertAttachmentHtml(result.attachment);
        }
    };

    const openMediaPicker = (tab: 'images' | 'attachments') => {
        if (!clientId) {
            alert('יש לבחור לקוח לפני הוספת תמונה או צרופה');
            return;
        }
        setMediaPickerTab(tab);
        setMediaPickerOpen(true);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleInsertParam = (param: string) => {
        editorRef.current?.insertText(param);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const finalContent = editorRef.current?.getContent() || formData.content || '';
        onSave({ ...formData, content: finalContent });
    };

    const handleInsertImage = () => openMediaPicker('images');
    const handleInsertAttachment = () => openMediaPicker('attachments');

    return (
        <>
        <form onSubmit={handleSubmit} className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-text-default">
                {template?.id ? 'עריכת תבנית הצעת מחיר' : 'יצירת תבנית הצעת מחיר'}
            </h2>
            
            <div className="bg-bg-card border border-border-default rounded-lg p-6 space-y-4">
                <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">שם התבנית*</label>
                    <input name="name" value={formData.name} onChange={handleChange} required className="w-full md:w-1/2 bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                </div>
                 
                <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                        <label className="block text-sm font-semibold text-text-muted">תוכן*</label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleInsertImage}
                                disabled={!clientId}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary-50 text-primary-800 border border-primary-200 hover:bg-primary-100 disabled:opacity-50"
                                title="בחר מתמונות שנוצרו או מהמאגר"
                            >
                                <PhotoIcon className="w-4 h-4" />
                                הוסף תמונה מהמאגר
                            </button>
                            <button
                                type="button"
                                onClick={handleInsertAttachment}
                                disabled={!clientId}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200 disabled:opacity-50"
                                title="בחר או העלה צרופה"
                            >
                                <PaperClipIcon className="w-4 h-4" />
                                הוסף צרופה
                            </button>
                        </div>
                    </div>
                    <p className="text-xs text-text-muted mb-2">
                        תמונות וצרופות נטענות מאותו מאגר כמו ב־הגדרות → צרופות ותמונות שנוצרו.
                        {' '}ללוגו ממורכז: לחץ &quot;לוגו ממורכז&quot; בסרגל, ואז &quot;הוסף תמונה מהמאגר&quot;.
                    </p>
                    <ProposalTemplateTinyMceEditor
                        ref={editorRef}
                        editorKey={template?.id || 'new'}
                        value={formData.content || ''}
                        onChange={(content) => setFormData((prev) => ({ ...prev, content }))}
                        onRequestImageInsert={handleInsertImage}
                        onRequestAttachmentInsert={handleInsertAttachment}
                    />
                </div>
            </div>
            
            <div className="bg-bg-card border border-border-default rounded-lg p-6">
                <h3 className="text-base font-bold text-text-default mb-3">{t('templates.params_title')}</h3>
                <div className="flex flex-wrap gap-2">
                    {parameters.map(param => (
                        <button key={param.value} type="button" onClick={() => handleInsertParam(param.value)} className="bg-bg-subtle text-text-default text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-primary-100 hover:text-primary-800 transition">
                            {param.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="text-text-muted font-semibold py-2 px-4 rounded-lg hover:bg-bg-hover">{t('client_form.cancel')}</button>
                <button type="submit" className="bg-primary-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-primary-700">{t('client_form.save')}</button>
            </div>
        </form>

        <CompanyMediaPickerModal
            isOpen={mediaPickerOpen}
            onClose={() => setMediaPickerOpen(false)}
            clientId={clientId}
            uploadedBy={user?.name || 'מערכת'}
            initialTab={mediaPickerTab}
            onPick={handleMediaPick}
        />
        </>
    );
};


const ProposalTemplatesView: React.FC = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const ownClientId = user?.clientId?.trim() || null;
    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

    const [adminClientId, setAdminClientId] = useState<string | null>(() => {
        if (typeof sessionStorage === 'undefined') return null;
        return sessionStorage.getItem(ADMIN_PROPOSAL_TEMPLATES_CLIENT_KEY);
    });
    const [clientOptions, setClientOptions] = useState<Array<{ id: string; label: string }>>([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [view, setView] = useState<'list' | 'create' | 'edit'>('list');
    const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<Partial<ProposalTemplate> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clientId = isPlatformAdmin ? adminClientId : ownClientId;

    const handleAdminClientChange = useCallback((val: string) => {
        const id = val || null;
        setAdminClientId(id);
        setView('list');
        if (typeof sessionStorage !== 'undefined') {
            if (id) sessionStorage.setItem(ADMIN_PROPOSAL_TEMPLATES_CLIENT_KEY, id);
            else sessionStorage.removeItem(ADMIN_PROPOSAL_TEMPLATES_CLIENT_KEY);
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
                ? sessionStorage.getItem(ADMIN_PROPOSAL_TEMPLATES_CLIENT_KEY)
                : null;
        const savedValid = saved && clientOptions.some((o) => o.id === saved);
        handleAdminClientChange(savedValid ? saved! : clientOptions[0].id);
    }, [isPlatformAdmin, adminClientId, clientOptions, handleAdminClientChange]);

    const load = useCallback(async () => {
        if (!clientId) {
            setTemplates([]);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const rows = await fetchProposalTemplates(clientId);
            setTemplates(rows.map(mapDto));
        } catch (e) {
            setError((e as Error)?.message || 'שגיאה בטעינת תבניות');
            setTemplates([]);
        } finally {
            setLoading(false);
        }
    }, [clientId]);

    useEffect(() => {
        void load();
    }, [load]);

    const handleCreate = () => {
        setEditingTemplate(null);
        setView('create');
    };

    const handleEdit = (template: ProposalTemplate) => {
        setEditingTemplate(template);
        setView('edit');
    };

    const handleDelete = async (id: string) => {
        if (!clientId) return;
        if (!window.confirm(t('templates.delete_confirm'))) return;
        try {
            await deleteProposalTemplate(id, clientId);
            await load();
        } catch (e) {
            alert((e as Error)?.message || 'מחיקה נכשלה');
        }
    };

    const handleSave = async (templateData: Partial<ProposalTemplate>) => {
        if (!clientId) {
            alert('יש לבחור לקוח לפני שמירת תבנית');
            return;
        }
        try {
            if (view === 'edit' && templateData.id) {
                await updateProposalTemplate(String(templateData.id), {
                    name: templateData.name || '',
                    content: templateData.content || '',
                    clientId,
                });
            } else {
                await createProposalTemplate({
                    name: templateData.name || '',
                    content: templateData.content || '',
                    clientId,
                });
            }
            setView('list');
            await load();
        } catch (e) {
            alert((e as Error)?.message || 'שמירה נכשלה');
        }
    };

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-black text-text-default">ניהול תבניות הצעות מחיר</h1>
                    <p className="text-sm text-text-muted">יצירה ועריכה של תבניות להצעות מחיר</p>
                </div>
                {view === 'list' && (
                    <button 
                        onClick={handleCreate}
                        disabled={!clientId}
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-primary-700 transition flex items-center gap-2 disabled:opacity-50"
                    >
                        <PlusIcon className="w-5 h-5" />
                        הוספת תבנית
                    </button>
                )}
            </header>

            {isPlatformAdmin ? (
                <div className="flex items-center gap-3 flex-wrap">
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

            {error ? (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
            ) : null}
            {!isPlatformAdmin && !clientId ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    יש להתחבר עם משתמש המשויך ללקוח כדי לנהל תבניות.
                </div>
            ) : null}
            {isPlatformAdmin && !clientId ? (
                <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    בחר לקוח מהרשימה כדי לצפות ולנהל תבניות הצעות מחיר.
                </div>
            ) : null}

            {view === 'list' ? (
                <div className="bg-bg-card border border-border-default rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-right">
                            <thead className="bg-bg-subtle text-text-muted text-sm border-b border-border-default">
                                <tr>
                                    <th className="px-6 py-4 font-semibold w-12"></th>
                                    <th className="px-6 py-4 font-semibold w-48">שם התבנית</th>
                                    <th className="px-6 py-4 font-semibold w-64">תוכן</th>
                                    <th className="px-6 py-4 font-semibold w-32">נוסף על ידי</th>
                                    <th className="px-6 py-4 font-semibold w-32">תאריך הוספה</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-default">
                                {loading ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-text-muted">טוען...</td>
                                    </tr>
                                ) : null}
                                {!loading && templates.map((template) => (
                                    <tr key={template.id} className="hover:bg-bg-hover transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => void handleDelete(template.id)} className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="מחק">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleEdit(template)} className="p-1.5 text-text-muted hover:text-primary-600 hover:bg-primary-50 rounded-lg transition" title="ערוך">
                                                    <PencilIcon className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-text-default">{template.name}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm text-text-muted line-clamp-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-xs" dangerouslySetInnerHTML={{__html: template.content}}></p>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-text-default">
                                            {template.updatedBy || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-text-muted">
                                            {template.lastUpdated || '—'}
                                        </td>
                                    </tr>
                                ))}
                                {!loading && templates.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-text-muted">לא נמצאו תבניות.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <ProposalTemplateForm
                    template={editingTemplate}
                    clientId={clientId}
                    onSave={(d) => void handleSave(d)}
                    onCancel={() => setView('list')}
                />
            )}
        </div>
    );
};

export default ProposalTemplatesView;
