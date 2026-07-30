import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Cog6ToothIcon, MagnifyingGlassIcon, UserGroupIcon, BriefcaseIcon,
    ClockIcon, PaperAirplaneIcon, CheckCircleIcon, AdjustmentsHorizontalIcon,
    ExclamationTriangleIcon, CalendarIcon
} from './Icons';
import CustomizeViewsPopover, { ViewConfig } from './CustomizeViewsPopover';
import RecruitmentGoalWidget from './RecruitmentGoalWidget';
import DateRangeSelector, { DateRange } from './DateRangeSelector';
import { useLanguage } from '../context/LanguageContext';
import {
    fetchHomeDashboard,
    type HomeDashboardResponse,
    type DashboardKpi,
} from '../services/homeDashboardApi';

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

interface KpiCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    sentiment?: 'neutral' | 'success' | 'warning' | 'critical';
    trend?: number;
    subtext?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon, sentiment = 'neutral', trend, subtext }) => {
    let colorStyles = 'bg-white border-border-default hover:border-primary-300';
    let iconBg = 'bg-primary-50';
    let iconColor = 'text-primary-600';

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
             {trend !== undefined && Number.isFinite(trend) && (
                 <div className={`absolute top-3 right-3 flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${trend > 0 ? 'bg-green-50 text-green-700' : trend < 0 ? 'bg-red-50 text-red-700' : 'bg-bg-subtle text-text-muted'}`}>
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

const KpiCardsGrid: React.FC<{ kpis: (KpiCardProps & { id: string })[] }> = ({ kpis }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
            <div key={kpi.id} className="col-span-1">
                <KpiCard {...kpi} />
            </div>
        ))}
    </div>
);

const VerticalBarChart: React.FC<{ data: { label: string; value: number }[]; max: number; }> = ({ data, max }) => (
    <div className="flex justify-around items-end h-40 gap-1 pt-4 pb-2">
        {(data.length ? data : [{ label: '—', value: 0 }]).map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                <div className="relative w-full h-full flex items-end justify-center">
                    <div 
                        className="w-full max-w-[12px] rounded-t-md opacity-60 group-hover:opacity-100 transition-all duration-300 bg-primary-400 group-hover:bg-primary-600 relative" 
                        style={{ height: `${Math.max((item.value / Math.max(max, 1)) * 100, item.value > 0 ? 4 : 0)}%` }}
                    ></div>
                </div>
                {index % 2 === 0 && <span className="text-[10px] text-text-subtle">{item.label}</span>}
            </div>
        ))}
    </div>
);

