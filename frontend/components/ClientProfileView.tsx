
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { 
    BuildingOffice2Icon, 
    UserGroupIcon, 
    BriefcaseIcon, 
    CalendarDaysIcon, 
    DocumentTextIcon,
    ArchiveBoxIcon,
    CheckBadgeIcon,
    ClockIcon,
    BanknotesIcon,
    ClipboardDocumentCheckIcon 
} from './Icons';
import ClientDetailsTab from './ClientDetailsTab';
import ClientContactsTab from './ClientContactsTab';
import ClientJobsTab from './ClientJobsTab';
import ClientEventsTab from './ClientEventsTab';
import ClientDocumentsTab from './ClientDocumentsTab';
import ClientTasksTab from './ClientTasksTab'; 
import ClientFinanceTab from './ClientFinanceTab'; // Changed import
import ClientHistoryTab from './ClientHistoryTab';
import AccordionSection from './AccordionSection';
import DocumentViewerModal from './DocumentViewerModal';
import { MessageModalConfig } from '../hooks/useUIState';
import { useLanguage } from '../context/LanguageContext';
import { authHeaders } from '../utils/authHeaders';

type Tab = 'details' | 'tasks' | 'contacts' | 'jobs' | 'events' | 'documents' | 'finance' | 'history'; 

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactElement; colorClass: { bg: string; text: string; } }> = ({ title, value, icon, colorClass }) => (
    <div className="bg-bg-card p-4 rounded-xl border border-border-default flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
        <div className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center ${colorClass.bg}`}>
            {React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: `w-6 h-6 ${colorClass.text}` })}
        </div>
        <div>
            <p className="text-sm font-semibold text-text-muted">{title}</p>
            <p className="text-2xl font-bold text-text-default">{value}</p>
        </div>
    </div>
);

const InfoItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex justify-between items-center py-2 border-b border-border-subtle last:border-b-0">
        <dt className="font-semibold text-text-muted">{label}</dt>
        <dd className="font-bold text-text-default">{children}</dd>
    </div>
);

type ClientInsights = {
    openJobs: number | null;
    frozenJobs: number | null;
    closedJobs: number | null;
    referrals: { week: number | null; month: number | null; year: number | null };
    hiredCount: number | null;
};

export const ClientInsightsDashboard: React.FC<{
    clientId?: string;
    /** When set, loads org-scoped insights (jobs/referrals for this org under the client). */
    organizationId?: string;
    creationDate?: string;
}> = ({ clientId, organizationId, creationDate }) => {
    const { t } = useLanguage();
    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [insights, setInsights] = useState<ClientInsights>({
        openJobs: null, frozenJobs: null, closedJobs: null,
        referrals: { week: null, month: null, year: null },
        hiredCount: null,
    });
    const [relationshipStartedAt, setRelationshipStartedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!apiBase) return;
        if (!organizationId && !clientId) return;
        setLoading(true);
        const url = organizationId
            ? `${apiBase}/api/organizations/${encodeURIComponent(organizationId)}/insights${
                clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''
              }`
            : `${apiBase}/api/clients/${encodeURIComponent(clientId!)}/insights`;
        fetch(url, { headers: authHeaders(true) })
            .then((r) => r.ok ? r.json() : Promise.reject(r))
            .then((data) => {
                setInsights({
                    openJobs: data.openJobs ?? 0,
                    frozenJobs: data.frozenJobs ?? 0,
                    closedJobs: data.closedJobs ?? 0,
                    referrals: {
                        week: data.referrals?.week ?? 0,
                        month: data.referrals?.month ?? 0,
                        year: data.referrals?.year ?? 0,
                    },
                    hiredCount: data.hiredCount ?? 0,
                });
                setRelationshipStartedAt(data.relationshipStartedAt || null);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [clientId, organizationId, apiBase]);

    const fmt = (v: number | null) => loading ? '…' : (v == null ? '—' : String(v));

    const startDate = relationshipStartedAt || creationDate;
    const daysSinceStart = startDate
        ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000)
        : null;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard title={t('client_profile.stat_open_jobs')} value={fmt(insights.openJobs)} icon={<BriefcaseIcon />} colorClass={{ bg: 'bg-primary-100', text: 'text-primary-600' }} />
                <StatCard title={t('client_profile.stat_frozen_jobs')} value={fmt(insights.frozenJobs)} icon={<ArchiveBoxIcon />} colorClass={{ bg: 'bg-yellow-100', text: 'text-yellow-600' }} />
                <StatCard title={t('client_profile.stat_closed_jobs')} value={fmt(insights.closedJobs)} icon={<CheckBadgeIcon />} colorClass={{ bg: 'bg-green-100', text: 'text-green-600' }} />
            </div>

            <AccordionSection title={t('client_profile.section_insights')} icon={<UserGroupIcon className="w-5 h-5"/>} defaultOpen>
                <dl className="text-sm">
                    <InfoItem label={t('client_profile.insight_submissions_week')}>{fmt(insights.referrals.week)}</InfoItem>
                    <InfoItem label={t('client_profile.insight_submissions_month')}>{fmt(insights.referrals.month)}</InfoItem>
                    <InfoItem label={t('client_profile.insight_submissions_year')}>{fmt(insights.referrals.year)}</InfoItem>
                    <InfoItem label={t('client_profile.insight_hired')}>{fmt(insights.hiredCount)}</InfoItem>
                </dl>
            </AccordionSection>

            <AccordionSection title={t('client_profile.section_relationship')} icon={<CalendarDaysIcon className="w-5 h-5"/>} defaultOpen>
                <dl className="text-sm">
                    <InfoItem label={t('client_profile.insight_days_start')}>{daysSinceStart != null ? String(daysSinceStart) : '—'}</InfoItem>
                </dl>
            </AccordionSection>
        </div>
    );
};

interface ClientProfileViewProps {
    openMessageModal: (config: MessageModalConfig) => void;
}

const ClientProfileView: React.FC<ClientProfileViewProps> = ({ openMessageModal }) => {
    const { t } = useLanguage();
    const { clientId } = useParams<{ clientId: string }>();
    const [activeTab, setActiveTab] = useState<Tab>('details');

    const apiBase = import.meta.env.VITE_API_BASE || '';
    const [client, setClient] = useState<any | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!apiBase || !clientId) return;
        let active = true;
        setIsLoading(true);
        setError(null);
        fetch(`${apiBase}/api/clients/${clientId}`)
            .then((r) => {
                if (!r.ok) throw new Error('Client not found');
                return r.json();
            })
            .then((data) => {
                if (!active) return;
                setClient(data);
            })
            .catch((e: any) => {
                if (!active) return;
                setError(e?.message || 'Client not found');
                setClient(null);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [apiBase, clientId]);

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
    if (error || !client) {
        return <div className="text-center p-8">{error || 'לקוח לא נמצא.'}</div>;
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        <div className="lg:col-span-2 space-y-6">
                            <ClientInsightsDashboard clientId={clientId!} creationDate={client?.creationDate || client?.createdAt} />
                        </div>
                        <div className="lg:col-span-1 space-y-6">
                            <ClientDetailsTab client={client} onClientUpdated={setClient} />
                        </div>
                    </div>
                );
            case 'tasks': return <ClientTasksTab clientId={clientId!} />; 
            case 'contacts': return <ClientContactsTab clientId={clientId!} onOpenMessageModal={openMessageModal} />;
            case 'jobs': return <ClientJobsTab clientId={clientId!} allLinkedOrganizations />;
            case 'events': return <ClientEventsTab clientId={clientId!} clientName={client.displayName || client.name} />;
            case 'documents': return <ClientDocumentsTab clientId={clientId!} clientName={client.displayName || client.name} />;
            case 'finance': return <ClientFinanceTab clientId={clientId!} clientName={client.displayName || client.name} />;
            case 'history': return <ClientHistoryTab clientId={clientId!} clientName={client.displayName || client.name} />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default">{client.displayName || client.name}</h1>
                <p className="text-sm text-text-muted">ניהול כל המידע והפעילויות הקשורות ללקוח.</p>
            </header>
            
            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto no-scrollbar">
                    {tabs.map(tab => (
                         <button 
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 py-3 px-5 font-semibold transition-colors shrink-0 ${activeTab === tab.id ? 'border-b-2 border-primary-500 text-primary-600' : 'text-text-muted hover:text-text-default'}`}
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

export default ClientProfileView;
