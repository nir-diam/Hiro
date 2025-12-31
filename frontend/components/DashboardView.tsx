
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
    Cog6ToothIcon, InformationCircleIcon, ArrowPathIcon, MagnifyingGlassIcon, UserGroupIcon, BriefcaseIcon, 
    ArrowTopRightOnSquareIcon, ClockIcon, PaperAirplaneIcon, CheckCircleIcon, AdjustmentsHorizontalIcon, ChartBarIcon,
    UserPlusIcon, ChevronUpIcon, ChevronDownIcon, CheckIcon, BellIcon, ExclamationTriangleIcon, CalendarIcon
} from './Icons';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';
import RecruitmentGoalWidget from './RecruitmentGoalWidget';
import DevAnnotation from './DevAnnotation';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import { useLanguage } from '../context/LanguageContext';

// --- Reusable Dashboard Components ---

const DashboardCard: React.FC<{ children: React.ReactNode; className?: string; title: string; linkText?: string; onLinkClick?: () => void; chartColorClass?: string; chartColorShade?: string; icon?: React.ReactNode }> = ({ children, className = '', title, linkText, onLinkClick, chartColorClass = 'primary', chartColorShade = '600', icon }) => (
    <div className={`bg-bg-card rounded-2xl border border-border-default shadow-sm flex flex-col h-full overflow-hidden ${className}`}>
        <header className="px-5 py-4 border-b border-border-subtle flex justify-between items-center bg-white">
            <div className="flex items-center gap-2">
                {icon && <div className="text-primary-500">{icon}</div>}
                <h3 className="font-bold text-base text-text-default truncate" title={title}>{title}</h3>
            </div>
            {linkText && onLinkClick ? (
                 <button onClick={onLinkClick} className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors">
                    {linkText}
                </button>
            ) : null}
        </header>
        <div className="p-5 flex-grow flex flex-col" style={{'--chart-color': `rgb(var(--color-${chartColorClass}-${chartColorShade}))`, '--chart-color-subtle': `rgb(var(--color-${chartColorClass}-100))` } as React.CSSProperties}>
            {children}
        </div>
    </div>
);

