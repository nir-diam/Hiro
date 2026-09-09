
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
    BuildingOffice2Icon,
    UserGroupIcon,
    BriefcaseIcon,
    CalendarDaysIcon,
    DocumentTextIcon,
    ClockIcon,
    BanknotesIcon,
    ClipboardDocumentCheckIcon,
    ArrowPathIcon,
} from './Icons';
import { ClientInsightsDashboard } from './ClientProfileView';
import ClientDetailsTab from './ClientDetailsTab';
import ClientContactsTab from './ClientContactsTab';
import ClientContactProcessesTab from './ClientContactProcessesTab';
import ClientJobsTab from './ClientJobsTab';
import OrganizationEventsTab from './OrganizationEventsTab';
import OrganizationHistoryTab from './OrganizationHistoryTab';
import ClientDocumentsTab from './ClientDocumentsTab';
import ClientTasksTab from './ClientTasksTab';
import ClientFinanceTab from './ClientFinanceTab';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';

type Tab = 'details' | 'tasks' | 'contacts' | 'processes' | 'jobs' | 'events' | 'documents' | 'finance' | 'history';

const PROFILE_TABS = new Set<Tab>([
    'details',
    'tasks',
    'contacts',
    'processes',
    'jobs',
    'events',
    'documents',
    'finance',
    'history',
]);

interface OrganizationProfileViewProps {
    openMessageModal?: (config: MessageModalConfig) => void;
}