const FunnelChart: React.FC<{ data: { label: string; value: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-4 py-2">
        {(data.length ? data : [{ label: 'אין נתונים', value: 0 }]).map((item, index) => {
            const widthPercent = Math.max((item.value / Math.max(max, 1)) * 100, item.value > 0 ? 5 : 2);
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

const CompactBarChart: React.FC<{ data: { label: string; value: number }[]; max: number; }> = ({ data, max }) => (
    <div className="space-y-3">
        {(data.length ? data : [{ label: 'אין נתונים', value: 0 }]).map((item, index) => (
            <div key={index} className="group">
                <div className="flex justify-between items-center text-xs mb-1">
                    <span className="text-text-default font-medium truncate max-w-[60%]">{item.label}</span>
                    <span className="text-text-muted font-bold tabular-nums">{item.value}</span>
                </div>
                <div className="w-full bg-bg-subtle rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 ease-out group-hover:opacity-80" style={{ width: `${(item.value / Math.max(max, 1)) * 100}%`, backgroundColor: 'var(--chart-color)' }}></div>
                </div>
            </div>
        ))}
    </div>
);

const SimpleList: React.FC<{ items: { main: string; sub?: string }[] }> = ({ items }) => (
    <div className="space-y-0 divide-y divide-border-subtle -my-2">
        {(items.length ? items : [{ main: 'אין משרות פתוחות' }]).map((item, index) => (
            <div key={index} className="flex flex-col justify-center py-3 first:pt-1 last:pb-1 hover:bg-bg-subtle/30 px-2 rounded transition-colors cursor-default">
                <span className="font-semibold text-text-default text-sm truncate">{item.main}</span>
                {item.sub && <span className="text-text-muted text-xs truncate mt-0.5">{item.sub}</span>}
            </div>
        ))}
    </div>
);

const TimeToHireWidget: React.FC<{
    className?: string;
    title: string;
    data: { label: string; value: number }[];
    max: number;
    avg: number;
    changePct: number;
}> = ({ className, title, data, max, avg, changePct }) => (
    <DashboardCard title={title} className={className}>
         <div className="flex flex-col h-full justify-end">
            <VerticalBarChart data={data} max={max} />
            <div className="text-center mt-2">
                <span className="text-xs text-text-muted">ממוצע: <span className="font-bold text-text-default">{avg} ימים</span></span>
                {Number.isFinite(changePct) && changePct !== 0 && (
                    <span className={`text-xs font-bold mr-2 ${changePct < 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {changePct < 0 ? '▼' : '▲'} {Math.abs(changePct)}%
                    </span>
                )}
            </div>
         </div>
    </DashboardCard>
);

const RecruiterPerformanceWidget: React.FC<{
    className?: string;
    title: string;
    recruiters: Array<{ name: string; sent: number; interviewed: number; hired: number }>;
}> = ({ className, title, recruiters }) => (
    <DashboardCard title={title} className={className}>
        <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
                <thead>
                    <tr className="border-b border-border-default text-text-muted">
                        <th className="pb-2 font-medium">רכז/ת</th>
                        <th className="pb-2 font-medium text-center">הפניות</th>
                        <th className="pb-2 font-medium text-center">ראיונות</th>
                        <th className="pb-2 font-medium text-center">גיוסים</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                    {(recruiters.length ? recruiters : [{ name: 'אין נתונים', sent: 0, interviewed: 0, hired: 0 }]).map((r, i) => (
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

const MyTasksWidget: React.FC<{ title: string; tasks: Array<{ id: string; title: string; time: string; status: string }> }> = ({ title, tasks }) => {
    const getStatusColor = (status: string) => {
        switch(status) {
            case 'urgent': return 'bg-red-500';
            case 'pending': return 'bg-orange-500';
            case 'done': return 'bg-green-500';
            default: return 'bg-gray-300';
        }
    };

    return (
        <DashboardCard title={title} icon={<CheckCircleIcon className="w-5 h-5"/>}>
            <div className="space-y-0 divide-y divide-border-subtle -mx-4">
                {(tasks.length ? tasks : [{ id: 'empty', title: 'אין משימות קרובות', time: '—', status: 'pending' }]).map(task => (
                    <div key={task.id} className="flex items-center justify-between p-4 hover:bg-bg-subtle/30 transition-colors group">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(task.status)}`}></div>
                            <span className="text-sm font-medium text-text-default truncate">{task.title}</span>
                        </div>
                        <span className="text-xs text-text-muted bg-bg-subtle px-2 py-1 rounded-md flex-shrink-0">{task.time}</span>
                    </div>
                ))}
            </div>
        </DashboardCard>
    );
};

const RecentUpdatesWidget: React.FC<{ title: string; updates: Array<{ id: string; user: string; action: string; time: string }> }> = ({ title, updates }) => (
    <DashboardCard title={title} icon={<ClockIcon className="w-5 h-5"/>}>
         <div className="space-y-4 relative">
            <div className="absolute top-2 bottom-2 right-[5px] w-0.5 bg-border-subtle"></div>
            {(updates.length ? updates : [{ id: 'empty', user: 'מערכת', action: 'אין עדכונים אחרונים', time: '—' }]).map(update => (
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
    </DashboardCard>
);

const CandidatesInProcessWidget = ({ className, title, data, max }: { className?: string; title: string; data: { label: string; value: number }[]; max: number }) => (
    <DashboardCard title={title} className={className}>
        <FunnelChart data={data} max={max} />
    </DashboardCard>
);
const RecentOpenJobsWidget = ({ className, title, items }: { className?: string; title: string; items: { main: string; sub?: string }[] }) => (
    <DashboardCard title={title} className={className}>
        <SimpleList items={items} />
    </DashboardCard>
);
const TopSourcesWidget = ({ className, title, data, max }: { className?: string; title: string; data: { label: string; value: number }[]; max: number }) => (
     <DashboardCard title={title} className={className}>
        <CompactBarChart data={data} max={max} />
    </DashboardCard>
);

const PERSONAL_KPI_IDS = ['exceptions', 'referrals', 'open_jobs', 'active_candidates', 'interviews_today', 'avg_status_time'] as const;
const COMPANY_KPI_IDS = ['hires', 'time_to_hire', 'offer_acceptance', 'waiting_screening'] as const;

const allPersonalViews: { id: string; name: string }[] = [
  { id: 'recruitment_goal', name: 'Recruitment Goal' },
  { id: 'my_tasks', name: 'My Tasks' },
  { id: 'recent_updates', name: 'Recent Updates' },
];
const defaultPersonalViewsConfig = allPersonalViews.map(view => ({ ...view, visible: true }));

const allCompanyViews: { id: string; name: string }[] = [
    { id: 'recruitment_goal_company', name: 'Recruitment Goal' },
    { id: 'candidates_by_stage', name: 'Funnel' },
    { id: 'time_to_hire', name: 'Time to Hire' },
    { id: 'recruiter_performance', name: 'Recruiter Performance' },
    { id: 'recent_open_jobs', name: 'Open Jobs' },
    { id: 'top_sources', name: 'Top Sources' },
];
const defaultCompanyViewsConfig = allCompanyViews.map(view => ({ ...view, visible: true }));

const KPI_TITLE_KEY: Record<string, string> = {
    exceptions: 'dashboard.kpi_exceptions',
    referrals: 'dashboard.kpi_monthly_referrals',
    open_jobs: 'dashboard.kpi_open_jobs',
    active_candidates: 'dashboard.kpi_active_candidates',
    interviews_today: 'dashboard.kpi_interviews_today',
    avg_status_time: 'dashboard.kpi_avg_status_time',
    hires: 'dashboard.kpi_hires',
    time_to_hire: 'dashboard.kpi_time_to_hire',
    offer_acceptance: 'dashboard.kpi_offer_acceptance',
    waiting_screening: 'dashboard.kpi_waiting_screening',
};

const kpiIcon = (id: string) => {
    switch (id) {
        case 'exceptions': return <ExclamationTriangleIcon className="w-6 h-6" />;
        case 'referrals': return <PaperAirplaneIcon className="w-6 h-6" />;
        case 'open_jobs': return <BriefcaseIcon className="w-6 h-6" />;
        case 'active_candidates': return <UserGroupIcon className="w-6 h-6" />;
        case 'interviews_today': return <CalendarIcon className="w-6 h-6" />;
        case 'avg_status_time': return <ClockIcon className="w-6 h-6" />;
        case 'hires': return <CheckCircleIcon className="w-6 h-6" />;
        case 'time_to_hire': return <ClockIcon className="w-6 h-6" />;
        case 'offer_acceptance': return <PaperAirplaneIcon className="w-6 h-6" />;
        case 'waiting_screening': return <MagnifyingGlassIcon className="w-6 h-6" />;
        default: return <BriefcaseIcon className="w-6 h-6" />;
    }
};

const formatKpiValue = (kpi: DashboardKpi): string => {
    const v = Number(kpi.value) || 0;
    if (kpi.unit === 'days') return `${v} ימים`;
    if (kpi.unit === 'pct') return `${v}%`;
    return v.toLocaleString('he-IL');
};

const mapRangeLabelToPreset = (label: string | undefined): string | undefined => {
    const l = String(label || '');
    if (/חודש|month/i.test(l) && !/קודם|last/i.test(l)) return 'this_month';
    if (/30|חודש אחרון|last.?30/i.test(l)) return 'last_30_days';
    if (/7|שבוע/i.test(l)) return 'last_7_days';
    if (/רבעון|quarter/i.test(l)) return 'this_quarter';
    if (/שנה|year/i.test(l)) return 'this_year';
    return undefined;
};

const DashboardView: React.FC = () => {
    const { t } = useLanguage();
    const [activeTab, setActiveTab] = useState<'personal' | 'company'>('personal');
    const getCurrentMonthRange = () => {
         const now = new Date();
         const start = new Date(now.getFullYear(), now.getMonth(), 1);
         return {
             from: start.toISOString().split('T')[0],
             to: now.toISOString().split('T')[0],
             label: t('filter_option.month')
         };
    };
    const [dateRange, setDateRange] = useState<DateRange | null>(getCurrentMonthRange());
    const [data, setData] = useState<HomeDashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [personalViewsConfig, setPersonalViewsConfig] = useState<ViewConfig[]>(defaultPersonalViewsConfig);
    const [personalKpiConfig, setPersonalKpiConfig] = useState<ViewConfig[]>(
        PERSONAL_KPI_IDS.map((id) => ({ id, name: id, visible: true })),
    );
    const [companyViewsConfig, setCompanyViewsConfig] = useState<ViewConfig[]>(defaultCompanyViewsConfig);
    const [companyKpiConfig, setCompanyKpiConfig] = useState<ViewConfig[]>(
        COMPANY_KPI_IDS.map((id) => ({ id, name: id, visible: true })),
    );

    const [isPersonalCustomizePopoverOpen, setIsPersonalCustomizePopoverOpen] = useState(false);
    const [isKpiCustomizePopoverOpen, setIsKpiCustomizePopoverOpen] = useState(false);
    const [isCompanyCustomizePopoverOpen, setIsCompanyCustomizePopoverOpen] = useState(false);
    const [isCompanyKpiCustomizePopoverOpen, setIsCompanyKpiCustomizePopoverOpen] = useState(false);

    const personalPopoverRef = useRef<HTMLDivElement>(null);
    const personalCustomizeButtonRef = useRef<HTMLButtonElement>(null);
    const kpiPopoverRef = useRef<HTMLDivElement>(null);
    const kpiCustomizeButtonRef = useRef<HTMLButtonElement>(null);

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const payload = await fetchHomeDashboard({
                scope: activeTab,
                startDate: dateRange?.from || undefined,
                endDate: dateRange?.to || undefined,
                range: mapRangeLabelToPreset(dateRange?.label) || 'this_month',
            });
            setData(payload);
        } catch (err: any) {
            setError(err?.message || 'שגיאה בטעינת הדשבורד');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [activeTab, dateRange?.from, dateRange?.to, dateRange?.label]);

    useEffect(() => {
        void loadDashboard();
    }, [loadDashboard]);

    // Sync KPI config names with translations when language/data changes
    useEffect(() => {
        setPersonalKpiConfig((prev) =>
            PERSONAL_KPI_IDS.map((id) => {
                const existing = prev.find((p) => p.id === id);
                return { id, name: t(KPI_TITLE_KEY[id] || id), visible: existing?.visible !== false };
            }),
        );
        setCompanyKpiConfig((prev) =>
            COMPANY_KPI_IDS.map((id) => {
                const existing = prev.find((p) => p.id === id);
                return { id, name: t(KPI_TITLE_KEY[id] || id), visible: existing?.visible !== false };
            }),
        );
    }, [t]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
             if (personalPopoverRef.current && !personalPopoverRef.current.contains(event.target as Node) && personalCustomizeButtonRef.current && !personalCustomizeButtonRef.current.contains(event.target as Node)) {
                setIsPersonalCustomizePopoverOpen(false);
                setIsCompanyCustomizePopoverOpen(false);
             }
             if (kpiPopoverRef.current && !kpiPopoverRef.current.contains(event.target as Node) && kpiCustomizeButtonRef.current && !kpiCustomizeButtonRef.current.contains(event.target as Node)) {
                setIsKpiCustomizePopoverOpen(false);
                setIsCompanyKpiCustomizePopoverOpen(false);
             }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const kpisFromApi = useMemo(() => {
        const byId = new Map((data?.kpis || []).map((k) => [k.id, k]));
        const ids = activeTab === 'personal' ? PERSONAL_KPI_IDS : COMPANY_KPI_IDS;
        return ids.map((id) => {
            const raw = byId.get(id);
            const changePct = raw?.changePct;
            const sub =
                raw?.subtext ||
                (changePct != null && changePct !== 0
                    ? `${changePct > 0 ? '+' : ''}${changePct}% מול תקופה קודמת`
                    : undefined);
            return {
                id,
                title: t(KPI_TITLE_KEY[id] || id),
                value: raw ? formatKpiValue(raw) : '—',
                icon: kpiIcon(id),
                sentiment: raw?.sentiment || 'neutral',
                trend: changePct,
                subtext: sub,
            } as KpiCardProps & { id: string };
        });
    }, [data, activeTab, t]);

    const visiblePersonalKpis = personalKpiConfig
        .filter(config => config.visible)
        .map(config => kpisFromApi.find(kpi => kpi.id === config.id))
        .filter((kpi): kpi is KpiCardProps & { id: string } => kpi !== undefined);

    const visibleCompanyKpis = companyKpiConfig
        .filter(config => config.visible)
        .map(config => kpisFromApi.find(kpi => kpi.id === config.id))
        .filter((kpi): kpi is KpiCardProps & { id: string } => kpi !== undefined);

    const handleSavePersonalViews = (newViews: ViewConfig[]) => { setPersonalViewsConfig(newViews); setIsPersonalCustomizePopoverOpen(false); };
    const handleResetPersonalViews = () => { setPersonalViewsConfig(defaultPersonalViewsConfig); setIsPersonalCustomizePopoverOpen(false); };
    const handleSaveCompanyViews = (newViews: ViewConfig[]) => { setCompanyViewsConfig(newViews); setIsCompanyCustomizePopoverOpen(false); };
    const handleResetCompanyViews = () => { setCompanyViewsConfig(defaultCompanyViewsConfig); setIsCompanyCustomizePopoverOpen(false); };

    const handleSaveKpis = (newViews: ViewConfig[], type: 'personal' | 'company') => {
        if (type === 'personal') { setPersonalKpiConfig(newViews); setIsKpiCustomizePopoverOpen(false); }
        else { setCompanyKpiConfig(newViews); setIsCompanyKpiCustomizePopoverOpen(false); }
    };
    
    const handleResetKpis = (type: 'personal' | 'company') => {
        if (type === 'personal') {
            setPersonalKpiConfig(PERSONAL_KPI_IDS.map((id) => ({ id, name: t(KPI_TITLE_KEY[id]), visible: true })));
            setIsKpiCustomizePopoverOpen(false);
        } else {
            setCompanyKpiConfig(COMPANY_KPI_IDS.map((id) => ({ id, name: t(KPI_TITLE_KEY[id]), visible: true })));
            setIsCompanyKpiCustomizePopoverOpen(false);
        }
    };

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto p-4 sm:p-6 h-full flex flex-col">
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in { animation: fadeIn 0.4s ease-out; }`}</style>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-default">
                        {activeTab === 'personal' ? t('dashboard.personal_title') : t('dashboard.company_title')}
                    </h1>
                    <p className="text-sm text-text-muted">
                        {activeTab === 'personal' ? 'סקירת הביצועים האישיים שלך' : 'סקירת ביצועי החברה'}
                        {data?.startDate && data?.endDate ? ` · ${data.startDate} – ${data.endDate}` : ''}
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

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3 flex justify-between items-center">
                    <span>{error}</span>
                    <button type="button" className="font-bold underline" onClick={() => void loadDashboard()}>נסה שוב</button>
                </div>
            )}
            
            <div className={`flex-1 overflow-y-auto pb-10 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
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
                        {loading && !data ? (
                            <div className="text-sm text-text-muted py-8 text-center">טוען נתונים...</div>
                        ) : (
                            <KpiCardsGrid kpis={activeTab === 'personal' ? visiblePersonalKpis : visibleCompanyKpis} />
                        )}
                    </div>
                </div>

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
                            personalViewsConfig.filter(v => v.visible).map(view => {
                                switch (view.id) {
                                    case 'recruitment_goal':
                                        return <div key={view.id} className="h-full"><RecruitmentGoalWidget current={data?.goal?.current ?? 0} target={data?.goal?.target ?? 0} /></div>;
                                    case 'my_tasks':
                                        return <div key={view.id} className="h-full"><MyTasksWidget title={t('dashboard.my_tasks')} tasks={data?.tasks || []} /></div>;
                                    case 'recent_updates':
                                        return <div key={view.id} className="h-full"><RecentUpdatesWidget title={t('dashboard.recent_updates')} updates={data?.recentUpdates || []} /></div>;
                                    default:
                                        return null;
                                }
                            })
                        ) : (
                             companyViewsConfig.filter(v => v.visible).map(view => {
                                 switch(view.id) {
                                     case 'recruitment_goal_company':
                                          return <div key={view.id} className="h-full"><RecruitmentGoalWidget current={data?.goal?.current ?? 0} target={data?.goal?.target ?? 0} /></div>;
                                     case 'candidates_by_stage':
                                         return <div key={view.id} className="h-full"><CandidatesInProcessWidget title={t('dashboard.funnel')} data={data?.funnel?.data || []} max={data?.funnel?.max || 1} /></div>;
                                     case 'time_to_hire':
                                         return (
                                            <div key={view.id} className="h-full">
                                                <TimeToHireWidget
                                                    title={t('dashboard.kpi_time_to_hire')}
                                                    data={data?.timeToHireSeries?.data || []}
                                                    max={data?.timeToHireSeries?.max || 1}
                                                    avg={data?.timeToHireSeries?.avg || 0}
                                                    changePct={data?.timeToHireSeries?.changePct || 0}
                                                />
                                            </div>
                                         );
                                     case 'recruiter_performance':
                                         return <div key={view.id} className="h-full"><RecruiterPerformanceWidget title={t('dashboard.recruiter_performance')} recruiters={data?.recruiterPerformance || []} /></div>;
                                     case 'recent_open_jobs':
                                         return <div key={view.id} className="h-full"><RecentOpenJobsWidget title={t('dashboard.kpi_open_jobs')} items={data?.openJobs || []} /></div>;
                                     case 'top_sources':
                                         return <div key={view.id} className="h-full"><TopSourcesWidget title={t('dashboard.top_sources')} data={data?.topSources?.data || []} max={data?.topSources?.max || 1} /></div>;
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