// Smart KPI Card
interface KpiCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    sentiment?: 'neutral' | 'success' | 'warning' | 'critical';
    trend?: number; // Percentage change (+ or -)
    subtext?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, sentiment = 'neutral', trend, subtext }) => {
    let colorStyles = 'bg-white border-border-default hover:border-primary-300';
    let iconBg = 'bg-primary-50';
    let iconColor = 'text-primary-600';
    let valueColor = 'text-text-default';

    if (sentiment === 'critical') {
        iconBg = 'bg-red-50';
        iconColor = 'text-red-500';
    } else if (sentiment === 'warning') {
        iconBg = 'bg-orange-50';
        iconColor = 'text-orange-500';
    } else if (sentiment === 'success') {
        iconBg = 'bg-emerald-50';
        iconColor = 'text-emerald-500';
    }

    return (
        <div className={`${colorStyles} rounded-2xl border shadow-sm flex flex-col items-center justify-center p-6 transition-all hover:shadow-md h-full text-center relative overflow-hidden group`}>
             {/* Trend Badge (Absolute Top Right) */}
             {trend !== undefined && (
                 <div className={`absolute top-3 right-3 flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {trend > 0 ? '+' : ''}{trend}%
                </div>
            )}
            
            <div className={`p-3 rounded-2xl mb-4 ${iconBg} ${iconColor} transition-colors transform group-hover:scale-110 duration-200`}>
                {React.cloneElement(icon as React.ReactElement<any>, { className: "w-8 h-8" })}
            </div>
            
            <div>
                <p className="text-4xl font-extrabold tracking-tight text-text-default mb-1">{value}</p>
                <p className="text-sm font-medium text-text-muted">{title}</p>
                {subtext && <p className="text-xs text-text-subtle mt-1.5 opacity-80">{subtext}</p>}
            </div>
        </div>
    );
};

const KpiCardsGrid: React.FC<{ kpis: (KpiCardProps & { id: string })[] }> = ({ kpis }) => {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {kpis.map((kpi) => (
                <div key={kpi.id} className="col-span-1">
                    <KpiCard {...kpi} />
                </div>
            ))}
        </div>
    );
};

const VerticalBarChart: React.FC<{ data: { label: string; value: number }[]; max: number; }> = ({ data, max }) => (
    <div className="flex justify-around items-end h-40 gap-1 pt-4 pb-2">
        {data.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                <div className="relative w-full h-full flex items-end justify-center">
                    <div 
                        className="w-full max-w-[12px] rounded-t-md opacity-60 group-hover:opacity-100 transition-all duration-300 bg-primary-400 group-hover:bg-primary-600 relative" 
                        style={{ height: `${(item.value / max) * 100}%` }}
                    ></div>
                </div>
                {index % 2 === 0 && <span className="text-[10px] text-text-subtle">{item.label}</span>}
            </div>
        ))}
    </div>
);

const FunnelChart: React.FC<{ data: { label: string; value: number; total?: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-4 py-2">
        {data.map((item, index) => {
            const widthPercent = Math.max((item.value / max) * 100, 5);
            const opacity = 1 - (index * 0.15); 
            return (
                <div key={index} className="relative group">
                    <div className="flex items-center h-8">
                        <div className="w-28 flex-shrink-0 text-xs font-semibold text-text-muted pl-1">{item.label}</div>
                        <div className="flex-grow relative h-full flex items-center">
                            <div className="h-full rounded-r-lg rounded-l-sm bg-primary-500 transition-all duration-500 ease-out shadow-sm relative z-10 flex items-center justify-end px-2" style={{ width: `${widthPercent}%`, opacity: Math.max(opacity, 0.3) }}>
                                <span className="text-white text-xs font-bold">{item.value}</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        })}
    </div>
);

const CompactBarChart: React.FC<{ data: { label: string; value: number; total?: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-3">
        {data.map((item, index) => (
            <div key={index} className="group">
                <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-text-default font-medium truncate max-w-[60%]">{item.label}</span>
                    <span className="text-text-muted font-bold tabular-nums">{item.value}</span>
                </div>
                <div className="w-full bg-bg-subtle rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 ease-out group-hover:opacity-80" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: 'var(--chart-color)' }}></div>
                </div>
            </div>
        ))}
    </div>
);

const SimpleList: React.FC<{ items: { main: string; sub?: string }[] }> = ({ items }) => (
    <div className="space-y-0 divide-y divide-border-subtle -my-2">
        {items.map((item, index) => (
            <div key={index} className="flex flex-col justify-center py-3 first:pt-1 last:pb-1 hover:bg-bg-subtle/30 px-2 rounded transition-colors cursor-default">
                <span className="font-semibold text-text-default text-sm truncate">{item.main}</span>
                {item.sub && <span className="text-text-muted text-xs truncate mt-0.5">{item.sub}</span>}
            </div>
        ))}
    </div>
);

// --- NEW WIDGETS FOR COMPANY DASHBOARD ---

const TimeToHireWidget: React.FC<{ className?: string, title: string }> = ({ className, title }) => {
    const data = [
        { label: 'Q1', value: 45 }, { label: 'Q2', value: 42 }, { label: 'Q3', value: 48 }, { label: 'Q4', value: 40 },
        { label: 'Q5', value: 38 }, { label: 'Q6', value: 35 }, { label: 'Q7', value: 36 }, { label: 'Q8', value: 32 },
        { label: 'Q9', value: 30 }, { label: 'Q10', value: 28 }, { label: 'Q11', value: 29 }, { label: 'Q12', value: 25 }
    ];
    return (
        <DashboardCard title={title} className={className}>
             <div className="flex flex-col h-full justify-end">
                <VerticalBarChart data={data} max={50} />
                <div className="text-center mt-2">
                    <span className="text-xs text-text-muted">Avg: <span className="font-bold text-text-default">34 days</span></span>
                    <span className="text-xs text-green-600 font-bold mr-2">▼ 15%</span>
                </div>
             </div>
        </DashboardCard>
    );
};

const RecruiterPerformanceWidget: React.FC<{ className?: string, title: string }> = ({ className, title }) => {
    const recruiters = [
        { name: 'Dana Cohen', sent: 120, interviewed: 45, hired: 8 },
        { name: 'Aviv Levi', sent: 95, interviewed: 30, hired: 5 },
        { name: 'Yael Shahar', sent: 150, interviewed: 55, hired: 12 },
    ];
    
    return (
        <DashboardCard title={title} className={className}>
            <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                    <thead>
                        <tr className="border-b border-border-default text-text-muted">
                            <th className="pb-2 font-medium">Recruiter</th>
                            <th className="pb-2 font-medium text-center">Ref.</th>
                            <th className="pb-2 font-medium text-center">Int.</th>
                            <th className="pb-2 font-medium text-center">Hired</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                        {recruiters.map((r, i) => (
                            <tr key={i} className="group">
                                <td className="py-3 font-semibold text-text-default">{r.name}</td>
                                <td className="py-3 text-center text-text-muted">{r.sent}</td>
                                <td className="py-3 text-center text-text-muted">{r.interviewed}</td>
                                <td className="py-3 text-center">
                                    <span className="bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-bold">{r.hired}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </DashboardCard>
    );
}

// --- NEW WIDGET COMPONENTS FOR PERSONAL DASHBOARD ---

const MyTasksWidget: React.FC<{ title: string }> = ({ title }) => {
    const tasks = [
        { id: 1, title: 'Interview with Maya Cohen', time: 'Today, 14:00', status: 'urgent' },
        { id: 2, title: 'Update status for Product Manager job', time: 'Tomorrow', status: 'pending' },
        { id: 3, title: 'Send contract to Getter Group', time: 'Thu', status: 'urgent' },
        { id: 4, title: 'Review new CVs (15)', time: 'This week', status: 'done' },
    ];

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'urgent': return 'bg-red-500';
            case 'pending': return 'bg-orange-500';
            case 'done': return 'bg-green-500';
            default: return 'bg-gray-300';
        }
    };

    return (
        <DashboardCard title={title} icon={<CheckCircleIcon className="w-5 h-5"/>} linkText="..." onLinkClick={() => {}}>
            <div className="space-y-0 divide-y divide-border-subtle -mx-4">
                {tasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-4 hover:bg-bg-subtle/30 transition-colors group cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(task.status)}`}></div>
                            <span className="text-sm font-medium text-text-default group-hover:text-primary-700 transition-colors">{task.title}</span>
                        </div>
                        <span className="text-xs text-text-muted bg-bg-subtle px-2 py-1 rounded-md">{task.time}</span>
                    </div>
                ))}
            </div>
        </DashboardCard>
    );
};