const OrganizationProfileView: React.FC<OrganizationProfileViewProps> = ({ openMessageModal }) => {
    const { t } = useLanguage();
    const { organizationId: organizationIdParam, organizationTmpId } = useParams<{
        organizationId?: string;
        organizationTmpId?: string;
    }>();
    const isPendingOrg = Boolean(organizationTmpId);
    const organizationId = isPendingOrg ? null : (organizationIdParam || null);
    const resolvedOrgKey = organizationTmpId || organizationIdParam || null;
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

    const [searchParams] = useSearchParams();
    const tabFromUrl = searchParams.get('tab');
    const pipelineFromUrl = searchParams.get('pipelineId');
    const processStageFromUrl = searchParams.get('processStage');

    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (tabFromUrl && PROFILE_TABS.has(tabFromUrl as Tab)) return tabFromUrl as Tab;
        return 'details';
    });
    const [eventsPipelineId, setEventsPipelineId] = useState<string | null>(pipelineFromUrl);
    const [eventsProcessStageId, setEventsProcessStageId] = useState<string | null>(processStageFromUrl);
    const apiBase = import.meta.env.VITE_API_BASE || '';

    useEffect(() => {
        if (tabFromUrl && PROFILE_TABS.has(tabFromUrl as Tab)) {
            setActiveTab(tabFromUrl as Tab);
        }
        setEventsPipelineId(pipelineFromUrl);
        setEventsProcessStageId(processStageFromUrl);
    }, [tabFromUrl, pipelineFromUrl, processStageFromUrl]);

    const [org, setOrg] = useState<Record<string, unknown> | null>(null);
    const [client, setClient] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load organization (approved or pending tmp)
    useEffect(() => {
        if (!apiBase || !resolvedOrgKey) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        const url = isPendingOrg
            ? `${apiBase}/api/organizations/tmp/${encodeURIComponent(resolvedOrgKey)}`
            : `${apiBase}/api/organizations/${encodeURIComponent(resolvedOrgKey)}`;
        fetch(url, { headers: authHeaders(true) })
            .then((r) => {
                if (!r.ok) throw new Error('Organization not found');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                setOrg(data);
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Organization not found');
                setOrg(null);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, resolvedOrgKey, isPendingOrg]);

    // Resolve linked client (tenant's own client, or org's primary client for admin)
    useEffect(() => {
        if (!apiBase || !resolvedOrgKey) return;
        let active = true;

        const resolve = async () => {
            let clientId: string | null = tenantClientId;

            if (!clientId && !isPendingOrg && organizationIdParam) {
                try {
                    const r = await fetch(
                        `${apiBase}/api/organizations/${encodeURIComponent(organizationIdParam)}/primary-client`,
                        { headers: authHeaders(true) },
                    );
                    if (r.ok) {
                        const d = await r.json();
                        clientId = d.clientId || null;
                    }
                } catch { /* ignore */ }
            }

            if (!clientId) {
                if (active) setClient(null);
                return;
            }

            try {
                const r = await fetch(`${apiBase}/api/clients/${encodeURIComponent(clientId)}`, {
                    headers: authHeaders(true),
                });
                if (!active) return;
                if (r.ok) {
                    setClient(await r.json());
                } else {
                    setClient(null);
                }
            } catch {
                if (active) setClient(null);
            }
        };

        void resolve();
        return () => { active = false; };
    }, [apiBase, resolvedOrgKey, organizationIdParam, tenantClientId, isPendingOrg]);

    // ClientDetailsTab reads company info from organizationLinks — inject current org as primary
    const clientForDetails = useMemo(() => {
        if (!client) return null;
        if (!org) return client;
        return {
            ...client,
            organizationLinks: [
                { isPrimary: true, organization: org },
                ...(Array.isArray(client.organizationLinks)
                    ? client.organizationLinks.filter(
                        (l: any) => String(l?.organizationId || l?.organization?.id || '') !== String(organizationIdParam || ''),
                    )
                    : []),
            ],
        };
    }, [client, org, organizationIdParam]);

    const clientId = client?.id ? String(client.id) : null;
    const displayName = String(org?.name || client?.displayName || client?.name || '');
    const noopMessageModal = useCallback((_config: MessageModalConfig) => {}, []);

    const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
        { id: 'details', label: t('client_profile.tab_details'), icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { id: 'tasks', label: 'משימות', icon: <ClipboardDocumentCheckIcon className="w-5 h-5" /> },
        { id: 'contacts', label: t('client_profile.tab_contacts'), icon: <UserGroupIcon className="w-5 h-5" /> },
        { id: 'processes', label: t('client_profile.tab_processes'), icon: <ArrowPathIcon className="w-5 h-5" /> },
        { id: 'jobs', label: t('client_profile.tab_jobs'), icon: <BriefcaseIcon className="w-5 h-5" /> },
        { id: 'events', label: t('client_profile.tab_events'), icon: <CalendarDaysIcon className="w-5 h-5" /> },
        { id: 'documents', label: t('client_profile.tab_documents'), icon: <DocumentTextIcon className="w-5 h-5" /> },
        { id: 'finance', label: 'כספים', icon: <BanknotesIcon className="w-5 h-5" /> },
        { id: 'history', label: 'היסטוריית לקוח', icon: <ClockIcon className="w-5 h-5" /> },
    ];

    if (isLoading) {
        return <div className="text-center p-8">טוען...</div>;
    }
    if (error || !org) {
        return <div className="text-center p-8">{error || 'ארגון לא נמצא.'}</div>;
    }

    const noClientMsg = (
        <div className="text-center p-8 text-text-muted">אין לקוח מקושר להציג נתונים אלה.</div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        <div className="lg:col-span-2 space-y-6">
                            {organizationIdParam ? (
                                <ClientInsightsDashboard
                                    organizationId={organizationIdParam}
                                    clientId={clientId || undefined}
                                    creationDate={
                                        (org as any)?.createdAt
                                        || client?.creationDate
                                        || client?.createdAt
                                    }
                                />
                            ) : (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-amber-950">
                                    <p className="font-bold mb-1">חברה ממתינה לאישור מנהל</p>
                                    <p className="text-amber-900/90">
                                        אפשר לנהל אנשי קשר, משתמשים ומשימות כרגיל. נתוני חברה מורחבים יתעדכנו
                                        לאחר אישור האדמין.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="lg:col-span-1 space-y-6">
                            {clientForDetails ? (
                                <ClientDetailsTab
                                    client={clientForDetails}
                                    onClientUpdated={setClient}
                                />
                            ) : noClientMsg}
                        </div>
                    </div>
                );
            case 'tasks':
                return clientId ? (
                    <ClientTasksTab
                        clientId={clientId}
                        organizationId={isPlatformAdmin ? undefined : organizationIdParam || undefined}
                    />
                ) : noClientMsg;
            case 'contacts':
                return clientId ? (
                    <ClientContactsTab
                        clientId={clientId}
                        organizationId={
                            isPlatformAdmin && !organizationTmpId ? undefined : organizationIdParam || undefined
                        }
                        organizationTmpId={organizationTmpId || undefined}
                        onOpenMessageModal={openMessageModal || noopMessageModal}
                    />
                ) : noClientMsg;
            case 'processes':
                return clientId && (organizationIdParam || organizationTmpId) ? (
                    <ClientContactProcessesTab
                        clientId={clientId}
                        organizationId={organizationIdParam || undefined}
                        organizationTmpId={organizationTmpId || undefined}
                        organizationName={displayName}
                    />
                ) : noClientMsg;
            case 'jobs':
                if (isPlatformAdmin && clientId) {
                    return <ClientJobsTab clientId={clientId} allLinkedOrganizations />;
                }
                return organizationIdParam ? (
                    <ClientJobsTab organizationId={organizationIdParam} clientId={clientId || undefined} />
                ) : clientId ? (
                    <ClientJobsTab clientId={clientId} allLinkedOrganizations />
                ) : noClientMsg;
            case 'events':
                return clientId && (organizationIdParam || organizationTmpId) ? (
                    <OrganizationEventsTab
                        key={`${eventsPipelineId || 'all'}:${eventsProcessStageId || ''}`}
                        clientId={clientId}
                        organizationId={organizationIdParam || undefined}
                        organizationTmpId={organizationTmpId || undefined}
                        organizationName={displayName}
                        defaultActionPipelineId={eventsPipelineId}
                        defaultProcessStageId={eventsProcessStageId}
                    />
                ) : noClientMsg;
            case 'documents':
                return clientId && organizationIdParam ? (
                    <ClientDocumentsTab
                        clientId={clientId}
                        clientName={displayName}
                        organizationId={organizationIdParam}
                    />
                ) : clientId ? (
                    <ClientDocumentsTab
                        clientId={clientId}
                        clientName={displayName}
                    />
                ) : noClientMsg;
            case 'finance':
                return clientId ? (
                    <ClientFinanceTab clientId={clientId} clientName={displayName} />
                ) : noClientMsg;
            case 'history':
                return organizationIdParam ? (
                    <OrganizationHistoryTab
                        organizationId={organizationIdParam}
                        organizationName={displayName}
                    />
                ) : (
                    <div className="text-center p-8 text-text-muted">
                        היסטוריית שינויים תופיע לאחר אישור החברה על ידי מנהל.
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-text-default">{displayName}</h1>
                    {isPendingOrg ? (
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                            ממתין לאישור
                        </span>
                    ) : null}
                </div>
                <p className="text-sm text-text-muted">ניהול כל המידע והפעילויות הקשורות לארגון.</p>
            </header>

            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto no-scrollbar">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${
                                activeTab === tab.id
                                    ? 'border-b-2 border-primary-500 text-primary-600'
                                    : 'text-text-muted hover:text-text-default'
                            }`}
                        >
                            {React.cloneElement(tab.icon as React.ReactElement<{ className?: string }>, { className: 'w-5 h-5' })}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </nav>
            </div>

            <main>
                {renderContent()}
            </main>
        </div>
    );
};

export default OrganizationProfileView;
