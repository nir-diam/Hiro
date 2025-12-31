
import React, { useState, useMemo, useRef } from 'react';
import { PlusIcon, MagnifyingGlassIcon, PencilIcon, TrashIcon, SparklesIcon, WhatsappIcon, EnvelopeIcon, ChatBubbleBottomCenterTextIcon } from './Icons';
import { useLanguage } from '../context/LanguageContext';

// --- TYPES ---
interface Template {
    id: number;
    name: string;
    subject: string;
    content: string;
    lastUpdated: string;
    updatedBy: string;
    channels: ('email' | 'sms' | 'whatsapp')[];
}

// --- MOCK DATA ---
const templatesData: Template[] = [
    { id: 1, name: 'אישור הגעה לראיון ראשון', subject: 'אישור הגעה לראיון למשרת {job_title}', content: 'היי {candidate_first_name}, בהמשך לפנייתך למשרת {job_title} בחברת {client_name}, נשמח לאשר את הגעתך לראיון בתאריך...', lastUpdated: '19/02/2023', updatedBy: 'גלעד', channels: ['email', 'whatsapp'] },
    { id: 2, name: 'אישור הגעת קורות חיים', subject: 'קיבלנו את קורות החיים שלך!', content: 'היי {candidate_first_name}, קורות החיים שלך למשרת {job_title} התקבלו בהצלחה. ניצור קשר בהמשך במידה ותמצא התאמה. תודה, צוות {company_name}.', lastUpdated: '30/08/2022', updatedBy: 'גלעד', channels: ['sms'] },
    { id: 3, name: 'הצעה עבודה - תחילת תהליך', subject: 'הזדמנות חדשה בחברת {client_name}', content: 'שלום {candidate_first_name}, שמחנו לבחון את הרקע המקצועי שלך. אנו מאמינים שיש לך פוטנציאל גבוה למשרת {job_title} אצלנו. נשמח לתאם שיחת היכרות קצרה. אנא חזור/חזרי אלינו בהקדם.', lastUpdated: '31/07/2024', updatedBy: 'מיכל', channels: ['email', 'whatsapp', 'sms'] },
];

const parameters = [
    { label: "שם פרטי מועמד", value: "{candidate_first_name}" }, { label: "שם משפחה מועמד", value: "{candidate_last_name}" }, { label: "טלפון מועמד", value: "{candidate_phone}" }, { label: "מייל מועמד", value: "{candidate_email}" }, { label: "לינק קורות חיים", value: "{candidate_cv_link}" },
    { label: "תעודת זהות מועמד", value: "{candidate_id}" }, { label: "משרות והפניות", value: "{job_referrals}" }, { label: "שם חברה", value: "{company_name}" }, { label: "שם איש קשר", value: "{contact_name}" }, { label: "טלפון איש קשר", value: "{contact_phone}" },
    { label: "מייל איש קשר", value: "{contact_email}" }, { label: "כותרת משרה", value: "{job_title}" }, { label: "תיאור משרה", value: "{job_description}" }, { label: "דרישות משרה", value: "{job_requirements}" }, { label: "שם רכז", value: "{recruiter_name}" },
    { label: "מייל רכז", value: "{recruiter_email}" }, { label: "טלפון רכז", value: "{recruiter_phone}" }, { label: "תאריך שליחה", value: "{send_date}" }, { label: "מדיניות הפרטיות", value: "{privacy_policy_link}" }, { label: "כתובת דף תודה", value: "{thank_you_page_link}" },
];

