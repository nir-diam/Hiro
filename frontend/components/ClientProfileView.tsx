
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { clientsData } from './ClientsListView';
import { 
    BuildingOffice2Icon, 
    UserGroupIcon, 
    BriefcaseIcon, 
    CalendarDaysIcon, 
    DocumentTextIcon,
    ArchiveBoxIcon,
    CheckBadgeIcon,
    ClockIcon
} from './Icons';
import ClientDetailsTab from './ClientDetailsTab';
import ClientContactsTab from './ClientContactsTab';
import ClientJobsTab from './ClientJobsTab';
import ClientEventsTab from './ClientEventsTab';
import ClientDocumentsTab from './ClientDocumentsTab';
import AccordionSection from './AccordionSection';
import { MessageModalConfig } from '../hooks/useUIState';

type Tab = 'details' | 'contacts' | 'jobs' | 'events' | 'documents';

const tabs: { id: Tab; label: string; icon: React.ReactElement }[] = [
    { id: 'details', label: 'פרטי לקוח', icon: <BuildingOffice2Icon className="w-5 h-5" /> },
    { id: 'contacts', label: 'אנשי קשר', icon: <UserGroupIcon className="w-5 h-5" /> },
    { id: 'jobs', label: 'משרות', icon: <BriefcaseIcon className="w-5 h-5" /> },
    { id: 'events', label: 'אירועים', icon: <CalendarDaysIcon className="w-5 h-5" /> },
    { id: 'documents', label: 'מסמכים', icon: <DocumentTextIcon className="w-5 h-5" /> },
];


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


const ClientInsightsDashboard: React.FC = () => {
    // Mock data for insights
    const insights = {
        openJobs: 12,
        frozenJobs: 3,
        closedJobs: 28,
        avgJobLifespan: "42 ימים",
        submissions: {
            week: 15,
            month: 62,
            year: 740,
        },
        hiredCount: 21,
        daysSinceStart: 452,
    };

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard title="משרות פתוחות" value={insights.openJobs.toString()} icon={<BriefcaseIcon />} colorClass={{ bg: 'bg-primary-100', text: 'text-primary-600' }} />
                <StatCard title="משרות מוקפאות" value={insights.frozenJobs.toString()} icon={<ArchiveBoxIcon />} colorClass={{ bg: 'bg-yellow-100', text: 'text-yellow-600' }} />
                <StatCard title="משרות סגורות" value={insights.closedJobs.toString()} icon={<CheckBadgeIcon />} colorClass={{ bg: 'bg-green-100', text: 'text-green-600' }} />
                <StatCard title="אורך חיי משרה" value={insights.avgJobLifespan} icon={<ClockIcon />} colorClass={{ bg: 'bg-secondary-100', text: 'text-secondary-600' }} />
            </div>

            {/* Detailed Insights */}
            <AccordionSection title="פעילות גיוס" icon={<UserGroupIcon className="w-5 h-5"/>} defaultOpen>
                <dl className="text-sm">
                    <InfoItem label="כמות הפניות (השבוע)">{insights.submissions.week}</InfoItem>
                    <InfoItem label="כמות הפניות (החודש)">{insights.submissions.month}</InfoItem>
                    <InfoItem label="כמות הפניות (השנה)">{insights.submissions.year}</InfoItem>
                    <InfoItem label="סה״כ מועמדים שהתקבלו">{insights.hiredCount}</InfoItem>
                </dl>
            </AccordionSection>

            <AccordionSection title="מדדי קשר" icon={<CalendarDaysIcon className="w-5 h-5"/>} defaultOpen>
                <dl className="text-sm">
                    <InfoItem label="ימים מתחילת ההתקשרות">{insights.daysSinceStart}</InfoItem>
                </dl>
            </AccordionSection>
        </div>
    );
};

interface ClientProfileViewProps {
    openMessageModal: (config: MessageModalConfig) => void;
}

const ClientProfileView: React.FC<ClientProfileViewProps> = ({ openMessageModal }) => {
    const { clientId } = useParams<{ clientId: string }>();
    const [activeTab, setActiveTab] = useState<Tab>('details');

    const client = clientsData.find(c => c.id === Number(clientId));

    if (!client) {
        return <div className="text-center p-8">לקוח לא נמצא.</div>;
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                        <div className="lg:col-span-2 space-y-6">
                            <ClientInsightsDashboard />
                        </div>
                        <div className="lg:col-span-1 space-y-6">
                            <ClientDetailsTab />
                        </div>
                    </div>
                );
            case 'contacts': return <ClientContactsTab clientId={clientId!} onOpenMessageModal={openMessageModal} />;
            case 'jobs': return <ClientJobsTab />;
            case 'events': return <ClientEventsTab />;
            case 'documents': return <ClientDocumentsTab />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-text-default">{client.name}</h1>
                <p className="text-sm text-text-muted">ניהול כל המידע והפעילויות הקשורות ללקוח.</p>
            </header>
            
            <div className="border-b border-border-default">
                <nav className="flex items-center -mb-px gap-4 overflow-x-auto">
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
