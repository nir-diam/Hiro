
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Drawer from './Drawer';
import {
    UserIcon, PhoneIcon, EnvelopeIcon, BriefcaseIcon,
    ChatBubbleBottomCenterTextIcon,
    ClockIcon, PlusIcon, WhatsappIcon, ArrowTopRightOnSquareIcon,
} from './Icons';
import { Contact } from './ClientsListView';
import type { MessageModalConfig, MessageRecipientOption } from '../hooks/useUIState';
import { authHeaders } from '../utils/authHeaders';
import {
    fetchClientContactRecipientOptions,
    hydrateContactForDrawer,
} from '../utils/processEntityDrawers';
import { resolveProcessPlacements, resolveStageDisplay } from '../utils/processPlacements';
import { fetchPipelines, type PipelineDto } from '../services/pipelinesApi';
import { eventBelongsToContact } from '../utils/contactEventHistory';

type ProcessOption = { id: string; name: string };

type ContactEventRow = {
    id: string;
    title: string;
    date: string;
    creator: string;
    description: string;
    process: string;
    stage: string;
    status: string;
};

interface ContactDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    contact: Contact | null;
    onStartProcess: (pipelineId: string) => void;
    processOptions?: ProcessOption[];
    openMessageModal: (config: MessageModalConfig) => void;
}