const RecentUpdatesWidget: React.FC<{ title: string }> = ({ title }) => {
    const updates = [
        { id: 1, user: 'Dana Cohen', action: 'moved Gideon Shapira to Interview', time: '10m ago' },
        { id: 2, user: 'System', action: 'received new candidate Noa Levi', time: '32m ago' },
        { id: 3, user: 'Aviv Levi', action: 'updated Fullstack job status', time: '1h ago' },
        { id: 4, user: 'Yael Shahar', action: 'sent invite to Ron Kaufman', time: '2h ago' },
    ];

    return (
        <DashboardCard title={title} icon={<ClockIcon className="w-5 h-5"/>} linkText="..." onLinkClick={() => {}}>
             <div className="space-y-4 relative">
                {/* Vertical Line */}
                <div className="absolute top-2 bottom-2 right-[5px] w-0.5 bg-border-subtle"></div>
                
                {updates.map(update => (
                    <div key={update.id} className="flex items-start gap-3 relative pr-4">
                        <div className="absolute top-1.5 right-0 w-2.5 h-2.5 rounded-full bg-primary-300 border-2 border-white ring-1 ring-primary-100 z-10"></div>
                        <div className="flex-1">
                            <p className="text-xs text-text-default leading-snug">
                                <span className="font-bold text-primary-700">{update.user}</span> {update.action}
                            </p>
                            <p className="text-[10px] text-text-muted mt-0.5">{update.time}</p>
                        </div>
                    </div>
                ))}
             </div>
             <div className="mt-4 text-center">
                 <button className="text-xs text-text-subtle hover:text-primary-600 transition-colors">Load more...</button>
             </div>
        </DashboardCard>
    );
};

