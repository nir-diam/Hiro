
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
    BuildingOffice2Icon,
    UserGroupIcon,
    BriefcaseIcon,
    CalendarDaysIcon,
    DocumentTextIcon,
    ClockIcon,
    BanknotesIcon,
    ClipboardDocumentCheckIcon,
} from './Icons';
import { ClientInsightsDashboard } from './ClientProfileView';
import ClientDetailsTab from './ClientDetailsTab';
import ClientContactsTab from './ClientContactsTab';
import ClientJobsTab from './ClientJobsTab';
import ClientEventsTab from './ClientEventsTab';
import ClientDocumentsTab from './ClientDocumentsTab';
import ClientTasksTab from './ClientTasksTab';
import ClientFinanceTab from './ClientFinanceTab';
import ClientHistoryTab from './ClientHistoryTab';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { authHeaders } from '../utils/authHeaders';

type Tab = 'details' | 'tasks' | 'contacts' | 'jobs' | 'events' | 'documents' | 'finance' | 'history';

interface OrganizationProfileViewProps {
    openMessageModal?: (config: MessageModalConfig) => void;
}

const OrganizationProfileView: React.FC<OrganizationProfileViewProps> = ({ openMessageModal }) => {
    const { t } = useLanguage();
    const { organizationId } = useParams<{ organizationId: string }>();
    const { user } = useAuth();
    const isPlatformAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const tenantClientId = !isPlatformAdmin && user?.clientId ? String(user.clientId) : null;

    const [activeTab, setActiveTab] = useState<Tab>('details');
    const apiBase = import.meta.env.VITE_API_BASE || '';

    const [org, setOrg] = useState<Record<string, unknown> | null>(null);
    const [client, setClient] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load organization
    useEffect(() => {
        if (!apiBase || !organizationId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/organizations/${encodeURIComponent(organizationId)}`, { headers: authHeaders(true) })
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
    }, [apiBase, organizationId]);

    // Resolve linked client (tenant's own client, or org's primary client for admin)
    useEffect(() => {
        if (!apiBase || !organizationId) return;
        let active = true;

        const resolve = async () => {
            let clientId: string | null = tenantClientId;

            if (!clientId) {
                try {
                    const r = await fetch(
                        `${apiBase}/api/organizations/${encodeURIComponent(organizationId)}/primary-client`,
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
    }, [apiBase, organizationId, tenantClientId]);

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
                        (l: any) => String(l?.organizationId || l?.organization?.id || '') !== String(organizationId),
                    )
                    : []),
            ],
        };
    }, [client, org, organizationId]);

    const clientId = client?.id ? String(client.id) : null;
    const displayName = String(org?.name || client?.displayName || client?.name || '');

    const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
        { id: 'details', label: t('client_profile.tab_details'), icon: <BuildingOffice2Icon className="w-5 h-5" /> },
        { id: 'tasks', label: 'משימות', icon: <ClipboardDocumentCheckIcon className="w-5 h-5" /> },
        { id: 'contacts', label: t('client_profile.tab_contacts'), icon: <UserGroupIcon className="w-5 h-5" /> },
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
                            {organizationId ? (
                                <ClientInsightsDashboard
                                    organizationId={organizationId}
                                    clientId={clientId || undefined}
                                    creationDate={
                                        (org as any)?.createdAt
                                        || client?.creationDate
                                        || client?.createdAt
                                    }
                                />
                            ) : noClientMsg}
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
                        organizationId={isPlatformAdmin ? undefined : organizationId}
                    />
                ) : noClientMsg;
            case 'contacts':
                return clientId ? (
                    <ClientContactsTab
                        clientId={clientId}
                        // Admin: all client contacts. Tenant: only this organization's contacts.
                        organizationId={isPlatformAdmin ? undefined : organizationId}
                        onOpenMessageModal={openMessageModal || (() => {})}
                    />
                ) : noClientMsg;
            case 'jobs':
                // Admin: all jobs across every org linked to this client.
                // Tenant: only this organization's jobs.
                if (isPlatformAdmin && clientId) {
                    return <ClientJobsTab clientId={clientId} allLinkedOrganizations />;
                }
                return organizationId ? (
                    <ClientJobsTab organizationId={organizationId} clientId={clientId || undefined} />
                ) : noClientMsg;
            case 'events':
                return clientId ? (
                    <ClientEventsTab
                        clientId={clientId}
                        clientName={displayName}
                        organizationId={isPlatformAdmin ? undefined : organizationId}
                    />
                ) : noClientMsg;
            case 'documents':
                return clientId ? (
                    <ClientDocumentsTab clientId={clientId} clientName={displayName} />
                ) : noClientMsg;
            case 'finance':
                return clientId ? (
                    <ClientFinanceTab clientId={clientId} clientName={displayName} />
                ) : noClientMsg;
            case 'history':
                return clientId ? (
                    <ClientHistoryTab clientId={clientId} clientName={displayName} />
                ) : noClientMsg;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default">{displayName}</h1>
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