// --- SUB-COMPONENTS ---
const TemplateForm: React.FC<{
    template: Partial<Template> | null;
    onSave: (template: Partial<Template>) => void;
    onCancel: () => void;
}> = ({ template, onSave, onCancel }) => {
    const { t } = useLanguage();
    const [formData, setFormData] = useState<Partial<Template>>(
        template || { name: '', subject: '', content: '', channels: ['whatsapp'] }
    );
    const contentRef = useRef<HTMLTextAreaElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleChannelChange = (channel: 'email' | 'sms' | 'whatsapp') => {
        setFormData(prev => {
            const currentChannels = prev.channels || [];
            const newChannels = currentChannels.includes(channel)
                ? currentChannels.filter(c => c !== channel)
                : [...currentChannels, channel];
            return { ...prev, channels: newChannels };
        });
    };

    const handleInsertParam = (param: string) => {
        if (!contentRef.current) return;
        const { selectionStart, selectionEnd, value } = contentRef.current;
        const newContent = value.substring(0, selectionStart) + param + value.substring(selectionEnd);
        setFormData(prev => ({ ...prev, content: newContent }));
        
        setTimeout(() => {
            if (contentRef.current) {
                contentRef.current.focus();
                contentRef.current.selectionStart = contentRef.current.selectionEnd = selectionStart + param.length;
            }
        }, 0);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-bold text-text-default">{template?.id ? t('templates.edit_title') : t('templates.create_title')}</h2>
            
            <div className="bg-bg-card border border-border-default rounded-lg p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_name')}*</label>
                        <input name="name" value={formData.name} onChange={handleChange} required className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-semibold text-text-muted">{t('templates.channels')}</label>
                        <div className="flex items-center gap-3">
                             {([['email', <EnvelopeIcon />], ['sms', <ChatBubbleBottomCenterTextIcon />], ['whatsapp', <WhatsappIcon />]] as const).map(([channel, icon]) => (
                                <button type="button" key={channel} onClick={() => handleChannelChange(channel as 'email' | 'sms' | 'whatsapp')} className={`p-2 rounded-lg border-2 transition ${formData.channels?.includes(channel) ? 'bg-primary-50 border-primary-500 text-primary-600' : 'bg-bg-subtle border-transparent text-text-muted hover:border-border-default'}`}>
                                    {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                 <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_subject')}*</label>
                    <input name="subject" value={formData.subject} onChange={handleChange} required className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5" />
                </div>
                 <div>
                    <label className="block text-sm font-semibold text-text-muted mb-1.5">{t('templates.field_content')}*</label>
                    <textarea ref={contentRef} name="content" value={formData.content} onChange={handleChange} required rows={8} className="w-full bg-bg-input border border-border-default text-sm rounded-lg p-2.5"></textarea>
                    <div className="text-xs text-text-subtle text-left mt-1">{formData.content?.length || 0} / 5000</div>
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
    );
};

const MessageTemplatesView: React.FC = () => {
    const { t } = useLanguage();
    const [view, setView] = useState<'list' | 'form'>('list');
    const [activeTab, setActiveTab] = useState<'saved' | 'system'>('saved');
    const [templates, setTemplates] = useState<Template[]>(templatesData);
    const [editingTemplate, setEditingTemplate] = useState<Partial<Template> | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const filteredTemplates = useMemo(() => {
        return templates.filter(t => 
            t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            t.content.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [templates, searchTerm]);

    const handleEdit = (template: Template) => {
        setEditingTemplate(template);
        setView('form');
    };

    const handleCreate = () => {
        setEditingTemplate(null);
        setView('form');
    };

    const handleDelete = (id: number) => {
        if (window.confirm('האם למחוק את התבנית?')) {
            setTemplates(prev => prev.filter(t => t.id !== id));
        }
    };

    const handleSave = (templateData: Partial<Template>) => {
        if (templateData.id) {
            setTemplates(prev => prev.map(t => t.id === templateData.id ? { ...t, ...templateData, lastUpdated: new Date().toLocaleDateString('he-IL'), updatedBy: 'עצמי' } as Template : t));
        } else {
            const newTemplate: Template = {
                id: Date.now(),
                name: '',
                subject: '',
                content: '',
                channels: [],
                ...templateData,
                lastUpdated: new Date().toLocaleDateString('he-IL'),
                updatedBy: 'עצמי',
            };
            setTemplates(prev => [newTemplate, ...prev]);
        }
        setView('list');
    };

    return (
        <div className="bg-bg-card rounded-2xl shadow-sm h-full flex flex-col p-4 sm:p-6">
            {view === 'list' ? (
                <>
                    <header className="flex flex-col md:flex-row items-center justify-between gap-2 mb-4">
                         <div>
                            <div className="border-b border-border-default">
                                <nav className="flex items-center -mb-px">
                                    <button onClick={() => setActiveTab('saved')} className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${activeTab === 'saved' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}>{t('templates.tab_saved')}</button>
                                    <button onClick={() => setActiveTab('system')} className={`py-3 px-6 font-bold text-base transition-all duration-300 ease-in-out border-b-4 ${activeTab === 'system' ? 'border-primary-500 text-primary-600' : 'border-transparent text-text-muted hover:text-text-default'}`}>{t('templates.tab_system')}</button>
                                </nav>
                            </div>
                        </div>
                        <button onClick={handleCreate} className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-primary-600 transition shadow-sm">
                            <PlusIcon className="w-5 h-5"/>
                            <span>{t('templates.new_template')}</span>
                        </button>
                    </header>

                    <div className="p-3 bg-bg-subtle rounded-xl border border-border-default mb-4">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-text-subtle absolute right-3 top-1/2 -translate-y-1/2" />
                            <input type="text" placeholder={t('templates.search_placeholder')} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-bg-input border border-border-default rounded-lg py-2 pl-3 pr-10 text-sm" />
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
                                    {filteredTemplates.map(t => (
                                        <tr key={t.id} className="hover:bg-bg-hover">
                                            <td className="p-4 font-semibold text-primary-700">{t.name}</td>
                                            <td className="p-4 text-text-muted max-w-sm truncate" title={t.content}>{t.content}</td>
                                            <td className="p-4 text-text-muted">{t.lastUpdated}</td>
                                            <td className="p-4 text-text-muted">{t.updatedBy}</td>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => handleEdit(t)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-primary-600"><PencilIcon className="w-4 h-4"/></button>
                                                    <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-bg-hover rounded-full text-text-subtle hover:text-red-600"><TrashIcon className="w-4 h-4"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </main>
                </>
            ) : (
                <TemplateForm template={editingTemplate} onSave={handleSave} onCancel={() => setView('list')} />
            )}
        </div>
    );
};

export default MessageTemplatesView;