// --- MOCK DATA ---
const companyOpenJobs = [
    { main: 'Customer Relations Manager', sub: 'Strauss Trucks' },
    { main: 'Import Manager', sub: 'Getter Group' },
    { main: 'Part-time Clerk', sub: 'Strauss Trucks' },
    { main: 'Receptionist', sub: 'Karney Tchelet' },
    { main: 'Mechanical Engineer', sub: 'Elbit' },
];

const allPersonalViews: { id: string, name: string }[] = [
  { id: 'recruitment_goal', name: 'Recruitment Goal' },
  { id: 'my_tasks', name: 'My Tasks' },
  { id: 'recent_updates', name: 'Recent Updates' },
];

const defaultPersonalViewsConfig = allPersonalViews.map(view => ({
    ...view,
    visible: true,
}));

// ... (Keeping company chart data from previous version to ensure company tab works) ...
const companyCandidatesByStage = {
    max: 215, data: [{ label: 'CV Sent', value: 215 }, { label: 'Interview', value: 65 }, { label: 'Test', value: 32 }, { label: 'Ref Check', value: 12 }, { label: 'Offer', value: 8 }, { label: 'Signed', value: 4 }]
};
const companyTopSources = { max: 3032, data: [{ label: '(Unknown)', value: 3032 }, { label: 'AllJobs', value: 535 }, { label: 'JobMaster', value: 425 }, { label: 'Drushim', value: 95 }] };

// --- Configuration for Company Dashboard ---
const allCompanyViews: { id: string, name: string }[] = [
    { id: 'recruitment_goal_company', name: 'Recruitment Goal' },
    { id: 'candidates_by_stage', name: 'Funnel' },
    { id: 'time_to_hire', name: 'Time to Hire' },
    { id: 'recruiter_performance', name: 'Recruiter Performance' },
    { id: 'recent_open_jobs', name: 'Open Jobs' },
    { id: 'top_sources', name: 'Top Sources' },
];

const defaultCompanyViewsConfig = allCompanyViews.map(view => ({ ...view, visible: true }));

// --- Specific Widget Components (Company) ---
const CandidatesInProcessWidget = ({ className, title }: { className?: string, title: string }) => (
    <DashboardCard title={title} className={className}>
        <FunnelChart data={companyCandidatesByStage.data} max={companyCandidatesByStage.max} />
    </DashboardCard>
);
const RecentOpenJobsWidget = ({ className, title }: { className?: string, title: string }) => (
    <DashboardCard title={title} linkText="..." onLinkClick={() => {}} className={className}>
        <SimpleList items={companyOpenJobs} />
    </DashboardCard>
);
const TopSourcesWidget = ({ className, title }: { className?: string, title: string }) => (
     <DashboardCard title={title} linkText="..." onLinkClick={() => {}} className={className}>
        <CompactBarChart data={companyTopSources.data} max={companyTopSources.max} />
    </DashboardCard>
);