const formatEventDateTime = (raw: string | null | undefined): string => {
    const value = String(raw || '').trim();
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value.includes('T') ? value.replace('T', ' ').replace(/\.\d{3}Z?$/, '') : value;
    }
    return date.toLocaleString('he-IL', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const mapContactEventRow = (raw: Record<string, unknown>): ContactEventRow => {
    const types = Array.isArray(raw.type) ? (raw.type as string[]) : [];
    return {
        id: String(raw.id || ''),
        title: String(raw.title || 'אירוע'),
        date: String(raw.date || ''),
        creator: String(raw.creator || raw.coordinator || ''),
        description: String(raw.description || ''),
        process: String(raw.process || types[0] || ''),
        stage: String(raw.stage || types[1] || ''),
        status: String(raw.status || 'עתידי'),
    };
};

const ContactDrawer: React.FC<ContactDrawerProps> = ({
    isOpen,
    onClose,
    contact,
    onStartProcess,
    processOptions = [],
    openMessageModal,
}) => {
    const [activeTab, setActiveTab] = useState<'overview' | 'processes' | 'history'>('overview');
    const [events, setEvents] = useState<ContactEventRow[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsError, setEventsError] = useState<string | null>(null);
    const [pipelines, setPipelines] = useState<PipelineDto[]>([]);
    const [contactDetail, setContactDetail] = useState<Contact | null>(null);
    const [processesLoading, setProcessesLoading] = useState(false);
    const [clientRecipientOptions, setClientRecipientOptions] = useState<MessageRecipientOption[]>([]);

    const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
    const clientId = String(contact?.clientId || '').trim();
    const contactId = String(contact?.id || '').trim();
    const displayContact = contactDetail || contact;

    const displayPhone = useMemo(() => {
        const raw = String(displayContact?.phone || '').trim();
        return raw.replace(/\s/g, '');
    }, [displayContact?.phone]);

    const displayEmail = useMemo(
        () => String(displayContact?.email || '').trim(),
        [displayContact?.email],
    );

    const organizationScope = useMemo(
        () => ({
            organizationId: String(displayContact?.organizationId || '').trim() || null,
            organizationTmpId: String(displayContact?.organizationTmpId || '').trim() || null,
        }),
        [displayContact?.organizationId, displayContact?.organizationTmpId],
    );

    const hasOrganizationScope = Boolean(
        organizationScope.organizationId || organizationScope.organizationTmpId,
    );

    const buildCurrentRecipientOption = useCallback((): MessageRecipientOption => ({
        id: contactId || displayContact?.id || '',
        name: displayContact?.name || '',
        email: displayEmail,
        phone: displayPhone,
        subtitle: displayContact?.clientName || null,
        clientId: clientId || null,
        organizationId: displayContact?.organizationId
            ? String(displayContact.organizationId)
            : null,
    }), [clientId, contactId, displayContact, displayEmail, displayPhone]);

    const mergeRecipientOptions = useCallback(
        (loaded: MessageRecipientOption[]): MessageRecipientOption[] => {
            const current = buildCurrentRecipientOption();
            if (!current.id) return loaded.length ? loaded : [];
            const byId = new Map<string, MessageRecipientOption>();
            for (const opt of loaded) {
                if (opt?.id) byId.set(opt.id, opt);
            }
            byId.set(current.id, { ...byId.get(current.id), ...current });
            return Array.from(byId.values()).sort((a, b) =>
                a.name.localeCompare(b.name, 'he'),
            );
        },
        [buildCurrentRecipientOption],
    );

    const handleContactAction = useCallback(
        async (mode: 'email' | 'sms' | 'whatsapp') => {
            if (!displayContact) return;
            let recipientOptions = mergeRecipientOptions(clientRecipientOptions);
            if (
                clientId
                && hasOrganizationScope
                && recipientOptions.length <= 1
                && apiBase
            ) {
                const fetched = await fetchClientContactRecipientOptions(
                    apiBase,
                    clientId,
                    displayContact.clientName || '',
                    organizationScope,
                );
                recipientOptions = mergeRecipientOptions(fetched);
                if (fetched.length) setClientRecipientOptions(fetched);
            }
            if (!recipientOptions.length) {
                recipientOptions = [buildCurrentRecipientOption()];
            }
            const config: MessageModalConfig = {
                mode,
                recipientType: 'client_contact',
                candidateName: displayContact.name,
                candidatePhone: displayPhone,
                candidateEmail: displayEmail || undefined,
                linkedClientId: clientId || null,
                linkedOrganizationId: displayContact.organizationId
                    ? String(displayContact.organizationId)
                    : null,
                linkedOrganizationName: displayContact.clientName || null,
                linkedContactId: contactId || null,
                recipientOptions,
                initialRecipientIds: contactId ? [contactId] : undefined,
            };
            openMessageModal(config);
        },
        [
            apiBase,
            buildCurrentRecipientOption,
            clientId,
            clientRecipientOptions,
            contactId,
            displayContact,
            displayEmail,
            displayPhone,
            hasOrganizationScope,
            mergeRecipientOptions,
            openMessageModal,
            organizationScope,
        ],
    );

    useEffect(() => {
        if (!isOpen) {
            setActiveTab('overview');
            setEvents([]);
            setEventsError(null);
            setContactDetail(null);
            setClientRecipientOptions([]);
        }
    }, [isOpen, contact?.id]);

    useEffect(() => {
        if (!isOpen || !apiBase || !clientId || !hasOrganizationScope) {
            setClientRecipientOptions([]);
            return;
        }
        let active = true;
        void fetchClientContactRecipientOptions(
            apiBase,
            clientId,
            displayContact?.clientName || contact?.clientName || '',
            organizationScope,
        ).then((rows) => {
            if (active) setClientRecipientOptions(rows);
        });
        return () => {
            active = false;
        };
    }, [
        isOpen,
        apiBase,
        clientId,
        hasOrganizationScope,
        organizationScope,
        contact?.clientName,
        displayContact?.clientName,
    ]);

    useEffect(() => {
        if (!isOpen || !contact) {
            setContactDetail(null);
            return;
        }
        setContactDetail(contact);
        if (!apiBase || !clientId || !contactId) return;
        let active = true;
        setProcessesLoading(true);
        void hydrateContactForDrawer(apiBase, clientId, contactId, contact)
            .then((hydrated) => {
                if (active && hydrated) setContactDetail(hydrated);
            })
            .finally(() => {
                if (active) setProcessesLoading(false);
            });
        return () => {
            active = false;
        };
    }, [isOpen, contact, apiBase, clientId, contactId]);

    useEffect(() => {
        if (!isOpen || !apiBase || !clientId) {
            setPipelines([]);
            return;
        }
        let active = true;
        void fetchPipelines(clientId)
            .then((rows) => {
                if (active) setPipelines(Array.isArray(rows) ? rows : []);
            })
            .catch(() => {
                if (active) setPipelines([]);
            });
        return () => {
            active = false;
        };
    }, [isOpen, apiBase, clientId]);

    useEffect(() => {
        if (!isOpen || activeTab !== 'history' || !apiBase || !clientId || !contactId || !contact) {
            return;
        }
        let active = true;
        setEventsLoading(true);
        setEventsError(null);
        const qs = new URLSearchParams({ summary: '1', limit: '200' });
        if (contact.organizationId) {
            qs.set('organizationId', String(contact.organizationId));
        }
        fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}/events?${qs.toString()}`, {
            credentials: 'include',
            headers: authHeaders(),
            cache: 'no-store',
        })
            .then((r) => {
                if (!r.ok) throw new Error('טעינת אירועים נכשלה');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                const list = Array.isArray(data) ? data : data?.data ?? [];
                const rows = list
                    .filter((row: Record<string, unknown>) =>
                        eventBelongsToContact(row, contactId, contact.name),
                    )
                    .map((row: Record<string, unknown>) => mapContactEventRow(row))
                    .sort(
                        (a: ContactEventRow, b: ContactEventRow) =>
                            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
                    );
                setEvents(rows);
            })
            .catch((e: Error) => {
                if (!active) return;
                setEventsError(e?.message || 'שגיאה בטעינת אירועים');
                setEvents([]);
            })
            .finally(() => {
                if (active) setEventsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [isOpen, activeTab, apiBase, clientId, contactId, contact]);

    const openProcesses = useMemo(() => {
        if (!pipelines.length || !displayContact) return [];
        const placements = resolveProcessPlacements(
            displayContact.pipelineId || null,
            displayContact.stageId || null,
            pipelines,
        );
        return placements.map((placement) => {
            const pipeline = pipelines.find((p) => p.id === placement.pipelineId);
            const stage = resolveStageDisplay(pipeline, placement.processStage);
            return {
                ...placement,
                pipelineName: pipeline?.name || 'תהליך',
                stageName: stage.name,
                stageColorClass: stage.colorClass,
            };
        });
    }, [displayContact, pipelines]);

    const allProcessesHref = useMemo(() => {
        if (!clientId || !contactId) return null;
        return `/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}?tab=processes`;
    }, [clientId, contactId]);

    const contactProfileHref = useMemo(() => {
        if (!clientId || !contactId) return null;
        return `/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}`;
    }, [clientId, contactId]);

    const processManagementHref = (
        pipelineId: string,
        processStage: string | null,
    ): string | null => {
        if (!clientId || !contactId) return null;
        const qs = new URLSearchParams({ tab: 'events', pipelineId });
        if (processStage) qs.set('processStage', processStage);
        return `/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}?${qs.toString()}`;
    };

    if (!contact) return null;

    const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors flex items-center justify-center gap-2 ${
                activeTab === id
                    ? 'border-primary-500 text-primary-600 bg-primary-50/30'
                    : 'border-transparent text-text-muted hover:bg-bg-subtle'
            }`}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title="כרטיס איש קשר"
            footer={
                <div className="flex flex-col gap-3 w-full">
                    {contactProfileHref ? (
                        <Link
                            to={contactProfileHref}
                            onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary-600 text-white font-bold hover:bg-primary-700 transition-colors shadow-md"
                        >
                            צפה בפרופיל המלא
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        </Link>
                    ) : null}
                    <div className="flex gap-3 w-full">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2 rounded-xl text-text-muted font-bold hover:bg-bg-hover transition-colors"
                        >
                            סגור
                        </button>
                        {allProcessesHref ? (
                            <Link
                                to={allProcessesHref}
                                onClick={onClose}
                                className="flex-1 py-2 rounded-xl bg-primary-50 text-primary-700 font-bold hover:bg-primary-100 transition-colors border border-primary-200 text-center"
                            >
                                ניהול התהליכים
                            </Link>
                        ) : (
                            <button
                                type="button"
                                disabled
                                className="flex-1 py-2 rounded-xl bg-primary-600/40 text-white font-bold cursor-not-allowed"
                            >
                                ניהול התהליכים
                            </button>
                        )}
                    </div>
                </div>
            }
        >
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-4 mb-6 p-4 bg-bg-subtle rounded-2xl border border-border-default">
                    <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-2xl font-bold border-2 border-white shadow-sm relative">
                        {displayContact.avatar || displayContact.name.charAt(0)}
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-[8px] font-bold text-text-muted overflow-hidden">
                            {displayContact.clientLogo ? (
                                <img src={displayContact.clientLogo} alt={displayContact.clientName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                                displayContact.clientName.substring(0, 2)
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-text-default">{displayContact.name}</h3>
                        <p className="text-sm text-primary-600 font-semibold">{displayContact.role}</p>
                        <p className="text-xs text-text-muted mt-1">{displayContact.clientName}</p>
                    </div>
                </div>

                <div className="flex gap-2 mb-6">
                    {displayPhone ? (
                        <a
                            href={`tel:${displayPhone}`}
                            className="flex-1 py-2 bg-green-50 text-green-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-green-100 transition-colors border border-green-200"
                        >
                            <PhoneIcon className="w-4 h-4"/> חייג
                        </a>
                    ) : (
                        <button
                            type="button"
                            disabled
                            className="flex-1 py-2 bg-green-50/60 text-green-700/50 rounded-lg flex items-center justify-center gap-2 text-xs font-bold border border-green-200 cursor-not-allowed"
                        >
                            <PhoneIcon className="w-4 h-4"/> חייג
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => handleContactAction('email')}
                        disabled={!displayEmail}
                        className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
                    >
                        <EnvelopeIcon className="w-4 h-4"/> מייל
                    </button>
                    <button
                        type="button"
                        onClick={() => handleContactAction('sms')}
                        disabled={!displayPhone}
                        className="flex-1 py-2 bg-purple-50 text-purple-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-purple-100 transition-colors border border-purple-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-purple-50"
                    >
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4"/> SMS
                    </button>
                    <button
                        type="button"
                        onClick={() => handleContactAction('whatsapp')}
                        disabled={!displayPhone}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-emerald-100 transition-colors border border-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                    >
                        <WhatsappIcon className="w-4 h-4"/> וואטסאפ
                    </button>
                </div>

                <div className="flex border-b border-border-default mb-4">
                    <TabButton id="overview" label="פרטים" icon={<UserIcon className="w-4 h-4"/>} />
                    <TabButton id="processes" label="תהליכים" icon={<BriefcaseIcon className="w-4 h-4"/>} />
                    <TabButton id="history" label="פעילות" icon={<ClockIcon className="w-4 h-4"/>} />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                    {activeTab === 'overview' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">טלפון</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{displayContact.phone || '—'}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">אימייל</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{displayContact.email || '—'}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">תפקיד</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{displayContact.role || '—'}</div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-text-muted mb-1 uppercase">קשר אחרון</label>
                                <div className="text-sm font-medium text-text-default bg-bg-subtle/50 p-2.5 rounded-lg border border-border-default">{displayContact.lastContact || '—'}</div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'processes' && (
                        <div className="space-y-4">
                            {processesLoading ? (
                                <div className="text-center py-6 text-text-muted text-sm">טוען תהליכים...</div>
                            ) : openProcesses.length === 0 ? (
                                <div className="bg-bg-subtle border border-dashed border-border-default p-4 rounded-xl text-sm text-text-muted text-center">
                                    אין תהליכים פתוחים — ניתן לפתוח תהליך חדש מלוח הלקוחות.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <h4 className="text-sm font-bold text-text-muted">תהליכים פתוחים ({openProcesses.length})</h4>
                                    {openProcesses.map((row) => {
                                        const href = processManagementHref(row.pipelineId, row.processStage);
                                        return (
                                            <div
                                                key={`${row.pipelineId}-${row.processStage}`}
                                                className="bg-white border border-border-default p-4 rounded-xl shadow-sm space-y-3"
                                            >
                                                <div>
                                                    <p className="font-bold text-text-default">{row.pipelineName}</p>
                                                    <span
                                                        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold border mt-2 ${row.stageColorClass}`}
                                                    >
                                                        {row.stageName}
                                                    </span>
                                                </div>
                                                {href ? (
                                                    <Link
                                                        to={href}
                                                        onClick={onClose}
                                                        className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2.5 py-1.5 rounded-lg transition whitespace-nowrap"
                                                    >
                                                        ניהול התהליך
                                                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                                                    </Link>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {allProcessesHref ? (
                                <Link
                                    to={allProcessesHref}
                                    onClick={onClose}
                                    className="flex items-center justify-center gap-2 w-full bg-primary-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-primary-700 transition-colors shadow-sm"
                                >
                                    ניהול התהליכים
                                    <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                                </Link>
                            ) : null}

                            <div className="bg-primary-50 rounded-xl p-4 border border-primary-100">
                                <h4 className="font-bold text-primary-900 mb-2">פתיחת תהליך חדש</h4>
                                <p className="text-xs text-primary-700 mb-4">הוסף את איש הקשר ללוח המשימות (Kanban) לניהול תהליך ממוקד.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {processOptions.length === 0 ? (
                                        <p className="col-span-full text-xs text-primary-700">אין תהליכי עבודה מוגדרים. הגדר אותם בהגדרות תהליכי עבודה.</p>
                                    ) : (
                                        processOptions.map((p) => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => onStartProcess(p.id)}
                                                className="flex items-center justify-center gap-2 bg-white text-primary-700 py-2 rounded-lg border border-primary-200 hover:border-primary-400 font-bold text-xs shadow-sm transition-all"
                                            >
                                                <PlusIcon className="w-3 h-3"/> {p.name}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div>
                            {eventsLoading ? (
                                <div className="text-center py-10 text-text-muted text-sm">טוען אירועים...</div>
                            ) : eventsError ? (
                                <div className="text-center py-10 text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4">
                                    {eventsError}
                                </div>
                            ) : events.length === 0 ? (
                                <div className="text-center py-10 text-text-muted text-sm bg-bg-subtle border border-dashed border-border-default rounded-xl">
                                    אין אירועים לאיש קשר זה
                                </div>
                            ) : (
                                <div className="relative border-r border-border-default mr-3 space-y-6">
                                    {events.map((item) => (
                                        <div key={item.id} className="relative pr-6">
                                            <div className="absolute top-1 -right-1.5 w-3 h-3 bg-bg-card border-2 border-primary-500 rounded-full" />
                                            <div className="text-xs text-text-muted mb-1">
                                                {formatEventDateTime(item.date)}
                                                {item.creator ? ` • ${item.creator}` : ''}
                                            </div>
                                            <div className="bg-bg-subtle p-3 rounded-lg rounded-tr-none text-sm text-text-default border border-border-default space-y-1">
                                                <p className="font-bold">{item.title}</p>
                                                {(item.process || item.stage) ? (
                                                    <p className="text-xs text-text-muted">
                                                        {[item.process, item.stage].filter(Boolean).join(' — ')}
                                                    </p>
                                                ) : null}
                                                {item.description ? (
                                                    <p className="text-xs text-text-muted whitespace-pre-wrap">{item.description}</p>
                                                ) : null}
                                                <p className="text-[11px] text-text-subtle">סטטוס: {item.status}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Drawer>
    );
};

export default ContactDrawer;