// --- Main Dashboard Component ---
const DashboardView: React.FC = () => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'personal' | 'company'>('personal');
    // Initialize dateRange with "Current Month" logic helper
    const getCurrentMonthRange = () => {
         const now = new Date();
         const start = new Date(now.getFullYear(), now.getMonth(), 1);
         return {
             from: start.toISOString().split('T')[0],
             to: now.toISOString().split('T')[0],
             label: t('filter_option.month')
         };
    }
    const [dateRange, setDateRange] = useState<DateRange | null>(getCurrentMonthRange());
    
    // KPIs Data - Using translation keys
    const personalKpisData: (KpiCardProps & { id: string })[] = [
        { id: 'k1', title: t('dashboard.kpi_exceptions'), value: "3", icon: <ExclamationTriangleIcon className="w-6 h-6" />, sentiment: 'critical', subtext: '-2 vs last month' },
        { id: 'k2', title: t('dashboard.kpi_monthly_referrals'), value: "42", icon: <PaperAirplaneIcon className="w-6 h-6" />, sentiment: 'neutral', subtext: '+8% vs last month', trend: 8 },
        { id: 'k3', title: t('dashboard.kpi_open_jobs'), value: "12", icon: <BriefcaseIcon className="w-6 h-6" />, sentiment: 'neutral', subtext: '0% change' },
        { id: 'k4', title: t('dashboard.kpi_active_candidates'), value: "87", icon: <UserGroupIcon className="w-6 h-6" />, sentiment: 'success', subtext: '+12% vs last month', trend: 12 },
        { id: 'k5', title: t('dashboard.kpi_interviews_today'), value: "4", icon: <CalendarIcon className="w-6 h-6" />, sentiment: 'neutral', subtext: '2 Frontal, 2 Phone' },
        { id: 'k6', title: t('dashboard.kpi_avg_status_time'), value: "5.2 days", icon: <ClockIcon className="w-6 h-6" />, sentiment: 'warning', subtext: '+10% vs last month', trend: -10 },
    ];
    
    const companyKpisData: (KpiCardProps & { id: string })[] = [
        { id: 'c2', title: t('dashboard.kpi_hires'), value: "25", icon: <CheckCircleIcon className="w-6 h-6" />, sentiment: 'success', trend: 25 },
        { id: 'c_tth', title: t('dashboard.kpi_time_to_hire'), value: "34 days", icon: <ClockIcon className="w-6 h-6" />, sentiment: 'success', trend: -15, subtext: '-5 days' },
        { id: 'c_oar', title: t('dashboard.kpi_offer_acceptance'), value: "82%", icon: <PaperAirplaneIcon className="w-6 h-6" />, sentiment: 'neutral', subtext: 'of 30 offers' },
        { id: 'c5', title: t('dashboard.kpi_waiting_screening'), value: "1,423", icon: <MagnifyingGlassIcon className="w-6 h-6" />, sentiment: 'warning', trend: 12 },
    ];

    // State Management
    const [personalViewsConfig, setPersonalViewsConfig] = useState<ViewConfig[]>(defaultPersonalViewsConfig);
    // KPIs Config - Allows reordering and hiding
    const [personalKpiConfig, setPersonalKpiConfig] = useState<ViewConfig[]>(personalKpisData.map(k => ({ id: k.id, name: k.title, visible: true })));
    
    // Company Configs
    const [companyViewsConfig, setCompanyViewsConfig] = useState<ViewConfig[]>(defaultCompanyViewsConfig);
    const [companyKpiConfig, setCompanyKpiConfig] = useState<ViewConfig[]>(companyKpisData.map(k => ({ id: k.id, name: k.title, visible: true })));
    
    // Popovers State
    const [isPersonalCustomizePopoverOpen, setIsPersonalCustomizePopoverOpen] = useState(false);
    const [isKpiCustomizePopoverOpen, setIsKpiCustomizePopoverOpen] = useState(false);
    
    const [isCompanyCustomizePopoverOpen, setIsCompanyCustomizePopoverOpen] = useState(false);
    const [isCompanyKpiCustomizePopoverOpen, setIsCompanyKpiCustomizePopoverOpen] = useState(false);

    // Refs
    const personalPopoverRef = useRef<HTMLDivElement>(null);
    const personalCustomizeButtonRef = useRef<HTMLButtonElement>(null);
    const kpiPopoverRef = useRef<HTMLDivElement>(null);
    const kpiCustomizeButtonRef = useRef<HTMLButtonElement>(null);

    // Click Outside Handler
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
             // Personal Tab Popovers
             if (personalPopoverRef.current && !personalPopoverRef.current.contains(event.target as Node) && personalCustomizeButtonRef.current && !personalCustomizeButtonRef.current.contains(event.target as Node)) setIsPersonalCustomizePopoverOpen(false);
             if (kpiPopoverRef.current && !kpiPopoverRef.current.contains(event.target as Node) && kpiCustomizeButtonRef.current && !kpiCustomizeButtonRef.current.contains(event.target as Node)) setIsKpiCustomizePopoverOpen(false);
             // Company Tab Popovers
             if (activeTab === 'company') {
                 if (personalPopoverRef.current && !personalPopoverRef.current.contains(event.target as Node) && personalCustomizeButtonRef.current && !personalCustomizeButtonRef.current.contains(event.target as Node)) setIsCompanyCustomizePopoverOpen(false);
                 if (kpiPopoverRef.current && !kpiPopoverRef.current.contains(event.target as Node) && kpiCustomizeButtonRef.current && !kpiCustomizeButtonRef.current.contains(event.target as Node)) setIsCompanyKpiCustomizePopoverOpen(false);
             }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeTab]);
    
    // SIMULATED DATA FILTERING FOR DEMO
    // In a real app, this would trigger an API call.
    const getFilteredPersonalKPIs = () => {
        // Just return mock data for simplicity as translation is the focus
        return personalKpisData; 
    };

    const getFilteredCompanyKPIs = () => {
        return companyKpisData;
    };
    
    const personalKPIsToRender = getFilteredPersonalKPIs();
    const companyKPIsToRender = getFilteredCompanyKPIs();

    // Correctly sort and filter KPIs based on configuration order
    const visiblePersonalKpis = personalKpiConfig
        .filter(config => config.visible)
        .map(config => personalKPIsToRender.find(kpi => kpi.id === config.id))
        .filter((kpi): kpi is KpiCardProps & { id: string } => kpi !== undefined);

    const visibleCompanyKpis = companyKpiConfig
        .filter(config => config.visible)
        .map(config => companyKPIsToRender.find(kpi => kpi.id === config.id))
        .filter((kpi): kpi is KpiCardProps & { id: string } => kpi !== undefined);

    // Save Handlers
    const handleSavePersonalViews = (newViews: ViewConfig[]) => { setPersonalViewsConfig(newViews); setIsPersonalCustomizePopoverOpen(false); };
    const handleResetPersonalViews = () => { setPersonalViewsConfig(defaultPersonalViewsConfig); setIsPersonalCustomizePopoverOpen(false); };
    
    const handleSaveCompanyViews = (newViews: ViewConfig[]) => { setCompanyViewsConfig(newViews); setIsCompanyCustomizePopoverOpen(false); };
    const handleResetCompanyViews = () => { setCompanyViewsConfig(defaultCompanyViewsConfig); setIsCompanyCustomizePopoverOpen(false); };

    const handleSaveKpis = (newViews: ViewConfig[], type: 'personal' | 'company') => {
        if (type === 'personal') { setPersonalKpiConfig(newViews); setIsKpiCustomizePopoverOpen(false); }
        else { setCompanyKpiConfig(newViews); setIsCompanyKpiCustomizePopoverOpen(false); }
    };
    
    const handleResetKpis = (type: 'personal' | 'company') => {
        if (type === 'personal') { setPersonalKpiConfig(personalKpisData.map(k => ({ id: k.id, name: k.title, visible: true }))); setIsKpiCustomizePopoverOpen(false); }
        else { setCompanyKpiConfig(companyKpisData.map(k => ({ id: k.id, name: k.title, visible: true }))); setIsCompanyKpiCustomizePopoverOpen(false); }
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.4s ease-out; }`}</style>
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">
                        {activeTab === 'personal' ? t('dashboard.personal_title') : t('dashboard.company_title')}
                    </h1>
                    <p className="text-sm text-text-muted">
                        {activeTab === 'personal' ? 'Overview of your personal performance' : 'Overview of company-wide performance'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                     <div className="bg-bg-subtle p-1 rounded-lg flex text-sm font-semibold border border-border-default">
                        <button 
                            onClick={() => setActiveTab('personal')}
                            className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'personal' ? 'bg-white shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                        >
                            {t('dashboard.personal_tab')}
                        </button>
                        <button 
                            onClick={() => setActiveTab('company')}
                            className={`px-4 py-1.5 rounded-md transition-all ${activeTab === 'company' ? 'bg-white shadow-sm text-primary-700' : 'text-text-muted hover:text-text-default'}`}
                        >
                            {t('dashboard.company_tab')}
                        </button>
                    </div>
                    
                    <DateRangeSelector 
                        value={dateRange} 
                        onChange={setDateRange} 
                        className="w-48"
                        placeholder="Select Date Range"
                    />
                </div>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto pb-10">
                
                {/* KPIs Section */}
                <div className="mb-8">
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-text-default">KPIs</h2>
                        <div className="relative">
                            <button 
                                ref={kpiCustomizeButtonRef}
                                onClick={() => activeTab === 'personal' ? setIsKpiCustomizePopoverOpen(!isKpiCustomizePopoverOpen) : setIsCompanyKpiCustomizePopoverOpen(!isCompanyKpiCustomizePopoverOpen)}
                                className="p-2 text-text-muted hover:bg-bg-subtle rounded-full transition-colors"
                                title={t('dashboard.customize_views')}
                            >
                                <Cog6ToothIcon className="w-5 h-5" />
                            </button>
                             {(activeTab === 'personal' ? isKpiCustomizePopoverOpen : isCompanyKpiCustomizePopoverOpen) && (
                                <div ref={kpiPopoverRef} className="z-20">
                                    <CustomizeViewsPopover
                                        isOpen={true}
                                        onClose={() => activeTab === 'personal' ? setIsKpiCustomizePopoverOpen(false) : setIsCompanyKpiCustomizePopoverOpen(false)}
                                        views={activeTab === 'personal' ? personalKpiConfig : companyKpiConfig}
                                        onSave={(views) => handleSaveKpis(views, activeTab)}
                                        onReset={() => handleResetKpis(activeTab)}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="animate-fade-in">
                        <KpiCardsGrid kpis={activeTab === 'personal' ? visiblePersonalKpis : visibleCompanyKpis} />
                    </div>
                </div>

                {/* Dashboard Widgets Grid */}
                <div>
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-text-default">Widgets</h2>
                        <div className="relative">
                            <button 
                                ref={personalCustomizeButtonRef}
                                onClick={() => activeTab === 'personal' ? setIsPersonalCustomizePopoverOpen(!isPersonalCustomizePopoverOpen) : setIsCompanyCustomizePopoverOpen(!isCompanyCustomizePopoverOpen)}
                                className="flex items-center gap-2 text-sm font-semibold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg hover:bg-primary-100 transition-colors"
                            >
                                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                                <span>{t('dashboard.customize_views')}</span>
                            </button>
                             {(activeTab === 'personal' ? isPersonalCustomizePopoverOpen : isCompanyCustomizePopoverOpen) && (
                                <div ref={personalPopoverRef} className="z-20">
                                    <CustomizeViewsPopover
                                        isOpen={true}
                                        onClose={() => activeTab === 'personal' ? setIsPersonalCustomizePopoverOpen(false) : setIsCompanyCustomizePopoverOpen(false)}
                                        views={activeTab === 'personal' ? personalViewsConfig : companyViewsConfig}
                                        onSave={activeTab === 'personal' ? handleSavePersonalViews : handleSaveCompanyViews}
                                        onReset={activeTab === 'personal' ? handleResetPersonalViews : handleResetCompanyViews}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
                        {activeTab === 'personal' ? (
                            // --- PERSONAL WIDGETS ---
                            personalViewsConfig.filter(v => v.visible).map(view => {
                                switch (view.id) {
                                    case 'recruitment_goal':
                                        return <div key={view.id} className="h-full"><RecruitmentGoalWidget current={18} target={20} /></div>;
                                    case 'my_tasks':
                                        return <div key={view.id} className="h-full"><MyTasksWidget title={t('dashboard.my_tasks')} /></div>;
                                    case 'recent_updates':
                                        return <div key={view.id} className="h-full"><RecentUpdatesWidget title={t('dashboard.recent_updates')} /></div>;
                                    default:
                                        return null;
                                }
                            })
                        ) : (
                             // --- COMPANY WIDGETS ---
                             companyViewsConfig.filter(v => v.visible).map(view => {
                                 switch(view.id) {
                                     case 'recruitment_goal_company':
                                          return <div key={view.id} className="h-full"><RecruitmentGoalWidget current={45} target={60} /></div>;
                                     case 'candidates_by_stage':
                                         return <div key={view.id} className="h-full"><CandidatesInProcessWidget title={t('dashboard.funnel')} /></div>;
                                     case 'time_to_hire':
                                         return <div key={view.id} className="h-full"><TimeToHireWidget title={t('metric.time_to_hire')} /></div>;
                                     case 'recruiter_performance':
                                         return <div key={view.id} className="h-full"><RecruiterPerformanceWidget title={t('dashboard.recruiter_performance')} /></div>;
                                     case 'recent_open_jobs':
                                         return <div key={view.id} className="h-full"><RecentOpenJobsWidget title={t('metric.open_jobs')} /></div>;
                                     case 'top_sources':
                                         return <div key={view.id} className="h-full"><TopSourcesWidget title={t('dashboard.top_sources')} /></div>;
                                     default: return null;
                                 }
                             })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
